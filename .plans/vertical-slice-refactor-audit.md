# Auditoria — Refatoração de vertical slices para arquitetura hexagonal em camadas

> Repositório: `coders-university-post-ia-module-4` · Raiz dos módulos: `apps/api/src/modules`
> Data: 2026-08-11 · Autor: subagent auditor (skill `refactor-slices`)
> Escopo: leitura/auditoria. Nenhum arquivo de código foi alterado.

## 1. Resumo executivo

Os 9 pontos auditados (7 slices de fluxo + 2 módulos compartilhados) estão **todos
desalinhados** do padrão-alvo (`interface/`, `application/`, `domain/`, `infrastructure/`,
request handler 1:1, use-case 1 fluxo = 1 classe, ports/adapters, composition root na
slice). Nenhuma slice tem a estrutura em camadas; os 6 services de fluxo acessam
`DRIZZLE`/`db/schema` diretamente e 4 deles lançam exceções HTTP de dentro do "application".

O ponto mais sensível é a **sessão** (`auth/session`): controller multi-endpoint, service
multi-fluxo, guard global, e o utilitário `session-token.ts` é importado por 5 services +
2 guards + specs/e2e — é o nó central do grafo de dependências e deve ser refatorado
junto com a extração de `shared/email` e `shared/password` antes das slices de fluxo.

Bom: os módulos compartilhados `shared/email` (port `EmailTransport` + adapters
`Mailtrap`/`Resend`) e `shared/password` (bcrypt isolado) já têm separação conceitual de
port/adapter — a refatoração deles é estrutural e de baixo risco. Os testes são abundantes
e asserts de rota/status/mensagem nos e2e funcionam como rede de segurança para a mudança.

## 2. Inventário de slices

| #   | Slice                                                    | Classificação                            |
| --- | -------------------------------------------------------- | ---------------------------------------- |
| 1   | `auth/` (raiz — `auth.controller.ts` + `auth.module.ts`) | DESALINHADA                              |
| 2   | `auth/session`                                           | DESALINHADA                              |
| 3   | `auth/sign-up`                                           | DESALINHADA                              |
| 4   | `auth/sign-in`                                           | DESALINHADA                              |
| 5   | `auth/confirm-account`                                   | DESALINHADA                              |
| 6   | `auth/forgot-password`                                   | DESALINHADA                              |
| 7   | `auth/reset-password`                                    | DESALINHADA                              |
| 8   | `shared/email`                                           | DESALINHADA (leve — já tem port/adapter) |
| 9   | `shared/password`                                        | DESALINHADA (leve)                       |

Nenhuma slice é CONFORME. `auth/session` é a mais complexa; `shared/*` são as mais baratas.

## 3. Detalhamento por slice

### 3.1 `auth/` (raiz) — DESALINHADA

```
modules/auth/
├── auth.controller.ts   # GET /auth (health)
└── auth.module.ts       # composition root de auth + session
```

| Catálogo                     | Ocorrência                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Estrutura ausente          | Sem `interface/application/domain/infrastructure`; arquivos soltos na raiz.                                                                                                                                                                                                                |
| 7 Nomenclatura antiga        | `auth.controller.ts` é um controller com 1 endpoint (`@Controller("auth") @Get()` em `auth.controller.ts:4-10`) — deveria ser um request handler.                                                                                                                                          |
| 10 Composition root quebrado | `auth.module.ts:12-14`: `controllers: [AuthController, SessionController]`, `providers: [SessionService, SessionGuard, { provide: APP_GUARD, useClass: AuthGuard }]`, `exports: [SessionService]` — registra controller/service/guards antigos e é o composition root da sessão (ver 3.2). |

### 3.2 `auth/session` — DESALINHADA

```
session/
├── auth.guard.ts              # guard global (via APP_GUARD)
├── auth.types.ts              # SessionUser, ValidatedSession, AuthenticatedRequest
├── current-user.decorator.ts
├── public.decorator.ts
├── session-token.ts           # generate/hash/parseBearerToken (compartilhado)
├── session.controller.ts      # GET me + POST logout (2 endpoints)
├── session.guard.ts           # guard por rota (duplica AuthGuard)
├── session.service.ts         # 3 fluxos: create/validate/revoke
├── session.service.spec.ts
└── session-token.spec.ts
```

