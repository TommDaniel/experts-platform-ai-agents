# Plano — Auth Session (`002-auth-session`)

> Executa a spec `./.specs/002-auth-session.md`. Materializa a mecânica de sessão: `SessionService` (create/validate/revoke com regra "última vence"), guard global da API (`AuthGuard`) protegendo `/api/v1/*` exceto `/api/v1/auth/*`, e os controllers `me`/`logout`. Consome a tabela `sessions` e as decisões da `001` (token opaco, `token_hash` = SHA-256).

## Premissas do refinamento (feature-concept — sem entrevista, decisões documentadas)

| Premissa                                                    | Decisão                                                                                                    | Racional                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Guard e `/auth/*` (spec)                                    | Global guard pular rotas marcadas `@Public()`; controllers `me`/`logout` ficam sob `/auth/*`               | Spec: guard desativado para `/api/v1/auth/*` via decorator; `me`/`logout` fazem autovalidação de token.    |
| `me` com token inválido                                     | `401` (via `SessionGuard` local)                                                                           | Critério de aceite exige `401` sem token válido.                                                           |
| `logout` idempotente                                        | Não usa guard; lê o header, revoga se houver token, responde 200 mesmo sem token válido                    | Critério: "repetir o chamado não gera erro" e edge case "logout sem sessão válida → sucesso".              |
| Resposta do logout                                          | `200` com `{ "success": true }`                                                                            | Simples e idempotente; evita 204 com corpo.                                                                |
| Identidade retornada em `me`                                | `{ id, email, firstName, lastName, emailVerifiedAt }` — nunca `passwordHash`                               | Suficiente para a `003` validar sessão/popular usuário; nunca expõe segredo.                               |
| Testes do `SessionService` (QA.md: "unitário + integração") | `src/**/*.spec.ts` contra o Postgres local real (limpeza por usuário único)                                | "Última vence" exige banco real; QA.md define `test` como unitário + integração e infra local é requisito. |
| Testes de guard/`me`/`logout`/`última vence` via HTTP       | `e2e/auth-session.e2e-spec.ts` (Supertest + `AppModule`)                                                   | Cobertura de ponta a ponta exigida pela spec.                                                              |
| Rota privada de teste do guard                              | `GET /api/v1` (AppController) — não é `/auth/*` nem `@Public()`                                            | Endpoint privado existente para provar 401 sem token.                                                      |
| `DatabaseModule` no grafo sem tocar `app.module.ts`         | `AuthModule` importa `DatabaseModule` (`@Global`) e registra `{ provide: APP_GUARD, useClass: AuthGuard }` | Orquestração proíbe mexer em `app.module.ts`; DatabaseModule global fica no grafo via `AuthModule`.        |

## Objetivo

- `SessionService.createSession/validateSession/revokeSession` com a regra "uma sessão válida por pessoa (última vence)" via transação.
- Guard global da API autenticando `Authorization: Bearer <token>` em todos os endpoints fora de `/api/v1/auth/*`, com `401` em header ausente/malformado/token desconhecido/revogado.
- `GET /api/v1/auth/me` (identidade da sessão) e `POST /api/v1/auth/logout` (revogação idempotente).
- Testes unitários+integração (`SessionService`) e e2e (guard, me, logout, última vence).
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando; ADR em `./.adrs/002-auth-session.md`.

## Escopo

**Dentro:** token utils (`generateSessionToken`, `hashToken`, `parseBearerToken`); `SessionService`; `AuthGuard` global + `@Public()`; `SessionGuard` local (me); controllers `me`/`logout`; registro no `auth.module.ts`; testes unitários/integração/e2e; atualização do e2e existente (`app.e2e-spec.ts`) por causa do guard; ADR; `.env` local da API.

**Fora:** sign-up/confirm-account/sign-in (004/005/006); guard do cliente e rotas `/auth/*` `/app/*` (003); refresh token; expiração por tempo; auditoria de sessões na UI; notificação de nova sessão.

## Etapas

### E1. Token utils — `apps/api/src/modules/auth/session/session-token.ts`

- `generateSessionToken()`: `randomBytes(32).toString("base64url")`.
- `hashToken(token)`: SHA-256 hex.
- `parseBearerToken(header)`: extrai token de `Authorization: Bearer <t>` (case-insensitive); `null` para ausente/malformado.

### E2. `SessionService` — `apps/api/src/modules/auth/session/session.service.ts`

- Injeta `DRIZZLE` (`DatabaseModule`).
- `createSession(userId)`: transação → revoga ativas anteriores (`revoked_at = now()` onde `user_id = ? AND revoked_at IS NULL`) → insere `{ user_id, token_hash }`; retorna o token puro uma única vez.
- `validateSession(token)`: join `sessions`×`users` onde `token_hash = sha256(token) AND revoked_at IS NULL`; retorna `{ session, user }` ou `null` (cobre "usuário inexistente" via inner join).
- `revokeSession(token)`: `revoked_at = now()` por `token_hash` (idempotente).
- Tipos: `SessionUser` e `ValidatedSession`.

