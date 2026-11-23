---
title: Fundação
status: draft
created: 2026-08-10
---

# Fundação

> Prepara a fundação do monorepo para o desenvolvimento real: cria a API (`apps/api`, Nest.js) e o cliente (`apps/app`, React + Vite), substitui os apps starter Next.js, configura tooling de qualidade, infra local (Supabase + LGTM) e os comandos de desenvolvimento previstos na documentação.

## Contexto

O monorepo (Turborepo + bun) começa como o starter padrão do Turborepo, com `apps/web` e `apps/docs` em Next.js. A documentação de `.docs/` (`ARCHITECTURE.md`, `DEVELOPMENT.md`, `QA.md`) define uma stack-alvo marcada com status `[implementado]`/`[planejado]` e o workflow exige que esta spec materialize os pontos `[planejado]` e remova os `[implementado]` que conflitarem.

O produto (ver `BUSINESS.md`) é uma plataforma de gestão de agentes de IA customizados, mas a fundação não implementa features — apenas a base estrutural sobre a qual as features serão construídas.

## Objetivo

- Ter uma API Nest.js e um cliente React + Vite criados, rodando localmente e integrados ao monorepo.
- Todos os portões de qualidade (`code:fix`, `types:check`, testes, build) executando pelo `turbo` na raiz.
- Infra local reproduzível (`supabase start` + LGTM) controlada por comandos raiz.
- `ARCHITECTURE.md`, `DEVELOPMENT.md` e `QA.md` com status consistentes com o novo estado (sem `[planejado]` conflitante pendente).

## Escopo

**Dentro:**

- `apps/api` — API Nest.js + TypeScript com `GET /` respondendo JSON hello world.
- `apps/app` — cliente React + Vite com `/` renderizando um título hello world.
- Remoção dos starters `apps/web` (Next.js, porta 3000) e `apps/docs` (Next.js, porta 3001).
- Integração com os pacotes compartilhados do monorepo (`@repo/typescript-config`, `@repo/ui`).
- Tooling: OXLint + OXFmt (substituindo ESLint + Prettier), Lefthook + Lint-staged, TypeScript.
- Testes: Vitest (unit + integração), Supertest (E2E da API), Playwright (E2E do app) — com testes smoke, mesmo que simples por enquanto.
- Infra local: `docker-compose.yml` com Supabase local (`supabase start`) e LGTM (Loki, Grafana, Tempo, Mimir).
- Comandos raiz: `code:fix`, `types:check`, `test`, `test:e2e`, `infra:up`, `infra:down`, `db:migrate`.
- Migrações versionadas em `./supabase/migrations/` aplicadas via Supabase CLI.
- Atualização dos marcadores `[implementado]`/`[planejado]` em `.docs/`.

**Fora:**

- Qualquer feature de produto (experts, conectores, autenticação, storage).
- Deploy em produção (Vercel, Supabase cloud).
- Configuração definitiva de observabilidade além da subida da stack local.

**Adiado:**

- Suites E2E reais e completas (a fundação garante apenas que os scripts e testes smoke executem).
- Ajuste fino das configs do OXLint para regras de projeto.
- Decisões de schema de banco (a fundação cria apenas a migração de smoke).

## Necessidade de negócio

Permite que o time comece a construir features do produto (gestão de experts, conectores de dados) sobre uma base sólida e padronizada, sem retrabalho: tooling único, qualidade verificável na raiz, infra local determinística e documentação alinhada à realidade do código. Remove a fricção de setups ad hoc e a duplicação de front-ends (dois apps Next.js starter que não são o produto).

## Critérios de aceite

