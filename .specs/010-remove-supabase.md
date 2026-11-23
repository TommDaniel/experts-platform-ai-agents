---
title: Remover Supabase em favor de PostgreSQL nativo via Docker
status: draft
created: 2026-08-12
---

# Remover Supabase em favor de PostgreSQL nativo via Docker

> Elimina o Supabase do monorepo (CLI, infra local, migrações, variáveis de ambiente e docs) e passa a rodar o PostgreSQL nativo via `docker-compose.yml`, consumido exclusivamente por uma única `DATABASE_URL` via Drizzle ORM.

## Contexto

O Supabase foi introduzido na fundação (`000-foundation.md`) como provedor local de Postgres, Auth e Storage, com migrações versionadas em `./supabase/migrations/` aplicadas via Supabase CLI (`supabase db push --local`) e o Postgres local servido na porta `54322`.

Na prática, o código da API **já não usa nenhum cliente do Supabase** (`@supabase/supabase-js`): o acesso ao banco é feito por **Drizzle ORM + postgres-js** diretamente via `DATABASE_URL` (`apps/api/src/db/database.factory.ts`). O Supabase permanece no projeto apenas como infraestrutura local e tooling: o CLI `supabase` (devDependency raiz), o diretório `supabase/` (config.toml, migrações, `.temp`), os scripts raiz `infra:up`/`infra:down`/`db:migrate`, as variáveis `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` e referências em `.docs/`, `README.md` e `load/README.md`. Auth e Storage do Supabase nunca foram utilizados por features.

Como não há mais uso efetivo do Supabase, mantê-lo adiciona peso desnecessário: mais um binário global, portas ocupadas (`54321`/`54322`), `config.toml` e uma camada de migração duplicada (Drizzle já gera `apps/api/drizzle/`). A migração para Postgres nativo em Docker simplifica a infra para um único contêiner e uma única variável de ambiente.

## Objetivo

- Remover todo vestígio de Supabase de código, configurações, dependências e documentação ativa do repositório.
- Rodar o PostgreSQL localmente via `docker-compose.yml` (imagem `postgres`), na porta `5432`, com volume persistente e healthcheck.
- Ter `DATABASE_URL` como **única** configuração de banco: `postgresql://postgres:postgres@localhost:5432/postgres`.
- Manter Drizzle ORM + postgres-js como camada de acesso e Drizzle Kit como gerenciador de migrações versionadas (em `apps/api/drizzle/`).
- Garantir que todos os portões de QA (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) continuem passando após a remoção.

## Escopo

