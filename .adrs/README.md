# ADRs — Architecture Decision Records

Decisões arquiteturais do projeto, em ordem cronológica. Cada arquivo registra contexto, decisão e consequências; o número é imutável, mas há numeração duplicada histórica (três `001`, três `002` e três `003`) — o nome do arquivo desempata.

## Índice

| ADR                                                                                | Título                                                       | Tema      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------- |
| [000-foundation.md](000-foundation.md)                                             | Fundação do monorepo                                         | Base      |
| [001-auth-schema.md](001-auth-schema.md)                                           | Auth schema base (Drizzle, hashing, email, `/api/v1`, en-us) | Auth      |
| [001-commitlint.md](001-commitlint.md)                                             | Commitlint com Conventional Commits                          | Tooling   |
| [002-auth-session.md](002-auth-session.md)                                         | Auth session (token opaco, guard global, me/logout)          | Auth      |
| [002-commit-and-push.md](002-commit-and-push.md)                                   | Comando `commit-and-push`                                    | Tooling   |
| [003-auth-routes.md](003-auth-routes.md)                                           | Auth routes do cliente (router SPA, AuthContext, guards)     | Front-end |
| [003-commit-and-push-opencode-command.md](003-commit-and-push-opencode-command.md) | `commit-and-push` como command de agent                      | Tooling   |
| [004-sign-up.md](004-sign-up.md)                                                   | Sign-up                                                      | Auth      |
| [005-confirm-account.md](005-confirm-account.md)                                   | Confirm account                                              | Auth      |
| [006-sign-in.md](006-sign-in.md)                                                   | Sign-in                                                      | Auth      |
| [007-forgot-password.md](007-forgot-password.md)                                   | Forgot password                                              | Auth      |
| [008-reset-password.md](008-reset-password.md)                                     | Reset password                                               | Auth      |
| [009-observability.md](009-observability.md)                                       | Observabilidade com OpenTelemetry → Grafana LGTM             | O11y      |
| [010-load-testing.md](010-load-testing.md)                                         | Harness de carga com k6                                      | Qualidade |
| [011-remove-supabase.md](011-remove-supabase.md)                                   | Remoção do Supabase em favor de Postgres nativo              | Infra     |
| [012-email-transport-node-env.md](012-email-transport-node-env.md)                 | Transporte de e-mail derivado de `NODE_ENV`                  | Auth      |
| [013-ui-redesign.md](013-ui-redesign.md)                                           | Redesign de UI com shadcn/ui e app shell                     | Front-end |
| [014-experts-ai-architecture.md](014-experts-ai-architecture.md)                   | Experts com LangGraph, Weaviate e RAG                        | IA        |
| [015-redesign-home.md](015-redesign-home.md)                                       | Redesign da home autenticada                                 | Front-end |

## Como adicionar um ADR

1. Crie `.adrs/NNN-titulo-curto.md` com o próximo número livre.
2. Use o formato: título, status, contexto, decisão, consequências.
3. Adicione a linha na tabela acima.
4. Referencie o ADR no código/PR quando a decisão for aplicada.

> Observabilidade operacional (stack local, token do Grafana, runbooks) está em [`.docs/OBSERVABILITY.md`](../.docs/OBSERVABILITY.md).
