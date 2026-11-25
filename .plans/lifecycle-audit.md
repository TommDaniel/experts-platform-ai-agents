# Auditoria do ciclo de vida — 2026-11-24

**Escopo:** fluxos `auth` e `chat` (checklists A–D)
**Grafana:** conectado — `http://localhost:3001` (v13.0.6), service account `sa-1-opencode-mcp`, datasources **Loki**, **Mimir** (default) e **Tempo** com health `OK` (3/3)
**Janela analisada:** `2026-11-24T21:30:00Z` → `2026-11-24T22:00:00Z` (UTC)
**Resumo executivo:** a telemetria existe e correlaciona bem no caminho de erro do `auth` (trace ↔ log ↔ métrica). O fluxo de `chat`, porém, falha de forma **invisível**: responde `201`, emite `event: error` no SSE, termina o trace com status `unset`, não gera log e não incrementa nenhum contador de erro. Além disso, a métrica de latência HTTP está **duplicada com unidades diferentes** (ms e s), o que torna o p95 inválido. Não há dashboards, alertas, contact points, runbooks nem instrumentação do LangGraph.
**Placar:** P0 1 · P1 6 · P2 7 · P3 2

## Retrato da observabilidade

| Item                | Estado em 2026-11-24                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Datasources         | Loki (`P8E80F9AEF21F6940`), Mimir (`PAE45454D0EDB9216`, default), Tempo (`P214B5B846CF3925F`) — todos `OK`                            |
| Dashboards          | **0** no snapshot (`search_dashboards` → `total: 0`); **1** criado após aprovação (`API — visão geral`, uid `api-overview`)           |
| Regras de alerta    | **0** no snapshot (`/api/v1/provisioning/alert-rules` → `[]`); **1** criada após aprovação (`API 5xx rate > 5%`)                      |
| Contact points      | **0** no snapshot (`/api/v1/provisioning/contact-points` → `[]`); **1** criado após aprovação (`lifecycle-audit`, e-mail placeholder) |
| Incidentes / OnCall | plugin não instalado (`list_incidents` e `list_oncall_schedules` → HTTP 404)                                                          |
| Logs (Loki)         | 52 linhas em 30 min; labels: `service_name`, `service_instance_id`, `deployment_environment_name`; o resto é **structured metadata**  |
| Métricas (Mimir)    | `http.server.request.count`, `http.server.request.duration`, `db.query.count`, `db.query.duration`, `auth.signup.count`               |
| Traces (Tempo)      | API instrumentada (HTTP → Express → Nest → Postgres); **sem spans do `agents`/LangGraph**                                             |
| Docs                | `.docs/` com 8 arquivos, `.specs/` com 15 specs, `.adrs/` sem índice; **sem runbooks** e **sem OpenAPI/Swagger**                      |
| Infra local         | `postgres`, `mimir`, `loki`, `tempo`, `grafana`, `weaviate`, `agents`; API/app rodando fora do compose                                |

### Evidência de tráfego real (30 min)

Contadores acumulados desde o start do processo (`http_server_request_count`):

| Rota                                      | Método | Status  | Qtd |
| ----------------------------------------- | ------ | ------- | --- |
| `/api/v1/auth/sign-in`                    | POST   | 200     | 3   |
| `/api/v1/auth/sign-in`                    | POST   | 401     | 1   |
| `/api/v1/auth/sign-up`                    | POST   | **500** | 1   |
| `/api/v1/auth/confirm-account`            | POST   | 400     | 1   |
| `/api/v1/auth/reset-password`             | POST   | 400     | 1   |
| `/api/v1/auth/forgot-password`            | POST   | 202     | 1   |
| `/api/v1/chat/conversations`              | POST   | 201     | 1   |
| `/api/v1/chat/conversations/:id/messages` | POST   | **201** | 1   |
| `/api/v1/rota-inexistente`                | GET    | 404     | 1   |

- `auth.signup.count{result="email_failure"}` = **1** — a métrica de negócio funciona.
- `db.query.count`: 14 `select`, 8 `insert`, 6 `update`, 5 `begin`, 1 `delete`; p95 de 4,75 ms.
- Loki: **1 ERROR** (`SignUpService`) e **4 WARN** (`SignInService` 3, `ForgotPasswordService` 1).