- **Dentro:**
  - Adição do serviço `postgres` ao `docker-compose.yml` (com volume e healthcheck).
  - Remoção do CLI `supabase` das devDependencies e dos scripts raiz `infra:up`/`infra:down`/`db:migrate`.
  - Remoção do diretório `supabase/` (config.toml, `migrations/`, `.temp`, `.branches`, `snippets`).
  - Remoção das variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` de `.env`, `.env.example` e `apps/api/.env`.
  - Atualização do `DATABASE_URL` para a porta `5432` do Postgres nativo.
  - Migrações versionadas passam a viver em `apps/api/drizzle/` (fonte de verdade), com `db:migrate` rodando `drizzle-kit migrate`.
  - Ajustes em `.gitignore`, `.oxlintrc.json` e `skills-lock.json`.
  - Remoção das skills de agente `supabase` e `supabase-postgres-best-practices` (`.agents/skills/` e `.claude/skills/`).
  - Atualização de `.docs/ARCHITECTURE.md`, `.docs/QA.md`, `README.md` e `load/README.md`.

- **Fora:**
  - Alterações no schema Drizzle (`apps/api/src/db/schema.ts`) — o schema permanece igual.
  - Alterações na stack LGTM (Loki, Grafana, Tempo, Mimir) já definida no `docker-compose.yml`.
  - Migração de dados entre o Postgres do Supabase (`54322`) e o novo Postgres (`5432`) — banco local de dev é descartável.
  - Deploy em produção ou decisões de banco em ambiente remoto.

- **Adiado:**
  - Atualização dos artefatos históricos `.specs/*.md`, `.plans/*.md` e `.adrs/*.md` (documentam decisões passadas e ficam como registro).
  - Melhoria do script `env:setup` (copia `.env.example` para `.env.local`), fora do escopo desta remoção.

## Necessidade de negócio

Reduz a complexidade de setup e on-call de infraestrutura: menos um binário global, menos portas e contêineres locais, menos camadas de migração e menos configurações sensíveis (chaves `anon`/`service_role` não precisam mais existir). Um `DATABASE_URL` único torna o ambiente local reproduzível e o futuro deploy (Vercel + Postgres gerenciado) direto, sem remapear a stack. Não há perda de funcionalidade: a API já operava 100% via Drizzle sobre Postgres.

## Critérios de aceite

- [ ] `package.json` (raiz) não lista `supabase` nas devDependencies; `bun.lock` regenerado sem o pacote `supabase`.
- [ ] Diretório `supabase/` removido do repositório (incluindo `config.toml`, `migrations/`, `.temp`, `.branches`, `snippets`).
- [ ] `docker-compose.yml` define o serviço `postgres` (imagem `postgres:17-alpine`, porta `5432:5432`, usuário/senha/banco `postgres`, volume `postgres-data` e healthcheck `pg_isready`).
- [ ] `bun run infra:up` sobe apenas Postgres + LGTM (sem Supabase); `bun run infra:down` derruba a infra.
- [ ] `bun run db:migrate` aplica as migrações Drizzle (`apps/api/drizzle/0000_huge_gargoyle.sql`) no Postgres do Docker e é idempotente (rodar duas vezes não falha).
- [ ] `DATABASE_URL` é a única configuração de banco e aponta para `postgresql://postgres:postgres@localhost:5432/postgres` em `.env`, `.env.example` e `apps/api/.env`.
- [ ] Variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` removidas de `.env`, `.env.example` e `apps/api/.env`.
- [ ] Migrações versionadas vivem em `apps/api/drizzle/` e o `.gitignore` não ignora mais esse diretório (nem comenta sobre `supabase/migrations`).
- [ ] `.oxlintrc.json` sem o `ignorePatterns` de `supabase/.temp/**`.
- [ ] Skills `supabase` e `supabase-postgres-best-practices` removidas de `.agents/skills/` e `.claude/skills/`; `skills-lock.json` sem referências a elas.
- [ ] `grep -ri "supabase"` não retorna ocorrências em código, configurações ativas e docs ativos (excluindo `.git/`, `node_modules/`, `.turbo/`, `dist/` e os artefatos históricos `.specs/`, `.plans/`, `.adrs/`).
- [ ] `apps/api` conecta no Postgres nativo via Drizzle e os portões de QA passam: `bun run code:fix`, `bun run types:check`, `bun run test`, `bun run test:e2e` e `bun run build`.
- [ ] `.docs/ARCHITECTURE.md`, `.docs/QA.md`, `README.md` e `load/README.md` atualizados, sem referências a Supabase e com os comandos de infra/migração corretos.
- [ ] Infra Supabase local do desenvolvedor parada/removida (contêineres `supabase_*` e volumes) antes da remoção do CLI.

## O que fazer

1. Adicionar ao `docker-compose.yml` o serviço `postgres` (`postgres:17-alpine`, `POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB=postgres`, `5432:5432`, volume `postgres-data:/var/lib/postgresql/data`, healthcheck `pg_isready -U postgres`) e declarar o volume `postgres-data`.
2. Parar e remover a infra Supabase local do desenvolvedor antes de desinstalar o CLI: `npx supabase stop --no-backup` (remove contêineres e volumes) e `docker rm -f $(docker ps -aq --filter name=supabase_*)` se sobrar algum.
3. Remover `supabase` das devDependencies do `package.json` raiz e rodar `bun install` (regenera `bun.lock` e remove o binário).
4. Atualizar os scripts raiz:
   - `infra:up`: `docker compose up -d` (sem `supabase start`).
   - `infra:down`: `docker compose down` (sem `supabase stop`).
   - `db:migrate`: `turbo run db:migrate`.
5. Adicionar o script `db:migrate` em `apps/api/package.json` (`drizzle-kit migrate`), que roda na pasta do workspace com a `drizzle.config.ts` local.
6. Adicionar `dbCredentials` (URL vinda de `process.env.DATABASE_URL`) em `apps/api/drizzle.config.ts`, para o `drizzle-kit migrate` conectar no banco.
7. Remover o diretório `supabase/` (config.toml, migrações, `.temp`, `.branches`, `snippets`).
8. Atualizar `.env`, `.env.example` e `apps/api/.env`: remover `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e apontar `DATABASE_URL` para `postgresql://postgres:postgres@localhost:5432/postgres`, com comentário descrevendo o Postgres do Docker.
9. Remover `apps/api/drizzle/` do `.gitignore` (e o comentário que referencia `supabase/migrations`) para versionar as migrações Drizzle.
10. Remover `supabase/.temp/**` dos `ignorePatterns` do `.oxlintrc.json`.
11. Remover as skills `supabase` e `supabase-postgres-best-practices` de `.agents/skills/` e `.claude/skills/` e limpar as entradas correspondentes em `skills-lock.json`.
12. Atualizar `.docs/ARCHITECTURE.md`: remover Supabase das seções Back-End e Infra; na seção Banco de dados registrar Postgres via Docker com migrações Drizzle (`apps/api/drizzle/`); atualizar o bloco de comandos de infra local (`infra:up`/`infra:down`/`db:migrate`).
13. Atualizar `.docs/QA.md`: substituir o bloco "Infra local" pelos comandos novos (`bun run infra:up` = Postgres + LGTM, `bun run db:migrate` = Drizzle Kit).
14. Atualizar `README.md` e `load/README.md`: remover menções a Supabase nos comandos e pré-requisitos.
15. Validar os portões de QA (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) e o fluxo local (`infra:up` → `db:migrate` → `dev`).
16. Criar ADR registrando a decisão e entregar o resumo conforme `RULES.md` (passos manuais de QA, arquivos modificados, bibliotecas instaladas, racional).

## O que não fazer

- Não adicionar nenhuma biblioteca do Supabase (`@supabase/supabase-js`, `@supabase/ssr`, etc.).
- Não remover Drizzle ORM, postgres-js ou `drizzle-kit` (são a camada de acesso e migração que permanece).
- Não alterar o schema em `apps/api/src/db/schema.ts` nem regenerar as migrações Drizzle nesta spec.
- Não introduzir outro gerenciador de migrações (sem raw SQL via psql, sem Prisma, etc.) além do Drizzle Kit.
- Não mudar portas/credenciais/configurações dos serviços LGTM já definidos no `docker-compose.yml`.
- Não versionar `.env` (continua no `.gitignore`).
- Não editar os artefatos históricos `.specs/*.md`, `.plans/*.md` e `.adrs/*.md`.
- Não manter referências a Supabase em documentação ativa (`.docs/`, `README.md`, `load/README.md`).

## Decisões

| Decisão                     | Opção escolhida                                                       | Racional                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Porta do Postgres           | `5432` (padrão)                                                       | Postgres nativo e limpo; `DATABASE_URL` vira `postgresql://postgres:postgres@localhost:5432/postgres`. Confirmado com o usuário. |
| Imagem do Postgres          | `postgres:17-alpine`                                                  | Leve, oficial e compatível com as features usadas (identity columns, timestamps).                                                |
| Credenciais do banco local  | `postgres`/`postgres`, database `postgres`                            | Padrão do driver/Drizzle; única configuração via `DATABASE_URL`.                                                                 |
| Gerenciador de migrações    | Drizzle Kit (`drizzle-kit migrate`), migrações em `apps/api/drizzle/` | Drizzle já é a camada de acesso e já gerou `0000_huge_gargoyle.sql`; elimina a duplicação com `supabase/migrations`.             |
| Migração `foundation_smoke` | Removida (não é portada)                                              | Tabela sem nenhuma referência em código; o schema Drizzle é a fonte de verdade.                                                  |
| Skills de agente            | `supabase` e `supabase-postgres-best-practices` removidas do repo     | Usuário optou por eliminar qualquer referência a Supabase, inclusive tooling de agente.                                          |
| Docs históricas             | Mantidas (`.specs/`, `.plans/`, `.adrs/`)                             | Registro de decisões passadas; a decisão nova é registrada em um ADR novo.                                                       |
| Comando `db:migrate`        | `turbo run db:migrate` → `drizzle-kit migrate` (em `apps/api`)        | Segue o padrão de orquestração via turbo e garante que o binário do `drizzle-kit` (devDep de `apps/api`) seja resolvido.         |

## Dependências

- Docker (já requisito da stack LGTM) — Postgres nativo roda no mesmo `docker-compose.yml`.
- `drizzle-orm` + `postgres` (dependências já instaladas em `apps/api`).
- `drizzle-kit` (devDependency já presente em `apps/api`).
- `DATABASE_URL` disponível em `apps/api/.env` para o runtime e para o `drizzle-kit migrate`.
- Porta `5432` livre no host (padrão do Postgres).

## Riscos e trade-offs

- **Porta `5432` ocupada:** máquinas com Postgres instalado localmente já usam `5432`. Trade-off aceito em favor do padrão; o `.env.example` e os edge cases documentam como proceder (trocar a porta no compose + `DATABASE_URL`).
- **Banco de dev descartável:** dados criados no Postgres do Supabase (`54322`) não migram para o novo banco (`5432`). Aceito: o banco local é efêmero e o load de teste provê massa de dados novamente.
- **Remoção da `foundation_smoke`:** em bancos antigos a tabela órfã permanece inofensiva; em bancos novos ela nem existe. Sem impacto em código.
- **Remoção das skills:** agentes em outras máquinas/clones que dependam das skills removidas perdem acesso; mitigado pela ausência de uso real no projeto.
- **Dependência do `postgres:17-alpine` local:** a versão local precisa acompanhar o que for usado em produção — aceito nesta fase, revisar no deploy.

## Edge cases e modos de falha

- **Porta `5432` ocupada no host:** `docker compose up -d` falha ao publicar a porta; instrução: parar o serviço local de Postgres ou alterar a porta no compose e no `DATABASE_URL`.
- **`db:migrate` sem Postgres de pé:** `drizzle-kit migrate` falha sem conectar; instrução: rodar `bun run infra:up` antes.
- **`.env` sem `DATABASE_URL`:** `createDrizzleDatabase` já lança erro claro ("DATABASE_URL is missing. Add it to apps/api/.env (see .env.example).") — comportamento mantido.
- **Migração já aplicada:** `drizzle-kit migrate` consulta o journal (`apps/api/drizzle/meta/_journal.json`) e não reaplica — idempotente.
- **Sobras do Supabase no ambiente:** contêineres `supabase_*` antigos podem conflitar por porta antes de serem removidos; a spec remove a infra local antes de desinstalar o CLI.
- **Arquivos de migração Drizzle fora do git:** se `apps/api/drizzle/` continuar ignorado, clones novos não terão migrações para aplicar — por isso o `.gitignore` é atualizado e o critério de aceite verifica versionamento.

## Resultado (definição de pronto)

- Nenhuma ocorrência de `supabase` em código, dependências, configurações e documentação ativa.
- Postgres nativo no `docker-compose.yml`, acessível apenas via `DATABASE_URL`.
- `bun run infra:up`, `bun run db:migrate` e os portões de QA (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) executando e passando.
- Migrações Drizzle versionadas em `apps/api/drizzle/`.
- ADR criado em `./.adrs/` com resumo, passos manuais de QA, arquivos modificados, bibliotecas instaladas/removidas e racional (conforme `RULES.md`).

## Arquivos e diretórios envolvidos

- `docker-compose.yml` (serviço `postgres` + volume).
- `package.json` (raiz — scripts e devDependencies), `bun.lock`.
- `apps/api/package.json` (script `db:migrate`).
- `apps/api/drizzle.config.ts` (`dbCredentials`).
- `apps/api/drizzle/**` (migrações versionadas — saem do `.gitignore`).
- `.env`, `.env.example`, `apps/api/.env` (remoção `SUPABASE_*`, novo `DATABASE_URL`).
- `.gitignore`, `.oxlintrc.json`, `skills-lock.json`.
- `supabase/**` (removido).
- `.agents/skills/supabase/**`, `.agents/skills/supabase-postgres-best-practices/**`, `.claude/skills/supabase/**`, `.claude/skills/supabase-postgres-best-practices/**` (removidos).
- `.docs/ARCHITECTURE.md`, `.docs/QA.md`.
- `README.md`, `load/README.md`.
- `./.adrs/010-remove-supabase.md` (novo, criado na execução).
