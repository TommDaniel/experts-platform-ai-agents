# ADR-011: Remoção do Supabase em favor de PostgreSQL nativo via Docker

- **Status:** aceito
- **Data:** 2026-08-12
- **Decisão load-bearing:** eliminar o Supabase do monorepo (CLI, infra local, migrações, env vars, docs ativos e skills de agente) e operar o banco com **PostgreSQL nativo via `docker-compose.yml`** (imagem `postgres:17-alpine`, porta `5432`), acessado exclusivamente via `DATABASE_URL` e gerenciado por **Drizzle ORM + postgres-js** com migrações do **Drizzle Kit** em `apps/api/drizzle/`.

## Contexto

O Supabase foi introduzido na fundação (`000-foundation.md`) como provedor local de Postgres, Auth e Storage, com migrações em `./supabase/migrations/` aplicadas via Supabase CLI (`supabase db push --local`) e Postgres local na porta `54322`. Na prática, o código da API **nunca usou clientes do Supabase** (`@supabase/supabase-js`): o acesso a banco é feito por Drizzle + postgres-js via `DATABASE_URL` (`apps/api/src/db/database.factory.ts`). Auth e Storage do Supabase não foram usados por nenhuma feature.

O Supabase permanecia apenas como infra/tooling: o CLI `supabase` (devDependency raiz), o diretório `supabase/` (config.toml, migrações, `.temp`), os scripts `infra:up`/`infra:down`/`db:migrate`, as variáveis `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` e referências em `.docs/`, `README.md` e `load/README.md`. Isso adicionava peso desnecessário: binário global, portas `54321`/`54322`, `config.toml` e uma segunda camada de migração (Drizzle já gerava `apps/api/drizzle/`).

A mudança foi solicitada pelo usuário ("remover o Supabase em favor da utilização nativa do PostgreSQL"), com `DATABASE_URL` como única configuração e Postgres subido via Docker.

## Decisões

### 1. Postgres nativo no docker-compose (porta 5432)

Serviço `postgres` (`postgres:17-alpine`) com `POSTGRES_USER/PASSWORD/DB=postgres`, porta `5432:5432`, volume `postgres-data` e healthcheck `pg_isready`. `DATABASE_URL` vira `postgresql://postgres:postgres@localhost:5432/postgres`. Confirmado com o usuário (porta padrão do Postgres).

### 2. Drizzle Kit como único gerenciador de migrações

`apps/api/drizzle/` (já gerado pelo Drizzle, `0000_huge_gargoyle.sql` + `meta/`) torna-se a fonte de verdade; `apps/api/drizzle/` sai do `.gitignore` e passa a ser versionado. `drizzle.config.ts` ganha `dbCredentials.url` via `process.env.DATABASE_URL`. `bun run db:migrate` agora executa `turbo run db:migrate` → `drizzle-kit migrate` (tarefa declarada em `turbo.json` — o Turbo 2.x exige tarefas declaradas para `turbo run`). A migração `foundation_smoke` não é portada (tabela sem referências em código; o schema Drizzle é a fonte de verdade).

### 3. Remoção completa do Supabase

- `supabase` removido das devDependencies (raiz) e `bun.lock` regenerado.
- Diretório `supabase/` (config.toml, migrações, `.temp`, `.branches`, `snippets`) removido.
- Vars `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` removidas de `.env`, `.env.example` e `apps/api/.env`.
- `infra:up`/`infra:down` passam a controlar só o Docker (`docker compose up -d`/`down`).
- `.oxlintrc.json` (ignorePattern `supabase/.temp/**`), `.gitignore` (comentário + entrada de `apps/api/drizzle/`) limpos.
- Skills de agente `supabase` e `supabase-postgres-best-practices` removidas de `.agents/skills/` e `.claude/skills/` (decisão explícita do usuário) e `skills-lock.json` atualizado.
- Docs ativos atualizados: `.docs/ARCHITECTURE.md`, `.docs/QA.md`, `README.md`, `load/README.md`.

### 4. Porta 5432 conflitante resolvida

O container `rocketseat_fastify_postgres` (outro projeto) ocupava a `5432` no host. Com aprovação do usuário, o container foi **parado** (sem remoção — dados preservados; pode ser religado com `docker start rocketseat_fastify_postgres`), liberando a porta para o Postgres deste projeto.

## Consequências

**Positivas:**

- Um único ponto de configuração de banco (`DATABASE_URL`); zero chaves de Supabase no ambiente.
- Infra local mais leve e determinística: um container Postgres + a stack LGTM, sem binário global nem `config.toml`.
- Camada de migração única (Drizzle Kit), com as migrações versionadas em `apps/api/drizzle/`.
- Deploy futuro mais direto (Vercel + Postgres gerenciado), sem remapear stack.

**Negativas/custos:**

- Dados locais do Postgres do Supabase (`54322`) não migram para o novo banco (`5432`) — banco de dev recomeça limpo (descartável).
- Máquinas com Postgres local na porta `5432` precisam liberar a porta ou trocá-la no compose + `DATABASE_URL`.
- O container `rocketseat_fastify_postgres` (outro projeto) ficou parado no host; precisa ser religado quando o outro projeto precisar do banco.
- Skills `supabase`/`supabase-postgres-best-practices` removidas do repo — agentes em outros clones perdem acesso (sem uso real no projeto).