| Catálogo                     | Ocorrência                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Estrutura ausente          | Sem camadas; 10 arquivos soltos na raiz.                                                                                                                                                                                                                                                                    |
| 2 Controller multi-endpoint  | `session.controller.ts:14-18` `@Get("me")` e `:20-26` `@Post("logout")` → 2 endpoints em 1 classe.                                                                                                                                                                                                          |
| 3 Service multi-fluxo        | `session.service.ts:13` `createSession()`, `:26` `validateSession()`, `:48` `revokeSession()` — 3 fluxos.                                                                                                                                                                                                   |
| 4 Infra no application       | `session.service.ts:3-5` importa `DRIZZLE` e `sessions, users` de `db/schema`; `:11` `@Inject(DRIZZLE)`; `:16-22` transação drizzle (`tx.update`/`tx.insert`); `:28-42` `select` com `innerJoin`; `:48-54` `update`. Geração/hash de token em `:14-15` (`generateSessionToken`/`hashToken`) e `:27`, `:49`. |
| 7 Nomenclatura antiga        | `session.controller.ts` / `session.service.ts`.                                                                                                                                                                                                                                                             |
| 8 Import cross-layer ilegal  | `session.service.ts` injeta a implementação concreta (DRIZZLE) e tabelas de `db/schema` em vez de um port de repositório de sessões.                                                                                                                                                                        |
| 9 Regra no lugar errado      | `session-token.ts:3-18` — geração de token (crypto, `randomBytes`), hash sha256 e parse de bearer token moram num util sem camada dentro da slice, usados por 5 services + 2 guards.                                                                                                                        |
| 10 Composition root quebrado | Não existe `session.module.ts`; a sessão é registrada em `auth.module.ts:13` e exportada via `auth.module.ts:14` (`exports: [SessionService]`).                                                                                                                                                             |

Obs.: `auth.guard.ts:10-32` e `session.guard.ts:10-21` duplicam a mesma validação de token/sessão (risco de divergência). `AuthGuard`/`SessionGuard` lançam `UnauthorizedException` — aceitável (camada interface), não conta como HTTP leak.

### 3.3 `auth/sign-up` — DESALINHADA

```
sign-up/
├── sign-up.controller.ts
├── sign-up.dto.ts
├── sign-up.module.ts
├── sign-up.service.ts
└── sign-up.service.spec.ts
```

| Catálogo                     | Ocorrência                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Estrutura ausente          | Sem camadas.                                                                                                                                                                                                                                                                                                                              |
| 7 Nomenclatura antiga        | `sign-up.controller.ts` / `sign-up.service.ts`.                                                                                                                                                                                                                                                                                           |
| 4 Infra no application       | `sign-up.service.ts:4-6` importa `DRIZZLE`, `users`, `emailConfirmationTokens`; `:22` `@Inject(DRIZZLE)`; `:30-34` `select` de duplicidade; `:47-64` transação (insert user + insert token); `:78` `db.delete` no rollback; `:45` `generateSessionToken()`; `:43` delega hash ao `PasswordService`; `:67` delega email ao `EmailService`. |
| 5 HTTP leak no application   | `sign-up.service.ts:79` `throw new InternalServerErrorException("Failed to send confirmation email")`.                                                                                                                                                                                                                                    |
| 6 DTO no lugar errado        | `sign-up.dto.ts:1-11` `class-validator`/`class-transformer` + decorator custom `Match` na raiz (fora de `interface/`).                                                                                                                                                                                                                    |
| 9 Regra no lugar errado      | `sign-up.service.ts:12` `CONFIRMATION_TOKEN_TTL_MS = 24h` (TTL de token no service); `:28` `dto.email.trim().toLowerCase()` (normalização duplicada — o DTO já normaliza em `sign-up.dto.ts:45-47`); `:45` geração de token dentro do service; `sign-up.dto.ts:45-47` normalização de email dentro da interface (deveria ser domain).     |
| 10 Composition root quebrado | `sign-up.module.ts:8-11` registra `SignUpController`/`SignUpService`; `exports: [SignUpService]` em `:11` é desnecessário (ninguém consome).                                                                                                                                                                                              |

