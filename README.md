# Coders University — Module 4

Monorepo (Turborepo + bun) da plataforma de **gestão de agentes de IA customizados** (experts) para empresas: API, cliente web, servidor de agentes (LangGraph), observabilidade local e um conjunto de **agentes de auditoria** para o OpenCode.

## Estrutura

- `apps/api` — API **Nest.js** (TypeScript, porta 3000).
- `apps/app` — Cliente **React + Vite** (porta 5173), com a home autenticada redesenhada (spec 014).
- `apps/agents` — **LangGraph Server** com o grafo dos experts (porta 2024, Docker).
- `packages/experts` — Registry tipado dos experts (`@repo/experts`).
- `packages/ui` — Componentes compartilhados, base shadcn/ui (`@repo/ui`).
- `packages/typescript-config` — Tsconfigs compartilhados.

## Comandos

| Comando                         | Descrição                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `bun install`                   | Instala dependências e hooks (lefthook)                                                |
| `bun run local:setup`           | Atalho: instala, copia `.env.example` → `.env.local`, sobe a infra e migra o banco     |
| `bun run dev`                   | Sobe api (`:3000`) e app (`:5173`)                                                     |
| `bun run code:fix`              | Lint (oxlint) + formatação (oxfmt)                                                     |
| `bun run types:check`           | Verificação de tipos                                                                   |
| `bun run test`                  | Testes unitários + integração (Vitest)                                                 |
| `bun run test:e2e`              | Testes E2E (Supertest + Playwright); a API exige Postgres no ar                        |
| `bun run build`                 | Build de todos os pacotes/apps                                                         |
| `bun run infra:up`              | Sobe Postgres, Weaviate, agents e LGTM (Loki, Tempo, Mimir, Grafana)                   |
| `bun run infra:down`            | Derruba a infra local                                                                  |
| `bun run db:migrate`            | Aplica migrações no banco local (Drizzle Kit)                                          |
| `bun run load:smoke`            | Teste de fumaça com k6 (precisa de Docker)                                             |
| `bun run load:test`             | Teste de carga com k6                                                                  |
| `/commit-and-push "<mensagem>"` | Analisa mudanças, commita (Conventional Commits + co-author OpenCode Agent) e faz push |

## Agentes do OpenCode

Cada ferramenta segue o padrão **comando → agente → skill** (`.opencode/command/`, `.opencode/agent/`, `.agents/skills/`). As auditorias são somente leitura: escrevem um relatório em `.plans/` e resumem no chat (P0–P3).

| Comando              | Agente                | O que faz                                                     | Relatório                     |
| -------------------- | --------------------- | ------------------------------------------------------------- | ----------------------------- |
| `/audit-structure`   | `structure-auditor`   | Consistência de slices, camadas, nomes e docs vs código       | `.plans/structure-audit.md`   |
| `/audit-performance` | `performance-auditor` | Gargalos de API, banco, React, build e infra, com baseline    | `.plans/performance-audit.md` |
| `/audit-scalability` | `scalability-auditor` | Evolução em carga e em time, com roadmap agora/próximo/depois | `.plans/scalability-audit.md` |
| `/audit-lifecycle`   | `lifecycle-auditor`   | Docs, pós-produção, manutenção e debug com dados do Grafana   | `.plans/lifecycle-audit.md`   |
| `/hunt-bugs`         | `bug-hunter`          | Defeitos reais com evidência, reprodução e correção sugerida  | `.plans/bug-hunt-audit.md`    |
| `/code-review <pr>`  | `code-reviewer`       | Revisão de PR com comentários inline e veredito               | —                             |

O `/audit-lifecycle` usa o MCP `grafana` (`opencode.json`). Para ele funcionar:

1. `bun run infra:up` e confirme `http://localhost:3001` (login `admin` / `GRAFANA_ADMIN_PASSWORD`, padrão `admin`).
2. Crie uma service account e salve o token em `.secrets/grafana-token` (pasta ignorada pelo git).
3. Recarregue o OpenCode e rode `/audit-lifecycle`.

Passo a passo completo em [`.docs/OBSERVABILITY.md`](.docs/OBSERVABILITY.md). Sem Grafana no ar, o agente avisa e segue só com análise estática, sem inventar dados.

## Documentação

Contexto completo em `.docs/` (`ARCHITECTURE.md`, `DEVELOPMENT.md`, `QA.md`, `RULES.md`, `BUSINESS.md`, `DESIGN.md`, `DESIGN_SYSTEM.md`, `OBSERVABILITY.md`, `SLO.md`). Specs em `.specs/`, planos em `.plans/` e decisões (ADRs) em `.adrs/` (índice em [`.adrs/README.md`](.adrs/README.md)).

Redesign da home: [`.specs/014-redesign-home.md`](.specs/014-redesign-home.md), [`.plans/014-redesign-home-plan.md`](.plans/014-redesign-home-plan.md) e [`.adrs/015-redesign-home.md`](.adrs/015-redesign-home.md).

Investigação e ação em incidentes: [`.docs/runbooks/`](.docs/runbooks/README.md).