## Achados

### [P0] Falha do chat é invisível: `201` + trace `unset` + zero log + zero métrica de erro

- **Área:** pós-produção / debug
- **Evidência:**
  - `POST /api/v1/chat/conversations/:id/messages` respondeu **201** e o corpo SSE foi `event: error` com `{"message":"Missing credentials..."}`.
  - Métrica: `http_server_request_count{http_route="/api/v1/chat/conversations/:id/messages",http_response_status_code="201"}` = **1**; nenhum 5xx.
  - Trace `39986524025e186a7bfd2c80d5422b59`: 98,81 ms, raiz `POST /api/v1/chat/conversations/:id/messages` com `status: unset`; `ChatController.stream` e `stream` também `unset`.
  - Loki `{service_name="api"} | context=~"Chat.*"` → **0 linhas**; não há log do erro.
  - `apps/api/src/modules/chat/chat.service.ts:140-146` captura o erro, emite `{ type: "error" }` no SSE e não registra log nem marca o span.
- **Risco:** o fluxo central do produto pode falhar 100% das vezes e o dashboard/alerta continuar “verde”. É o pior tipo de cegueira: erro de negócio com aparência de sucesso.
- **Correção sugerida:** no `catch` do stream, (1) `logger.error` com `conversationId`, `userId` e `reason`; (2) `span.recordException(err)` + `span.setStatus({ code: ERROR })`; (3) contador `chat.message.failed{reason}` e histograma de duração do stream; (4) opcional: status HTTP 200 é inevitável depois do header, mas o evento SSE deve carregar um `code` estável para métrica.
- **Esforço:** baixo

### [P1] `http.server.request.duration` duplicada (ms e s) — p95 inválido

- **Área:** pós-produção
- **Evidência:** o middleware em `apps/api/src/observability/http-metrics.middleware.ts:15-18` cria o histograma com `unit: "ms"`, enquanto `new HttpInstrumentation()` em `observability.ts:64` já emite o mesmo nome em **segundos** (semconv). Em Mimir convivem buckets `0.005 … 10` e `25 … 10000` para a mesma métrica.
  - `histogram_quantile(0.95, …{http_route="/api/v1/auth/sign-in"})` = **10000** (10 s), enquanto o k6 mediu p95 ≈ **1,76 s**.
  - `http_server_request_duration_bucket{route="/api/v1/auth/sign-in",le="+Inf"}` = **8**, mas só houve **3** sign-ins — confirma a dupla contagem.
- **Risco:** qualquer alerta de latência baseado nesse p95 vai disparar (ou nunca disparar) por artefato, não por comportamento real.
- **Correção sugerida:** manter **uma** fonte. Opção A: remover o histograma do middleware e usar só o da `HttpInstrumentation` (segundos, semconv). Opção B: desabilitar a métrica da instrumentação e manter a do middleware, renomeando para `http.server.request.duration.ms` e ajustando os buckets para exponenciais. Padronizar unidade em **segundos** é o mais aderente ao semconv.
- **Esforço:** baixo

### [P1] Não existe log de acesso/requisição

- **Área:** pós-produção / debug
- **Evidência:** em 30 min, Loki tem 52 linhas e **nenhuma** de request. Os `context` existentes são apenas `InstanceLoader`, `NestApplication`, `NestFactory`, `RouterExplorer`, `RoutesResolver`, `SignUpService`, `SignInService` e `ForgotPasswordService`. O 404 em `/api/v1/rota-inexistente`, o 401 de sign-in e o 500 de sign-up **não aparecem em log**.
- **Risco:** investigar “quem chamou o quê e quando” exige cruzar métrica + trace; sem `requestId`/`userId` no log, fica impossível responder “o que aconteceu nesta requisição” só com Loki.
- **Correção sugerida:** middleware de acesso emitindo `method`, `route`, `status`, `duration_ms`, `trace_id`, `user_id` (quando autenticado) e `request_id`; **sem** e-mail, token ou corpo. Nível `warn` para 5xx, `info` para o resto.
- **Esforço:** baixo

