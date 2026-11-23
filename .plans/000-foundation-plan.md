# Plano — Fundação (`000-foundation`)

> Executa a spec `./.specs/000-foundation.md`. Preparar a fundação do monorepo: `apps/api` (Nest.js), `apps/app` (React + Vite), remoção dos starters Next.js, tooling de qualidade, infra local e comandos raiz.

## Decisões do refinamento (feature-concept)

| Fork                           | Decisão                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Supabase CLI ausente           | Adicionar pacote npm `supabase` (CLI oficial) como devDependency na raiz.                                 |
| Escopo do `docker-compose.yml` | LGTM (Loki, Tempo, Mimir, Grafana) no compose raiz; Supabase via `supabase start`. `infra:up` sobe ambos. |
| Browser do Playwright          | Instalar Chromium agora (`playwright install chromium`).                                                  |

## Objetivo

- `apps/api` (Nest.js, `GET /` → JSON hello world, porta 3000) e `apps/app` (React + Vite, título hello world, porta 5173) criados e integrados ao Turborepo.
- Portões de qualidade na raiz: `code:fix`, `types:check`, `test`, `test:e2e`, `build`.
- Infra local: `infra:up`/`infra:down` (Supabase + LGTM) e `db:migrate` (Supabase CLI).
- `.docs/` consistentes com o estado final (marcadores `[implementado]`/`[planejado]`).

## Escopo

**Dentro:** apps api/app; remoção de `apps/web`, `apps/docs`, `packages/eslint-config`; OXLint/OXFmt; Lefthook + Lint-staged; Vitest + Supertest + Playwright (smoke); docker-compose LGTM; `supabase/` (config + migrações); comandos raiz; atualização de `.docs/`.

**Fora:** features de produto, deploy, schema de banco definitivo, ajuste fino de regras OXLint, suites E2E completas.

## Etapas

### E1. Tooling raiz

- `package.json` raiz: remover `prettier`; adicionar `oxlint`, `oxfmt`, `supabase`, `lefthook`, `lint-staged` (devDeps). Scripts: `code:fix`, `lint`, `format`, `check-types`→`types:check` (alias), `test`, `test:e2e`, `build`, `dev`, `infra:up`, `infra:down`, `db:migrate`.
- `turbo.json`: tarefas `lint`, `check-types`, `test`, `test:e2e` (com `dependsOn`), `format`, `code:fix`; outputs de `dist`/`node_modules/.cache`; `dev` persistente.
- `.oxlintrc.json` (ou defaults + plugin TS), `.env.example`.
- `lefthook.yml` + `lint-staged` config: `pre-commit` roda `oxfmt --write` + `oxlint --fix` nos arquivos staged.

### E2. Remover starters

- `rm -rf apps/web apps/docs packages/eslint-config`.
- `packages/ui`: remover dependência `@repo/eslint-config` e `eslint`; script `lint` → `oxlint`; limpar `eslint.config.mjs`.

### E3. `packages/typescript-config`

- Adicionar `nest.json` (decorators, CommonJS/NodeNext, base `base.json`) e `vite-app.json` (React JSX, `moduleResolution: bundler`, `noEmit`). Manter os demais.

### E4. `apps/api` (Nest.js)

- `src/`: `main.ts` (bootstrap, `:3000`), `app.module.ts`, `app.controller.ts` (`GET /` → `{ message: 'hello world' }`), `app.service.ts`.
- Testes: `src/app.controller.spec.ts` (Vitest, unit) e `e2e/app.e2e-spec.ts` (Vitest + Supertest, integração HTTP em memória).
- `vitest.config.ts` (unit: `src/**/*.spec.ts`; e2e: `e2e/**/*.e2e-spec.ts`).
- `tsconfig.json`/`tsconfig.build.json` herdando `@repo/typescript-config/nest.json`.
- Scripts: `dev` (`tsx watch src/main.ts`), `build` (`tsc -p tsconfig.build.json`), `start`, `lint`, `check-types`, `test`, `test:e2e`.
- Deps: `@nestjs/core|common|platform-express`, `reflect-metadata`, `rxjs`; dev: `@nestjs/testing`, `tsx`, `supertest`, `@types/supertest`, `vitest`, `@types/node`, `@repo/typescript-config`.

