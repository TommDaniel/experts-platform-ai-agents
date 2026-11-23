# Plano — Sign-in (`006-sign-in`)

> Executa a spec `./.specs/006-sign-in.md`. Implementa o login ponta a ponta: `POST /api/v1/auth/sign-in` (validação, anti-enumeração, email de nova sessão best-effort, sessão "última vence") e a página `/auth/sign-in` (campos, erro genérico, persistência do token e navegação para `/app`). Módulo autônomo em `apps/api/src/modules/auth/sign-in/`; não toca em `auth.module.ts`/`app.module.ts` (wiring centralizado na onda).

## Premissas do refinamento (feature-concept — sem entrevista, decisões documentadas)

| Premissa                       | Decisão                                                                                                                   | Racional                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Anti-enumeração por timing     | Executar `PasswordService.verify(password, hash)` também quando o email não existe, contra um hash bcrypt dummy constante | Mesmo custo de CPU no caminho de sucesso/insucesso; resposta idêntica (spec: "executar o mesmo caminho de hash mesmo sem usuário"). |
| Email de nova sessão falho     | `sendNewSessionEmail` em `try/catch`: loga `warn` e **continua** o login                                                  | Decisão da spec: "o login NÃO deve falhar se o email falhar"; credenciais Mailtrap locais são placeholder.                          |
| Transporte de email nos testes | Test-double (`overrideProvider(EMAIL_TRANSPORT)`) com um `EmailTransport` fake que acumula mensagens                      | Evita SMTP real nos testes; permite assertar o envio.                                                                               |
| Resposta de sucesso            | `200` com `{ token }`                                                                                                     | Spec: "200 com token de sessão"; Bearer/localStorage (decisão da 003).                                                              |
| Validação do DTO               | `ValidationPipe({ whitelist, transform })` no controller (`@UsePipes`)                                                    | Mantém o módulo autônomo sem alterar `main.ts` (não existe pipe global; o orquestrador faz o wiring).                               |
| Conta não confirmada           | `email_verified_at` nulo → mesmo `401` genérico; sem email e sem sessão                                                   | Decisão da spec (não vaza estado da conta).                                                                                         |
| Normalização do email          | `trim().toLowerCase()` no use case antes do lookup                                                                        | Spec: lookup por email lowercase.                                                                                                   |
| Fluxo pós-sucesso (UI)         | `setStoredToken(response.token)` + `refresh()` + `navigate("/app")`                                                       | Reusa `AuthContext`/`apiClient` da 003; guard valida a sessão.                                                                      |
| Mensagens                      | en-us, erro genérico "Invalid email or password."                                                                         | Convenção da 001 + decisão da spec.                                                                                                 |

## Objetivo

- `POST /api/v1/auth/sign-in` autentica email+senha, envia email de nova sessão (best-effort), cria sessão revogando as anteriores e responde `{ token }`.
- Respostas `401` idênticas para senha errada / email inexistente / conta não confirmada.
- Página `/auth/sign-in` valida campos, mostra erro genérico, persiste o token e navega para `/app`.
- QA gates passando; ADR em `./.adrs/006-sign-in.md`.

## Escopo

**Dentro:** `sign-in/` (dto, controller, use case, module) + testes (`src/*.spec.ts`, `e2e/*.e2e-spec.ts`), página `sign-in.tsx` + teste de componente, `class-validator`/`class-transformer` em `apps/api`, plano e ADR.

**Fora:** `auth.module.ts`/`app.module.ts` (wiring da onda), sign-up (004), confirm-account (005), forgot/reset (007/008), rate limiting, refresh token, migrações de banco (schema já existe da 001).

## Etapas

### E1. Dependências

`class-validator` + `class-transformer` em `apps/api` (já instalados via `bun add`).

### E2. `sign-in.dto.ts`

`SignInDto` com `email` (`@IsEmail`, `@MaxLength(255)`) e `password` (`@IsString`, `@IsNotEmpty`, `@MaxLength(72)`).

### E3. `sign-in.service.ts`

- Injeta `DRIZZLE`, `PasswordService`, `SessionService`, `EmailService`, `Logger`.
- `signIn(email, password): Promise<string>`:
  1. normaliza email (trim + lowercase);
  2. lookup único por email;
  3. roda `verify(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)` sempre;
  4. falha (sem usuário, senha inválida, `email_verified_at` nulo) → `UnauthorizedException("Invalid email or password")`;
  5. `sendNewSessionEmail({ to })` em `try/catch` (warn e segue);
  6. `return sessionService.createSession(user.id)`.