### [P1] Zero dashboards, zero alertas e zero contact points (parcialmente corrigido nesta sessão)

- **Área:** pós-produção
- **Evidência:** `search_dashboards` → `total: 0`; provisioning de alert rules → `[]`; contact points → `[]`; `docker/grafana/` contém apenas `datasources/lgtm.yaml`.
- **Status:** dashboard `API — visão geral` e regra `API 5xx rate > 5%` criados após aprovação (ver “Recursos criados nesta sessão”). A regra **disparou** com o 500 controlado; a notificação falhou porque o SMTP não está configurado.
- **Risco:** não há SLO operacional nem caminho de notificação. Um 5xx sustentado ou uma queda de throughput passa despercebido até o usuário reclamar.
- **Correção sugerida:** configurar SMTP e validar a notificação; depois evoluir o dashboard com erro por rota e top erros do Loki. O `.docs/ARCHITECTURE.md:142` já declara isso como `[planejado]`; falta executar.
- **Esforço:** médio

### [P1] Sem runbooks para os fluxos críticos

- **Área:** documentação / manutenção
- **Evidência:** `find . -iname '*runbook*'` → nenhum arquivo; `.docs/` não tem seção de runbook; `.docs/ARCHITECTURE.md` só descreve a stack. Os cenários do checklist D (API 5xx, latência, SSE travado, ingestão, login, serviço fora) não têm passo a passo.
- **Risco:** cada incidente vira arqueologia; o conhecimento fica só em quem implementou.
- **Correção sugerida:** adotar os runbooks propostos abaixo em `.docs/runbooks/` e linkar no README. Começar por `chat-sse`, `api-5xx` e `latency`.
- **Esforço:** baixo

### [P1] `agents`/LangGraph sem OTel e sem chave no container — chat sempre falha e o trace termina na API

- **Área:** pós-produção
- **Evidência:**
  - `docker-compose.yml` (serviço `agents`) não passa nenhuma variável `OTEL_*`; `grep -rn OTEL apps/agents` → nada.
  - `docker exec cu-agents printenv OPENAI_API_KEY` → vazio.
  - O compose interpola `${OPENAI_API_KEY:-}` a partir do `.env` da raiz, que **não existe**; as chaves estão em `.env.local` e `apps/api/.env` (e são placeholders).
  - Trace do chat termina em `POST /api/v1/chat/conversations/:id/messages`; não há span de `/runs/stream`, LLM ou ferramenta.
- **Risco:** o chat não funciona no ambiente local e, quando falhar em produção, o trace não atravessa a fronteira da API — impossível saber se o problema é API, LangGraph, OpenAI ou ferramenta.
- **Correção sugerida:** (1) `env_file: .env.local` no serviço `agents` (ou `docker compose --env-file .env.local up -d`); (2) inicializar OTel no `apps/agents` com o mesmo `OTEL_*` e propagar `traceparent` no `fetch` do `AgentsClient`; (3) confirmar se a chave placeholder é intencional.
- **Esforço:** médio

### [P1] Grafana com admin anônimo e senha padrão

- **Área:** manutenção / segurança
- **Evidência:** `docker-compose.yml` define `GF_AUTH_ANONYMOUS_ENABLED: "true"`, `GF_AUTH_ANONYMOUS_ORG_ROLE: "Admin"`, `GF_SECURITY_ADMIN_PASSWORD: "admin"` e publica `3001:3000` em todas as interfaces.
- **Risco:** qualquer pessoa na rede local tem poder de admin no Grafana (criar/apagar dashboard, ler datasources, alterar alertas). Em uma máquina compartilhada ou exposta, é comprometimento direto.
- **Correção sugerida:** desabilitar anônimo, usar a service account para o MCP, trocar a senha do admin e publicar em `127.0.0.1:3001:3000`. Manter a configuração insegura só se o compose for explicitamente “dev-only” e documentado.
- **Esforço:** baixo

### [P2] PII nos logs: e-mails de usuário em `ERROR`/`WARN`