### 3.4 `auth/sign-in` — DESALINHADA

```
sign-in/
├── sign-in.controller.ts
├── sign-in.dto.ts
├── sign-in.module.ts
├── sign-in.service.ts
└── sign-in.service.spec.ts
```

| Catálogo                     | Ocorrência                                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Estrutura ausente          | Sem camadas.                                                                                                                                                                                                                                                             |
| 7 Nomenclatura antiga        | `sign-in.controller.ts` / `sign-in.service.ts`.                                                                                                                                                                                                                          |
| 4 Infra no application       | `sign-in.service.ts:3-5` importa `DRIZZLE` e `users`; `:21` `@Inject(DRIZZLE)`; `:30-34` `select` de usuário; delega hash (`:37` `PasswordService.verify`) e email (`:44` `EmailService.sendNewSessionEmail`) e sessão (`:51` `SessionService.createSession`).           |
| 5 HTTP leak no application   | `sign-in.service.ts:40` `throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE)`.                                                                                                                                                                                  |
| 6 DTO no lugar errado        | `sign-in.dto.ts:1-11` `class-validator` na raiz.                                                                                                                                                                                                                         |
| 9 Regra no lugar errado      | `sign-in.service.ts:10` `INVALID_CREDENTIALS_MESSAGE` (mensagem de interface no service); `:14` `DUMMY_PASSWORD_HASH` (constante de segurança/anti-timing no service); `:28` `email.trim().toLowerCase()` (normalização duplicada — DTO sem transform, aqui no service). |
| 8 Import cross-layer ilegal  | `sign-in.service.ts:8` importa o `SessionService` concreto de `../session` em vez de um port de criação de sessão.                                                                                                                                                       |
| 10 Composition root quebrado | `sign-in.module.ts:9` `imports: [AuthModule, PasswordModule, EmailModule]` — importa o módulo pai (`AuthModule`) só para obter `SessionService` (acoplamento amplo); `:10-11` registra `SignInController`/`SignInService`.                                               |

### 3.5 `auth/confirm-account` — DESALINHADA

```
confirm-account/
├── confirm-account.controller.ts
├── confirm-account.dto.ts
├── confirm-account.module.ts
├── confirm-account.service.ts
└── confirm-account.service.spec.ts
```

| Catálogo                     | Ocorrência                                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Estrutura ausente          | Sem camadas.                                                                                                                                                                            |
| 7 Nomenclatura antiga        | `confirm-account.controller.ts` / `confirm-account.service.ts`.                                                                                                                         |
| 4 Infra no application       | `confirm-account.service.ts:3-5` importa `DRIZZLE`, `emailConfirmationTokens`, `users`; `:16` `@Inject(DRIZZLE)`; `:23-27` `select` do token; `:43-49` transação (update user + token). |
| 5 HTTP leak no application   | `confirm-account.service.ts:30` `throw new BadRequestException(INVALID_LINK_MESSAGE)`; `:33` `USED_LINK_MESSAGE`; `:36` `EXPIRED_LINK_MESSAGE`.                                         |
| 6 DTO no lugar errado        | `confirm-account.dto.ts:1-7` `class-validator` na raiz.                                                                                                                                 |
| 9 Regra no lugar errado      | `confirm-account.service.ts:9-11` constantes de mensagem exportadas do service (importadas pelos specs — devem viver na interface); `:21` `hashToken(token)`.                           |
| 8 Import cross-layer ilegal  | `confirm-account.service.ts:7` importa `SessionService` concreto (mesmo padrão do sign-in).                                                                                             |
| 10 Composition root quebrado | `confirm-account.module.ts:7` `imports: [AuthModule]`; `:8-9` registra `ConfirmAccountController`/`ConfirmAccountService`.                                                              |

### 3.6 `auth/forgot-password` — DESALINHADA

