# Runbook — API retornando 5xx

## 1. Meça o impacto (Mimir)

```promql
sum by (http_route, http_response_status_code) (http_server_request_count)
100 * sum(rate(http_server_request_count{http_response_status_code=~"5.."}[5m]))
  / clamp_min(sum(rate(http_server_request_count[5m])), 0.001)
```

A regra `API 5xx rate > 5%` dispara quando a taxa passa de 5% por 1 min. O contact point `lifecycle-audit` é um e-mail placeholder; configure SMTP antes de confiar na notificação.

## 2. Encontre o erro (Loki)

```logql
{service_name="api"} | severity_text="ERROR"
{service_name="api"} | context="HTTP" | severity_text="ERROR"
```

O log de acesso traz `METHOD /route STATUS DURATIONms` e o `trace_id`. Copie o `trace_id` do 5xx.

## 3. Abra o trace (Tempo)

```text
{ resource.service.name = "api" && status = error }
```

No trace, procure o span com `status: error`, `exception.message` e a operação de banco (`db.query.*`) ou chamada externa correspondente.

## 4. Causas comuns

| Sintoma                                   | Verificação                                                                                     | Ação                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `Failed to send confirmation email` / 535 | `MAILTRAP_*` no `.env.local`; conectividade SMTP                                                | Corrigir credencial; decidir se o cadastro deve ser fail-closed |
| `db.query.*` lento/erro                   | `histogram_quantile(0.95, sum by (le, db_operation_name) (rate(db_query_duration_bucket[5m])))` | Ver pool, locks e índices                                       |
| `agents_unavailable`                      | `docker compose ps agents`, `/ok`                                                               | Subir/reiniciar `agents`                                        |
| Erro de validação virou 500               | Log `context` do serviço                                                                        | Corrigir o mapeamento para 4xx                                  |

## 5. Ações e escalação

1. Se for credencial/serviço externo, corrija e confirme a taxa de 5xx voltando a 0.
2. Se for banco, aplique rollback/mitigação e escale para o dono da API.
3. Se o 5xx passar de 1% por 5 min, trate como incidente e abra comunicação.

## Critério de saída

- Taxa de 5xx < 1% por 5 min.
- Nenhum `severity_text="ERROR"` novo no Loki para a rota.
- Trace de uma requisição de sucesso com todos os spans `ok`.