- **Área:** pós-produção / privacidade
- **Evidência:** as linhas de `SignUpService` e `SignInService` incluem o e-mail completo do usuário na mensagem (ex.: `Failed to send ... to <email>`). Os logs vão para Loki sem scrub.
- **Risco:** exposição de dado pessoal no stack de observabilidade, com retenção indefinida.
- **Correção sugerida:** mascarar (`l***@dominio`) ou logar apenas `userId`/hash; manter o e-mail fora de labels e de mensagens.
- **Esforço:** baixo

### [P2] Nenhum SLO escrito

- **Área:** pós-produção
- **Evidência:** não há meta de latência/disponibilidade em `.docs/` nem em dashboard. O k6 tem threshold `p(95)<5000`, mas isso é teste de carga, não SLO operacional.
- **Correção sugerida:** definir SLO de disponibilidade (ex.: 99,5% em 30 dias) e latência (p95 < 500 ms para auth; p95 < 2 s para chat) e ligar aos alertas.
- **Esforço:** baixo

### [P2] Sem processo de incidente (Grafana Incident/OnCall ausente)

- **Área:** pós-produção
- **Evidência:** `list_incidents` → 404 “Plugin not found”; `list_oncall_schedules` → 404 no settings API.
- **Risco:** não há dono, severidade, comunicação nem postmortem definidos.
- **Correção sugerida:** documentar o processo mínimo (quem abre, canais, severidade, postmortem) e, se for usar o Grafana, instalar/configurar os plugins.
- **Esforço:** médio

### [P2] SMTP síncrono no caminho de `sign-in`/`sign-up`

- **Área:** manutenção / performance
- **Evidência:** `sign-in.service.ts:44-50` envia e-mail de nova sessão dentro do request e engole a falha com `warn`; `sign-up.service.ts:67-81` envia confirmação dentro do request e, se falhar, apaga o usuário e retorna 500. O trace de sign-up tem **1.548 ms** no handler e o k6 mediu p95 ≈ 1,76 s.
- **Risco:** indisponibilidade do SMTP vira latência (sign-in) ou bloqueio de cadastro (sign-up); o usuário fica sem feedback útil.
- **Correção sugerida:** mover envio para fila/outbox com retry; no sign-up, considerar criar a conta e reenviar confirmação em vez de rollback (decisão de produto).
- **Esforço:** médio

### [P2] Sem OpenAPI/Swagger

- **Área:** documentação
- **Evidência:** `find . -iname '*openapi*' -o -iname '*swagger*'` → nada; a API só é descobrível pelo código.
- **Correção sugerida:** gerar OpenAPI a partir dos DTOs/controllers e publicar em `/api/docs` (ou artifact no CI).
- **Esforço:** médio

### [P2] Sem backup/restore de Postgres e Weaviate

- **Área:** manutenção
- **Evidência:** nenhum script `pg_dump`/restore no `package.json` ou compose; volumes nomeados sem rotina.
- **Correção sugerida:** documentar e testar um restore local; em produção, definir RPO/RTO e automatizar.
- **Esforço:** médio

### [P2] Métricas de negócio cobrem só sign-up

- **Área:** pós-produção
- **Evidência:** `createCounter`/`createHistogram` existem apenas para `auth.signup.count`, HTTP e DB. Não há contador de mensagens de chat, runs concluídas/falhas, tokens/custo de LLM nem ingestão (sucesso/falha/duração).
- **Correção sugerida:** adicionar `chat.message.count{result}`, `chat.run.duration`, `llm.tokens{model}` e `ingestion.count{result}`; são os sinais que respondem “o produto está funcionando?”.
- **Esforço:** médio

### [P2] Weaviate com acesso anônimo

- **Área:** manutenção / segurança
- **Evidência:** `AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: "true"` no compose, porta `8080` publicada.
- **Correção sugerida:** habilitar API key/OIDC e restringir a porta ao host local.
- **Esforço:** baixo

### [P3] Link “open in Grafana” do MCP aponta para a porta errada

- **Área:** polimento
- **Evidência:** `get_tempo_trace` devolve `grafanaUrl` com `http://localhost:3000/explore?...`, mas o Grafana deste stack está em `:3001`.
- **Correção sugerida:** ajustar a base URL do MCP/`GRAFANA_URL` ou o campo de link; validar com um trace real.
- **Esforço:** baixo

