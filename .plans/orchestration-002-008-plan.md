# Plano de orquestração — range 002-008

> Skill: `orchestrate-me` · Orquestrador: agente principal (não implementa specs).
> Data: 2026-08-11 · Branch: `main`.

## 1. Range resolvido

Range solicitado: `002-008`. Todas as 7 specs existem em `.specs/`:

| Spec | Arquivo                         | Status   |
| ---- | ------------------------------- | -------- |
| 002  | `.specs/002-auth-session.md`    | Pendente |
| 003  | `.specs/003-auth-routes.md`     | Pendente |
| 004  | `.specs/004-sign-up.md`         | Pendente |
| 005  | `.specs/005-confirm-account.md` | Pendente |
| 006  | `.specs/006-sign-in.md`         | Pendente |
| 007  | `.specs/007-forgot-password.md` | Pendente |
| 008  | `.specs/008-reset-password.md`  | Pendente |

**Classificação de "já implementada":** nenhuma. Não há ADR em `.adrs/` para specs 002–008 (os `002-commit-and-push.md` / `003-commit-and-push-opencode-command.md` são do command, não de auth-session/auth-routes) e não há commit tocando os arquivos das specs (`git log --all -- <path>` vazio). A spec 001 já está implementada (commit `67ddc76`) e serve de base para todas.

## 2. Contexto adquirido

- `001-auth-schema` entregou: schema Drizzle completo (`users`, `sessions`, `email_confirmation_tokens`, `password_reset_tokens`), `PasswordService`, `EmailService` com **todos** os 4 métodos/templates (confirmation, newSession, passwordReset, passwordResetSuccess). **Nenhuma spec 002–008 precisa mexer em email nem em schema** → sem migrações novas esperadas.
- `apps/api`: Nest.js, `AuthModule` com um `AuthController` de health; guard global ainda não existe. `DatabaseModule` lê `DATABASE_URL` do env (`createDrizzleDatabase` lança erro sem `.env`).
- `apps/app`: React+Vite, sem router ainda (hello world). 003 instala `react-router-dom` e cria placeholders.
- Infra: Supabase local rodando (porta 54321, OrbStack). **Não existe `.env`** — subagents precisam criar `apps/api/.env` a partir de `.env.example` (default `DATABASE_URL` já aponta para o Postgres local). `.env` é gitignored.
- QA gates: `code:fix`, `types:check`, `test`, `test:e2e`, `build` (QA.md).
- Trabalho pendente não relacionado no working tree: `.docs/AGENTS.md`, `.docs/RULES.md`, `.agents/skills/orchestrate-me/`. **Subagents não devem commitar esses arquivos.**

## 3. Grafo de dependências e ondas

Dependências in-range extraídas de cada spec:

- 002 ← 001 ✅ (fora do range, pronta)
- 003 ← 002
- 004 ← 003
- 005 ← 002, 003, 004
- 006 ← 002, 003
- 007 ← 003
- 008 ← 003, 006, 007

### Ondas (ordem topológica)

| Onda | Specs             | Justificativa                                |
| ---- | ----------------- | -------------------------------------------- |
| 1    | **002**           | Sem dependências in-range                    |
| 2    | **003**           | Depende de 002                               |
| 3    | **004, 006, 007** | Dependem de 002/003 (prontas)                |
| 4    | **005, 008**      | 005 depende de 004; 008 depende de 006 e 007 |

Sem ciclos. A spec 008 exige 006 apenas para o teste de integração "login com a nova senha" — dependência real mantida.

## 4. Subagents a spawnar

Um subagent `general` por spec pendente, em background, na MESMA mensagem quando forem da mesma leva:

- Onda 1: 002
- Onda 2: 003
- Onda 3: 004, 006, 007 (3 em paralelo)
- Onda 4: 005, 008 (2 em paralelo)

## 5. Colisão de arquivos (análise)

| Arquivo/dir                                                                 | Tocadas por                                             | Onda      | Conflito                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------- | --------- | ------------------------ |
| `apps/api/src/modules/auth/auth.module.ts`                                  | 002 (onda 1), 004, 006, 007 (onda 3), 005, 008 (onda 4) | múltiplas | **SIM — decisão abaixo** |
| `apps/api/src/modules/shared/email/*`                                       | nenhuma (001 entregou tudo)                             | —         | Não                      |
| `apps/app/src/pages/auth/*.tsx`                                             | cada spec preenche UM placeholder diferente             | 3/4       | Não                      |
| `apps/api/e2e/*` / `apps/app/src/**/*.test.tsx`                             | cada spec cria arquivos novos                           | 3/4       | Não (arquivos distintos) |
| `apps/app/src/router.tsx`, `contexts/auth-context.tsx`, `lib/api-client.ts` | 003 cria; 004–008 só consomem                           | —         | Não                      |

