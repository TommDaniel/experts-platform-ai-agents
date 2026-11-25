# Runbooks

Passo a passo para investigar e agir nos fluxos críticos. Todos usam o stack local LGTM:

- Grafana: `http://localhost:3001`
- Loki: `http://localhost:3100`
- Mimir/Prometheus: `http://localhost:9009/prometheus`
- Tempo: `http://localhost:3200`

Regras gerais:

- Sempre use uma janela de tempo e um limite (`limit`) nas consultas.
- Logs do Loki usam **structured metadata**: filtre por `| severity_text="ERROR"` ou `| context="ChatService"`, não por `|= "ERROR"`.
- Não cole e-mail, token ou corpo de mensagem em ticket/chat. Use `conversationId`, `userId` e `trace_id`.
- O Grafana local agora exige login (`admin` + `GRAFANA_ADMIN_PASSWORD`, padrão `admin`). O MCP usa a service account.

## Índice

| Cenário                           | Runbook                            |
| --------------------------------- | ---------------------------------- |
| Chat sem resposta ou SSE com erro | [chat-sse.md](chat-sse.md)         |
| API retornando 5xx                | [api-5xx.md](api-5xx.md)           |
| Latência alta                     | [latency.md](latency.md)           |
| Serviço fora do ar                | [service-down.md](service-down.md) |
| Ingestão falhando                 | [ingestion.md](ingestion.md)       |

## Queries rápidas

```logql
{service_name="api"} | severity_text="ERROR"
{service_name="api"} | severity_text="WARN"
{service_name="api"} | context="ChatService"
{service_name="api"} | context="HTTP"
```

```promql
sum by (http_route, http_response_status_code) (http_server_request_count)
histogram_quantile(0.95, sum by (le, http_route) (rate(http_server_request_duration_bucket[5m])))
sum by (result, reason) (chat_message_count)
sum by (result) (auth_signup_count)
```