- [ ] `GET /` na API responde JSON hello world (`bun run dev --filter api` e requisição local).
- [ ] `/` no app renderiza um título hello world (`bun run dev --filter app`).
- [ ] `bun run code:fix` executa lint + formatação sem erros.
- [ ] `bun run types:check` passa sem erros de tipo.
- [ ] `bun run build` passa para todos os apps e pacotes.
- [ ] `bun run test` executa os testes unitários/integração (smoke, ao menos um por app) e passa.
- [ ] `bun run test:e2e` executa os testes E2E (smoke) e passa.
- [ ] `docker-compose.yml` define a infra local de desenvolvimento.
- [ ] Supabase local sobe com `supabase start`.
- [ ] LGTM (Grafana stack) sobe.
- [ ] `bun run infra:up` e `bun run infra:down` sobem e derrubam a infra.
- [ ] `bun run db:migrate` aplica as migrações no banco local.
- [ ] `apps/web` e `apps/docs` removidos; `apps/api` e `apps/app` presentes.
- [ ] Pontos `[planejado]` da stack-alvo implementados e pontos `[implementado]` conflitantes removidos (ex.: ESLint + Prettier → OXLint + OXFmt).
- [ ] `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md` e `.docs/QA.md` com status consistentes com o estado final.

## O que fazer

- Instalar as bibliotecas da stack-alvo conforme `ARCHITECTURE.md` (Nest.js, React, Vite, TailwindCSS, shadcn/ui, TanStack Query/Table/Chart, date-fns, Vitest, Supertest, Playwright, Supabase, bcrypt, OXLint, OXFmt, Lefthook, Lint-staged).
- Criar `apps/api` e `apps/app`, com tsconfigs herdando de `@repo/typescript-config`.
- Remover `apps/web`, `apps/docs` e o que conflitar (ex.: `packages/eslint-config` com a adoção do OXLint).
- Criar/ajustar arquivos de configuração (root `package.json`, `turbo.json`, configs de lint/formatação, hooks, `.env.example`).
- Adicionar os comandos raiz: `code:fix`, `types:check`, `test`, `test:e2e`, `infra:up`, `infra:down`, `db:migrate`.
- Criar `docker-compose.yml` (Supabase + LGTM) e o diretório `./supabase/migrations/`.
- Atualizar os marcadores de status em `.docs/`.

## O que não fazer

- Implementar feature completa (nenhum domínio de produto nesta spec).
- Manter os starters Next.js (`apps/web`, `apps/docs`) no monorepo.
- Introduzir ORM/outro gerenciador de migrações além do Supabase CLI.
- Deployar nada em produção.
- Remover pontos `[implementado]` que não conflitam com o novo planejado (ex.: `@repo/typescript-config`).

## Decisões

| Decisão              | Opção escolhida                                                          | Racional                                                                                               |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Stack do cliente     | `apps/app` (React + Vite)                                                | Escolha original da spec; confirmada no refinamento.                                                   |
| Apps starter Next.js | `apps/web` e `apps/docs` removidos                                       | Evita dois front-ends conflitantes; cumpre o critério de remover `[implementado]` que conflita.        |
| Stack da API         | `apps/api` (Nest.js)                                                     | Conforme `ARCHITECTURE.md`.                                                                            |
| Migrações            | Supabase CLI (`supabase db push`), migrações em `./supabase/migrations/` | Decisão do refinamento; alinhada ao `ARCHITECTURE.md`, sem camada de ORM.                              |
| Lint + formatação    | OXLint + OXFmt substituem ESLint + Prettier                              | `[planejado]` em `ARCHITECTURE.md`; ESLint/Prettier e `packages/eslint-config` removidos por conflito. |
| Git hooks            | Lefthook + Lint-staged                                                   | `[planejado]` em `ARCHITECTURE.md`.                                                                    |
| Testes               | Vitest (unit/integração) + Supertest (E2E API) + Playwright (E2E app)    | `[planejado]` em `ARCHITECTURE.md`.                                                                    |
| Portas locais        | API em `:3000`, app em `:5173`                                           | `web` (3000) sai do monorepo; `5173` é o padrão do Vite.                                               |
| Observabilidade      | LGTM (Loki, Grafana, Tempo, Mimir) via docker-compose                    | `[planejado]` em `ARCHITECTURE.md`/`DEVELOPMENT.md`.                                                   |
| Commandos de QA      | `code:fix` e `types:check`                                               | Nomeação original da spec (o `codes:fix` de `QA.md` é tratado como typo).                              |

