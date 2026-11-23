# Plano — Refatoração de vertical slices para arquitetura hexagonal em camadas

> Repositório: `coders-university-post-ia-module-4` · Raiz dos módulos: `apps/api/src/modules`
> Data: 2026-08-11 · Autor: subagent planner (skill `refactor-slices`)
> Base: `.plans/vertical-slice-refactor-audit.md` · Escopo: planejamento. Nenhum arquivo de código foi alterado.

---

## 1. Objetivo

Alinhar as 9 vertical slices do back-end (`auth/*` e `shared/*`) ao padrão-alvo do projeto:
arquitetura em camadas (`interface` / `application` / `domain` / `infrastructure`), **1 endpoint = 1
request handler**, **1 fluxo = 1 use-case**, ports/adapters para toda persistência e transportes,
composition root na raiz de cada slice e **zero** HTTP leak e **zero** acesso direto a `db`/`schema`
na camada `application`.

O comportamento HTTP observável deve permanecer **byte-a-byte idêntico** (rotas, status e mensagens
dos e2e), e a observabilidade existente (`auth.signup.count`) deve ser preservada.

## 2. Escopo (slices no range)

| #   | Slice                                                   | Ação                                                                                                        |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | `auth/` (raiz: `auth.controller.ts` + `auth.module.ts`) | Health vira slice `auth/health`; `auth.module.ts` vira passthrough transitório e é removido no wiring final |
| 2   | `auth/session`                                          | `SessionModule` próprio (3 use-cases, port+adapter, guards consolidados, 2 request handlers)                |
| 3   | `auth/sign-up`                                          | camadas + use-case + request handler                                                                        |
| 4   | `auth/sign-in`                                          | camadas + use-case + request handler                                                                        |
| 5   | `auth/confirm-account`                                  | camadas + use-case + request handler                                                                        |
| 6   | `auth/forgot-password`                                  | camadas + use-case + request handler                                                                        |
| 7   | `auth/reset-password`                                   | camadas + use-case + request handler                                                                        |
| 8   | `shared/email`                                          | reestruturação estrutural (port/adapter já existentes)                                                      |
| 9   | `shared/password`                                       | port `PasswordHasher` + adapter `BcryptHasherAdapter`                                                       |
| 10  | `shared/tokens` (**novo**)                              | extração de `session/session-token.ts` (usado por 5 slices + guards)                                        |
| 11  | `auth/users` (**novo**)                                 | agregado de persistência de usuários (port + adapter Drizzle + `normalizeEmail`)                            |
| 12  | `auth/email-confirmation-tokens` (**novo**)             | agregado de persistência de tokens de confirmação                                                           |
| 13  | `auth/password-reset-tokens` (**novo**)                 | agregado de persistência de tokens de reset                                                                 |
| 14  | `auth/health` (**novo**)                                | request handler de `GET /auth`                                                                              |

Fora de escopo: `apps/api/src/db/*`, `apps/api/src/app.controller.ts`/`app.service.ts` (GET /), front-end, observability/scripts.

## 3. Arquitetura-alvo (convenções obrigatórias — do SKILL.md)

Cada slice de fluxo vira:

```
modules/<domain>/<slice>/
├── application/<slice>.use-case.ts        # @Injectable, UM método execute(), fluxo único
├── domain/<slice>.{policy,errors,types}.ts# constantes de negócio (TTL), erros de domínio, tipos
├── infrastructure/…                        # adapters concretos (repository/transport) OU .gitkeep
├── interface/<slice>.request-handler.ts    # @Controller, UM endpoint, UM método handle()
├── interface/<slice>.dto.ts                # validação do request HTTP
└── <slice>.module.ts                       # composition root
```

Regras que **não** se negociam:

- `application` conhece **ports** (interfaces de `domain`) e serviços injetados; nunca `DRIZZLE`, `db/schema` nem classe concreta de infra.
- HTTP leak (exceptions `BadRequest/Unauthorized/InternalServerError` + constantes de mensagem) sai do `application` e vai para `interface` (request handler). Exceção **aceita**: `AuthGuard`/`CurrentUser` (camada interface) lançam `UnauthorizedException`.
- O use-case retorna/levanta **erros de domínio** (classes custom em `domain/<slice>.errors.ts`); o handler mapeia erro de domínio → status HTTP + mensagem.
- Regra de negócio (TTL, `DUMMY_PASSWORD_HASH`, normalização de email) vai para `domain`; crypto (geração/hash de token, bcrypt) vai para `infrastructure` (adapter).
- Camadas sem conteúdo recebem `.gitkeep` + nota "vazia por design".
- Relação request handler → use-case é **1:1**; método do handler: `handle()`; método do use-case: `execute()`.
- Slices de fluxo dependem da sessão via `SessionModule` (que exporta os use-cases), **nunca** via `AuthModule`.

### Decisões arquiteturais registradas (racional para o ADR final)

1. **Sessão = 3 use-cases + aggregate de persistência.** `session.service.ts` (3 fluxos) vira
   `CreateSessionUseCase`, `ValidateSessionUseCase`, `RevokeSessionUseCase` sobre o port
   `SessionsRepository` (adapter Drizzle). A regra "last wins" (revogar sessões ativas anteriores +
   inserir a nova **atomicamente**) é contrato do port `SessionsRepository.create(...)` — a transação é
   mecanismo de infra, a regra de negócio fica declarada no contrato do port.
2. **Guards consolidados.** `SessionGuard` (rota) é idêntico ao `AuthGuard` exceto pelo handling de
   `@Public`. Após dividir `me`/`logout` em handlers próprios, o guard por rota fica desnecessário:
   `GetMeRequestHandler` não carrega `@Public` (o `AuthGuard` global valida) e
   `LogoutRequestHandler` carrega `@Public` e faz o parse/revoke por conta própria (comportamento atual
   preservado). `SessionGuard` é **removido**; `AuthGuard` passa a ser o único guard (fica em
   `session/interface/auth.guard.ts`).
3. **Persistência compartilhada em agregados.** Como `users`, `emailConfirmationTokens`,
   `passwordResetTokens` e `sessions` são tocados por várias slices, os ports/adapters Drizzle vivem em
   **módulos agregados** (`auth/users`, `auth/email-confirmation-tokens`, `auth/password-reset-tokens`,
   `auth/session`), não duplicados por slice (DRY). Cada use-case injeta só o port que precisa.