```
forgot-password/
├── forgot-password.controller.ts
├── forgot-password.dto.ts
├── forgot-password.module.ts
├── forgot-password.service.ts
└── forgot-password.service.spec.ts
```

| Catálogo                     | Ocorrência                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Estrutura ausente          | Sem camadas.                                                                                                                                                                                      |
| 7 Nomenclatura antiga        | `forgot-password.controller.ts` / `forgot-password.service.ts`.                                                                                                                                   |
| 4 Infra no application       | `forgot-password.service.ts:3-5` importa `DRIZZLE`, `passwordResetTokens`, `users`; `:16` `@Inject(DRIZZLE)`; `:23-27` `select`; `:41-57` transação (revoga ativos + insert); `:60` delega email. |
| 6 DTO no lugar errado        | `forgot-password.dto.ts:1-7` `class-validator` na raiz.                                                                                                                                           |
| 9 Regra no lugar errado      | `forgot-password.service.ts:9` `RESET_TOKEN_TTL_MS = 24h`; `:21` `email.trim().toLowerCase()`; `:33-34` geração + hash do token no service.                                                       |
| 10 Composition root quebrado | `forgot-password.module.ts:7` `imports: [EmailModule]`; `:8-9` registra `ForgotPasswordController`/`ForgotPasswordService`.                                                                       |

Sem HTTP leak (engole falha de envio de email — correto, anti-enumeração).

### 3.7 `auth/reset-password` — DESALINHADA

```
reset-password/
├── reset-password.controller.ts
├── reset-password.dto.ts
├── reset-password.module.ts
├── reset-password.service.ts
└── reset-password.service.spec.ts
```

| Catálogo                     | Ocorrência                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Estrutura ausente          | Sem camadas.                                                                                                                                                                                                                              |
| 7 Nomenclatura antiga        | `reset-password.controller.ts` / `reset-password.service.ts`.                                                                                                                                                                             |
| 4 Infra no application       | `reset-password.service.ts:3-5` importa `DRIZZLE`, `passwordResetTokens`, `users`; `:20` `@Inject(DRIZZLE)`; `:28-32` `select`; `:48-57` transação (update password + token); `:46` delega hash ao `PasswordService`; `:66` delega email. |
| 5 HTTP leak no application   | `reset-password.service.ts:35` `BadRequestException(INVALID_TOKEN_MESSAGE)`; `:40` `USED_TOKEN_MESSAGE`; `:43` `EXPIRED_TOKEN_MESSAGE`.                                                                                                   |
| 6 DTO no lugar errado        | `reset-password.dto.ts:1-20` `class-validator` na raiz.                                                                                                                                                                                   |
| 9 Regra no lugar errado      | `reset-password.service.ts:10-13` constantes de mensagem exportadas do service; `:26` `hashToken`.                                                                                                                                        |
| 10 Composition root quebrado | `reset-password.module.ts:8-10` `imports: [PasswordModule, EmailModule]`; registra `ResetPasswordController`/`ResetPasswordService`.                                                                                                      |

Obs.: o match de senha é feito no controller (`reset-password.controller.ts:27-29`, `BadRequestException` — camada interface, ok), mas de forma inconsistente com o sign-up, que usa decorator `Match` no DTO.

### 3.8 `shared/email` — DESALINHADA (leve)

```
shared/email/
├── email.constants.ts            # EMAIL_TRANSPORT (token DI)
├── email.module.ts               # composition root: factory + service
├── email.service.ts              # 4 métodos de envio
├── email.service.spec.ts
├── email-templates.ts            # templates HTML (domain puro)
├── email-transport.factory.ts    # seleção de transport por env
├── email-transport.factory.spec.ts
├── email.types.ts                # port EmailTransport + inputs
├── mailtrap.transport.ts         # adapter SMTP
└── resend.transport.ts           # adapter Resend API
```

