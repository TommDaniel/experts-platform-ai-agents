# Plano — Auth Schema (`001-auth-schema`)

> Executa a spec `./.specs/001-auth-schema.md`. Prepara a fundação do domínio de autenticação: schema das 4 tabelas via Drizzle (aplicado pelo pipeline Supabase), `PasswordService` (bcrypt custo 10), `EmailService` (transports Mailtrap/Resend), prefixo global `api/v1`, módulo `auth` com endpoint scaffolding e a convenção en-us documentada.

## Decisões do refinamento (feature-concept)

| Fork                  | Decisão                                                                                                  | Racional                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Driver Drizzle        | `postgres-js` (`drizzle-orm/postgres-js`)                                                                | Leve, TS-nativo, funciona bem com bun e node (escolha do usuário).                         |
| Implementação bcrypt  | Pacote `bcrypt` (nativo) + `@types/bcrypt`                                                               | Escolha do usuário (link do pacote oficial).                                               |
| Local do schema/db    | `apps/api/src/db/` (schema.ts + database.module.ts)                                                      | Infra de banco é camada de infraestrutura (DEVELOPMENT.md); evita dependência shared→auth. |
| Geração da migração   | `drizzle-kit generate` → SQL copiado para `supabase/migrations/` (pipeline `bun run db:migrate` mantido) | Spec exige manter o pipeline Supabase da fundação; Drizzle só gera o SQL.                  |
| Config de env no Nest | `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`)                                            | Carrega `.env` no dev (sem isso o DATABASE_URL não chega ao processo); padrão Nest.        |
| Transports de email   | Mailtrap via `nodemailer` (SMTP, non-prod) · Resend via SDK oficial (prod)                               | Implementações concretas dos dois transportes exigidos pela spec, plugáveis por env.       |

## Objetivo

- Schema das tabelas `users`, `sessions`, `email_confirmation_tokens` e `password_reset_tokens` definido em Drizzle, com SQL versionado em `supabase/migrations/` e aplicável via `bun run db:migrate`.
- `PasswordService` (hash/verify, bcrypt custo 10) testado.
- `EmailService` com métodos por fluxo (confirmação, nova sessão, reset, sucesso do reset), transportes Mailtrap/Resend por env e fail-fast para transport desconhecido, testado.
- API Nest servindo sob `/api/v1` com módulo `auth` acessível em `/api/v1/auth`.
- Seção "Idioma" (en-us) em `.docs/DEVELOPMENT.md`.

## Escopo

**Dentro:** deps Drizzle/bcrypt/email/config; schema das 4 tabelas + migração; DatabaseModule; PasswordService; EmailService + transports + templates en-us; prefixo `api/v1`; módulo auth com GET `/api/v1/auth`; `.env.example`; seção "Idioma"; testes; QA gates; ADR.

**Fora:** endpoints/fluxos de auth (specs 004–008); guard/sessão/`me`/`logout` (spec 002); RLS/PostgREST/Supabase Auth como porta de entrada; chave real do Resend; filas/retry/templates visuais ricos.

## Etapas

### E1. Dependências (`apps/api`)

- runtime: `drizzle-orm`, `postgres`, `bcrypt`, `nodemailer`, `resend`, `@nestjs/config`.
- dev: `drizzle-kit`, `@types/bcrypt`, `@types/nodemailer`.

### E2. Schema Drizzle (`apps/api/src/db/schema.ts`)

- `users`: `id` bigint identity PK; `email` text not null unique; `password_hash` text not null; `first_name`/`last_name` text not null; `email_verified_at` timestamptz null; `created_at`/`updated_at` timestamptz default now().
- `sessions`: `id` PK; `user_id` FK→users (indexada); `token_hash` text not null unique; `revoked_at` timestamptz null; `created_at` default now().
- `email_confirmation_tokens` e `password_reset_tokens`: `id` PK; `user_id` FK→users (indexada); `token_hash` unique; `expires_at` timestamptz not null; `used_at` timestamptz null; `created_at` default now().
- Colunas e nomes em snake_case lowercase (skill Postgres).

### E3. Migração

- `drizzle.config.ts` em `apps/api` (`out: ./drizzle`), `bunx drizzle-kit generate`.
- Copiar o SQL gerado para `supabase/migrations/<timestamp>_auth_schema.sql` (via `supabase migration new auth_schema`).
- `.gitignore`: ignorar `apps/api/drizzle/` (o SQL versionado é o de `supabase/migrations/`).

### E4. DatabaseModule (`apps/api/src/db/database.module.ts`)

- Global; provider `DRIZZLE` (token Symbol) criando `postgres(DATABASE_URL)` + `drizzle(client, { schema })`.
- `DATABASE_URL` ausente → erro claro apontando `.env`.

### E5. PasswordService (`apps/api/src/modules/shared/password/`)