4. **Normalização de email tem residência única** em `auth/users/domain/email.ts` (`normalizeEmail`).
   O `@Transform` do DTO de sign-up é **removido** (a normalização sai da interface) e passa a ser feita
   no use-case antes de qualquer lookup/insert. `sign-in` e `forgot-password` também passam a usar
   `normalizeEmail`.
5. **`shared/tokens` expõe funções + adapter.** `generateSessionToken`/`hashToken` continuam exportadas
   de `infrastructure/token.adapter.ts` (usadas em setup de testes e como implementação do
   `CryptoTokenAdapter implements TokenService`); `parseBearerToken` vai para `interface/bearer-token.parser.ts`.
   Use-cases injetam o port `TOKEN_SERVICE` (nunca importam crypto direto).
6. **`auth.module.ts` é transitório.** Na onda 3 vira passthrough (`imports/exports: [SessionModule]` +
   `controllers: [AuthController]`) para manter o `APP_GUARD` e o health vivos; é **removido** na onda 6
   (wiring final), quando `AppModule` importa as slices diretamente.
7. **`EmailService` mantém 1 classe com 4 métodos.** É serviço compartilhado de infra/fachada sobre o
   port `EmailTransport`; aceito como desvio de baixa prioridade (registrado no audit §3.8).
8. **`SignUpService` → use-case mantém transações por compensação.** `users.create` + token insert não
   são mais uma única transação Drizzle; falha no insert do token compensa com `users.deleteById`.
   A falha de email continua fazendo rollback via `users.deleteById` (cascade remove o token). O estado
   final do banco permanece igual ao atual (verificado pelos testes).
9. **`PasswordService` → `BcryptHasherAdapter` + port `PASSWORD_HASHER`.** Renomeia e inverte a
   dependência; `BCRYPT_COST = 10` é constante de infra do adapter.

---

## 4. Mapa de arquivos (atual → alvo), por slice

### 4.1 `shared/tokens` (novo — extração de `auth/session/session-token.ts`)

| De                                   | Para                                                  | Responsabilidade                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/session/session-token.ts`      | `shared/tokens/domain/token.port.ts`                  | Port `TokenService { generate(): string; hash(token: string): string }` + símbolo `TOKEN_SERVICE`                                                             |
|                                      | `shared/tokens/infrastructure/token.adapter.ts`       | Funções `generateSessionToken()` e `hashToken(token)` (crypto: `randomBytes(32).base64url`, sha256 hex) + classe `CryptoTokenAdapter implements TokenService` |
|                                      | `shared/tokens/interface/bearer-token.parser.ts`      | Função `parseBearerToken(header: string \| undefined): string \| null` (parse de header HTTP)                                                                 |
|                                      | `shared/tokens/tokens.module.ts`                      | Composition root: `providers: [{ provide: TOKEN_SERVICE, useClass: CryptoTokenAdapter }]`, `exports: [TOKEN_SERVICE]`                                         |
| `auth/session/session-token.spec.ts` | `shared/tokens/infrastructure/token.adapter.spec.ts`  | Geração (43 chars, unicidade) + hash (sha256 hex, determinístico)                                                                                             |
|                                      | `shared/tokens/interface/bearer-token.parser.spec.ts` | `parseBearerToken` (extração, case-insensitive, malformado)                                                                                                   |
| —                                    | `shared/tokens/application/.gitkeep`                  | Vazia por design (não há use-case de token)                                                                                                                   |

### 4.2 `shared/password`

| De                                         | Para                                                           | Responsabilidade                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `shared/password/password.service.ts`      | `shared/password/domain/password.port.ts`                      | Port `PasswordHasher { hash(pw): Promise<string>; verify(pw, hash): Promise<boolean> }` + símbolo `PASSWORD_HASHER` |
|                                            | `shared/password/infrastructure/bcrypt-hasher.adapter.ts`      | `BcryptHasherAdapter implements PasswordHasher` (bcrypt, `BCRYPT_COST = 10`)                                        |
| `shared/password/password.module.ts`       | `shared/password/password.module.ts` (reescrito)               | `providers/exports: [{ provide: PASSWORD_HASHER, useClass: BcryptHasherAdapter }]`                                  |
| `shared/password/password.service.spec.ts` | `shared/password/infrastructure/bcrypt-hasher.adapter.spec.ts` | hash cost 10, verify true/false, `BCRYPT_COST === 10`                                                               |
| —                                          | `shared/password/application/.gitkeep`, `interface/.gitkeep`   | Vazias por design                                                                                                   |

### 4.3 `shared/email`

| De                                | Para                                             | Responsabilidade                                                                               |
| --------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `email.types.ts`                  | `domain/email.types.ts`                          | Port `EmailTransport`, `EmailMessage`, `EmailTransportName`, inputs de email (mover sem mudar) |
| `email.constants.ts`              | `domain/email.constants.ts`                      | `EMAIL_TRANSPORT` (símbolo DI)                                                                 |
| `email-templates.ts`              | `domain/email-templates.ts`                      | Templates HTML (domínio puro, mover sem mudar)                                                 |
| `mailtrap.transport.ts`           | `infrastructure/mailtrap.transport.ts`           | Adapter SMTP                                                                                   |
| `resend.transport.ts`             | `infrastructure/resend.transport.ts`             | Adapter Resend                                                                                 |
| `email-transport.factory.ts`      | `infrastructure/email-transport.factory.ts`      | Seleção de transport por env                                                                   |
| `email.service.ts`                | `application/email.service.ts`                   | `EmailService` (fachada 4 métodos, inalterado)                                                 |
| `email.module.ts`                 | `email.module.ts` (paths atualizados)            | Factory `EMAIL_TRANSPORT` + `EmailService`, `exports: [EmailService]`                          |
| `email.service.spec.ts`           | `application/email.service.spec.ts`              | Mover sem mudar                                                                                |
| `email-transport.factory.spec.ts` | `infrastructure/email-transport.factory.spec.ts` | Mover sem mudar                                                                                |
| —                                 | `interface/.gitkeep`                             | Vazia por design                                                                               |

### 4.4 `auth/users` (novo — agregado de persistência)

| Arquivo                                      | Responsabilidade                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/users.repository.ts`                 | `UsersRepository` + símbolo `USERS_REPOSITORY`. Métodos: `findByEmail(email)`, `findById(id)`, `create(input) → id`, `deleteById(id)`, `setEmailVerified(id, at)`, `setPasswordHash(id, hash, updatedAt)`. Tipos `UserRecord` e `CreateUserInput` |
| `domain/email.ts`                            | `normalizeEmail(email: string): string` = `email.trim().toLowerCase()`                                                                                                                                                                            |
| `infrastructure/users.repository.ts`         | `DrizzleUsersRepository implements UsersRepository` (importa `DRIZZLE` de `db/database.module` e `users` de `db/schema`)                                                                                                                          |
| `users.module.ts`                            | `imports: [DatabaseModule]`; `providers/exports: [{ provide: USERS_REPOSITORY, useClass: DrizzleUsersRepository }]`                                                                                                                               |
| `application/.gitkeep`, `interface/.gitkeep` | Vazias por design (sem use-case/endpoint)                                                                                                                                                                                                         |