| Catálogo                        | Ocorrência                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Estrutura ausente             | Arquivos soltos na raiz, sem `interface/application/domain/infrastructure`.                                                                                                                                                                                              |
| 3 Service multi-fluxo (parcial) | `email.service.ts:26-46` — 4 métodos públicos (`sendConfirmationEmail`, `sendNewSessionEmail`, `sendPasswordResetEmail`, `sendPasswordResetSuccessEmail`). Como serviço compartilhado de infra, é aceitável manter 1 classe; registrar como decisão de baixa prioridade. |

Positivo: já existe separação port/adapter (`email.types.ts` = port, `mailtrap.transport.ts`/`resend.transport.ts` = adapters, `email-transport.factory.ts` = composição). Refactor é mover para pastas (`domain/email.types.ts`, `infrastructure/transports/*`, `application/email.service.ts`) sem mudar lógica.

### 3.9 `shared/password` — DESALINHADA (leve)

```
shared/password/
├── password.module.ts
├── password.service.ts
└── password.service.spec.ts
```

| Catálogo                        | Ocorrência                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Estrutura ausente             | Arquivos soltos na raiz.                                                                                                                                                                                             |
| 7 Nomenclatura antiga (parcial) | `password.service.ts:6-14` é um adapter de infra (bcrypt) usado como service. Correto no hexágono seria um port (`PasswordHasher`) em domain + adapter em infrastructure. `BCRYPT_COST` (`:4`) é constante de infra. |

## 4. Grafo de dependências

### 4.1 Wiring de módulos (composition root)

```
AppModule (app.module.ts:12-21)
 ├─ AuthModule            → imports DatabaseModule (auth.module.ts:11)
 │    registra AuthController, SessionController, SessionService, SessionGuard,
 │    AuthGuard como APP_GUARD (auth.module.ts:12-14); exports SessionService (:14)
 ├─ SignUpModule          → imports PasswordModule, EmailModule (sign-up.module.ts:8)
 ├─ SignInModule          → imports AuthModule, PasswordModule, EmailModule (sign-in.module.ts:9)
 ├─ ForgotPasswordModule  → imports EmailModule (forgot-password.module.ts:7)
 ├─ ConfirmAccountModule  → imports AuthModule (confirm-account.module.ts:7)
 └─ ResetPasswordModule   → imports PasswordModule, EmailModule (reset-password.module.ts:8)

DatabaseModule (@Global, database.module.ts:9) — injeta DRIZZLE em qualquer provider.
```

Colisões de wiring: `AuthModule` é importado por `SignInModule`, `ConfirmAccountModule`
e por specs/e2e — e é o composition root da sessão. `AppModule` importa os 6 módulos de
auth. Toda mudança de sessão passa por `auth.module.ts`; o wiring final será resolvido
no fim da refatoração.

### 4.2 Dependências no nível de serviço (quem importa o quê)

```
                        ┌─────────────────────────┐
                        │   db/schema + DRIZZLE    │  (infra compartilhada, db/)
                        └───────┬────────┬─────────┘
                                │        │
        session.service ────────┤        │
        sign-up.service ────────┤        │
        sign-in.service ────────┤        │
        confirm-account.service ┤        │
        forgot-password.service ┤        │
        reset-password.service ─┘        │
                                         │
        session.service, sign-up, confirm-account, forgot-password, reset-password,
        AuthGuard, SessionGuard  ──▶ session-token.ts (generate/hash/parseBearerToken)

        EmailService (shared/email) ◀── sign-up, sign-in, forgot-password, reset-password
        PasswordService (shared/password) ◀── sign-up, sign-in, reset-password
        SessionService ◀── AuthGuard, SessionGuard, sign-in.service, confirm-account.service
        Public decorator ◀── auth.controller + todos os controllers de fluxo + session.controller
```

### 4.3 Ordem sugerida para a refatoração (informa o planner)

1. **Fundações compartilhadas primeiro** (sem dependentes delas em fluxo): `shared/email`,
   `shared/password` (movimentação estrutural, porta intocada).
2. **`auth/session`** (extrair `SessionModule`, ports/adapters de sessão, request handlers
   `me`/`logout`, extrair `session-token.ts` para infra compartilhada) — é o nó central:
   tudo depende dela. Atualizar `AuthGuard`/`SessionGuard`.