### E5. `apps/app` (React + Vite)

- Scaffold Vite (React + TS) + TailwindCSS com tokens pastel de `DESIGN.md` (tema claro).
- `src/App.tsx` renderiza título hello world consumindo `@repo/ui` (ex.: `Button`/`Card`).
- Testes: `src/App.test.tsx` (Vitest + jsdom/RTL smoke) e `e2e/app.spec.ts` (Playwright: navega até `:5173`, valida título).
- `playwright.config.ts` com `webServer` (vite dev na porta 5173, `reuseExistingServer`).
- Deps: `react`, `react-dom`, `@repo/ui`, `tailwindcss`, `date-fns`, `@tanstack/react-query`, `@tanstack/react-table`, `@tanstack/react-charts`, `lucide-react`; dev: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `jsdom`, `@testing-library/react`, `@playwright/test`, `@types/react`, `@types/react-dom`.

### E6. Playwright browsers

- `playwright install chromium` (instalar durante a implementação).

### E7. Infra local

- `docker-compose.yml` raiz: `loki`, `tempo`, `mimir`, `grafana` (datasources provisionados).
- `supabase init` (gera `supabase/config.toml`) e `supabase/migrations/000_foundation.sql` (smoke, idempotente).
- Scripts: `infra:up` = `supabase start && docker compose up -d`; `infra:down` = `supabase stop && docker compose down`; `db:migrate` = `supabase db push`.
- Falhas com mensagem clara (docker ausente, banco não iniciado, portas ocupadas).

### E8. Documentação

- Atualizar `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/QA.md`, `.docs/DESIGN_SYSTEM.md`, `.docs/DESIGN.md` conforme o novo estado (remover `[planejado]` concluídos, corrigir `codes:fix`→`code:fix`, Vite no lugar de Next.js).

### E9. Portões de QA + ADR

- Rodar na ordem: `code:fix`, `types:check`, `test`, `test:e2e`, `build`.
- Criar `./.adrs/000-foundation.md` e entregar os artefatos do `RULES.md`.

## Arquivos-alvo

- Novo: `apps/api/**`, `apps/app/**`, `docker-compose.yml`, `supabase/**`, `.env.example`, `.oxlintrc.json`, `lefthook.yml`, `.plans/000-foundation-plan.md`, `.adrs/000-foundation.md`.
- Alterado: `package.json` raiz, `turbo.json`, `packages/ui/**`, `packages/typescript-config/**`, `.docs/*`, `.gitignore`.
- Removido: `apps/web/**`, `apps/docs/**`, `packages/eslint-config/**`.

## Riscos e edge cases

- `oxfmt` CLI jovem (v0.63) — se o comando de format divergir, adaptar flag ao comportamento real e documentar.
- Nest + decorators requer `experimentalDecorators`/`emitDecoratorMetadata` no tsconfig — coberto pelo `nest.json`.
- Playwright `webServer` reusa servidor já ativo (`reuseExistingServer: true`) — evita conflito de porta.
- `infra:up` com Docker parado: comando deve falhar apontando a dependência (checagem `docker info`/mensagem).
- `supabase start` na primeira execução baixa imagens (~minutos) — documentar como esperado.
- Portas `3000`/`5432`/`5173`/Grafana `3001` ocupadas: erro identificável do docker/supabase; documentar como liberar.
- `db:migrate` sem banco local: falhar instruindo `infra:up` antes.

## Critérios de aceite (da spec)

Todos os itens do checklist da spec `000-foundation.md` (§Critérios de aceite) — verificáveis pelos portões de QA e por requisição local (`curl :3000`, app em `:5173`).

## Checklist de QA manual

1. `bun install` (atualiza lockfile).
2. `bun run dev` → `curl http://localhost:3000/` retorna JSON hello world; abrir `http://localhost:5173` e ver título.
3. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build` passam.
4. `bun run infra:up` sobe Supabase + LGTM (Grafana em `:3001`).
5. `bun run db:migrate` aplica a migração smoke (`supabase db push`).
6. `bun run infra:down` derruba tudo.
7. `apps/web`/`apps/docs`/`packages/eslint-config` não existem mais.