### 4.5 `auth/email-confirmation-tokens` (novo)

| Arquivo                                                  | Responsabilidade                                                                                                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/email-confirmation-tokens.repository.ts`         | Port `EmailConfirmationTokensRepository` + símbolo. Métodos: `create({ userId, tokenHash, expiresAt })`, `findByHash(tokenHash)`, `markUsed(id, usedAt)`. Tipo `EmailConfirmationTokenRecord` |
| `infrastructure/email-confirmation-tokens.repository.ts` | Adapter Drizzle                                                                                                                                                                               |
| `email-confirmation-tokens.module.ts`                    | Composition root (Drizzle)                                                                                                                                                                    |
| `.gitkeep` (application, interface)                      | Vazias por design                                                                                                                                                                             |

### 4.6 `auth/password-reset-tokens` (novo)

| Arquivo                                              | Responsabilidade                                                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain/password-reset-tokens.repository.ts`         | Port `PasswordResetTokensRepository` + símbolo. Métodos: `create({ userId, tokenHash, expiresAt })`, `revokeActiveByUser(userId, usedAt)`, `findByHash(tokenHash)`, `markUsed(id, usedAt)` |
| `infrastructure/password-reset-tokens.repository.ts` | Adapter Drizzle                                                                                                                                                                            |
| `password-reset-tokens.module.ts`                    | Composition root                                                                                                                                                                           |
| `.gitkeep` (application, interface)                  | Vazias por design                                                                                                                                                                          |

### 4.7 `auth/session` (nó central)

| De                                                   | Para                                       | Responsabilidade                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session/session.service.ts` (3 fluxos)              | `application/create-session.use-case.ts`   | `CreateSessionUseCase.execute(userId): Promise<string>` — gera token (port `TOKEN_SERVICE`) e chama `SessionsRepository.create` (last-wins)                                                                                                                                                                                                                                                                               |
|                                                      | `application/validate-session.use-case.ts` | `ValidateSessionUseCase.execute(token): Promise<ValidatedSession \| null>` — `hash` + `findValidByHash`                                                                                                                                                                                                                                                                                                                   |
|                                                      | `application/revoke-session.use-case.ts`   | `RevokeSessionUseCase.execute(token): Promise<void>` — `hash` + `revokeByHash`                                                                                                                                                                                                                                                                                                                                            |
| `session/session.service.ts` (apagar)                | —                                          | Lógica distribuída nos 3 use-cases                                                                                                                                                                                                                                                                                                                                                                                        |
| —                                                    | `domain/session.repository.ts`             | Port `SessionsRepository` + `SESSIONS_REPOSITORY`. `create(userId, tokenHash)` (revoga ativas + insere, atômico), `findValidByHash(tokenHash)`, `revokeByHash(tokenHash)`                                                                                                                                                                                                                                                 |
| `session/auth.types.ts`                              | `domain/session.types.ts`                  | `SessionUser`, `ValidatedSession` (tipos de domínio)                                                                                                                                                                                                                                                                                                                                                                      |
|                                                      | `interface/authenticated-request.ts`       | `AuthenticatedRequest extends Request` (`session?`, `token?`) — tipo de interface                                                                                                                                                                                                                                                                                                                                         |
| `session/session.controller.ts` (2 endpoints)        | `interface/get-me.request-handler.ts`      | `GetMeRequestHandler` — `@Controller("auth")` sem `@Public`, `@Get("me")`, `handle(@CurrentUser() user)` → retorna `SessionUser`                                                                                                                                                                                                                                                                                          |
|                                                      | `interface/logout.request-handler.ts`      | `LogoutRequestHandler` — `@Controller("auth") @Public()`, `@Post("logout") @HttpCode(200)`, `handle(@Headers("authorization"))` → `parseBearerToken`, se token chama `RevokeSessionUseCase.execute`, retorna `{ success: true }`                                                                                                                                                                                          |
| `session/auth.guard.ts` + `session/session.guard.ts` | `interface/auth.guard.ts`                  | **Único guard**: `AuthGuard implements CanActivate` — `@Public` via Reflector + `parseBearerToken` + `ValidateSessionUseCase` + `UnauthorizedException`. `SessionGuard` é **removido**                                                                                                                                                                                                                                    |
| `session/current-user.decorator.ts`                  | `interface/current-user.decorator.ts`      | Mover sem mudar (lança `UnauthorizedException` — interface)                                                                                                                                                                                                                                                                                                                                                               |
| `session/public.decorator.ts`                        | `interface/public.decorator.ts`            | Mover sem mudar                                                                                                                                                                                                                                                                                                                                                                                                           |
| —                                                    | `infrastructure/session.repository.ts`     | `DrizzleSessionRepository implements SessionsRepository` (join `sessions` × `users` no validate)                                                                                                                                                                                                                                                                                                                          |
| —                                                    | `session.module.ts`                        | Composition root: `imports: [DatabaseModule, TokensModule]`; `controllers: [GetMeRequestHandler, LogoutRequestHandler]`; `providers: [{ provide: SESSIONS_REPOSITORY, useClass: DrizzleSessionRepository }, CreateSessionUseCase, ValidateSessionUseCase, RevokeSessionUseCase, AuthGuard, { provide: APP_GUARD, useClass: AuthGuard }]`; `exports: [CreateSessionUseCase, ValidateSessionUseCase, RevokeSessionUseCase]` |
| `session/session.service.spec.ts`                    | `application/session.use-cases.spec.ts`    | Migrar: testa os 3 use-cases via `SessionModule`                                                                                                                                                                                                                                                                                                                                                                          |

### 4.8 `auth/sign-up`

| De                                | Para                                   | Responsabilidade                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sign-up/sign-up.controller.ts`   | `interface/sign-up.request-handler.ts` | `SignUpRequestHandler` — `@Controller("auth") @Public()`, `@Post("sign-up") @HttpCode(CREATED)`, `handle(@Body() dto)` → `execute(dto)`; em `ConfirmationEmailFailedError` → `InternalServerErrorException(EMAIL_FAILURE_MESSAGE)`                                                                                                                                                                                                                                               |
| `sign-up/sign-up.dto.ts`          | `interface/sign-up.dto.ts`             | Mover; **remover** `@Transform` do email (normalização vira domain); manter `Match`                                                                                                                                                                                                                                                                                                                                                                                              |
| `sign-up/sign-up.service.ts`      | `application/sign-up.use-case.ts`      | `SignUpUseCase.execute(input: SignUpInput): Promise<void>` — `normalizeEmail`, dup-check (contador `duplicate`), `PASSWORD_HASHER.hash`, gera/hash token (`TOKEN_SERVICE`), `UsersRepository.create` + `EmailConfirmationTokensRepository.create` (compensando falha com `deleteById`), email (`EmailService`), rollback + `ConfirmationEmailFailedError` em falha de email. **Preservar** counter OTel `auth.signup.count` (`duplicate`/`success`/`email_failure`) e o `Logger` |
| —                                 | `domain/sign-up.policy.ts`             | `CONFIRMATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| —                                 | `domain/sign-up.errors.ts`             | `ConfirmationEmailFailedError extends Error`                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| —                                 | `interface/sign-up.messages.ts`        | `GENERIC_RESPONSE_MESSAGE = "Check your email to confirm your account"`, `EMAIL_FAILURE_MESSAGE = "Failed to send confirmation email"`                                                                                                                                                                                                                                                                                                                                           |
| `sign-up/sign-up.module.ts`       | `sign-up.module.ts` (reescrito)        | `imports: [TokensModule, PasswordModule, EmailModule, UsersModule, EmailConfirmationTokensModule]`; `controllers: [SignUpRequestHandler]`; `providers: [SignUpUseCase]`; **remover** `exports: [SignUpService]`                                                                                                                                                                                                                                                                  |
| `sign-up/sign-up.service.spec.ts` | `sign-up.use-case.spec.ts`             | Migrar (ver §6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| —                                 | `infrastructure/.gitkeep`              | Vazia por design (persistência via ports compartilhados)                                                                                                                                                                                                                                                                                                                                                                                                                         |

### 4.9 `auth/sign-in`

| De                                | Para                                   | Responsabilidade                                                                                                                                                                                                                                                                                             |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sign-in/sign-in.controller.ts`   | `interface/sign-in.request-handler.ts` | `SignInRequestHandler` — `@Controller("auth") @Public()`, `@Post("sign-in") @HttpCode(OK)`, `handle(@Body() dto)` → `{ token }`; em `InvalidCredentialsError` → `UnauthorizedException(INVALID_CREDENTIALS_MESSAGE)`                                                                                         |
| `sign-in/sign-in.dto.ts`          | `interface/sign-in.dto.ts`             | Mover sem mudar                                                                                                                                                                                                                                                                                              |
| `sign-in/sign-in.service.ts`      | `application/sign-in.use-case.ts`      | `SignInUseCase.execute(input: { email, password }): Promise<string>` — `normalizeEmail`, `UsersRepository.findByEmail`, `PASSWORD_HASHER.verify` contra `user?.passwordHash ?? DUMMY_PASSWORD_HASH`, checa `emailVerifiedAt`, email de nova sessão (falha só logada), `CreateSessionUseCase.execute(userId)` |
| —                                 | `domain/sign-in.policy.ts`             | `DUMMY_PASSWORD_HASH` (bcrypt cost 10 de `"sign-in-timing-dummy"`) — política anti-timing de domínio                                                                                                                                                                                                         |
| —                                 | `domain/sign-in.errors.ts`             | `InvalidCredentialsError extends Error`                                                                                                                                                                                                                                                                      |
| —                                 | `interface/sign-in.messages.ts`        | `INVALID_CREDENTIALS_MESSAGE = "Invalid email or password"`                                                                                                                                                                                                                                                  |
| `sign-in/sign-in.module.ts`       | `sign-in.module.ts` (reescrito)        | `imports: [SessionModule, UsersModule, PasswordModule, EmailModule]` — **remove `AuthModule`**; `controllers: [SignInRequestHandler]`; `providers: [SignInUseCase]`                                                                                                                                          |
| `sign-in/sign-in.service.spec.ts` | `sign-in.use-case.spec.ts`             | Migrar (ver §6)                                                                                                                                                                                                                                                                                              |
| —                                 | `infrastructure/.gitkeep`              | Vazia por design                                                                                                                                                                                                                                                                                             |