3. **Slices de fluxo** que usam sessão/token: `sign-in`, `confirm-account`.
4. **Slices de fluxo** restantes: `sign-up`, `forgot-password`, `reset-password`
   (podem ir em paralelo entre si — sem colisão de arquivos).
5. **Wiring final**: `auth.module.ts`/`app.module.ts` e os `*.module.ts` das slices
   passam a registrar request handlers + use-cases + ports/adapters; remover imports de
   `AuthModule` por `SessionModule` onde aplicável.

## 5. Inventário de testes

### 5.1 Unitários / integração (`apps/api/src/...`)

| Arquivo                                                | O que cobre                                                                                                                        | Migra junto com             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `auth/session/session.service.spec.ts`                 | `SessionService`: cria sessão (hash sha256), valida, token desconhecido, revogada, revoga idempotente, last-wins, usuário deletado | slice session               |
| `auth/session/session-token.spec.ts`                   | `session-token`: geração (43 chars), hash sha256, parseBearerToken                                                                 | extração de `session-token` |
| `auth/sign-up/sign-up.service.spec.ts`                 | `SignUpService`: cria user+token+email, anti-enumeração, normalização email, falha de transport (rollback + 500)                   | slice sign-up               |
| `auth/sign-in/sign-in.service.spec.ts`                 | `SignInService`: sign-in ok + email, normalização, senha/email/desverificado (401 genérico), last-wins, falha de email tolerada    | slice sign-in               |
| `auth/confirm-account/confirm-account.service.spec.ts` | `ConfirmAccountService`: token válido/expirado/usado/desconhecido, idempotência, last-wins                                         | slice confirm-account       |
| `auth/forgot-password/forgot-password.service.spec.ts` | `ForgotPasswordService`: cria token 24h, revoga anteriores, email desconhecido, normalização, falha de email                       | slice forgot-password       |
| `auth/reset-password/reset-password.service.spec.ts`   | `ResetPasswordService`: reset ok, expirado/usado/desconhecido, falha de email                                                      | slice reset-password        |
| `shared/email/email.service.spec.ts`                   | `EmailService`: templates/links, fallback APP_URL (unit, sem Nest)                                                                 | shared/email                |
| `shared/email/email-transport.factory.spec.ts`         | `createEmailTransport`: seleção mailtrap/resend, falhas rápidas, proibição mailtrap em prod                                        | shared/email                |
| `shared/password/password.service.spec.ts`             | `PasswordService`: hash bcrypt cost 10, verify true/false                                                                          | shared/password             |
| `db/database.factory.spec.ts`                          | `createDrizzleDatabase`: DATABASE_URL ausente, criação com schema                                                                  | fora de escopo (db/)        |
| `app.controller.spec.ts`                               | `AppController.getHello`                                                                                                           | fora de escopo (app/)       |

Atenção: os specs de `sign-in`, `confirm-account` e `session` importam `AuthModule`
(para obter `SessionService`); os specs de `sign-up`, `forgot-password`, `reset-password`
importam `EMAIL_TRANSPORT`/`EmailModule`/`PasswordModule` e `hashToken`/`generateSessionToken`
de `session/session-token` — imports quebram com os renames/movimentações.

### 5.2 E2E (`apps/api/e2e/`)

| Arquivo                       | Rota(s)                                                   | Asserts críticos (devem ser preservados)                                                                                     |
| ----------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `sign-up.e2e-spec.ts`         | `POST /auth/sign-up`                                      | 201 + body genérico; duplicidade idêntica; lowercase; validação 400 com mensagens por campo                                  |
| `sign-in.e2e-spec.ts`         | `POST /auth/sign-in`, `GET /auth/me`                      | 200 + token (43); me aceita token; 401 genérico idêntico; last-wins; validação 400                                           |
| `confirm-account.e2e-spec.ts` | `POST /auth/confirm-account`, `GET /auth/me`              | 200 + token; me aceita; expirado/usado/desconhecido 400; idempotência; last-wins; validação 400                              |
| `forgot-password.e2e-spec.ts` | `POST /auth/forgot-password`                              | 202 + body genérico; 202 idêntico para email desconhecido; revoga anteriores; 400                                            |
| `reset-password.e2e-spec.ts`  | `POST /auth/reset-password`, `POST /auth/sign-in`         | 200 + body; mismatch 400 ("Passwords do not match."); expirado/usado/desconhecido 400; sign-in com nova senha; validação 400 |
| `auth-session.e2e-spec.ts`    | `GET /auth`, `GET /auth/me`, `POST /auth/logout`, `GET /` | health sem token; me 200/401; guards 401 malformado/desconhecido/revogado; logout idempotente; last-wins                     |
| `app.e2e-spec.ts`             | `GET /`, `GET /auth`                                      | 401 sem token; hello world autenticado; health auth                                                                          |