### [P3] `.adrs/` sem índice e `.env.example` sem instrução do `.secrets/`

- **Área:** documentação
- **Evidência:** `.adrs/` tem arquivos, mas nenhum `README`/`index`; o `opencode.json` usa `{file:./.secrets/grafana-token}`, e o `.env.example` só traz o placeholder `GRAFANA_SERVICE_ACCOUNT_TOKEN=your-...`.
- **Correção sugerida:** criar `.adrs/README.md` com índice e documentar no README/`.docs/DEVELOPMENT.md` como gerar o token e onde colocá-lo (`.secrets/`, gitignored).
- **Esforço:** baixo

## Investigação

### Chat SSE retorna erro e “parece sucesso”

- **Sintoma:** `POST /api/v1/chat/conversations/:id/messages` responde `201`; o cliente recebe `event: error` com “Missing credentials”.
- **Janela:** `2026-11-24T21:57:00Z` → `2026-11-24T21:58:00Z`.
- **Evidência coletada:**
  1. **Logs:** `query_loki_logs` com `{service_name="api"} | context=~"Chat.*"` → 0 linhas; não há registro do erro.
  2. **Trace:** `get_tempo_trace` em `39986524025e186a7bfd2c80d5422b59` → 98,81 ms; todos os spans do caminho de chat com `status: unset`; nenhum span de `agents`/LLM.
  3. **Métrica:** `http_server_request_count{http_route="/api/v1/chat/conversations/:id/messages",http_response_status_code="201"}` = 1; nenhum 5xx.
  4. **Código:** `chat.service.ts:140-146` emite o evento de erro no SSE sem log/status; `chat.controller.ts:42-47` já enviou o header 201.
  5. **Causa do erro:** o `AgentsClient` chama `AGENTS_URL` (`http://localhost:2024`); o container `cu-agents` está sem `OPENAI_API_KEY` (o compose lê `.env` da raiz, que não existe; as chaves estão em `.env.local`/`apps/api/.env` e são placeholders).
- **Causa provável:** combinação de configuração ausente no container `agents` + tratamento de erro do SSE que não instrumenta.
- **Confiança:** alta para a causa da falha (credencial ausente); alta para a cegueira (log/trace/métrica comprovados).
- **Próximo passo:** corrigir a instrumentação do `catch` e o wiring de env; reproduzir com uma chave válida e confirmar `chat.message.count{result="error"}` + span com status `error`.

### Sign-up 500 por falha de SMTP (correlação completa)

- **Sintoma:** `POST /api/v1/auth/sign-up` → 500.
- **Evidência:**
  - Log `ERROR` em `SignUpService` com `trace_id=ff7c4e33d0106654c134a1dcbfc4cf5d` e `span_id=7b0c53fe09870e55` (mensagem de falha de envio de confirmação).
  - Trace `ff7c4e33d0106654c134a1dcbfc4cf5d`: 1.549,66 ms; spans `signUp` e `SignUpController.signUp` com `status: error`; `db.query.delete` de compensação.
  - Métrica `auth.signup.count{result="email_failure"}` = 1.
  - `MAILTRAP_PASS` é placeholder → SMTP responde `535 5.7.0 Invalid credentials`.
- **Causa provável:** credencial de SMTP inválida/placeholder; o fluxo é fail-closed e remove o usuário criado.
- **Confiança:** alta.
- **Próximo passo:** configurar credencial válida do Mailtrap (ou desabilitar envio em dev) e decidir se o cadastro deve falhar ou seguir com reenvio assíncrono.

## Runbooks propostos

### Chat sem resposta / SSE com `event: error`