### 4.10 `auth/confirm-account`

| De                                                | Para                                           | Responsabilidade                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `confirm-account/confirm-account.controller.ts`   | `interface/confirm-account.request-handler.ts` | `ConfirmAccountRequestHandler` — `@Post("confirm-account") @HttpCode(OK)`, `handle(@Body() dto)` → `{ token }`; mapeia erros de domínio → `BadRequestException` com `INVALID_LINK_MESSAGE`/`EXPIRED_LINK_MESSAGE`/`USED_LINK_MESSAGE`                                                     |
| `confirm-account/confirm-account.dto.ts`          | `interface/confirm-account.dto.ts`             | Mover sem mudar                                                                                                                                                                                                                                                                           |
| `confirm-account/confirm-account.service.ts`      | `application/confirm-account.use-case.ts`      | `ConfirmAccountUseCase.execute(input: { token }): Promise<string>` — `TOKEN_SERVICE.hash`, `EmailConfirmationTokensRepository.findByHash`, valida `usedAt`/`expiresAt` (levanta erros de domínio), `UsersRepository.setEmailVerified`, `markUsed`, `CreateSessionUseCase.execute(userId)` |
| —                                                 | `domain/confirm-account.errors.ts`             | `InvalidConfirmationTokenError`, `ExpiredConfirmationTokenError`, `UsedConfirmationTokenError`                                                                                                                                                                                            |
| —                                                 | `interface/confirm-account.messages.ts`        | `INVALID_LINK_MESSAGE = "Invalid confirmation link."`, `EXPIRED_LINK_MESSAGE = "This confirmation link has expired."`, `USED_LINK_MESSAGE = "This confirmation link has already been used."`                                                                                              |
| `confirm-account/confirm-account.module.ts`       | `confirm-account.module.ts` (reescrito)        | `imports: [SessionModule, TokensModule, UsersModule, EmailConfirmationTokensModule]` — **remove `AuthModule`**                                                                                                                                                                            |
| `confirm-account/confirm-account.service.spec.ts` | `confirm-account.use-case.spec.ts`             | Migrar (ver §6)                                                                                                                                                                                                                                                                           |
| —                                                 | `infrastructure/.gitkeep`                      | Vazia por design                                                                                                                                                                                                                                                                          |

