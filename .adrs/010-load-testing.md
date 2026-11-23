# ADR-010: Harness de teste de carga da API com k6 (Docker one-shot) + massa de dados

- **Status:** aceito
- **Data:** 2026-08-12
- **Decisão load-bearing:** estressar a API com **k6 v2.2.0 em Docker one-shot** (sem instalar binário, sem entrar no compose) com 3 arquivos JS (`smoke.js`/`load.js`/`common.js`), seed de usuários confirmados e cleanup, tudo orquestrado por scripts npm.

## Contexto

A stack de observabilidade (ADR-009) passou a receber logs, métricas e traces — mas para validar o pipeline de ponta a ponta e dar valor ao Grafana era preciso **gerar carga real** contra os endpoints da API (sign-up, sign-in, me, logout, forgot/reset/confirm password, hello, health). Não existia massa de dados: usuários confirmados precisam de `email_verified_at` no banco (impossível criar só por API com o Mailtrap do sandbox) e tokens de reset/confirmação só existem via fluxo real. Sem isso, os cenários autenticados e de erro (400) não tinham como rodar.

## Decisões

### 1. k6 via Docker one-shot (não instalado, não no compose)

`bun run load:smoke`/`load:test` rodam `docker run --rm grafana/k6:2.2.0` montando `./load:/load`. Zero binário local e o k6 não vira dependência de runtime da aplicação. A API é alcançada via `http://host.docker.internal:3000/api/v1` (Linux precisa de `--add-host host.docker.internal:host-gateway`).

### 2. Env vars passam do host para o container com `-e VAR` (sem valor)

O k6 lê `__ENV` de variáveis do processo dentro do container — o host não repassa o ambiente por padrão. Os scripts npm usam `-e LOAD_VUS -e LOAD_HOLD ...` (docker herda o valor do host quando `-e` vem sem `=valor`). Sem isso, `LOAD_VUS=3 bun run load:test` rodava o perfil default de 7min e parecia "travar".

### 3. Usuários seedados no banco (não via API)

`apps/api/scripts/load-seed.mjs` insere 4 usuários confirmados (`load.user@`, `load.me@`, `load.hello@`, `load.logout@coders.local`) com bcrypt pré-computado e `email_verified_at` no passado, idempotente por `ON CONFLICT (email) DO NOTHING`. Necessário porque o `createSession` adota "last wins" (revoga a sessão anterior do usuário) — cada cenário autenticado usa um usuário dedicado.

### 4. Particionamento por tag custom `class` (não `expected_response`)

O k6 2.2.0 não combina `expected_response` com tags custom em sub-metric nem suporta negação. Requests são rotulados com `class: success | signup | error-path`:

- `success` → endpoints que devem dar 2xx sob carga → threshold estrito `http_req_failed{class:success} rate<0.01`.
- `signup` → sem threshold (fail-fast quando o SMTP do sandbox não acompanha; ver "achados").
- `error-path` → 400 esperados (tokens inválidos), validados por check, sem impacto no exit code.

### 5. Threshold de sign-up removido → o sinal é o check + métrica de negócio

`http_req_failed{class:signup} rate<0.99` tripava quase sempre porque ~100% dos sign-ups falham sob carga concorrente (Mailtrap). Como o k6 só muda o exit code por threshold (não por check), o threshold foi removido: o gargalo fica visível no check `sign-up -> 201` (✗ no resumo) e em `auth.signup.count{result="email_failure"}` no Grafana, enquanto o run sai verde quando os cenários estritos passam.

### 6. Cleanup dos dados do load (`load:clean`)

O load escreve de verdade no banco local (usuários, sessions, tokens de reset ativos) e isso quebrava `forgot-password.service.spec.ts`, que conta tokens ativos da tabela inteira. `apps/api/scripts/load-clean.mjs` apaga usuários `@coders.local` (FKs com `onDelete: cascade` limpam sessions e tokens), e o `load/README.md` orienta rodar antes de `bun run test`.

## Consequências

**Positivas:**

- Os três pilares do ADR-009 recebem volume real: numa rodada de ~40s foram geradas dezenas de milhares de requests (`/api/v1/auth` 66k, `confirm-account` 65k, `reset-password` 65k, `sign-in` 7.7k, `sign-up` 325) + traces no Tempo (`service.name=api`).
- Caminho feliz de sign-in/me/logout/hello coberto; error-path de confirm/reset (400) gera traces/logs/métricas sem depender de email real.
- Reprodução de gargalo determinística via `LOAD_SIGNUP_VUS`.

**Negativas/custos:**

- Happy path de `confirm-account`/`reset-password` fica de fora (precisaria de token real do banco).
- Dados residuais do load exigem `load:clean` antes dos testes de integração.
- O gargalo de email (SMTP síncrono no request) domina o p95 do cenário sign-up — o p95 global `http_req_duration` é pensado para os cenários de sucesso.
