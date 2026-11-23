# Arquitetura

> Status: `[implementado]` = já existe no repositório · `[planejado]` = parte da stack-alvo, ainda pendente.

## Estrutura do monorepo (Turborepo)

Workspaces gerenciados com **bun** (`bun.lock`).

- `apps/api` `[implementado]` — API (Nest.js, TypeScript, porta 3000).
- `apps/app` `[implementado]` — Cliente (React + Vite, TypeScript, porta 5173).
- `apps/agents` `[implementado]` — LangGraph Server com o grafo dos experts (TypeScript, porta 2024, Docker).
- `packages/experts` `[implementado]` — Registry tipado dos 9 experts (`@repo/experts`), compartilhado entre API e agentes.
- `packages/ui` `[implementado]` — Biblioteca de componentes (`@repo/ui`).
- `packages/typescript-config` `[implementado]` — Configurações compartilhadas de TypeScript.

## Desenvolvimento local

```sh
bun install
bun run dev          # api em :3000, app em :5173
bun run code:fix     # lint + formatação (oxlint + oxfmt)
bun run types:check  # verificação de tipos
bun run test         # unitário + integração (Vitest)
bun run test:e2e     # E2E (Supertest + Playwright)
bun run build
```

Infra local:

```sh
bun run infra:up    # docker compose up -d (Postgres + Weaviate + agents + LGTM)
bun run infra:down  # docker compose down
bun run db:migrate  # drizzle-kit migrate (apps/api/drizzle)
```

Carga (k6, `load/`):

```sh
bun run load:smoke  # smoke test contra a API local
bun run load:test   # carga com VUs e limite de p95 configuráveis
```

## Tooling

- **OXLint** `[implementado]` — Lint do código.
- **OXFmt** `[implementado]` — Formatação do código.
- **TypeScript** `[implementado]` — Tipagem estática.
- **Turborepo** `[implementado]` — Orquestração de tarefas e cache.
- **Lefthook** `[implementado]` — Git hooks.
- **Lint-staged** `[implementado]` — Formatação/lint dos arquivos no `git add`.
- **Commitlint** `[implementado]` — Lint de mensagens de commit (Conventional Commits, via hook `commit-msg`).
- **commit-and-push** `[implementado]` — Analisa as mudanças pendentes, commita (Conventional Commits, co-author OpenCode Agent) e faz push (command opencode `/commit-and-push` → agent `committer`, em `.opencode/`).

## Ferramentas de IA (OpenCode)

Agentes, comandos e skills que operam sobre o próprio repositório. O padrão é **comando → agente → skill**: o comando fica em `.opencode/command/`, o agente em `.opencode/agent/` e a skill em `.agents/skills/<nome>/SKILL.md`.

### Revisão e entrega

- **code-review** `[implementado]` — `/code-review <pr>` → agent `code-reviewer` → skill `code-review`; comenta o PR inline (Conventional Comments) e submete veredito APPROVE/REQUEST_CHANGES.
- **commit-and-push** `[implementado]` — `/commit-and-push "<mensagem>"` → agent `committer`.

### Auditorias (somente leitura)

Nenhuma auditoria altera código: cada uma escreve um relatório em `./.plans/` e responde no chat com o resumo priorizado (P0–P3).

| Comando              | Agente                | Skill               | O que audita                                                                               | Relatório                     |
| -------------------- | --------------------- | ------------------- | ------------------------------------------------------------------------------------------ | ----------------------------- |
| `/audit-structure`   | `structure-auditor`   | `audit-structure`   | Consistência estrutural (slices/camadas, nomenclatura, wiring, fronteiras, docs vs código) | `.plans/structure-audit.md`   |
| `/audit-performance` | `performance-auditor` | `audit-performance` | Gargalos de performance (API, banco, React, build, infra) com baseline medido              | `.plans/performance-audit.md` |
| `/audit-scalability` | `scalability-auditor` | `audit-scalability` | Evolução e escala em duas lentes (carga e time), com roadmap por horizonte                 | `.plans/scalability-audit.md` |
| `/audit-lifecycle`   | `lifecycle-auditor`   | `audit-lifecycle`   | Ciclo de vida (docs, pós-produção, manutenção, debug) com dados do Grafana                 | `.plans/lifecycle-audit.md`   |
| `/hunt-bugs`         | `bug-hunter`          | `hunt-bugs`         | Defeitos reais com evidência, reprodução e correção sugerida                               | `.plans/bug-hunt-audit.md`    |

### Skills de apoio