### 4.11 `auth/forgot-password`

| De                                                | Para                                           | Responsabilidade                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `forgot-password/forgot-password.controller.ts`   | `interface/forgot-password.request-handler.ts` | `ForgotPasswordRequestHandler` — `@Post("forgot-password") @HttpCode(ACCEPTED)`, `handle(@Body() dto)` → `{ message: GENERIC_RESPONSE_MESSAGE }` (sem mapeamento de erro — fluxo engole falha de email)                                                                                                |
| `forgot-password/forgot-password.dto.ts`          | `interface/forgot-password.dto.ts`             | Mover sem mudar                                                                                                                                                                                                                                                                                        |
| `forgot-password/forgot-password.service.ts`      | `application/forgot-password.use-case.ts`      | `ForgotPasswordUseCase.execute(input: { email }): Promise<void>` — `normalizeEmail`, `UsersRepository.findByEmail`, gera/hash token **em todos os caminhos** (anti-enumeração), `PasswordResetTokensRepository.revokeActiveByUser` + `create`, `EmailService.sendPasswordResetEmail` (falha só logada) |
| —                                                 | `domain/forgot-password.policy.ts`             | `RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000`                                                                                                                                                                                                                                                             |
| —                                                 | `interface/forgot-password.messages.ts`        | `GENERIC_RESPONSE_MESSAGE = "If the account exists, we sent a link"`                                                                                                                                                                                                                                   |
| `forgot-password/forgot-password.module.ts`       | `forgot-password.module.ts` (reescrito)        | `imports: [TokensModule, EmailModule, UsersModule, PasswordResetTokensModule]`                                                                                                                                                                                                                         |
| `forgot-password/forgot-password.service.spec.ts` | `forgot-password.use-case.spec.ts`             | Migrar (ver §6)                                                                                                                                                                                                                                                                                        |
| —                                                 | `infrastructure/.gitkeep`                      | Vazia por design                                                                                                                                                                                                                                                                                       |

### 4.12 `auth/reset-password`

| De                                              | Para                                          | Responsabilidade                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reset-password/reset-password.controller.ts`   | `interface/reset-password.request-handler.ts` | `ResetPasswordRequestHandler` — `@Post("reset-password") @HttpCode(OK)`, `handle(@Body() dto)`; **mantém o mismatch** `password !== confirm_password` → `BadRequestException(MISMATCH_MESSAGE)` (interface); mapeia erros de domínio → `BadRequestException` com `INVALID_TOKEN_MESSAGE`/`USED_TOKEN_MESSAGE`/`EXPIRED_TOKEN_MESSAGE`                                    |
| `reset-password/reset-password.dto.ts`          | `interface/reset-password.dto.ts`             | Mover sem mudar                                                                                                                                                                                                                                                                                                                                                          |
| `reset-password/reset-password.service.ts`      | `application/reset-password.use-case.ts`      | `ResetPasswordUseCase.execute(input: { token, password }): Promise<void>` — `TOKEN_SERVICE.hash`, `PasswordResetTokensRepository.findByHash`, valida `usedAt`/`expiresAt` (erros de domínio), `PASSWORD_HASHER.hash`, `UsersRepository.setPasswordHash` + `markUsed`, `UsersRepository.findById` (email), `EmailService.sendPasswordResetSuccessEmail` (falha só logada) |
| —                                               | `domain/reset-password.errors.ts`             | `InvalidPasswordResetTokenError`, `ExpiredPasswordResetTokenError`, `UsedPasswordResetTokenError`                                                                                                                                                                                                                                                                        |
| —                                               | `interface/reset-password.messages.ts`        | `INVALID_TOKEN_MESSAGE = "Invalid password reset link."`, `USED_TOKEN_MESSAGE = "This password reset link has already been used."`, `EXPIRED_TOKEN_MESSAGE = "This password reset link has expired. Please request a new one."`, `MISMATCH_MESSAGE = "Passwords do not match."`, `SUCCESS_MESSAGE = "Your password has been reset. You can now sign in."`                |
| `reset-password/reset-password.module.ts`       | `reset-password.module.ts` (reescrito)        | `imports: [TokensModule, PasswordModule, EmailModule, UsersModule, PasswordResetTokensModule]`                                                                                                                                                                                                                                                                           |
| `reset-password/reset-password.service.spec.ts` | `reset-password.use-case.spec.ts`             | Migrar (ver §6)                                                                                                                                                                                                                                                                                                                                                          |
| —                                               | `infrastructure/.gitkeep`                     | Vazia por design                                                                                                                                                                                                                                                                                                                                                         |

### 4.13 `auth/health` (novo)

| Arquivo                                          | Responsabilidade                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `interface/health.request-handler.ts`            | `HealthRequestHandler` — `@Controller("auth") @Public()`, `@Get()`, `handle()` → `{ status: "ok" }` |
| `health.module.ts`                               | `controllers: [HealthRequestHandler]`                                                               |
| `.gitkeep` (application, domain, infrastructure) | Vazias por design                                                                                   |
| `auth/auth.controller.ts`                        | **Remover** (substituído pelo health slice)                                                         |

### 4.14 `auth` raiz e `app.module.ts` (wiring)

| Arquivo               | Ação                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/auth.module.ts` | Onda 3: passthrough `@Module({ imports: [SessionModule], exports: [SessionModule], controllers: [AuthController] })`. **Onda 6: remover**                                          |
| `app.module.ts`       | Onda 6: `imports: [ConfigModule, SessionModule, HealthModule, SignUpModule, SignInModule, ConfirmAccountModule, ForgotPasswordModule, ResetPasswordModule]` (remover `AuthModule`) |

---

## 5. Ondas de execução

### Dependências (grafo)

```
shared/tokens ─┬─► session ──┬─► sign-in          shared/email ─┬─► sign-up
               │             └─► confirm-account                 ├─► sign-in
shared/password┼─► sign-up   └─► (guards/handlers)               ├─► forgot-password
               ├─► sign-in                                       └─► reset-password
               └─► reset-password
shared/tokens ─┴─► sign-up, forgot-password, reset-password, confirm-account
users ──► sign-up, sign-in, confirm-account, forgot-password, reset-password
email-confirmation-tokens ──► sign-up, confirm-account
password-reset-tokens ──► forgot-password, reset-password
session ──► sign-in, confirm-account (CreateSessionUseCase)
```

### Onda 1 — Fundações compartilhadas **em série** (acoplada; executa o orquestrador)