- `hash(plain)` → bcrypt custo 10; `verify(plain, hash)` → boolean. Testes unitários.

### E6. EmailService (`apps/api/src/modules/shared/email/`)

- `email.types.ts`: `EmailTransport` (interface `send`), `EmailMessage`, dados por fluxo.
- `email-templates.ts`: builders HTML en-us (confirmation, new session, password reset, reset success).
- `mailtrap.transport.ts` (nodemailer SMTP) e `resend.transport.ts` (SDK `resend`).
- `email-transport.factory.ts`: `EMAIL_TRANSPORT=mailtrap` → Mailtrap; `resend` → Resend; outro → `Error` claro (fail-fast).
- `email.service.ts`: métodos `sendConfirmationEmail`, `sendNewSessionEmail`, `sendPasswordResetEmail`, `sendPasswordResetSuccessEmail` (links usam `APP_URL`).
- `email.module.ts`: providers com factory resolvendo transporte e `APP_URL`.
- Testes: factory por env (com mock), métodos chamam o transporte com assunto/html/link corretos.

### E7. Prefixo `api/v1` + módulo auth

- `main.ts`: `app.setGlobalPrefix('api/v1')`.
- `apps/api/src/modules/auth/`: `auth.module.ts` (importa DatabaseModule e EmailModule) + `auth.controller.ts` com `GET /auth` → `{ status: "ok" }`.
- `app.module.ts` importa `AuthModule`.
- Atualizar `apps/api/e2e/app.e2e-spec.ts`: `GET /api/v1` → hello world; adicionar caso `GET /api/v1/auth`.

### E8. `.env.example`

- `DATABASE_URL` (Supabase local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`), `EMAIL_TRANSPORT`, `APP_URL`, `MAILTRAP_*`, `RESEND_*` com instruções.

### E9. Docs

- Seção "Idioma" em `.docs/DEVELOPMENT.md`: páginas, endpoints e código em en-us.

### E10. Infra + migração

- `bun run infra:up` (Supabase + LGTM) e `bun run db:migrate`; validar tabelas no banco local.

### E11. QA gates

- `bun run code:fix`, `bun run types:check`, `bun run test`, `bun run build` (nesta ordem).

### E12. ADR + artefatos

- `./.adrs/001-auth-schema.md` e entregáveis do `RULES.md` (decisões, QA manual, arquivos, libs, racional).

### E13. Commit e push

- `/commit-and-push '<mensagem conventional>'` ao final.

## Arquivos-alvo

- Novo: `apps/api/drizzle.config.ts`, `apps/api/src/db/{schema,database.module}.ts`, `apps/api/src/modules/shared/password/*`, `apps/api/src/modules/shared/email/*`, `apps/api/src/modules/auth/*`, `supabase/migrations/<ts>_auth_schema.sql`, `./.plans/001-auth-schema-plan.md`, `./.adrs/001-auth-schema.md`.
- Alterado: `apps/api/package.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/e2e/app.e2e-spec.ts`, `.env.example`, `.docs/DEVELOPMENT.md`, `.gitignore`.

## Riscos e edge cases

- `DATABASE_URL` ausente → DatabaseModule falha com mensagem clara.
- `EMAIL_TRANSPORT` desconhecido ou sem credenciais → EmailService falha na inicialização (fail-fast).
- `bcrypt` nativo: prebuilt disponível para darwin/node; se o build falhar, cair para `bcryptjs` (documentar).
- Migração já aplicada → `supabase db push` idempotente.
- Drizzle e Supabase CLI como "dois donos de schema" → mitigado gerando o SQL pelo Drizzle e versionando-o no pipeline Supabase (fonte única: `schema.ts`).
- `GET /` da fundação passa a viver sob `/api/v1` — e2e atualizado.

## Critérios de aceite (da spec)

Checklist de `001-auth-schema.md` §Critérios de aceite — todos verificáveis (migração aplicada, tabelas com constraints, PasswordService/EmailService com testes, API sob `/api/v1/auth`, seção "Idioma", QA gates passando).

## Checklist de QA manual

1. `bun run infra:up` sobe Supabase local + LGTM.
2. `bun run db:migrate` aplica a migração `auth_schema` sem erro.
3. Confirmar no banco (psql/Studio) que as 4 tabelas existem com as constraints (email único, token_hash único, FKs indexadas).
4. `bun run dev --filter api` → `curl http://localhost:3000/api/v1` (hello world) e `curl http://localhost:3000/api/v1/auth` (`{"status":"ok"}`).
5. `bun run code:fix`, `types:check`, `test`, `build` passam.
6. Email: com `EMAIL_TRANSPORT=mailtrap` e credenciais do Mailtrap, o EmailService envia para o inbox (validar manualmente em `001` via teste/script; fluxos completos nas specs 004–008).
