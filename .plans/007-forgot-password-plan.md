# Plano — Forgot Password (`007-forgot-password`)

> Executa a spec `./.specs/007-forgot-password.md`. Implementa a solicitação de reset de senha ponta a ponta: `POST /api/v1/auth/forgot-password` (DTO validado, anti-enumeração total, token de 24h em `password_reset_tokens`, email com link) e a página `/auth/forgot-password` (campo email, validação, sucesso genérico). Módulo autônomo em `apps/api/src/modules/auth/forgot-password/`; não toca `auth.module.ts`/`app.module.ts` (wiring centralizado na onda).

## Premissas do refinamento (feature-concept — sem entrevista, decisões documentadas)

| Premissa                  | Decisão                                                                                                                                                  | Racional                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato do token          | Reusa `generateSessionToken`/`hashToken` (`../session/session-token.ts`): `randomBytes(32)` base64url no link; apenas SHA-256 persistido em `token_hash` | Mesmo padrão da 002 (DRY); o token cru só existe no email — vazamento do banco não permite uso.                                                                 |
| Expiração                 | `expiresAt = now + 24h`, `usedAt = null` (uso único)                                                                                                     | Spec: token 24h, uso único.                                                                                                                                     |
| Token ativo anterior      | Revogar (`usedAt = now`) todos os `password_reset_tokens` do usuário com `used_at IS NULL` e `expires_at > now` antes de inserir o novo                  | Spec edge case: "gerar novo token invalida o anterior? Sim" — evita links velhos válidos.                                                                       |
| Transporte de email falho | Persistir o token e logar `warn`; resposta `202` genérica mesmo assim                                                                                    | `500` para conta existente vs `202` para inexistente vazaria a existência (anti-enumeração). Retry manual = nova solicitação (spec 008 usa o token persistido). |
| Timing anti-enumeração    | Gerar o token (custo de `randomBytes` + hash) sempre, antes do branch existe/inexiste                                                                    | Minimiza diferença observável; a diferença restante (insert + envio) é trade-off documentado (sem hash de senha neste fluxo; rate limiting adiado).             |
| Resposta `202`            | `{ message: "If the account exists, we sent a link" }` idêntica nos dois casos                                                                           | Spec: resposta idêntica + mensagem genérica de sucesso.                                                                                                         |
| Validação do DTO          | `ValidationPipe({ whitelist, transform })` no controller (`@UsePipes`)                                                                                   | Módulo autônomo sem alterar `main.ts` (padrão da 006).                                                                                                          |
| Normalização do email     | `trim().toLowerCase()` antes do lookup                                                                                                                   | Spec + padrão da 006 (`users_email_unique` é case-sensitive no Postgres).                                                                                       |
| Email inexistente         | Nenhum token, nenhum email, resposta idêntica                                                                                                            | Spec "o que não fazer": nunca enviar email quando a conta não existe.                                                                                           |
| Email com link            | `EmailService.sendPasswordResetEmail({ to, token })` (001) — link `{APP_URL}/auth/reset-password?token=<token>`                                          | Não criar templates/métodos novos (instrução da orquestração).                                                                                                  |
| UI                        | Form com email + validação client; sucesso substitui o form por mensagem "If the account exists, we sent a link"; `AuthLink` de volta ao sign-in         | Spec §Escopo: mensagem genérica em ambos os casos; usuário não sabe distinguir.                                                                                 |
| Erro genérico na UI       | Falha de rede/`500` → "Something went wrong. Please try again." (não revela existência)                                                                  | Preserva anti-enumeração também no client.                                                                                                                      |
| Testes                    | Test-double do `EMAIL_TRANSPORT` (override) em todos os testes; Mailtrap placeholder não é chamado                                                       | Instrução da orquestração: credenciais Mailtrap não são reais.                                                                                                  |

## Objetivo

- `POST /api/v1/auth/forgot-password` aceita um email, cria token de 24h (uso único, revogando ativos anteriores) e envia o email de reset — **somente** quando a conta existe; resposta `202` idêntica em todos os casos.
- Página `/auth/forgot-password` coleta o email, valida formato, mostra sucesso genérico e link de volta ao sign-in.
- QA gates passando; ADR em `./.adrs/007-forgot-password.md`.

## Escopo

**Dentro:** `forgot-password/` (dto, controller, use case, module) + testes (`src/*.spec.ts`, `e2e/*.e2e-spec.ts`), página `forgot-password.tsx` + teste de componente, plano e ADR.

**Fora:** `auth.module.ts`/`app.module.ts` (wiring da onda), reset em si (008), sign-in (006), sign-up (004), rate limiting, reenvio de email, migrações de banco (schema da 001).

## Etapas

### E1. `forgot-password.dto.ts`

`ForgotPasswordDto` com `email` (`@IsEmail`, `@MaxLength(255)`), espelhando `SignInDto`.

### E2. `forgot-password.service.ts`

Injeta `DRIZZLE` e `EmailService` (+ `Logger`). `requestPasswordReset(email: string): Promise<void>`:

1. normaliza email (trim + lowercase);
2. lookup único por email em `users`;
3. gera token (`generateSessionToken()`) e hash (`hashToken`) — sempre, mesmo sem usuário;
4. se usuário existe: revoga tokens ativos anteriores (`usedAt = now` onde `user_id` e `used_at IS NULL` e `expires_at > now`), insere novo `password_reset_tokens` (`token_hash`, `expiresAt = now + 24h`);
5. se usuário existe: `sendPasswordResetEmail({ to, token })` em `try/catch` (warn + segue);
6. retorna `void` — nada é exposto.

### E3. `forgot-password.controller.ts`

`@Controller("auth")` + `@Public()` + `@UsePipes(ValidationPipe({ whitelist, transform }))`; `@Post("forgot-password")` + `@HttpCode(202)` → `{ message: "If the account exists, we sent a link" }`.

### E4. `forgot-password.module.ts`

Imports `EmailModule` (EmailService); `DatabaseModule` é global. Providers `[ForgotPasswordService]`; controllers `[ForgotPasswordController]`. Sem exports.

### E5. Teste do use case (`forgot-password.service.spec.ts`)

TestingModule: `ConfigModule.forRoot({isGlobal:true})` + `DatabaseModule` + `PasswordModule` + `EmailModule` + `ForgotPasswordModule`, com `overrideProvider(EMAIL_TRANSPORT)` fake acumulando mensagens. Cenários:

- email existente → token persistido (hash do token do email, `used_at` null, `expires_at` ~24h) + 1 email com link `.../auth/reset-password?token=<token>`;
- email existente com token ativo anterior → anterior ganha `used_at`, apenas 1 token ativo novo;
- email inexistente → nenhum token, nenhum email;
- email com maiúsculas → normalizado (token criado para o usuário lowercase);
- transporte falho → não lança e token permanece persistido.

### E6. E2E HTTP (`apps/api/e2e/forgot-password.e2e-spec.ts`)

Supertest contra `/api/v1/auth/forgot-password` (mesmo TestingModule, `setGlobalPrefix("api/v1")`):

- email cadastrado → `202` + body genérico; token criado (24h); email enviado com link correto;
- email inexistente → `202` com **exatamente o mesmo body**; nenhum token; nenhum email;
- segundo request para conta existente → token anterior revogado (`used_at` set) e novo token enviado;
- email malformado → `400` de validação.

### E7. Página `forgot-password.tsx`

Form com `email` (`type="email"`, `autoComplete="email"`), validação client (obrigatório + `EMAIL_PATTERN`), estado de loading no botão ("Sending…"), sucesso substitui o form por painel "If the account exists, we sent a link" (com dica de que é genérico), `AuthLink` de volta ao sign-in. Paleta do AuthShell, a11y (labels, `aria-describedby`, `aria-invalid`, `aria-busy`).

### E8. Teste da página (`apps/app/src/pages/auth/forgot-password.test.tsx`)

MemoryRouter + fetch stub: renderiza form, validação bloqueia submit (email vazio/malformado), sucesso mostra a mensagem genérica e envia o body correto, falha mostra erro genérico.

### E9. QA gates

Ordem de `.docs/QA.md`: `code:fix`, `types:check`, `test`, `test:e2e`, `build`.

### E10. ADR + artefatos + commit

`./.adrs/007-forgot-password.md`; commit Conventional Commits com `git add <caminhos explícitos>` (sem `auth.module.ts`/`app.module.ts`), validação `bunx commitlint`, co-author OpenCode Agent, `git pull --rebase` se a main andou.

## Arquivos-alvo

- Novo: `apps/api/src/modules/auth/forgot-password/{forgot-password.module.ts,forgot-password.controller.ts,forgot-password.service.ts,forgot-password.dto.ts,forgot-password.service.spec.ts}`, `apps/api/e2e/forgot-password.e2e-spec.ts`, `apps/app/src/pages/auth/forgot-password.test.tsx`, `./.plans/007-forgot-password-plan.md`, `./.adrs/007-forgot-password.md`.
- Alterado: `apps/app/src/pages/auth/forgot-password.tsx` (preenche o placeholder da 003).
- Não tocado: `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/app.module.ts`, `.specs/`, planos/ADRs de outras specs, `.env`.

## Riscos e edge cases

- **Timing:** token sempre gerado antes do branch; diferença de insert+email documentada e aceita (anti-enumeração da resposta prevalece).
- **Email falho:** nunca lança para o caller (warn + segue); token persistido habilita retry manual (008).
- **Conflito com 004/006:** arquivos todos distintos (`forgot-password/*`, `forgot-password.*`); deps `class-validator`/`class-transformer` já adicionadas por 006 e instaladas.
- **Banco compartilhado:** emails únicos por teste (`Date.now()` + random) e cleanup em `afterAll` (`password_reset_tokens` → `users`).

## Critérios de aceite (da spec)

Checklist de `007-forgot-password.md` §Critérios de aceite — cobertos por E2/E3/E5/E6/E7/E8 e QA gates.

## Checklist de QA manual

1. `bun run dev`; com usuário existente: `curl -X POST localhost:3000/api/v1/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"...@example.com"}'` → `202 {"message":"If the account exists, we sent a link"}`; repetir e conferir o token novo no Mailtrap e o anterior revogado.
2. Email inexistente → `202` com exatamente o mesmo body; nenhum email no Mailtrap.
3. Email malformado → `400`.
4. No app, `/auth/forgot-password`: submit com email válido → mensagem genérica; campo vazio/malformado → erro por campo.
5. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build` passam.