### E3. Guard global — `apps/api/src/modules/auth/session/auth.guard.ts` + decorators

- `public.decorator.ts`: `IS_PUBLIC_KEY` + `@Public()`.
- `AuthGuard` (global): `@Public()` → libera; senão valida Bearer via `SessionService` e injeta `request.session`/`request.token`; inválido → `401`.
- `session.guard.ts`: `SessionGuard` — valida o Bearer e injeta `request.session` (para `me`), `401` se inválido.
- `current-user.decorator.ts`: `@CurrentUser()` lê `request.session.user` (lança `401` se ausente).
- `auth.types.ts` (em session/): `AuthenticatedRequest`.

### E4. Controllers — `apps/api/src/modules/auth/session/session.controller.ts`

- `GET /api/v1/auth/me`: `@Public()` + `@UseGuards(SessionGuard)` + `@CurrentUser()` → usuário.
- `POST /api/v1/auth/logout`: `@Public()`; lê header, `revokeSession` se houver token; `200 { success: true }` sempre (idempotente).
- `AuthController` (health) ganha `@Public()`.

### E5. `auth.module.ts`

- `imports: [DatabaseModule]`; `controllers: [AuthController, SessionController]`; `providers: [SessionService, SessionGuard, { provide: APP_GUARD, useClass: AuthGuard }]`; `exports: [SessionService]`.
- Sem mudança em `app.module.ts` (DatabaseModule entra no grafo via AuthModule; é `@Global`).

### E6. Testes — `src` e `e2e`

- `session-token.spec.ts` (unit): formato do token, hash determinístico, parsing do Bearer.
- `session.service.spec.ts` (unit+integração real DB): create armazena `token_hash`; validate ativo → sessão+usuário; token errado/revogado → null; revoke idempotente; "última vence"; usuário removido → null.
- `e2e/auth-session.e2e-spec.ts` (Supertest + AppModule): me 200/401; guard 401 (ausente, malformado, desconhecido, revogado); rota privada liberada com token; logout idempotente; `GET /api/v1/auth` sem token; "última vence" via HTTP.
- `app.e2e-spec.ts`: `GET /api/v1` sem token → 401 (guard); atualizar caso do hello world para autenticado.

### E7. `.env` local

- `apps/api/.env` (gitignored) criado a partir do `.env.example` raiz; `DATABASE_URL` já aponta para o Supabase local (`:54322`).

### E8. QA gates

- Ordem de `.docs/QA.md`: `code:fix`, `types:check`, `test`, `test:e2e`, `build`.

### E9. ADR + artefatos

- `./.adrs/002-auth-session.md` com as decisões load-bearing.

### E10. Commit

- Um commit Conventional Commits apenas com os arquivos da spec (seção "Arquivos e diretórios envolvidos"); co-author OpenCode Agent; validar com `bunx commitlint`; `git pull --rebase` se a main andou.

## Arquivos-alvo

- Novo: `apps/api/src/modules/auth/session/{session-token,session.service,auth.guard,session.guard,public.decorator,current-user.decorator,auth.types,session.controller}.ts` (+ `.spec.ts`), `apps/api/e2e/auth-session.e2e-spec.ts`, `./.plans/002-auth-session-plan.md`, `./.adrs/002-auth-session.md`.
- Alterado: `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/modules/auth/auth.controller.ts`, `apps/api/e2e/app.e2e-spec.ts`.
- Local (não commitado): `apps/api/.env`.

## Riscos e edge cases

- **Guard global pega o e2e existente:** `GET /api/v1` agora exige token → `app.e2e-spec.ts` atualizado.
- **`me`/`logout` sob `/auth/*`:** global guard pularia sem autovalidação → `me` usa `SessionGuard`; `logout` é idempotente de propósito.
- **Token malformado (sem Bearer / base64 inválido):** `parseBearerToken` → `null` → `401` genérico.
- **Sessão revogada reutilizada:** `validateSession` consulta `revoked_at` → `401`.
- **Logout sem sessão:** update em 0 linhas → sucesso.
- **Usuário inexistente com token válido:** inner join `users` → `null` → `401` (FK cascade previne na prática).
- **Criação concorrente de sessão (duas abas):** transação serializa; a última a commitar vence.
- **`bun run test` passa a depender do banco local** (QA.md: test = unitário + integração; infra local é requisito documentado).

## Critérios de aceite (da spec)

Checklist de `002-auth-session.md` §Critérios de aceite — todos cobertos pelos testes de E2/E6 e QA gates.

## Checklist de QA manual

1. `bun run infra:up` (Supabase local) já rodando; conferir `curl http://127.0.0.1:54321/health`.
2. `bun run dev --filter api` → `curl http://localhost:3000/api/v1` (401 sem token) e `curl http://localhost:3000/api/v1/auth` (`{"status":"ok"}`).
3. Criar usuário no banco, gerar sessão via `SessionService` e validar: `me` 200 com token, 401 sem; `logout` 200 e repetido 200; segunda sessão invalida a primeira.
4. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build` passam.