Por que em série: os 3 módulos tocam caminhos de importação de TODAS as outras slices (services,
specs e e2e). Um executor por módulo colidiria nos mesmos arquivos de consumo. É a onda que mantém o
repositório compilando após cada movimento.

1. `shared/tokens` (criar; migrar `session-token.spec.ts`).
2. `shared/password` (port + adapter; atualizar consumidores: `sign-up.service.ts`, `sign-in.service.ts`,
   `reset-password.service.ts`, specs e e2e que usam `PasswordService`).
3. `shared/email` (mover para camadas; atualizar imports de services/specs/e2e).

Atualizações de importação **transitórias** nesta onda (só paths / re-pointing mínimo, sem mudar lógica):

- Services de fluxo (`sign-up`, `sign-in`, `forgot-password`, `reset-password`) e `session/session.service.ts`
  passam a importar `generateSessionToken`/`hashToken` de `shared/tokens/infrastructure/token.adapter`.
- `sign-up`, `sign-in`, `reset-password` services: `PasswordService` → `@Inject(PASSWORD_HASHER)` +
  `PasswordHasher` de `shared/password`.
- `sign-up`, `sign-in`, `forgot-password`, `reset-password` services: `EmailService` de
  `shared/email/application/email.service`.
- Specs: `EMAIL_TRANSPORT` de `shared/email/domain/email.constants`; `hashToken` de
  `shared/tokens/infrastructure/token.adapter`; `PasswordService`/`PASSWORD_HASHER` de `shared/password`.
- E2E: `hashToken` (sign-up, forgot-password, reset-password, confirm-account) de `shared/tokens`;
  `PasswordService` → `PASSWORD_HASHER` (sign-in, reset-password); paths de `EmailModule`/`EMAIL_TRANSPORT`.

> Exceção de ownership: esta onda commita os arquivos de consumo que ela precisa tocar para manter o
> build verde (documentado e aceito — esses arquivos são reescritos nas ondas 4/5 de qualquer forma).

**Commits sugeridos (Conventional):** `refactor(api): extract shared tokens module`, `refactor(api): add PasswordHasher port with bcrypt adapter`, `refactor(api): move shared email module into layers`.

### Onda 2 — Agregados de persistência **em paralelo** (3 executors, sem colisão)

`auth/users`, `auth/email-confirmation-tokens`, `auth/password-reset-tokens`. Nenhum consumidor muda
(ainda não usados); o build continua verde. Executors paralelos por slice.

**Commits:** `feat(api): add users repository port and adapter`, `feat(api): add email-confirmation-tokens repository port and adapter`, `feat(api): add password-reset-tokens repository port and adapter`.

### Onda 3 — Sessão **em série** (nó central; acoplada a `auth.module.ts` + e2e + re-pointing)

Escopo (executor único/orquestrador):

- Criar `session/` em camadas (application/domain/infrastructure/interface), `session.module.ts`.
- **Consolidar guards** (remover `SessionGuard`), mover decorators e tipos.
- `auth.module.ts` → passthrough (`imports/exports: [SessionModule]`, `controllers: [AuthController]`).
- **Re-pointing transitório** (mantém build verde até ondas 4/5): `sign-in.service.ts` e
  `confirm-account.service.ts` passam a injetar `CreateSessionUseCase` (de `SessionModule`) no lugar de
  `SessionService`; `sign-in.module.ts` e `confirm-account.module.ts` trocam `AuthModule` por
  `SessionModule`.
- Migrar `session.service.spec.ts` → `session.use-cases.spec.ts`.
- Atualizar specs/e2e que referenciam `SessionService`/`AuthModule` diretamente: `auth-session.e2e`,
  `app.e2e`, `confirm-account.e2e`, `sign-in.e2e`, `sign-in.service.spec`, `confirm-account.service.spec`
  (re-pointing mínimo para use-cases/módulos — conteúdo dos fluxos só muda na onda 4).

**Commits:** `refactor(api): extract session module with use-cases, port and request handlers`.

### Onda 4 — `sign-in` + `confirm-account` **em paralelo** (2 executors, sem colisão entre si)

Ambos consomem `SessionModule`. Cada executor reescreve service→use-case, controller→request handler,
module→wiring novo (`SessionModule` direto), migra spec e e2e do fluxo, remove `AuthModule`.

**Commits:** `refactor(api): move sign-in slice to hexagonal layers`, `refactor(api): move confirm-account slice to hexagonal layers`.

### Onda 5 — `sign-up` + `forgot-password` + `reset-password` + `health` **em paralelo** (4 executors)

Sem colisão de arquivos entre si. `health` cria o slice e **remove `auth/auth.controller.ts`** (o
`AuthModule` passthrough deixa de registrar o controller — health passa a ser servido pelo novo slice,
registrado em `app.module.ts` na onda 6).

> Durante a onda 5, `auth.module.ts` passthrough sem `controllers` deixa `GET /auth` órfão até a onda 6.
> Aceito (gate e2e pode ficar vermelho temporariamente para health); o orchestrator valida na onda 6.
> Alternativa: deixar `auth.controller.ts` no passthrough até a onda 6 e só então remover — decidir na
> execução para manter o e2e verde. **Recomendação: manter `AuthController` no passthrough até a onda 6.**

**Commits:** `refactor(api): move sign-up slice to hexagonal layers`, `refactor(api): move forgot-password slice to hexagonal layers`, `refactor(api): move reset-password slice to hexagonal layers`, `feat(api): add auth health request handler`.

### Onda 6 — Wiring final **em série**

- `app.module.ts`: importar `SessionModule`, `HealthModule` e as 5 slices de fluxo; remover `AuthModule`.
- **Remover `auth/auth.module.ts`** e `auth/auth.controller.ts` (se ainda existir).
- Varrer importações remanescentes de `AuthModule`, `SessionService`, `session-token`, `session.guard`.
- Rodar todos os gates (ver §10).

**Commit:** `refactor(api): wire auth slices into hexagonal modules`.

### Colisões de arquivos

| Arquivo                       | Ondas                                    | Tratamento                                            |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| `app.module.ts`               | 6                                        | Só o wiring final (série)                             |
| `auth/auth.module.ts`         | 3 (passthrough), 5 (health), 6 (remoção) | Serializado; nunca paralelo                           |
| `auth/auth.controller.ts`     | 5 ou 6 (remoção)                         | Serializado                                           |
| Services/specs/e2e dos fluxos | 1 (imports), 4/5 (reescrita)             | Onda 1 é transitória; reescrita na onda dona do fluxo |
| `session-token.ts`            | 1 (extração)                             | Antes de qualquer slice de fluxo                      |