1. Confirme o sintoma: `POST /api/v1/chat/conversations/:id/messages` retorna 201? O corpo tem `event: error`?
2. Verifique o container `agents`: `docker compose ps agents` e `docker exec cu-agents printenv OPENAI_API_KEY` (apenas para saber se está vazio; não imprima o valor).
3. Cheque `AGENTS_URL` na API e a saúde do LangGraph: `curl -s http://localhost:2024/ok`.
4. Em Loki: `{service_name="api"} | context=~"Chat.*"` e `{service_name="api"} | severity_text="ERROR"` na janela.
5. Em Tempo: busque `{ resource.service.name = "api" && name =~ ".*messages.*" }` e abra o trace mais recente; se não houver span de `agents`, a fronteira não está instrumentada.
6. Em Mimir: `sum by (http_response_status_code) (http_server_request_count{http_route="/api/v1/chat/conversations/:id/messages"})` — se só houver 201, o erro está invisível.
7. Ação: reinicie `agents` com a env correta; se o erro for de credencial do provedor, escale para quem administra as chaves.
8. Critério de saída: trace com span de LLM, `chat.message.count{result="success"}` incrementando e SSE terminando com `event: end`.

### API retornando 5xx (ex.: sign-up)

1. Mimir: `sum by (http_route,http_response_status_code) (http_server_request_count)` — identifique a rota/status.
2. Loki: `{service_name="api"} | severity_text="ERROR"` na mesma janela; copie o `trace_id`.
3. Tempo: `get_tempo_trace` com o `trace_id`; procure o span com `status: error` e o `exception.message`.
4. Se for SMTP: valide `MAILTRAP_*` e a conectividade de saída; se for banco: veja `db.query.duration` e `db.query.count`.
5. Ação: corrigir a credencial/serviço; se o erro for de regra de negócio, ajustar o status HTTP e a mensagem.
6. Escale para o dono do fluxo (`auth`) se o 5xx passar de 1% por 5 min.

### Latência alta / p95 acima do SLO

1. **Não confie no p95 atual** até corrigir a duplicação de `http.server.request.duration` (achado P1).
2. Use `histogram_quantile(0.95, sum by (le,http_route) (rate(http_server_request_duration_bucket[5m])))` apenas depois de unificar a métrica.
3. Compare com o trace mais lento: `search_tempo_traces` por `duration > 1s` na janela.
4. Verifique `db.query.duration` por `db_operation_name` e o tempo de chamadas externas (SMTP/LLM).
5. Ação: se o gargalo for banco, ver índices/consultas; se for externo, timeout/retry/fila.

### Serviço fora do ar

1. `docker compose ps` e os healthchecks (`/api/health` do Grafana, `/ready` de Loki/Mimir/Tempo, `/ok` do agents).
2. `docker compose logs --tail=100 <serviço>`.
3. Verifique se a porta está ocupada (`ss -ltnp | grep :<porta>`) e se o container reiniciou.
4. Ação: `docker compose up -d <serviço>`; se persistir, colete o log e escale.

### Ingestão falhando (gap — sem telemetria dedicada)

1. Hoje só é possível ver o log `Indexed N chunks...` em `IngestionService`; não há métrica de sucesso/falha.
2. Até instrumentar, use `{service_name="api"} | context="IngestionService"` e o status da `source` no banco.
3. Ação: adicionar `ingestion.count{result}` e `ingestion.duration` antes de considerar o fluxo observável.

## O que já está bom

- OTel SDK da API está ativo e exporta logs, métricas e traces para Loki/Mimir/Tempo; a correlação `trace_id`/`span_id` nos logs funciona.
- O caminho de erro do `auth` é exemplar: 500 → log `ERROR` com `trace_id` → span `error` → métrica de negócio `auth.signup.count{result="email_failure"}`.
- `db.query.count`/`db.query.duration` dão visibilidade real do Postgres (p95 4,75 ms no período).
- A instrumentação de HTTP/Express/Nest gera spans úteis (middlewares, handler, DB) e o trace de sign-up mostra a transação e a compensação.
- `.env.example` cobre as variáveis de OTel e o token do Grafana; o token real está em `.secrets/` (gitignored) e não foi commitado.
- Docs e specs estão organizados (`.docs/`, `.specs/`, `.adrs/`) e o README tem os comandos principais.

## Recursos criados nesta sessão (após aprovação)

Criados via MCP em `2026-11-24T22:50Z`, no folder `API Observability` (`api-observability`):

