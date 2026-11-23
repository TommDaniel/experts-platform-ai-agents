# ADR-009: Observabilidade da API — OpenTelemetry (logs, métricas e traces) → Grafana LGTM

- **Status:** aceito
- **Data:** 2026-08-12
- **Decisão load-bearing:** instrumentar a API (NestJS) com um único SDK OpenTelemetry exportando os três pilares via OTLP para a stack LGTM local (`docker-compose.yml`).

## Contexto

O `docker-compose.yml` já subia a stack LGTM (Loki :3100, Grafana :3001, Tempo :3200/4317/4318, Mimir :9009) com datasources provisionados, mas **nenhuma aplicação enviava dados**: o Grafana abria vazio mesmo após fluxos completos de sign-up. A API só usava o `Logger` do NestJS (console) e não tinha métricas nem traces. O desenvolvimento.md pedia "O11y desde o dia zero", mas a integração nunca tinha sido feita.

## Decisões

### 1. Um único SDK OpenTelemetry (NodeSDK) cobre os três pilares via OTLP HTTP

Em vez de ferramentas por pilar (ex.: `prom-client` + Promtail + um Tracer avulso), um `NodeSDK` registra, num ponto só, os três pipelines:

- **Traces** → `OTLPTraceExporter` → `http://localhost:4318/v1/traces` (Tempo).
- **Métricas** → `PeriodicExportingMetricReader` (intervalo de 10s) + `OTLPMetricExporter` → `http://localhost:9009/otlp/v1/metrics` (Mimir).
- **Logs** → `BatchLogRecordProcessor` + `OTLPLogExporter` → `http://localhost:3100/otlp/v1/logs` (Loki).

Bootstrap em `src/observability/observability.ts`, importado como **primeiro** import de `main.ts` (side effect), garantindo que as instrumentações (`http`, `express`, `nestjs-core`) sejam registradas antes de `@nestjs/core`/express carregarem. Desligável com `OTEL_ENABLED=false` (testes não importam `main.ts`, então não vazam para o Vitest). Endpoints configuráveis por env (`OTEL_*_ENDPOINT`).

### 2. Métricas HTTP por middleware (não interceptor)

Métricas `http.server.request.count` + `http.server.request.duration` com atributos `http.request.method`, `http.route` e `http.response.status_code`. Implementadas como **middleware** (`res.on("finish")`), não interceptor: interceptors rodam **depois** dos guards no NestJS, então requests rejeitados (401) ficariam de fora; o middleware roda antes de tudo e conta 100% do tráfego.

### 3. `ObservabilityLogger` (LoggerService) roteia os logs do NestJS para o Loki mantendo o console

`app.useLogger(new ObservabilityLogger())` captura todos os logs do framework e dos serviços. Cada `emit` também correlaciona **trace context**: quando há span ativo e amostrado, o LogRecord carrega o `Context` ativo, e o SDK extrai `trace_id`/`span_id` — permitindo saltar do log no Loki para o trace no Tempo/Grafana.

### 4. Métrica de negócio no sign-up

`auth.signup.count` com atributo `result ∈ {success, duplicate, email_failure}` no `SignUpService`, demonstrando métricas de domínio além das de infra. Nos testes, sem `MeterProvider` registrado o `@opentelemetry/api` devolve objetos no-op — specs existentes seguem passando sem alteração.

### 5. Correção de infra: receivers OTLP do Tempo escutavam só em `127.0.0.1`

O Tempo 2.9.4 ligou os receivers OTLP (`grpc`/`http`) em `127.0.0.1:4317/4318` **dentro do container** — o mapeamento de porta nunca entregava os dados e o export dava `socket hang up`. Corrigido em `docker/tempo/tempo.yaml` com `endpoint: 0.0.0.0:4317` e `0.0.0.0:4318`.

## Consequências

- O Grafana (`:3001`) passa a exibir dados: métricas no Mimir (Explore/datasource Prometheus), logs no Loki (`{service_name="api"}`) e traces no Tempo.
- O `Logger` do NestJS continua imprimindo no console (formato `ISO timestamp LEVEL [context] message`), só que agora também vai para o Loki.
- Build/start da API ganha um pouco de overhead de bootstrap do SDK (desprezível em dev); `OTEL_ENABLED=false` desliga tudo.
- Endpoints de env: `OTEL_ENABLED`, `OTEL_SERVICE_NAME`, `OTEL_TRACES_ENDPOINT`, `OTEL_METRICS_ENDPOINT`, `OTEL_LOGS_ENDPOINT`.
- Deps novas em `apps/api`: pacotes `@opentelemetry/*` (api, sdk-node, exporters, instrumentations, resources, semantic-conventions).
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando.

## Passos manuais de QA

1. `bun run infra:up` (sobe LGTM) e `bun run dev` (API em :3000 com a instrumentação).
2. Gerar tráfego: `curl localhost:3000/api/v1` e um `POST /api/v1/auth/sign-up` com email novo.
3. Métricas: em Grafana `:3001` (Mimir/Prometheus) consultar `http_server_request_count` e `auth_signup_count`.
4. Logs: em Grafana (Loki) consultar `{service_name="api"}`; abrir um log de sign-up e seguir o `trace_id` para o Tempo.
5. Traces: em Grafana (Tempo) `service.name=api` deve listar `POST /api/v1/auth/sign-up`; abrir o trace para ver os spans (http → controller → service).
6. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build`.
