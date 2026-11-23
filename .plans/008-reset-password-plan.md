# Plano — Reset Password (`008-reset-password`)

> Executa a spec `./.specs/008-reset-password.md`. Implementa a redefinição de senha ponta a ponta: `POST /api/v1/auth/reset-password` (DTO `{ token, password, confirm_password }`, validação de match no server, token 24h/uso único consumido da 007, hash bcrypt custo 10, marcação de uso, email de sucesso) e a página `/auth/reset-password` (lê `?token=`, dois campos, validação client, estados de erro, navegação pós-sucesso). Módulo autônomo em `apps/api/src/modules/auth/reset-password/`; não toca `auth.module.ts`/`app.module.ts` (wiring centralizado na onda).

## Premissas do refinamento (feature-concept — sem entrevista, decisões documentadas)

| Premissa                   | Decisão                                                                                                                                                                                       | Racional                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Consumo do token           | `hashToken(token)` (SHA-256) para o lookup em `password_reset_tokens` — igual ao padrão da 001/002/007                                                                                        | O banco só guarda o hash; o token cru vem do email (DRY).                                                                       |
| Validação                  | `token_hash` existente + `used_at` nulo + `expires_at` futuro                                                                                                                                 | Spec: uso único + 24h.                                                                                                          |
| Match                      | Validado no client (página) e no server (controller antes do use case)                                                                                                                        | Spec: server nunca confia no client.                                                                                            |
| Mensagens de erro do token | Distintas: "Invalid password reset link." (inexistente), "This password reset link has already been used." (usado), "This password reset link has expired..." (expirado)                      | Spec edge cases pedem mensagens claras e distintas; tokens são inegáveis (32 bytes), então distinguir não vaza estado de conta. |
| Nova senha                 | `PasswordService.hash` (bcrypt custo 10), mín. 8 chars (DTO `@MinLength(8)`), máx. 72 (limite do bcrypt)                                                                                      | Spec + `PasswordService` da 001.                                                                                                |
| Marcação de uso            | `used_at = now` no mesmo transaction do update do hash                                                                                                                                        | Atomicidade: senha e token mudam juntos ou nada muda.                                                                           |
| Email de sucesso           | `EmailService.sendPasswordResetSuccessEmail({ to })` (001); falha → `logger.warn` e **não** reverte o reset                                                                                   | Spec edge case: reset já aplicado; falha de envio não deve reverter.                                                            |
| Resposta de sucesso        | `200` + `{ message: "Your password has been reset. You can now sign in." }`                                                                                                                   | Spec: retorna sucesso e página navega para sign-in.                                                                             |
| Atualização do usuário     | Também toca `updated_at = now` no update de `password_hash`                                                                                                                                   | Mantém a coluna de auditoria coerente.                                                                                          |
| UI                         | Form com 2 campos (password/confirm_password), validação client (obrigatório, mín. 8, match), estados de erro (link inválido/expirado/usado), sucesso → navega para `/auth/sign-in`           | Spec §Escopo.                                                                                                                   |
| Página sem token           | Mantém o heading "Reset password" (Playwright `auth-redirects.spec.ts` exige) e mostra estado "Invalid reset link"                                                                            | Compatibilidade com teste E2E existente + critério de aceite "Página sem `?token=` → estado de erro".                           |
| Erros da API na UI         | Mapeia `payload.message` do `ApiError` para mensagens amigáveis (expired → "This link has expired"; already been used → "This link has already been used"; genérico → "Something went wrong") | Spec: estados de erro distintos para token inválido/expirado/usado.                                                             |
| Testes                     | Test-double do `EMAIL_TRANSPORT` (override) em todos os testes; para "login com nova senha", importa `SignInModule` (não recria sign-in)                                                      | Instrução da orquestração.                                                                                                      |
| Usuário não confirmado     | Reset funciona independente de `email_verified_at` (token existe da 007)                                                                                                                      | Spec edge case: confirmação e reset são independentes — documentar, sem teste dedicado obrigatório.                             |