- **refactor-slices** `[implementado]` — catálogo de desalinhamento de slices e arquitetura em camadas (reutilizado pelo `structure-auditor`).
- **frontend-design** e **web-design-guidelines** `[implementado]` — obrigatórias para alteração e revisão de UI.
- **vercel-react-best-practices** `[implementado]` — regras de performance de React (reutilizadas pelo `performance-auditor`).
- **playwright** `[implementado]` — automação de navegador para medir e reproduzir.
- **shadcn**, **create-spec**, **refine-spec**, **feature-concept**, **implement-me**, **orchestrate-me**, **find-skills**, **skill-creator** `[implementado]` — demais skills do workflow.

### MCP Grafana

- **Grafana MCP** `[implementado]` — `opencode.json` registra o servidor MCP `grafana` (`http://localhost:3001`, autenticado por `GRAFANA_SERVICE_ACCOUNT_TOKEN`). O `lifecycle-auditor` usa Loki, Mimir/Prometheus, Tempo, alertas, incidentes e OnCall para investigar pós-produção.

## Front-End

Stack do cliente (`apps/app`):

- **React** `[implementado]` — Criação de UIs.
- **Vite** `[implementado]` — Bundler e dev server.
- **TypeScript** `[implementado]` — Tipagem.
- **TailwindCSS** `[implementado]` — Estilização (tokens da paleta em `apps/app/src/index.css`).
- **shadcn/ui** `[implementado]` — Base do design system em `packages/ui` (`components/ui/*`, Radix UI + `class-variance-authority` + `tailwind-merge`).
- **React Router** `[implementado]` — Rotas (`react-router-dom`).
- **date-fns** `[implementado]` — Manipulação de datas.
- **TanStack Query** `[implementado]` — Queries e mutations.
- **TanStack Table** `[implementado]` — Tabelas.
- **TanStack Charts** `[implementado]` — Gráficos (`@tanstack/react-charts`).
- **Vitest** `[implementado]` — Testes unitários e de integração.
- **Playwright** `[implementado]` — Testes E2E.

## Back-End

Stack da API (`apps/api`):

- **Nest.js** `[implementado]` — Criação da API.
- **TypeScript** `[implementado]` — Tipagem.
- **Drizzle ORM** `[implementado]` — Acesso ao banco (`postgres-js`), migrações via Drizzle Kit.
- **class-validator / class-transformer** `[implementado]` — Validação e transformação de DTOs.
- **Bcrypt** `[implementado]` — Hash de senhas (`bcrypt-hasher.adapter`).
- **Nodemailer + Resend** `[implementado]` — Transporte de email (Mailtrap em dev).
- **ffmpeg-static** `[implementado]` — Extração de áudio de vídeo para transcrição.
- **Vitest** `[implementado]` — Testes unitários e de integração.
- **Supertest** `[implementado]` — Testes E2E da API.

## Camada de IA

- **LangGraph Server** `[implementado]` — `apps/agents` empacota o grafo `experts` via `langgraph.json` e roda em container próprio (porta 2024).
- **LangChain.js** `[implementado]` — Document loaders, splitters, embeddings e tools.
- **Weaviate** `[implementado]` — Vector store (classe `Chunk`, `vectorizer: none`), toda leitura filtrada por `userId`.
- **OpenAI** `[implementado]` — `gpt-4o-mini` (chat/visão), `text-embedding-3-small` (embeddings) e `gpt-image-2` (imagem).
- **Google Gemini** `[implementado]` — Geração de vídeo (`@google/genai`).
- **LangSmith** `[implementado]` — Tracing do grafo (configurado por `LANGSMITH_API_KEY` e `LANGCHAIN_TRACING_V2`).
- **OpenTelemetry** `[implementado]` — Logs, métricas e traces da API (`apps/api/src/observability/`).

## Infra

- **Docker Compose** `[implementado]` — Serviços `postgres`, `weaviate`, `agents` (LangGraph Server) e LGTM (`loki`, `tempo`, `mimir`, `grafana`).
- **Vercel** `[planejado]` — Deploy da aplicação e da API.

## Banco de dados

- **PostgreSQL** `[implementado]` — Banco de dados local via Docker (`docker-compose.yml`, serviço `postgres`, porta `5432`); migrações versionadas em `apps/api/drizzle/` aplicadas via Drizzle Kit (`bun run db:migrate`).
- **Tabelas** `[implementado]` — `users`, `sessions`, `email_confirmation_tokens`, `password_reset_tokens`, `sources` (dedup por `(user_id, type, reference)`), `conversations` e `messages`.

## Observabilidade

- **Grafana (LGTM stack)** `[implementado]` — Logs, métricas e traces via `docker-compose.yml` (Loki `:3100`, Tempo `:3200`, Mimir `:9009` e Grafana `:3001`).
- **OpenTelemetry SDK** `[implementado]` — Instrumentação de HTTP, Express, Nest e Postgres; métricas `http.server.request.count` e `http.server.request.duration`.
- **Dashboards e alertas** `[planejado]` — Provisionamento de dashboards/SLOs e regras de alerta no Grafana.
