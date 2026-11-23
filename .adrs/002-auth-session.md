# ADR-002: Auth session (token opaco, guard global, me/logout, última vence)

- **Status:** aceito
- **Data:** 2026-08-11
- **Spec:** `./.specs/002-auth-session.md`
- **Decisões load-bearing** da materialização da mecânica de sessão sobre o schema da `001`.

## Contexto

A `001` entregou a tabela `sessions` (`token_hash`, `revoked_at`) e a decisão de guardar apenas o SHA-256 do token. Esta spec materializa: criação/validação/revogação de sessão com a regra de negócio "uma sessão válida por pessoa (a última vence)", a proteção de todos os endpoints `/api/v1/*` (exceto `/api/v1/auth/*`) via guard global, e os endpoints `GET /api/v1/auth/me` e `POST /api/v1/auth/logout`.

## Decisões

### 1. `SessionService` com token opaco (32 bytes base64url) e `token_hash` SHA-256

`createSession(userId)` gera o token puro, armazena `sha256(token)` e retorna o token **uma única vez**. `validateSession(token)` faz inner join `sessions × users` filtrando `token_hash` e `revoked_at IS NULL` — o join também cobre o edge case "usuário inexistente com token válido". `revokeSession(token)` atualiza `revoked_at` por `token_hash` (idempotente). Nenhuma claim/expiração: a sessão morre por novo login, logout ou remoção da conta.

### 2. "Última vence" dentro de transação

`createSession` roda em `db.transaction`: primeiro seta `revoked_at = now()` nas sessões ativas anteriores do usuário, depois insere a nova. Uma transação garante atomicidade (sem janela onde o usuário fica sem sessão ou com duas ativas) e que a última a commitar vence em criação concorrente (duas abas).

### 3. Guard global `AuthGuard` + decorator `@Public()`

`{ provide: APP_GUARD, useClass: AuthGuard }` registrado no `AuthModule` protege todo endpoint fora de `/api/v1/auth/*` por padrão. O guard lê `Authorization: Bearer <token>` (via `parseBearerToken`, case-insensitive e rígido quanto a formato), valida via `SessionService` e injeta `request.session`/`request.token`; falha → `401` genérico. Rotas públicas são marcadas com `@Public()` (metadata `IS_PUBLIC_KEY`); o guard consulta handler + classe via `Reflector.getAllAndOverride`.

### 4. `me`/`logout` sob `/auth/*` são públicos ao guard global e autogerenciam a sessão

Como o guard global é desativado para `/api/v1/auth/*` (spec), cada rota cuida da própria autenticação:

- `GET /auth/me` → `@Public()` + `SessionGuard` (guarda local que valida o Bearer e injeta a sessão) + `@CurrentUser()`; `401` sem token válido. Retorna `{ id, email, firstName, lastName, emailVerifiedAt }` — nunca `password_hash`.
- `POST /auth/logout` → `@Public()`, **sem guard**: lê o header, chama `revokeSession` se houver token e responde sempre `200 { success: true }` — idempotente mesmo sem sessão válida (requisito da spec: "logout sem sessão válida → sucesso").

### 5. `AuthModule` é o ponto de fiação (sem tocar `app.module.ts`)

`AuthModule` importa `DatabaseModule` (módulo `@Global`), registra os controllers `AuthController` (health) e `SessionController` (me/logout), e os providers `SessionService`, `SessionGuard` e o `APP_GUARD`. Como `DatabaseModule` é global, o token `DRIZZLE` fica disponível app-wide a partir do grafo — não foi necessário alterar `apps/api/src/app.module.ts` (restrição de orquestração).

### 6. Testes: unitário+integração do `SessionService` no `src`, e2e do guard/`me`/`logout`/última-vence no `e2e`

O spec de `SessionService` (`src/**/*.spec.ts`) roda contra o Postgres local real (QA.md define `test` como "unitário + integração"; infra local é requisito), com usuário por execução e limpeza por `afterEach`/`afterAll`. O e2e (`Supertest + AppModule`) cobre o guard (401 para ausente/malformado/desconhecido/revogado, liberação com token válido), `me`, `logout` idempotente e "última vence" via HTTP. O e2e existente (`app.e2e-spec.ts`) foi atualizado porque `GET /api/v1` agora exige autenticação.

### 7. `apps/api/.env` local (gitignored)

Criado a partir do `.env.example` raiz com o `DATABASE_URL` padrão apontando ao Supabase local (`:54322`). Necessário para os testes de integração/e2e lerem o banco. Não commitado.

## Consequências

- Todo endpoint novo fora de `/auth/*` nasce protegido por padrão (401 até ter token válido); rotas públicas exigem `@Public()` (documentado como risco).
- `SessionService` exportado pelo `AuthModule` para as specs 004/005/006 criarem sessão nos fluxos confirm-account/sign-in.
- `GET /api/v1` (hello world da fundação) agora exige autenticação — e2e atualizado.
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando.
