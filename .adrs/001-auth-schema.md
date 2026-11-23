# ADR-001: Auth schema base (Drizzle, hashing, email, /api/v1, en-us)

- **Status:** aceito
- **Data:** 2026-08-10
- **Spec:** `./.specs/001-auth-schema.md`
- **Decisões load-bearing** do refinamento e da implementação da base do domínio de autenticação.

## Contexto

A fundação (`000`) entregou API Nest.js (`apps/api`, :3000), cliente React + Vite, Supabase local e migrações via Supabase CLI. Não há autenticação. Esta ADR registra as decisões estruturais que sustentam todo o domínio auth (specs 002–008): acesso a dados, hashing, envio de email, versionamento da API e idioma.

## Decisões

### 1. Drizzle ORM com driver `postgres-js`

Acesso a dados via Drizzle ORM (`drizzle-orm` + `postgres-js`), substituindo o "sem ORM" da fundação para queries. Driver `postgres-js` escolhido pelo usuário: leve, TS-nativo, funciona com bun e node. A única fonte do schema é `apps/api/src/db/schema.ts`; os módulos injetam o client via token `DRIZZLE` (`DatabaseModule` global).

### 2. Migrações: SQL gerado por `drizzle-kit`, versionado no pipeline Supabase

`drizzle-kit generate` produz o SQL (em `apps/api/drizzle/`, ignorado no git) e o SQL é copiado para `supabase/migrations/<timestamp>_auth_schema.sql`, aplicado por `bun run db:migrate` (`supabase db push --local`). Mantém o pipeline da fundação intacto; o Drizzle é usado para schema e query, não para o fluxo de migração. Mitigação do risco "dois donos de schema": o `schema.ts` é a fonte e a migração é regenerável.

### 3. Schema das 4 tabelas (idempotente, constraints fortes)

`users` (email único por índice, `password_hash`, `first_name`/`last_name`, `email_verified_at`), `sessions` (`token_hash` único, `revoked_at`), `email_confirmation_tokens` e `password_reset_tokens` (`token_hash` único, `expires_at`, `used_at`). PKs `bigint identity` (recomendação de schema), colunas snake_case lowercase, FKs para `users` com `ON DELETE CASCADE` e **índices nas colunas de FK**. Sessão/`token_hash` guardam apenas o hash SHA-256 do token (o token puro só trafega na criação).

### 4. Senhas com `bcrypt` (nativo), custo 10

`PasswordService` usa o pacote `bcrypt` (escolha do usuário), custo fixo 10, com `hash` e `verify`. Nunca armazenar senha em claro; `verify` usa `bcrypt.compare`.

### 5. `EmailService` com transports Mailtrap/Resend por env (fail-fast)

Interface `EmailTransport` + `MailtrapTransport` (SMTP via `nodemailer`, non-prod) e `ResendTransport` (SDK oficial `resend`, prod). `EMAIL_TRANSPORT=mailtrap|resend`; transporte desconhecido, credenciais ausentes ou `mailtrap` em produção falham na inicialização com erro explícito (fail-fast, nunca silencioso). O `EmailService` expõe métodos por fluxo: confirmação de conta, nova sessão, reset de senha e sucesso do reset (templates HTML en-us com `APP_URL`).

### 6. API sob prefixo global `api/v1`; módulo `auth` em `api/v1/auth`

`app.setGlobalPrefix('api/v1')` em `main.ts` (espelhado no e2e). O módulo `auth` expõe `GET /api/v1/auth` com scaffolding de saúde. O hello world da fundação passa a viver em `/api/v1`.

### 7. Idioma en-us documentado

Seção "Idioma" em `.docs/DEVELOPMENT.md`: páginas, endpoints, mensagens, emails e código em en-us; apenas comentários de decisão e `.docs/` podem ficar em português.

### 8. Config de env via `@nestjs/config`

`ConfigModule.forRoot({ isGlobal: true })` no `AppModule` carrega `.env` no dev. Decisões de config (tokens/credenciais) são lidas por `ConfigService` nas factories (`DRIZZLE`, transporte de email).

### 9. `DatabaseModule` e `EmailModule` ainda não wiring no `AppModule`

Os módulos existem e estão testados, mas não são importados pelo `AppModule` nesta spec: os fluxos que realmente consultam o banco e enviam email (specs 004–008) fazem a fiação. Evita fail-fast em boot/tests sem env, mantendo os portões de QA verdes. Documentado para as próximas specs.

## Consequências

- `bun run db:migrate` aplica as 4 tabelas no Supabase local sem erro (verificado no banco: tabelas, PKs identity, índices únicos e FKs cascade).
- `PasswordService` e `EmailService` com testes unitários passando (18 testes na API).
- API respondendo em `api/v1` e `api/v1/auth` (supertest + smoke real).
- Portões de QA (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando na raiz.
- `.env.example` documenta `DATABASE_URL`, `APP_URL`, `EMAIL_TRANSPORT` e credenciais `MAILTRAP_*`/`RESEND_*`.
- Devias da fundação: `.docs/` atualizado com a convenção de idioma; `GET /` da API agora sob `/api/v1`.
