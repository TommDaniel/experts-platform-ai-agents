# Teste de carga e massa de dados (k6)

Estressa todos os endpoints da API (`apps/api`, base `/api/v1`) via **k6 v2.2.0** rodando em Docker one-shot — sem instalar binário e sem entrar no `docker-compose.yml` principal.

## Pré-requisitos

1. Infra e API de pé:
   ```sh
   bun run infra:up   # Postgres local + LGTM (Grafana em :3001)
   bun run db:migrate
   bun run dev        # API em http://localhost:3000/api/v1
   ```
2. Docker disponível.

## Como rodar

```sh
bun run load:seed     # cria usuários confirmados para os fluxos autenticados (idempotente)
bun run load:smoke    # valida os 9 endpoints em ~10s (1 VU, 1 iteração)
bun run load:test     # perfil ramping: 50 VUs, ramp 1m, hold 5m, ramp-down 30s
bun run load:clean    # apaga usuários @coders.local criados pelo load (cascade) — antes de rodar os testes
```

> **Dados residuais:** o load escreve de verdade no banco local (usuários, sessions, tokens de reset ativos). Isso quebra testes de integração que assumem tabelas limpas (ex.: `forgot-password.service.spec.ts` conta tokens ativos da tabela inteira). Rode `bun run load:clean` antes de `bun run test`.

O k6 acessa a API via `http://host.docker.internal:3000/api/v1` (padrão). Em Docker Desktop (macOS/Windows) funciona direto. Em Linux, use:

```sh
docker run --rm -i --add-host host.docker.internal:host-gateway \
  -v "$(pwd)/load:/load" grafana/k6:2.2.0 run /load/load.js
```

## Endpoints cobertos

| Método | Rota                           | Cenário (k6)    | Fluxo esperado                                    |
| ------ | ------------------------------ | --------------- | ------------------------------------------------- |
| GET    | `/api/v1`                      | hello           | sign-in (usuário dedicado) + GET com Bearer → 200 |
| GET    | `/api/v1/auth`                 | health          | → 200                                             |
| POST   | `/api/v1/auth/sign-up`         | sign_up         | email único por iteração → 201                    |
| POST   | `/api/v1/auth/sign-in`         | sign_in         | usuário seed → 200 + token                        |
| GET    | `/api/v1/auth/me`              | me              | sign-in + GET com Bearer → 200                    |
| POST   | `/api/v1/auth/logout`          | logout          | sign-in + logout → 200                            |
| POST   | `/api/v1/auth/confirm-account` | confirm_account | token inválido (error-path) → 400                 |
| POST   | `/api/v1/auth/forgot-password` | forgot_password | email do seed → 202                               |
| POST   | `/api/v1/auth/reset-password`  | reset_password  | token inválido (error-path) → 400                 |

- `confirm-account` e `reset-password` exigem token real do banco (vai por email); o happy path fica de fora — o k6 cobre o error-path (400), que já gera traces/logs/métricas.
- Autenticação: 4 usuários confirmados seedados (`load.user@`, `load.me@`, `load.hello@`, `load.logout@coders.local`), um por cenário, porque o `createSession` adota "last wins" (revoga sessões anteriores do mesmo usuário).
- `GET /api/v1` exige Bearer (guarda global), então o cenário hello faz sign-in antes.

## Variáveis de ambiente (override)

| Env                  | Default                                   | Descrição                            |
| -------------------- | ----------------------------------------- | ------------------------------------ |
| `API_URL`            | `http://host.docker.internal:3000/api/v1` | Base da API                          |
| `LOAD_VUS`           | `50`                                      | VUs dos cenários (exceto sign_up)    |
| `LOAD_SIGNUP_VUS`    | `5`                                       | VUs do cenário sign_up (email-bound) |
| `LOAD_RAMP_UP`       | `1m`                                      | Duração do ramp-up                   |
| `LOAD_HOLD`          | `5m`                                      | Duração da carga sustentada          |
| `LOAD_RAMP_DOWN`     | `30s`                                     | Duração do ramp-down                 |
| `LOAD_SLEEP_MS`      | `200`                                     | Sleep por iteração (ms)              |
| `LOAD_P95_MS`        | `5000`                                    | Threshold de p95 de duração (ms)     |
| `LOAD_SEED_PASSWORD` | `k6Password!2026`                         | Senha dos usuários seed              |

Ex.: `LOAD_VUS=100 LOAD_HOLD=10m bun run load:test`.

## O que observar no Grafana (`:3001`)

- **Métricas (Mimir/Prometheus):** `http_server_request_count` e `http_server_request_duration` com labels `http_request_method`, `http_route`, `http_response_status_code`; `auth_signup_count` com `result ∈ {success, duplicate, email_failure}`.
- **Logs (Loki):** `{service_name="api"}`; seguir `trace_id` para o Tempo.
- **Traces (Tempo):** `service.name=api` → spans http → controller → service.

## Achados conhecidos (email-bound)

`sign-up`, `sign-in` e `forgot-password` enviam email **síncrono** no request (Mailtrap). O transporte SMTP não sustenta concorrência no sandbox gratuito:

- `sign-in` e `forgot-password` são **tolerantes**: logam warning e seguem (200/202).
- `sign-up` é **fail-fast**: falha de email → 500 + rollback do usuário (by design).

Por isso o threshold de `sign_up` não existe (o k6 só muda o exit code por threshold, não por check): o sinal do gargalo fica no **check** `sign-up -> 201` (aparece ✗ no resumo) e na métrica `auth_signup_count{result="email_failure"}` no Grafana. Os demais cenários são estritos (`{class:success}` rate<0.01). Aumente `LOAD_SIGNUP_VUS` para reproduzir o gargalo com mais intensidade.

> k6 2.2.0: sub-metrics não combinam `expected_response` com tags custom nem suportam negação (`!/regex/`) — por isso as partições usam a tag custom positiva `class`.

## Arquivos

- `load/smoke.js` — smoke (validação rápida, checks estritos).
- `load/load.js` — carga (9 cenários ramping, thresholds).
- `load/common.js` — base URL, payloads, usuários por cenário.
- `apps/api/scripts/load-seed.mjs` — seed de usuários confirmados (idempotente).
- `apps/api/scripts/load-clean.mjs` — remove usuários `@coders.local` criados pelo load (sessions/tokens por cascade).