## Dependências

- Monorepo Turborepo + bun já existente (`turbo.json`, `package.json` raiz).
- Pacotes compartilhados `@repo/typescript-config` e `@repo/ui`.
- `bun` como gerenciador e runner (`bun.lock`).
- Supabase CLI instalado localmente.
- Docker instalado localmente (para `infra:up`/`infra:down`).
- Docs de referência: `ARCHITECTURE.md` (stack), `DEVELOPMENT.md` (camadas/princípios), `QA.md` (portões), `DESIGN.md`/`DESIGN_SYSTEM.md` (paleta e base shadcn/ui para o app).

## Riscos e trade-offs

- **Migração ESLint → OXLint:** regras e plugins existentes (ex.: regras Next) não portam 1:1; aceita-se reconfigurar, mantendo o mesmo portão `code:fix`. Escolhemos não manter ESLint só para compatibilidade.
- **Remoção de `apps/web`/`apps/docs`:** eles são starters sem código de produto; o risco é nulo, mas a doc precisa ser atualizada junto para não divergir.
- **Vite vs Next.js (documentado):** `ARCHITECTURE.md` precisa ser corrigida, senão a divergência se perpetua. Aceito como parte da fundação.
- **LGTM em docker-compose:** stack pesada em máquinas com poucos recursos; alternativa seria adiar, mas o `[planejado]` exige infra desde o dia zero.
- **Sem ORM:** mais SQL manual via Supabase CLI; aceitável nesta fase, sem abstração prematura (DRY).

## Edge cases e modos de falha

- **Docker não instalado/parado:** `infra:up` deve falhar com mensagem clara apontando a dependência.
- **Portas ocupadas (`3000`, `5432`, `5173`, Grafana):** `infra:up`/`supabase start` devem reportar erro identificável; documentar como liberar.
- **`db:migrate` sem banco local iniciado:** deve falhar com instrução para rodar `infra:up`/`supabase start` antes.
- **`infra:up` repetido (já ativo):** comandos devem ser idempotentes (subir o que falta, não duplicar).
- **Migração quebrada:** `supabase db push` falha e sinaliza o arquivo de migração com problema; nenhuma migração parcial deve corromper o estado.
- **Remoção acidental de `@repo/ui`:** o app consome `@repo/ui`; a remoção não pode quebrar o build (o UI permanece como pacote compartilhado).

## Resultado (definição de pronto)

- `apps/api` e `apps/app` criados; `apps/web` e `apps/docs` removidos.
- Todos os critérios de aceite verificáveis passando (API JSON, app renderizando, `code:fix`, `types:check`, builds, testes unitários/integração e E2E).
- Infra local sobe/desce via `infra:up`/`infra:down`; `db:migrate` aplica migrações no Supabase local.
- Documentação de `.docs/` consistente (sem `[planejado]` conflitante pendente).
- ADR registrando as decisões de fundação em `./.adrs/*.md` e resumo entregue conforme `RULES.md`.

## Arquivos e diretórios envolvidos

- `apps/api/**` (novo), `apps/app/**` (novo).
- `apps/web/**`, `apps/docs/**` (removidos).
- `packages/eslint-config/**` (removido, se substituído por OXLint).
- `packages/ui/**`, `packages/typescript-config/**` (ajustados apenas se necessário).
- `docker-compose.yml`, `supabase/` (novos).
- `package.json` raiz, `turbo.json`, configs de lint/format, `.env.example` (novos/alterados).
- `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/QA.md` (status).
- `./.adrs/000-foundation.md` (novo).
