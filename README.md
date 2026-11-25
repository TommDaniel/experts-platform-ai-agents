# Coders University — Module 4

Monorepo (Turborepo + bun) da plataforma de **gestão de agentes de IA customizados** (experts) para empresas. Esta base é a fundação: API e cliente prontos, tooling de qualidade e infra local reproduzível.

## Estrutura

- `apps/api` — API **Nest.js** (TypeScript, porta 3000).
- `apps/app` — Cliente **React + Vite** (porta 5173).
- `packages/ui` — Componentes compartilhados (`@repo/ui`).
- `packages/typescript-config` — Tsconfigs compartilhados.

## Comandos

| Comando                         | Descrição                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `bun install`                   | Instala dependências e hooks (lefthook)                                                |
| `bun run dev`                   | Sobe api (`:3000`) e app (`:5173`)                                                     |
| `bun run code:fix`              | Lint (oxlint) + formatação (oxfmt)                                                     |
| `bun run types:check`           | Verificação de tipos                                                                   |
| `bun run test`                  | Testes unitários + integração (Vitest)                                                 |
| `bun run test:e2e`              | Testes E2E (Supertest + Playwright)                                                    |
| `bun run build`                 | Build de todos os pacotes/apps                                                         |
| `bun run infra:up`              | Sobe Postgres + LGTM (Grafana)                                                         |
| `bun run infra:down`            | Derruba a infra local                                                                  |
| `bun run db:migrate`            | Aplica migrações no banco local (Drizzle Kit)                                          |
| `/commit-and-push "<mensagem>"` | Analisa mudanças, commita (Conventional Commits + co-author OpenCode Agent) e faz push |

## Documentação

Contexto completo em `.docs/` (`ARCHITECTURE.md`, `DEVELOPMENT.md`, `QA.md`, `BUSINESS.md`, `DESIGN.md`, `DESIGN_SYSTEM.md`). Specs em `.specs/`, planos em `.plans/` e decisões (ADRs) em `.adrs/`.

Observabilidade: stack local, token do MCP e sinais em [`.docs/OBSERVABILITY.md`](.docs/OBSERVABILITY.md); investigação e ação em [`.docs/runbooks/`](.docs/runbooks/README.md). Índice de ADRs em [`.adrs/README.md`](.adrs/README.md).
