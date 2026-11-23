# Plano — Sign-up (`004-sign-up`)

> Executa a spec `./.specs/004-sign-up.md`. Implementa o cadastro ponta a ponta: `POST /api/v1/auth/sign-up` (DTO com class-validator, anti-enumeração, criação de usuário com bcrypt custo 10, token de confirmação 24h, email) e a página `/auth/sign-up` (campos `first_name`/`last_name`/`email`/`password`/`confirm_password`, validação client, erro por campo, tela "check your email"). Módulo autônomo em `apps/api/src/modules/auth/sign-up/`; não toca em `auth.module.ts`/`app.module.ts` (wiring centralizado na onda).

## Premissas do refinamento (feature-concept — sem entrevista, decisões documentadas)

| Premissa                      | Decisão                                                                                                                                 | Racional                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resposta genérica             | `201` com `{ message }` fixo, idêntico para email novo e existente                                                                      | Spec §Anti-enumeração: "esconder também no sign-up"; não vaza duplicidade.                                                                                                             |
| Email existente               | Lookup por email; se existir, retorna genérico **sem criar usuário e sem enviar email**                                                 | Spec §O que fazer/§Edge cases: "nenhum email enviado (não notifica o dono)".                                                                                                           |
| Match de senha                | Validado no server com decorator custom `@Match("password")` no DTO + no client                                                         | Spec §Decisões; server nunca confia no client.                                                                                                                                         |
| Normalização de email         | `@Transform` (trim + lowercase) no DTO **e** `trim().toLowerCase()` no service (defesa em profundidade)                                 | Spec §Decisões: lowercase antes de salvar/consultar.                                                                                                                                   |
| Falha do transporte de email  | `sendConfirmationEmail` é **blocking**: em falha, deleta o usuário criado (cascade remove o token) e lança `500`; loga o erro real      | Spec §Riscos: "fail-fast, rastreável" + §Edge cases: "o cadastro falha... o usuário pode tentar reenviar o form". Rollback compensatório garante que reenviar o form re-tenta o fluxo. |
| Persistência do usuário+token | `db.transaction` para inserir `users` + `email_confirmation_tokens` juntos                                                              | Atomicidade: nunca fica usuário sem token.                                                                                                                                             |
| Token                         | `generateSessionToken()` (43 chars base64url) + `hashToken()` (sha256) reutilizados; TTL 24h, uso único (coluna `used_at` já no schema) | Reuso do padrão da 002/007; spec §Decisões.                                                                                                                                            |
| Resposta de validação         | `400` com `message[]` por campo (padrão Nest `ValidationPipe`)                                                                          | Spec §Critérios de aceite.                                                                                                                                                             |
| `SignUpModule`                | Imports `[PasswordModule, EmailModule]`; `DatabaseModule` é global (DRIZZLE); exporta controller + serviço                              | Instrução de orquestração: módulo autocontido que exporta controller/serviços.                                                                                                         |

## Objetivo

- `POST /api/v1/auth/sign-up` cria conta (bcrypt custo 10, `email_verified_at` null), gera token 24h, envia email de confirmação e responde `201` genérico idêntico para email novo/existente.
- Página `/auth/sign-up` valida obrigatórios, email válido, senha mín. 8 e match; mostra erro por campo; tela de sucesso "check your email".
- QA gates passando; ADR em `./.adrs/004-sign-up.md`.

## Escopo

**Dentro:** `sign-up/` (dto, controller, use case, module) + testes (`src/*.spec.ts`, `e2e/*.e2e-spec.ts`), página `sign-up.tsx` + teste de componente, plano e ADR.

**Fora:** `auth.module.ts`/`app.module.ts` (wiring da onda), confirm-account (005), sign-in (006), forgot/reset (007/008), reenvio de email, rate limiting, migrações de banco (schema já existe da 001).

## Etapas

### E1. `sign-up.dto.ts`

`SignUpDto` com `first_name`, `last_name` (`@IsString`, `@IsNotEmpty`, `@MaxLength(255)`), `email` (`@IsEmail`, `@MaxLength(255)`, `@Transform` trim+lowercase), `password` (`@IsString`, `@IsNotEmpty`, `@MinLength(8)`, `@MaxLength(72)`), `confirm_password` (`@IsString`, `@IsNotEmpty`, `@Match("password")`). Decorator custom `Match` (registerDecorator) no próprio arquivo.

### E2. `sign-up.service.ts`

- Injeta `DRIZZLE`, `PasswordService`, `EmailService`, `Logger`.
- `signUp(dto): Promise<void>`:
  1. normaliza email (trim + lowercase);
  2. lookup único por email; se existir → `return` (genérico, sem efeitos);
  3. transação: insere `users` (email, passwordHash via `PasswordService.hash`, first/last name, `email_verified_at` null) e `email_confirmation_tokens` (tokenHash, `expiresAt = now + 24h`);
  4. `sendConfirmationEmail({ to: email, token })` **fora** da transação; em falha → deleta o usuário (cascade) e lança `InternalServerErrorException` logando o erro real;
  5. nada é retornado (controller responde o genérico).

### E3. `sign-up.controller.ts`

`@Controller("auth")` + `@Public()` + `@UsePipes(ValidationPipe({ whitelist, transform }))`; `@Post("sign-up")` + `@HttpCode(201)` → `{ message: GENERIC_MESSAGE }`. `GENERIC_MESSAGE = "Check your email to confirm your account"`.

