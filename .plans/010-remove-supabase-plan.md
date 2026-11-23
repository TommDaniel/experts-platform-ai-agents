# Plano — 010-remove-supabase

> Spec: `.specs/010-remove-supabase.md` · Objetivo: remover o Supabase e operar o Postgres nativo via Docker com uma única `DATABASE_URL`.

## Objetivo

Eliminar todo vestígio de Supabase do monorepo (CLI, infra local, migrações, env vars, docs ativos e skills) e passar a rodar o PostgreSQL nativo via `docker-compose.yml` na porta `5432`, consumido por Drizzle ORM via `DATABASE_URL`.

## Contexto mapeado

- Acesso a banco já é Drizzle + postgres-js via `DATABASE_URL` (`apps/api/src/db/database.factory.ts`) — **nenhum** `@supabase/*` no código.
- Supabase aparece apenas como: devDependency `supabase` (root `package.json`), scripts `infra:up`/`infra:down`/`db:migrate`, diretório `supabase/` (config.toml, 2 migrações, `.temp`, `.branches`, `snippets`), vars `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` em `.env`, `.env.example` e `apps/api/.env`, `DATABASE_URL` apontando p/ `54322`, referências em `.docs/ARCHITECTURE.md`, `.docs/QA.md`, `README.md`, `load/README.md`, `skills-lock.json`, `.oxlintrc.json` (ignorePattern) e `.gitignore` (ignora `apps/api/drizzle/`).
- Migração Drizzle já gerada: `apps/api/drizzle/0000_huge_gargoyle.sql` + `meta/` (fonte de verdade nova). `foundation_smoke` não é portada (sem referências em código).

## Decisões (da spec, confirmadas)

| Decisão            | Opção                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Porta do Postgres  | `5432` (padrão)                                                                                                      |
| Imagem             | `postgres:17-alpine`, creds `postgres`/`postgres`, db `postgres`                                                     |
| Migrações          | Drizzle Kit em `apps/api/drizzle/`, `db:migrate` = `turbo run db:migrate` → `drizzle-kit migrate`                    |
| `foundation_smoke` | Removida (sem referências)                                                                                           |
| Skills             | `supabase` e `supabase-postgres-best-practices` removidas (`.agents/skills/`, `.claude/skills/`, `skills-lock.json`) |
| Docs históricas    | `.specs/`, `.plans/`, `.adrs/` mantidas como registro                                                                |

## Etapas

1. **Stop da infra Supabase local** — `npx supabase stop --no-backup` (se o CLI/containers existirem) e remover contêineres `supabase_*` restantes.
2. **Compose** — adicionar serviço `postgres` (`postgres:17-alpine`, env `POSTGRES_*`, `5432:5432`, volume `postgres-data:/var/lib/postgresql/data`, healthcheck `pg_isready -U postgres`) + volume `postgres-data`.
3. **Scripts raiz** — `infra:up` → `docker compose up -d`; `infra:down` → `docker compose down`; `db:migrate` → `turbo run db:migrate`; remover `supabase` das devDependencies.
4. **apps/api** — script `db:migrate` (`drizzle-kit migrate`) no `package.json`; `drizzle.config.ts` ganha `dbCredentials.url` via `process.env.DATABASE_URL`.
5. **Env** — remover `SUPABASE_*` e atualizar `DATABASE_URL` p/ `postgresql://postgres:postgres@localhost:5432/postgres` em `.env`, `.env.example` e `apps/api/.env`.
6. **Remoções** — diretório `supabase/`; entry do `.gitignore` (`apps/api/drizzle/` + comentário); `supabase/.temp/**` do `.oxlintrc.json`; skills de Supabase + entries do `skills-lock.json`.
7. **Docs** — `.docs/ARCHITECTURE.md`, `.docs/QA.md`, `README.md`, `load/README.md`.
8. **Bun install** — regenerar `bun.lock`.
9. **QA gates + ADR + commit** — ver `QA.md`.

## Arquivos-alvo

- `docker-compose.yml`
- `package.json`, `bun.lock`
- `apps/api/package.json`, `apps/api/drizzle.config.ts`
- `apps/api/drizzle/**` (agora versionado)
- `.env`, `.env.example`, `apps/api/.env`
- `.gitignore`, `.oxlintrc.json`, `skills-lock.json`
- `supabase/**` (removido)
- `.agents/skills/supabase/**`, `.agents/skills/supabase-postgres-best-practices/**`, `.claude/skills/supabase/**`, `.claude/skills/supabase-postgres-best-practices/**` (removidos)
- `.docs/ARCHITECTURE.md`, `.docs/QA.md`, `README.md`, `load/README.md`

## Riscos / edge cases

- Porta `5432` ocupada no host → `docker compose up -d` falha; ajustar compose + `DATABASE_URL` ou parar o Postgres local.
- `drizzle-kit migrate` sem banco de pé → falha; rodar `infra:up` antes. Idempotente via journal (`apps/api/drizzle/meta/_journal.json`).
- `apps/api/.env` não tem as vars OTEL (ficam no `.env` raiz) — não tocar fora do escopo.
- `drizzle-kit` precisa estar resolvível no workspace `apps/api` (já é devDependency lá).

## Critérios de aceite (resumo)

- `grep -ri supabase` limpo em código/configs/docs ativos.
- `docker compose up -d` sobe Postgres na `5432`; `bun run db:migrate` aplica e é idempotente.
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando.

## QA

```sh
bun run infra:up
bun run db:migrate        # aplica + roda de novo (idempotente)
bun run code:fix
bun run types:check
bun run test
bun run test:e2e
bun run build
```

## Entregáveis

- ADR `./.adrs/011-remove-supabase.md` + resumo.
- Passos manuais de QA, arquivos modificados, libs removidas, racional.