- **Dashboard `API — visão geral`** (uid `api-overview`): 7 painéis — RPS por rota, taxa de 5xx, total de 5xx, p95 por rota (com aviso explícito do achado P1), p95 de query no Postgres, sign-up por resultado e notas da auditoria.
  - URL local: `http://localhost:3001/d/api-overview` (o link devolvido pelo MCP usa `:3000` — achado P3).
- **Regra de alerta `API 5xx rate > 5%`** (uid `bg5b5shzrrpc0b`, grupo `api-5xx`, folder `api-observability`):
  - Condição: `sum(rate(http_server_request_count{http_response_status_code=~"5.."}[5m])) / clamp_min(sum(rate(http_server_request_count[5m])), 0.001) > 0.05`.
  - `for: 1m`, `no_data_state: NoData`, `exec_err_state: Alerting`, labels `severity=critical`, `team=api`, `service=api`.
- **Contact point `lifecycle-audit`** (uid `bg5b5sbu7rx8ge`): tipo `email`, endereço placeholder `oncall@example.com`.
  - **Entrega não validada:** o Grafana local não tem SMTP configurado. Troque o endereço e configure SMTP antes de confiar na notificação.

**Validação:** `get_dashboard_by_uid` devolveu os 7 painéis; `alerting_rules_write` (`get`) devolveu a regra com `receiver: lifecycle-audit`; `alerting_manage_routing` devolveu o contact point. Um `POST /api/v1/auth/sign-up` controlado gerou 500 em 1,66 s (somado ao 500 do smoke test, a métrica ficou em 2) e a regra passou a **`firing`** às `22:52:20Z` (1 alerta). O envio falhou com `SMTP not configured, check your grafana.ini config file's [smtp] section` — a regra e o roteamento funcionam; falta apenas o transporte de e-mail.

## Remediação aplicada (2026-11-25)

Código e infra alterados depois da auditoria. `bun run types:check`, `bun run lint` (só warnings pré-existentes), `bun run test` (62/62 na API, 2/2 nos agentes) e `oxfmt --check` passaram.

| Achado                 | Correção aplicada                                                                                                                                                          | Evidência                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| P0 — chat invisível    | `chat.stream` span com `status: error` + `recordException`; `logger.error` com `reason` estável; `chat.message.count{result,reason}` e `chat.stream.duration` no `finally` | `apps/api/src/modules/chat/chat.service.ts`                                      |
| P1 — duração duplicada | histograma em ms removido do middleware; `http.server.request.duration` fica só com a `HttpInstrumentation` (segundos)                                                     | `apps/api/src/observability/http-metrics.middleware.ts`                          |
| P1 — sem log de acesso | middleware `HTTP` com `METHOD /route STATUS DURATIONms` (error ≥500, warn ≥400), sem PII                                                                                   | `apps/api/src/observability/access-log.middleware.ts` + `main.ts`                |
| P1 — agents sem OTel   | SDK Node com traces/métricas/logs para Tempo/Mimir/Loki, `HttpInstrumentation`, shutdown em SIGTERM; `traceparent` injetado no `AgentsClient`                              | `apps/agents/src/observability.ts`, `apps/agents/server.mjs`, `agents.client.ts` |
| P1 — env do agents     | compose usa `env_file: .env.local` (`required: false`) + `OTEL_*`; portas em loopback                                                                                      | `docker-compose.yml`                                                             |
| P1 — runbooks          | 5 runbooks + índice, ligados no README e em `.docs/OBSERVABILITY.md`                                                                                                       | `.docs/runbooks/`                                                                |
| P1/P2 — exposição      | Grafana sem admin anônimo, senha via `GRAFANA_ADMIN_PASSWORD`, portas `127.0.0.1` em todos os serviços                                                                     | `docker-compose.yml`                                                             |
| P2 — PII               | `maskEmail()` (`s***@example.com`) em sign-up, sign-in, forgot e reset                                                                                                     | `apps/api/src/modules/shared/logging/mask-email.ts`                              |
| P3 — ADRs e token      | índice em `.adrs/README.md`; token e MCP documentados em `.docs/OBSERVABILITY.md`                                                                                          | docs                                                                             |
| P2 — teste frágil      | spec de forgot-password não depende mais de tokens de execuções anteriores                                                                                                 | `forgot-password.service.spec.ts`                                                |