### E4. `sign-in.controller.ts`

`@Controller("auth")` + `@Public()` + `@UsePipes(ValidationPipe)`; `@Post("sign-in")` + `@HttpCode(200)` → `{ token }`.

### E5. `sign-in.module.ts`

Imports `AuthModule` (SessionService), `PasswordModule`, `EmailModule`; providers `[SignInService]`; controllers `[SignInController]`. Sem exports.

### E6. Teste de integração do use case (`sign-in.service.spec.ts`)

TestingModule: `ConfigModule.forRoot({isGlobal:true})` + `DatabaseModule` + `PasswordModule` + `EmailModule` + `AuthModule` + `SignInModule`, com `EMAIL_TRANSPORT` override. Cenários: sucesso (token + sessão ativa + email enviado + anteriores revogadas), senha errada (401), email inexistente (401 mesmo body), conta não confirmada (401, sem email/sessão), 2 sign-ins → última vence.

### E7. E2E HTTP (`apps/api/e2e/sign-in.e2e-spec.ts`)

Supertest contra `/api/v1/auth/sign-in` (mesmo TestingModule): 200+token válido no `/auth/me`, 401 idênticos (senha/inexistente/não confirmada), duas sessões (primeira cai), 400 de validação (campos ausentes/inválidos), email enviado uma vez por login.

### E8. Página `sign-in.tsx`

Form com `email` + `password`, validação client (obrigatórios + formato), erro genérico (`role="alert"`), estado de loading no botão, sucesso → `setStoredToken` + `refresh()` + `navigate("/app")`. Mantém links (`AuthLink`) para sign-up e forgot-password. Estilo na paleta (AuthShell), a11y (labels, `aria-describedby`, `aria-invalid`, `aria-busy`).

### E9. Teste da página (`apps/app/src/pages/auth/sign-in.test.tsx`)

MemoryRouter + `useAuth` mockado (`refresh`) + fetch stub: validação bloqueia submit, credencial inválida mostra erro genérico, sucesso persiste token e navega para `/app`.

### E10. QA gates

Ordem de `.docs/QA.md`: `code:fix`, `types:check`, `test`, `test:e2e`, `build`.

### E11. ADR + artefatos + commit

`./.adrs/006-sign-in.md`; commit Conventional Commits com `git add <caminhos explícitos>` (sem `auth.module.ts`/`app.module.ts`), validação `bunx commitlint`, co-author OpenCode Agent, `git pull --rebase` se a main andou.

## Arquivos-alvo

- Novo: `apps/api/src/modules/auth/sign-in/{sign-in.module.ts,sign-in.controller.ts,sign-in.service.ts,sign-in.dto.ts,sign-in.service.spec.ts}`, `apps/api/e2e/sign-in.e2e-spec.ts`, `apps/app/src/pages/auth/sign-in.test.tsx`, `./.plans/006-sign-in-plan.md`, `./.adrs/006-sign-in.md`.
- Alterado: `apps/app/src/pages/auth/sign-in.tsx` (preenche o placeholder da 003), `apps/api/package.json` + `bun.lock` (class-validator/class-transformer).
- Não tocado: `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/app.module.ts`, `.specs/`, planos/ADRs de outras specs, `.env`.

## Riscos e edge cases

- **Timing de anti-enumeração:** hash dummy constante; custo igual em todos os caminhos.
- **Email falho:** nunca falha o login (warn + continue) — coberto no teste com transport fake que lança.
- **Email com maiúsculas:** lowercase antes do lookup (teste).
- **Sessão anterior:** revogada em transação pela `SessionService` (002) — teste de duas sessões.
- **Conta não confirmada:** 401 genérico, sem email e sem sessão.
- **Conflito de package.json/bun.lock com 004:** ambas instalam as mesmas deps; diff mínimo e aditivo.
- **Sem pipe global:** `@UsePipes` no controller garante validação em produção e nos testes.

## Critérios de aceite (da spec)

Checklist de `006-sign-in.md` §Critérios de aceite — cobertos por E3/E4/E6/E7/E8/E9 e QA gates.

## Checklist de QA manual

1. `bun run dev`; com usuário confirmado no banco, `curl -X POST localhost:3000/api/v1/auth/sign-in -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'` → `{ token }`; repetir e conferir que o primeiro token falha em `/api/v1/auth/me`.
2. Senha errada/email inexistente → `401 {"message":"Invalid email or password",...}`.
3. No app, `/auth/sign-in` com credenciais válidas → home `/app`; com inválidas → erro genérico no card.
4. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build` passam.