## Objetivo

- `POST /api/v1/auth/reset-password` valida o token (existente, `used_at` nulo, `expires_at` futuro), atualiza `password_hash` (bcrypt custo 10), marca o token como usado, envia email de sucesso e responde sucesso.
- Página `/auth/reset-password` lê `?token=`, valida os dois campos no client, mostra estados de erro claros e navega para `/auth/sign-in` após sucesso.
- QA gates passando; ADR em `./.adrs/008-reset-password.md`.

## Escopo

**Dentro:** `reset-password/` (dto, controller, use case, module) + testes (`src/*.spec.ts`, `e2e/*.e2e-spec.ts`), página `reset-password.tsx` + teste de componente, plano e ADR.

**Fora:** `auth.module.ts`/`app.module.ts` (wiring da onda), geração do token/email de reset (007), sign-in (006), sign-up (004), revogação de sessões após reset, regra de não repetir senha anterior.

## Etapas

### E1. `reset-password.dto.ts`

`ResetPasswordDto` com `token` (`@IsString`, `@IsNotEmpty`, `@MaxLength(512)`), `password` (`@IsString`, `@IsNotEmpty`, `@MinLength(8)`, `@MaxLength(72)`) e `confirm_password` (mesmas regras). O match é validado no controller (server), não via decorator custom.

### E2. `reset-password.service.ts`

Injeta `DRIZZLE`, `PasswordService`, `EmailService` (+ `Logger`). `resetPassword(token: string, password: string): Promise<void>`:

1. `hashToken(token)` → lookup único em `password_reset_tokens`;
2. não existe → `BadRequestException("Invalid password reset link.")`;
3. `used_at` não nulo → `BadRequestException("This password reset link has already been used.")`;
4. `expires_at <= now` → `BadRequestException("This password reset link has expired. Please request a new one.")`;
5. `passwordService.hash(password)` (custo 10);
6. transaction: update `users.password_hash` (+ `updated_at`) e `password_reset_tokens.used_at = now`;
7. `sendPasswordResetSuccessEmail({ to: user.email })` em `try/catch` — falha loga `warn` e não reverte.

### E3. `reset-password.controller.ts`

`@Controller("auth")` + `@Public()` + `@UsePipes(ValidationPipe({ whitelist, transform }))`; `@Post("reset-password")` + `@HttpCode(200)`; antes de chamar o use case, valida match (`dto.password === dto.confirm_password` senão `BadRequestException("Passwords do not match.")`); responde `{ message: "Your password has been reset. You can now sign in." }`.

### E4. `reset-password.module.ts`

Imports `PasswordModule` + `EmailModule` (DatabaseModule é global). Controllers `[ResetPasswordController]`, providers `[ResetPasswordService]`. Sem exports.

### E5. Teste do use case (`reset-password.service.spec.ts`)

TestingModule: `ConfigModule.forRoot({isGlobal:true})` + `DatabaseModule` + `PasswordModule` + `EmailModule` + `ResetPasswordModule`, com `overrideProvider(EMAIL_TRANSPORT)` fake. Seeds usuário + token (via `hashToken`). Cenários:

- token válido → `password_hash` bate com a nova senha (via `PasswordService.verify`), `used_at` preenchido, 1 email de sucesso;
- token expirado → `BadRequestException`, hash inalterado, token não usado, sem email;
- token já usado → `BadRequestException`, sem alteração;
- token inexistente → `BadRequestException`;
- transporte de email falho → reset aplicado mesmo assim e não lança.

### E6. E2E HTTP (`apps/api/e2e/reset-password.e2e-spec.ts`)

Supertest contra `/api/v1/auth/reset-password`. TestingModule: `ConfigModule.forRoot({isGlobal:true})` + `DatabaseModule` + `PasswordModule` + `EmailModule` + `ResetPasswordModule` + `SignInModule` (para o critério "login com nova senha"). Seeds usuário com `emailVerifiedAt` + token. Cenários:

- token válido + senhas iguais → `200`; `password_hash` atualizado; token usado; email de sucesso;
- senhas diferentes → `400` sem alteração;
- token expirado → `400` sem alteração;
- token já usado → `400` sem alteração;
- token inexistente → `400`;
- após reset: `POST /api/v1/auth/sign-in` com a nova senha → `200`; com a antiga → `401`.

### E7. Página `reset-password.tsx`

Lê `?token=` via `useSearchParams`. Sem token → AuthShell "Reset password" + painel "Invalid reset link" + links (nova solicitação / sign-in). Com token → form com `password` e `confirm_password` (validação client: obrigatórios, mín. 8, match), estados de erro por campo, `formError` para falha da API mapeando expired/used/genérico, botão com loading. Sucesso → `navigate("/auth/sign-in", { replace: true })`. Paleta do AuthShell, a11y (labels, `aria-invalid`, `aria-describedby`, `role="alert"`, `aria-busy`).

### E8. Teste da página (`apps/app/src/pages/auth/reset-password.test.tsx`)

MemoryRouter (`initialEntries` com e sem token) + fetch stub: render do form; sem token → "Invalid reset link" sem form; validação bloqueia submit (vazio, <8, mismatch); sucesso → POST com body `{ token, password, confirm_password }` e navega para `/auth/sign-in`; erro expired/used → mensagens específicas; erro genérico → "Something went wrong".

### E9. QA gates

Ordem de `.docs/QA.md`: `code:fix`, `types:check`, `test`, `test:e2e`, `build`.

### E10. ADR + artefatos + commit

`./.adrs/008-reset-password.md`; commit Conventional Commits com `git add <caminhos explícitos>` (sem `auth.module.ts`/`app.module.ts`, `.docs/`, `.agents/`, `.plans/orchestration-002-008-plan.md`, `.env`), validação `bunx commitlint`, co-author OpenCode Agent, `git pull --rebase` se a main andou.

## Arquivos-alvo

- Novo: `apps/api/src/modules/auth/reset-password/{reset-password.module.ts,reset-password.controller.ts,reset-password.service.ts,reset-password.dto.ts,reset-password.service.spec.ts}`, `apps/api/e2e/reset-password.e2e-spec.ts`, `apps/app/src/pages/auth/reset-password.test.tsx`, `./.plans/008-reset-password-plan.md`, `./.adrs/008-reset-password.md`.
- Alterado: `apps/app/src/pages/auth/reset-password.tsx` (preenche o placeholder da 003).
- Não tocado: `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/app.module.ts`, `.specs/`, planos/ADRs de outras specs, `.docs/`, `.env`, arquivos do subagent 005.

## Riscos e edge cases

- **Conflito com 005/007:** arquivos todos distintos (`reset-password/*`); nenhuma sobreposição com `confirm-account` ou `forgot-password`.
- **Email de sucesso falho:** reset já aplicado; `warn` + segue (não reverte).
- **Mensagens distintas para token inválido/usado/expirado:** seguras porque tokens são inegáveis (32 bytes); spec exige clareza.
- **Banco compartilhado:** emails únicos por teste (`Date.now()` + random) e cleanup em `afterAll` (`password_reset_tokens` → `users`).
- **Playwright existente:** heading "Reset password" preservado no estado sem token.

## Critérios de aceite (da spec)

Checklist de `008-reset-password.md` §Critérios de aceite — cobertos por E2–E8 e QA gates.

## Checklist de QA manual

1. `bun run dev`; com usuário e token válidos (gerado via 007 no Mailtrap): abrir `{APP_URL}/auth/reset-password?token=<token>`, definir nova senha (mín. 8) → navega para `/auth/sign-in`; email de sucesso chega no Mailtrap.
2. Login com a nova senha → OK; com a antiga → erro.
3. Reabrir o mesmo link → "This link has already been used".
4. Sem `?token=` → estado "Invalid reset link".
5. Senhas diferentes / <8 chars → erro por campo (client e server).
6. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build` passam.