---

## 6. Testes a migrar (de → para) e o que muda em cada um

| De                                                     | Para                                                                                                         | Mudanças                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth/session/session.service.spec.ts`                 | `auth/session/application/session.use-cases.spec.ts`                                                         | Testa `CreateSessionUseCase`/`ValidateSessionUseCase`/`RevokeSessionUseCase` via `SessionModule` (substitui `providers: [SessionService]`); `hashToken` de `shared/tokens`; chama `.execute(...)`                                                                                                                                                                        |
| `auth/session/session-token.spec.ts`                   | `shared/tokens/infrastructure/token.adapter.spec.ts` + `shared/tokens/interface/bearer-token.parser.spec.ts` | Split por responsabilidade; importa das novas localizações                                                                                                                                                                                                                                                                                                               |
| `shared/password/password.service.spec.ts`             | `shared/password/infrastructure/bcrypt-hasher.adapter.spec.ts`                                               | `new PasswordService()` → `new BcryptHasherAdapter()`; import de `PASSWORD_HASHER`/`BCRYPT_COST`                                                                                                                                                                                                                                                                         |
| `shared/email/email.service.spec.ts`                   | `shared/email/application/email.service.spec.ts`                                                             | Só path                                                                                                                                                                                                                                                                                                                                                                  |
| `shared/email/email-transport.factory.spec.ts`         | `shared/email/infrastructure/email-transport.factory.spec.ts`                                                | Só path                                                                                                                                                                                                                                                                                                                                                                  |
| `auth/sign-up/sign-up.service.spec.ts`                 | `auth/sign-up/sign-up.use-case.spec.ts`                                                                      | `SignUpService` → `SignUpUseCase` (`execute(input)`); `PasswordService` → `PASSWORD_HASHER`; `hashToken` de `shared/tokens`; assert do 500 → **`ConfirmationEmailFailedError`** (import de `domain/sign-up.errors`); mantém asserts de estado do banco, anti-enumeração, normalização e rollback                                                                         |
| `auth/sign-in/sign-in.service.spec.ts`                 | `auth/sign-in/sign-in.use-case.spec.ts`                                                                      | Remove `AuthModule` → adiciona `SessionModule`; `SignInService` → `SignInUseCase` (`execute({email, password})`); asserts `UnauthorizedException("Invalid email or password")` → **`InvalidCredentialsError`**; `PasswordService` → `PASSWORD_HASHER`                                                                                                                    |
| `auth/confirm-account/confirm-account.service.spec.ts` | `auth/confirm-account/confirm-account.use-case.spec.ts`                                                      | Remove `AuthModule` → `SessionModule`; `ConfirmAccountService` → `ConfirmAccountUseCase`; `SessionService.createSession` (último teste) → `CreateSessionUseCase.execute`; asserts `BadRequestException(<MSG>)` → **`ExpiredConfirmationTokenError`/`UsedConfirmationTokenError`/`InvalidConfirmationTokenError`**; `generateSessionToken`/`hashToken` de `shared/tokens` |
| `auth/forgot-password/forgot-password.service.spec.ts` | `auth/forgot-password/forgot-password.use-case.spec.ts`                                                      | `ForgotPasswordService` → `ForgotPasswordUseCase` (`execute({email})`); `hashToken` de `shared/tokens`                                                                                                                                                                                                                                                                   |
| `auth/reset-password/reset-password.service.spec.ts`   | `auth/reset-password/reset-password.use-case.spec.ts`                                                        | `ResetPasswordService` → `ResetPasswordUseCase` (`execute({token, password})`); asserts `BadRequestException(<MSG>)` → **`ExpiredPasswordResetTokenError`/`UsedPasswordResetTokenError`/`InvalidPasswordResetTokenError`**; `PasswordService` → `PASSWORD_HASHER`; `hashToken` de `shared/tokens`                                                                        |

E2E (não mudam de arquivo, só imports):

| Arquivo                       | Onda                                                         | Mudança                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `auth-session.e2e-spec.ts`    | 3                                                            | `SessionService` → `CreateSessionUseCase` + `RevokeSessionUseCase` (imports de `session/application/...`)                        |
| `app.e2e-spec.ts`             | 3                                                            | `SessionService` → `CreateSessionUseCase`                                                                                        |
| `sign-in.e2e-spec.ts`         | 1 (PasswordService) + 3 (AuthModule→SessionModule) + 4 (fim) | `PasswordService` → `PASSWORD_HASHER`; `AuthModule` → `SessionModule`                                                            |
| `confirm-account.e2e-spec.ts` | 1 (tokens) + 3 (SessionService/AuthModule) + 4               | `generateSessionToken`/`hashToken` de `shared/tokens`; `SessionService` → `CreateSessionUseCase`; `AuthModule` → `SessionModule` |
| `sign-up.e2e-spec.ts`         | 1                                                            | `hashToken` de `shared/tokens`                                                                                                   |
| `forgot-password.e2e-spec.ts` | 1                                                            | `hashToken` de `shared/tokens`                                                                                                   |
| `reset-password.e2e-spec.ts`  | 1                                                            | `hashToken` de `shared/tokens`; `PasswordService` → `PASSWORD_HASHER`                                                            |

**As mensagens HTTP movidas para `interface/*.messages.ts` são cobertas pelos e2e** (status + mensagem
byte-a-byte), que não mudam de assertion — apenas os specs unitários passam a assertar os erros de domínio.

---

## 7. Riscos e edge cases

1. **Cascata de imports do `session-token` (5 slices + 2 guards + 5 specs + 4 e2e).** Mitigado: onda 1
   extrai `shared/tokens` e atualiza todos os consumidores antes de qualquer slice de fluxo.
2. **`auth.module.ts` como composition root da sessão + importado por `SignInModule`/`ConfirmAccountModule`/specs/e2e.** Mitigado: onda 3 vira passthrough de `SessionModule` (guard continua ativo); ondas 4/6 eliminam o import de `AuthModule`.
3. **Comportamento HTTP byte-a-byte.** Handlers devem preservar exatamente: `POST /auth/sign-up` 201, `POST /auth/sign-in` 200, `POST /auth/confirm-account` 200, `POST /auth/forgot-password` 202, `POST /auth/reset-password` 200, `GET /auth/me` 200, `POST /auth/logout` 200, `GET /auth` 200, `GET /` (app.controller, intocado). Mensagens exatas dos e2e (link/token inválido/expirado/usado, "Invalid email or password", "Passwords do not match."). Validar via e2e em cada onda afetada.
4. **Constantes de mensagem exportadas de services (`INVALID_LINK_MESSAGE`, `EXPIRED_LINK_MESSAGE`, `USED_LINK_MESSAGE`, `INVALID_TOKEN_MESSAGE`, `USED_TOKEN_MESSAGE`, `EXPIRED_TOKEN_MESSAGE`) importadas por specs.** Migram para `interface/*.messages.ts` na mesma onda do fluxo; specs passam a assertar erros de domínio.
5. **HTTP leak em 4 services** (sign-up 500, sign-in 401, confirm-account 400, reset-password 400) vira erro de domínio → mapeamento no handler, sem mudar status/mensagem.
6. **Observabilidade**: preservar o counter OTel `auth.signup.count` (`duplicate`/`success`/`email_failure`) no `SignUpUseCase`. O trabalho de observabilidade de `sign-up.service.ts` está **não commitado** — a reescrita do fluxo incorpora o counter no use-case (sem perder a mudança).
7. **Anti-enumeração/anti-timing**: `DUMMY_PASSWORD_HASH` (sign-in), geração de token em todos os caminhos (forgot-password), rollback do sign-up — preservar no use-case; QA manual.
8. **Normalização de email duplicada** (DTO Transform + services). Resolvida: residência única em `users/domain/email.ts`; `@Transform` do DTO removido. Risco: e2e de lowercase deve validar.
9. **Atomicidade multi-tabela** (antes: transações Drizzle únicas): `sign-up` (user+token, compensa com `deleteById`), `forgot-password` (revoke+insert em 2 chamadas), `reset-password` (update+mark em 2 chamadas), `confirm-account` (update+mark em 2 chamadas). O estado final observado pelos testes permanece igual; documentar no ADR. Não enfraquecer os fluxos de rollback/anti-enumeração.
10. **Consolidação `AuthGuard` × `SessionGuard`.** `/auth/me` sem `@Public` + guard global valida; `/auth/logout` com `@Public` faz parse/revoke próprio. E2E `auth-session` cobre 401 (malformado/desconhecido/revogado), logout idempotente e last-wins — são a rede de segurança.
11. **`APP_GUARD` durante a transição**: registrado em `session.module.ts` (onda 3) e propagado via `auth.module.ts` passthrough até a onda 6 — guard nunca fica órfão.
12. **Health `GET /auth`** órfão entre ondas 5 e 6 se `auth.controller.ts` for removido cedo — recomendado manter no passthrough até a onda 6.
13. **Trabalho não commitado na `main`** (observability, load-testing, skills): cada executor faz `git add` de **caminhos explícitos** da sua slice; nunca `git add -A`. Não commitar arquivos fora de `apps/api/src/modules` + `apps/api/e2e` (exceto wiring final). `sign-up.service.ts` tem diff não commitado (counter) que será incorporado no use-case.
14. **Testes que dependem de arquivos renomeados** migram na mesma onda do fluxo (ver §6) — nunca deixar `*.service.spec.ts` apontando para service removido.
15. **`CurrentUser` sem sessão** (rota protegida sem guard): continua lançando `UnauthorizedException` (comportamento preservado).

## 8. Critérios de aceite

- [ ] Todas as slices com as 4 camadas (`interface`/`application`/`domain`/`infrastructure`); camadas vazias com `.gitkeep` + nota.
- [ ] 1 request handler por endpoint (método `handle()`) e 1 use-case por fluxo (método `execute()`), relação 1:1.
- [ ] Nenhum `DRIZZLE`/`db`/`schema` em `application`; adapters só em `infrastructure`; ports só em `domain`.
- [ ] Nenhuma exceção HTTP em `application` (exceto guards em `interface`).
- [ ] `SessionModule` exporta `CreateSessionUseCase`/`ValidateSessionUseCase`/`RevokeSessionUseCase`; nenhum módulo de slice importa `AuthModule`.
- [ ] `session-token.ts` extraído para `modules/shared/tokens`; nenhum import residual de `auth/session/session-token`.
- [ ] Rotas/status/mensagens idênticos aos e2e existentes (sem alterar asserts).
- [ ] Counter OTel `auth.signup.count` presente no `SignUpUseCase`.
- [ ] `auth.module.ts` removido; `app.module.ts` importa as slices.
- [ ] Todos os specs migrados e verdes; gates de QA.md verdes.

## 9. Critérios de aceite por gate (executores)

Ao final de cada onda, o executor roda os gates de `QA.md`. Ondas acopladas podem deixar gates vermelhos
temporariamente (registrar e seguir); o orquestrador valida a árvore na onda 6. **A refatoração só é
declarada concluída com todos os gates verdes.**

## 10. Checklist de QA (ordem de `QA.md`)

```sh
# 1. Lint + formatação
bun run code:fix

# 2. Tipagem
bun run types:check

# 3. Testes unitários + integração
bun run test

# 4. Testes E2E (requer infra local + migrações)
bun run infra:up
bun run db:migrate
bun run test:e2e

# 5. Build
bun run build

# ao final, se necessário
bun run infra:down
```

QA manual (comportamentos de segurança que testes unitários não capturam):

- `POST /auth/sign-up` com email já registrado e com transport quebrado → mesmo 201/500 e rollback (nenhum user/token órfão).
- `POST /auth/sign-in` com email desconhecido vs senha errada vs conta não verificada → mesmo 401 e timing comparável (dummy hash).
- `POST /auth/forgot-password` para email existente vs desconhecido → mesmo 202; token persistido mesmo com email falho.
- `POST /auth/logout` sem token → 200 `{ success: true }`; idempotente.
- `GET /auth/me` 200/401; guard global valida até rotas protegidas; health `GET /auth` sem token.

## 11. Regras de commit (obrigatórias)

- Um commit por slice/onda, **`git add` de caminhos explícitos** (nunca `git add -A`).
- Mensagem Conventional Commits validada com `printf '%s\n' "$msg" | bunx commitlint` + trailer
  `Co-authored-by: ${OPENCODE_COAUTHOR_NAME:-OpenCode Agent} <${OPENCODE_COAUTHOR_EMAIL:-agent@opencode.ai>`.
- Não incluir: `main.ts`, `database.factory.ts`, `observability/`, `scripts/`, `load/`, `.docs/*`,
  `.adrs/009/010`, `package.json`/`bun.lock`/`turbo.json`, skills — salvo wiring final.
- Antes de commitar, `git pull --rebase` se houver commits novos na `main`.
