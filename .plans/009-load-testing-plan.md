# Plano — 009-load-testing

> Espec: `.specs/009-load-testing.md` · Execução: k6 v2.2.0 via Docker one-shot.

## Objetivo

Gerar massa de dados de observabilidade e testar carga da API estressando os 9 endpoints atuais, com k6 reproduzível via scripts npm.

## Contexto mapeado

- Base da API: `http://localhost:3000/api/v1` (`API_PORT=3000`, prefixo global `api/v1`).
- Endpoints:
  1. `GET /api/v1` (hello) — 200
  2. `GET /api/v1/auth` (health) — 200
  3. `POST /api/v1/auth/sign-up` — 201 (bcrypt + token + email)
  4. `POST /api/v1/auth/sign-in` — 200 (bcrypt + sessão + email)
  5. `GET /api/v1/auth/me` — 200 (Bearer válido)
  6. `POST /api/v1/auth/logout` — 200 (revoga sessão)
  7. `POST /api/v1/auth/confirm-account` — 400 (token inválido, error-path)
  8. `POST /api/v1/auth/forgot-password` — 202 (token de reset + email)
  9. `POST /api/v1/auth/reset-password` — 400 (token inválido, error-path)
- Error-path: `BadRequestException` → 400 (`confirm-account`/`reset-password`).
- `sign-in` exige `email_verified_at` preenchido → precisamos de seed de usuário confirmado.
- k6 rodará em container: API acessível via `host.docker.internal:3000`.
- `postgres` e `bcrypt` resolvem a partir de `apps/api/node_modules` → seed em `apps/api/scripts/`.

## Decisões (do feature-concept)

| Decisão   | Opção                                                                            |
| --------- | -------------------------------------------------------------------------------- |
| Execução  | Docker one-shot (`grafana/k6:2.2.0`)                                             |
| Cobertura | Happy path + error-path (400) p/ confirm/reset                                   |
| Perfil    | Ramping, env-configurável (defaults: 50 VUs, 1m ramp-up, 5m hold, 30s ramp-down) |
| Auth      | Seed usuário confirmado + pool de tokens no `setup()`                            |

## Arquivos a criar

1. `apps/api/scripts/load-seed.mjs` — insere usuário confirmado `load.user@coders.local` (`k6Password!2026`, hash bcrypt cost 10) via `postgres` (idempotente).
2. `load/common.js` — base URL, helpers, métricas por endpoint (tags), checks.
3. `load/smoke.js` — 1 VU, 1–2 iterações, valida os 9 endpoints (com `expectedResponse` para 4xx) + setup de tokens.
4. `load/load.js` — 9 cenários `ramping-vus` (um por endpoint), stages via env, setup de pool de tokens, thresholds.
5. `load/README.md` — como rodar, env vars, o que observar no Grafana, riscos (Mailtrap, DB growth).
6. `package.json` — scripts:
   - `load:seed`: `bun apps/api/scripts/load-seed.mjs`
   - `load:smoke`: docker run k6 smoke
   - `load:test`: docker run k6 load

## Estrutura do load.js

- `options.scenarios`:
  - `hello`, `health`, `sign_up`, `sign_in`, `me`, `logout`, `confirm_account`, `forgot_password`, `reset_password` — todos `executor: "ramping-vus"`.
  - Stages derivados de env: `LOAD_VUS` (default 50), `LOAD_RAMP_UP` (1m), `LOAD_HOLD` (5m), `LOAD_RAMP_DOWN` (30s).
- `setup()`: mina pool de tokens (default `LOAD_TOKEN_POOL=50` sign-ins com o usuário seed) → `SharedArray`.
- `sign_up`: email único `load-<runId>-<VU>-<ITER>@coders.local`, espera 201.
- `sign_in`: credenciais do seed, espera 200, retorna token.
- `me`: pega token do pool, espera 200.
- `logout`: `sign-in` (token novo) → `logout`, espera 200.
- `confirm_account`/`reset_password`: token fake, `expectedResponse: false`, check 400.
- `forgot_password`: email do seed, espera 202.
- Thresholds: `http_req_failed` com `expectedResponse` excluindo 4xx intencionais; `http_req_duration` p95 < 2000ms default (env-configurável).

## Ordem de implementação

1. Seed script + testar manualmente (insert + idempotência).
2. `common.js` + `smoke.js` + rodar smoke (valida `expectedResponse` no k6 2.2.0).
3. `load.js` + rodar load curto (VUs baixas) para validar cenários e dados no Grafana.
4. README + scripts npm.
5. QA gates + ADR-010 + commit.

## QA

- `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build`.
- Smoke verde contra API local.
- Load curto gera métricas/logs/traces no Grafana `:3001`.

## Riscos

- Mailtrap flood (sign-up/sign-in/forgot) — esperado em dev.
- `http_req_failed` com 4xx intencionais → `expectedResponse: false` (validar no smoke).
- Database growth (usuários/sessões/tokens) — limpar quando necessário.
