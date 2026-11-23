# ADR-000: Fundação do monorepo

- **Status:** aceito
- **Data:** 2026-08-10
- **Spec:** `./.specs/000-foundation.md`
- **Decisões load-bearing** da fundação, consolidadas do refinamento e da implementação.

## Contexto

O monorepo (Turborepo + bun) começou como o starter padrão do Turborepo, com `apps/web` e `apps/docs` em Next.js. A documentação de `.docs/` definia uma stack-alvo marcada como `[implementado]`/`[planejado]`. Esta ADR registra as decisões estruturais tomadas para materializar a fundação sobre a qual as features do produto (gestão de experts, conectores) serão construídas.

## Decisões

### 1. `apps/api` (Nest.js) e `apps/app` (React + Vite); remoção dos starters Next.js

Os apps starter `apps/web` e `apps/docs` foram removidos e substituídos por uma API Nest.js (porta 3000) e um cliente React + Vite (porta 5173). Manter dois front-ends starter duplicaria a base sem valor de produto.

### 2. OXLint + OXFmt substituem ESLint + Prettier

`packages/eslint-config` foi removido. Lint e formatação agora são OXLint + OXFmt, com `.oxlintrc.json` e `.oxfmtrc.json`. Trade-off assumido: regras de plugins existentes (ex.: Next.js) não portam 1:1; o mesmo portão `code:fix` foi preservado.

### 3. Git hooks com Lefthook + Lint-staged

`lefthook.yml` instala o hook `pre-commit` (via script `prepare`), que roda `lint-staged` (oxfmt + oxlint nos arquivos staged).

### 4. Testes: Vitest + Supertest + Playwright

- Vitest: unitário + integração (API e app).
- Supertest: E2E da API (app Nest em memória).
- Playwright (Chromium): E2E do app com `webServer` gerenciando o Vite.
- Os comandos raiz `test` e `test:e2e` orquestram tudo via turbo.

### 5. Supabase CLI como devDependency npm

O CLI `supabase` (pacote npm) é devDependency da raiz, garantindo `bun run db:migrate`/`infra:*` reproduzíveis sem instalação global.

### 6. `docker-compose.yml` contém apenas o LGTM; Supabase via `supabase start`

Loki, Tempo, Mimir e Grafana (porta 3001) sobem via docker-compose. O Supabase é gerenciado pelo seu CLI (`supabase start`/`stop`), que controla os próprios containers. Misturar os dois no mesmo compose criaria gerenciamento conflitante.

### 7. Migrações via Supabase CLI (`supabase db push --local`)

Migrações versionadas em `supabase/migrations/` (nomes com timestamp via `supabase migration new`). Sem ORM — decisão da spec para evitar abstração prematura.

### 8. Dev da API com `nest start --watch` (builder tsc), não `tsx`

`tsx` (esbuild) não emite `design:paramtypes`, quebrando a injeção de dependência do Nest por construtor em runtime. O `@nestjs/cli` com builder `tsc` (via `nest-cli.json` → `tsconfig.build.json`) emite os metadados de decorator corretamente. Supertest/Vitest usam `unplugin-swc` pelo mesmo motivo.

### 9. `@repo/ui` permanece como pacote consumido por fonte (sem `build`)

Os componentes compartilhados continuam sendo consumidos como fonte TSX via `exports`, como no starter. Adicionar build próprio fica para quando o design system (shadcn/ui) for migrado.

## Consequências

- Comandos raiz padronizados: `code:fix`, `types:check`, `test`, `test:e2e`, `build`, `infra:up`, `infra:down`, `db:migrate`.
- Portas locais reservadas: API `3000`, app `5173`, Grafana `3001`, Supabase `54321–54323`.
- Os 5 portões de QA passam na raiz.
- A documentação de `.docs/` foi atualizada para refletir o novo estado (sem `[planejado]` conflitante pendente).