### Decisão para `auth.module.ts` (único arquivo realmente compartilhado)

Editar o MESMO arquivo por 2+ subagents concorrentes no mesmo working tree corrompe a árvore (last-writer-wins). Decisão: **wiring centralizado no orquestrador**.

- **Subagents 004–008:** criam o feature como módulo autocontido na sua pasta (controller + module + use cases). **NÃO editam** `auth.module.ts` nem `app.module.ts`. Nos testes de integração/e2e (Supertest), montam um `TestingModule` próprio importando o próprio feature module + `DatabaseModule` + `PasswordModule` + `EmailModule` + `ConfigModule` — **não importam `AppModule`** (que ainda não estará wired).
- **Subagent 002 (onda 1, sozinho):** é dono de `auth.module.ts` — registra `me`/`logout` e o `APP_GUARD` (AuthGuard global, whitelist `/api/v1/auth/*`).
- **Orquestrador:** ao final de cada onda, faz UM commit de wiring em `auth.module.ts` registrando os feature modules daquela onda (import + controllers), e roda `bun run test` + `test:e2e` para validar a integração. É reconciliação de trabalho paralelo (mesma natureza de rodar `db:migrate` ao final da leva).

## 6. Estratégia de commit

- Um commit Conventional por spec, feito pelo **próprio subagent**, com `git add <caminhos explícitos>` — **nunca `git add -A`**.
- Validação: `printf '%s\n' "$msg" | bunx commitlint`.
- Trailer obrigatório: `Co-authored-by: OpenCode Agent <agent@opencode.ai>` (via `${OPENCODE_COAUTHOR_NAME:-OpenCode Agent}`).
- Antes do commit: `git pull --rebase` se houver commits novos na main.
- O wiring do orquestrador é um commit Conventional extra por onda (`feat(api): wire auth feature modules (wave N)`), com co-author.
- **Não commitar**: `.docs/AGENTS.md`, `.docs/RULES.md`, `.agents/skills/orchestrate-me/`, `.env`.

## 7. Migrações de banco

Nenhuma spec 002–008 exige mudança de schema (tabelas já existem da 001). Se algum subagent identificar necessidade (não esperado), deve **apenas criar o arquivo** em `supabase/migrations/` sem rodar `db:migrate` e reportar — o orquestrador aplica ao final da leva.

## 8. Riscos e mitigações

| Risco                                                        | Mitigação                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Corrupção de `auth.module.ts` por edição concorrente         | Wiring centralizado no orquestrador (decisão acima)                                                           |
| E2E do subagent importa `AppModule` e falha (rota não wired) | Instrução explícita: TestingModule com o feature module; nunca `AppModule`                                    |
| Sem `.env` → `createDrizzleDatabase` lança erro              | Subagents criam `apps/api/.env` a partir do `.env.example` (default DATABASE_URL já aponta ao Postgres local) |
| Mailtrap sem credenciais reais → envio de email falha        | Subagents usam transport test-double nos testes e registram o passo manual de QA (checar Mailtrap)            |
| Suite e2e compartilhada roda por inteiro a cada wave         | Esperado e desejado: cada wave roda sobre árvore consistente (ondas anteriores commitadas)                    |
| Playwright (`apps/app/test:e2e`) precisa api+app no ar       | Subagent de 003 em diante sobe os dev servers (ou usa servidores do Playwright) — passo documentado em QA.md  |
| Subagent falha em uma spec da leva                           | Continua as demais; falha registrada para o relatório final e passo seguinte (`implement-me` isolado)         |
| Commit do subagent vaza arquivos de outra spec/skill         | Instrução explícita + validação do diff do commit na conclusão (passo 8 da skill)                             |

## 9. Critérios de aceite do range

- [ ] Todas as 7 specs concluídas (002–008), cada uma com ADR em `.adrs/NNN-*.md` e plano em `.plans/[spec]-plan.md`.
- [ ] Um commit Conventional por spec, com co-author `OpenCode Agent`, sem `git add -A`.
- [ ] Wiring de `auth.module.ts` validado (test + test:e2e passando) ao final de cada onda.
- [ ] QA gates (`code:fix`, `types:check`, `test`, `test:e2e`) passando na árvore final.
- [ ] Relatório final consolidado com status por spec, ADRs, planos, arquivos, libs e QA gates.