**Validação em runtime (2026-11-25):**

- **Chat (P0):** mensagem real via SSE retornou `event: error`; Loki registrou `Chat stream failed for conversation 2 (user 42): provider_auth`; Mimir registrou `chat_message_count{result="error",reason="provider_auth"}=1` e `chat_stream_duration_count` equivalente.
- **Trace distribuído:** o trace `2f47282a759765f0b94657c7effc9446` contém `chat.stream` com `STATUS_CODE_ERROR` **e** o span `POST /runs/stream` do serviço `agents` no mesmo trace — o `traceparent` foi propagado.
- **Agents OTel:** trace com `rootServiceName=agents` chegou ao Tempo após rebuild do container.
- **Log de acesso (P1):** `LOG [HTTP] GET /api/v1/auth 200 6ms` emitido pelo middleware `HTTP`.
- **PII (P2):** `Failed to send new-session email to l***@coders.local` — e-mail mascarado.
- **Grafana (P1):** anônimo `302` para login; token da service account `200` em `/api/user` e `/api/datasources`; `admin` autentica.
- **Rede:** todas as portas publicadas em `127.0.0.1` (confirmado com `ss -ltn`).
- **Healthchecks:** `loki`/`mimir` usam imagens distroless sem `wget`; os healthchecks quebrados foram removidos e o `/ready` é verificado no host.

**Ainda pendente:** SMTP (entrega do alerta), `OPENAI_API_KEY` real no `.env.local`, auth no Weaviate, backup/restore e OpenAPI. O runbook `chat-sse` cobre os dois primeiros.

## Próximos passos priorizados

1. ~~**Corrigir a cegueira do chat (P0)**~~ — feito; validar com chave de provedor real.
2. ~~**Unificar `http.server.request.duration` (P1)**~~ — feito; revalidar p95 após reiniciar a API.
3. ~~**Adicionar log de acesso (P1)**~~ — feito.
4. **Dashboard + alerta + contact point (P1):** criados; **falta configurar SMTP** e validar a entrega.
5. ~~**Instrumentar `agents`/LangGraph (P1)**~~ — código feito; falta rebuild/validação com chave válida.
6. ~~**Escrever os runbooks (P1)**~~ — feito em `.docs/runbooks/`.
7. ~~**Reduzir exposição (P1/P2)**~~ — feito no compose; falta habilitar auth no Weaviate (exige mudar o cliente) e recriar os containers.
8. **SLO e processo de incidente (P2):** e-mails mascarados; ainda faltam SLOs escritos e fluxo de incidente.
9. **Backup/restore e OpenAPI (P2):** pendente.
10. **Polimento (P3):** índice de ADRs e doc do token feitos; o link `:3000` do MCP continua limitação conhecida.

## Apêndice — queries usadas (reprodução)

> O MCP do Grafana usa `endTime`/`startTime` em RFC3339 ou relativo; para o Mimir, `endTime: "now"` retornou vazio nesta versão — use um timestamp explícito.

```logql
# erros e avisos (Loki usa structured metadata, não |= "ERROR")
{service_name="api"} | severity_text="ERROR"
{service_name="api"} | severity_text="WARN"
{service_name="api"} | context=~"Chat.*"
sum by (context,severity_text) (count_over_time({service_name="api"} [30m]))
```

```promql
sum by (http_route,http_response_status_code,http_request_method) (http_server_request_count)
histogram_quantile(0.95, sum by (le,http_route) (rate(http_server_request_duration_bucket[30m])))
sum by (result) (auth_signup_count)
sum by (db_operation_name,db_collection_name) (db_query_count)
histogram_quantile(0.95, sum by (le,db_operation_name) (rate(db_query_duration_bucket[30m])))
```

```text
Tempo: { resource.service.name = "api" && name =~ ".*messages.*" }
Tempo: { resource.service.name = "api" && status = error }
```

**Observação:** nenhum token, senha ou valor de `.env` foi incluído neste relatório; e-mails de usuário foram omitidos/mascarados.