Os e2e `auth-session` e `app` usam `AppModule` completo + `SessionService`/`DRIZZLE`
diretos — são a rede de segurança do wiring final.

## 6. Riscos

1. **`session-token.ts` atravessa 5 slices** (`session`, `sign-up`, `confirm-account`,
   `forgot-password`, `reset-password`) + `AuthGuard`/`SessionGuard` + 5 specs + 4 e2e.
   Extrair para infra compartilhada **antes** das slices de fluxo, senão toda movimentação
   quebra imports em cascata.
2. **`auth.module.ts` é composition root da sessão e é importado por `SignInModule` e
   `ConfirmAccountModule`** — refatorar sessão requer criar `SessionModule` e re-apontar
   esses imports; há risco de import circular (slices importando o módulo pai).
3. **Comportamento HTTP deve ser byte-a-byte igual**: os e2e assertam rotas, status e
   mensagens exatas (201 sign-up, 202 forgot, mensagens de link inválido/expirado/usado,
   "Invalid email or password", "Passwords do not match."). Renomear classes não pode
   mudar rota/status/mensagem.
4. **Constantes exportadas de services são importadas pelos specs** (`INVALID_LINK_MESSAGE`,
   `EXPIRED_LINK_MESSAGE`, `USED_LINK_MESSAGE`, `INVALID_TOKEN_MESSAGE`, etc.) — mover para
   a interface exige migrar os imports dos specs na mesma onda.
5. **`InternalServerErrorException`/`UnauthorizedException`/`BadRequestException` em 4
   services** (sign-up, sign-in, confirm-account, reset-password) — o HTTP leak deve migrar
   para os request handlers sem mudar a semântica (código/status/mensagem).
6. **Observabilidade**: `sign-up.service.ts:17-19` cria o contador OTel `auth.signup.count`
   com métricas de resultado (`duplicate`/`success`/`email_failure`) — preservar no
   use-case/application após a refatoração.
7. **Regras de segurança anti-enumeração/anti-timing** dependem de detalhes de
   implementação atuais: `DUMMY_PASSWORD_HASH` (`sign-in.service.ts:14`), geração de token
   em todos os caminhos do forgot-password (`:33`), rollback do sign-up (`:78`) — qualquer
   reestruturação pode enfraquecê-las sem teste detectando. Incluir no QA manual.
8. **Normalização de email duplicada**: `sign-up.dto.ts:45-47` (Transform) e
   `sign-up.service.ts:28`; `sign-in.service.ts:28`; `forgot-password.service.ts:21`.
   Decidir a residência única (domain) para não propagar a duplicação.
9. **Duplicação `AuthGuard` × `SessionGuard`** (mesma validação) — risco de divergência;
   oportunidade de consolidar na refatoração da sessão.
10. **`exports: [SignUpService]`** sem consumidores — remover na refatoração.

## 7. Conclusão

Todas as slices estão DESALINHADAS. A refatoração é viável com baixo risco de
comportamento porque a cobertura de testes é forte (12 specs + 7 e2e) e o grafo de
dependências tem um nó central claro (`session` + `session-token`). A ordem recomendada
para o planner: `shared/*` → `session` → `sign-in`/`confirm-account` → `sign-up`/
`forgot-password`/`reset-password` → wiring final (`auth.module.ts`/`app.module.ts`).