### E4. `sign-up.module.ts`

Imports `[PasswordModule, EmailModule]`; controllers `[SignUpController]`; providers `[SignUpService]`; exports `[SignUpService, SignUpController]`.

### E5. Teste de integração (`sign-up.service.spec.ts`)

TestingModule: `ConfigModule.forRoot({isGlobal:true})` + `DatabaseModule` + `PasswordModule` + `EmailModule` + `SignUpModule`, com `EMAIL_TRANSPORT` override (test-double que acumula). Cenários:

- cria usuário com hash bcrypt válido (verify), `email_verified_at` null, token persistido com TTL ~24h e email enviado com link `http://localhost:5173/auth/confirm-account?token=`;
- email já existente → sem novo usuário (count estável), sem email, sem token novo;
- email normalizado a lowercase (uppercase no input → salvo lowercase, e email já existente com variação de case não duplica);
- transporte falha → `InternalServerErrorException`, usuário removido (rollback compensatório).

### E6. E2E HTTP (`apps/api/e2e/sign-up.e2e-spec.ts`)

Supertest contra `/api/v1/auth/sign-up` (mesmo TestingModule, prefixo `api/v1`):

- email novo → `201` genérico + usuário no banco + token + email com link;
- email existente → `201` **idêntico** ao anterior (body igual), sem side effects (sem email, count de usuários estável);
- validação → `400` com mensagens por campo (obrigatórios, email inválido, senha curta, match);
- lowercase → cadastro com email uppercase salva lowercase; repetir com a variação de case → genérico sem duplicar.

### E7. Página `sign-up.tsx`

Carregar skills `frontend-design` e `web-design-guidelines` (obrigatórias p/ UI). Form controlado com 5 campos, validação client (obrigatórios, email válido, senha mín. 8, match), erro por campo (`role="alert"`, `aria-invalid`, `aria-describedby`, foco no primeiro erro), estado de loading no botão, erro genérico de form, tela de sucesso "Check your email" (substitui o form). Reusa `AuthShell`/`AuthLink` da 003 e `apiClient`. Mantém link para sign-in.

### E8. Teste da página (`apps/app/src/pages/auth/sign-up.test.tsx`)

MemoryRouter + fetch stub (padrão de sign-in/forgot-password): render dos campos, validação bloqueia submit (obrigatórios, email inválido, senha curta, match), sucesso → tela "Check your email" com body correto no POST, falha → erro genérico.

### E9. QA gates

Ordem de `.docs/QA.md`: `code:fix`, `types:check`, `test`, `test:e2e`, `build`.

### E10. ADR + artefatos + commit

`./.adrs/004-sign-up.md`; commit Conventional Commits com `git add <caminhos explícitos>` (sem `auth.module.ts`/`app.module.ts`, sem `.docs/`, `.agents/`, `.plans/orchestration-*`, `.env`), validação `bunx commitlint`, co-author OpenCode Agent, `git pull --rebase` se a main andou.

## Arquivos-alvo

- Novo: `apps/api/src/modules/auth/sign-up/{sign-up.module.ts,sign-up.controller.ts,sign-up.service.ts,sign-up.dto.ts,sign-up.service.spec.ts}`, `apps/api/e2e/sign-up.e2e-spec.ts`, `apps/app/src/pages/auth/sign-up.test.tsx`, `./.plans/004-sign-up-plan.md`, `./.adrs/004-sign-up.md`.
- Alterado: `apps/app/src/pages/auth/sign-up.tsx` (preenche o placeholder da 003).
- Não tocado: `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/app.module.ts`, `.specs/`, planos/ADRs de outras specs, `.docs/AGENTS.md`, `.docs/RULES.md`, `.agents/`, `.plans/orchestration-002-008-plan.md`, `.env`.

## Riscos e edge cases

- **Anti-enumeração:** resposta idêntica para email novo/existente (teste de igualdade de body); sem email no caso existente.
- **Transporte falho:** 500 genérico + rollback compensatório (usuário removido) → reenviar o form re-tenta; loga a causa real.
- **Senhas que não batem / senha curta:** 400 por campo (client e server).
- **Email com maiúsculas:** lowercase no DTO (transform) e no service; unicidade case-insensitive.
- **Concorrência de sign-up no mesmo email:** o unique index `users_email_unique` garante unicidade; o catch do conflito pode re-levantar como 500 — aceitável nesta spec (sem retry), documentado.
- **Sem pipe global:** `@UsePipes` no controller garante validação em produção e nos testes.

## Critérios de aceite (da spec)

Checklist de `004-sign-up.md` §Critérios de aceite — cobertos por E2/E3/E5/E6/E7/E8 e QA gates.

## Checklist de QA manual

1. `bun run dev`; `curl -X POST localhost:3000/api/v1/auth/sign-up -H 'Content-Type: application/json' -d '{"first_name":"Ada","last_name":"Lovelace","email":"ada@example.com","password":"password123","confirm_password":"password123"}'` → `201 {"message":"Check your email to confirm your account"}`; repetir com o mesmo email → `201` idêntico, sem novo email no Mailtrap.
2. Conferir o email no Mailtrap com link `http://localhost:5173/auth/confirm-account?token=<token>` (com `EMAIL_TRANSPORT=mailtrap` e credenciais reais).
3. No app, `/auth/sign-up` com form inválido → erros por campo; válido → tela "Check your email".
4. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build` passam.
