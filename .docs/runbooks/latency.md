# Runbook — latência alta

## 1. Confirme no Mimir

A métrica `http.server.request.duration` agora vem **apenas** da `HttpInstrumentation`, em **segundos** (buckets `0.005 … 10`). O histograma custom em milissegundos foi removido para não duplicar buckets.

```promql
histogram_quantile(0.95, sum by (le, http_route) (rate(http_server_request_duration_bucket[5m])))
histogram_quantile(0.95, sum by (le, db_operation_name) (rate(db_query_duration_bucket[5m])))
sum by (http_route) (rate(http_server_request_duration_sum[5m]))
  / sum by (http_route) (rate(http_server_request_duration_count[5m]))
```

Referências: auth p95 < 500 ms; chat (primeiro token) < 2 s.

## 2. Encontre o trace mais lento (Tempo)

```text
{ resource.service.name = "api" && duration > 1s }
```

Abra o trace e compare:

- tempo no handler (`request handler - /api/v1/...`);
- tempo em `db.query.*`;
- tempo na chamada ao `agents` (span HTTP cliente);
- tempo de e-mail/SMTP (quando aplicável).

## 3. Suspeitas comuns

| Suspeita           | Sinal                                            | Ação                                    |
| ------------------ | ------------------------------------------------ | --------------------------------------- |
| bcrypt no sign-in  | `auth/sign-in` p95 alto, `db.query.select` baixo | Avaliar custo do hash e cache de sessão |
| SMTP síncrono      | `SignInService` WARN + latência alta             | Mover envio para fila/outbox            |
| Query sem índice   | `db.query.duration` p95 alto                     | `EXPLAIN ANALYZE` e índice              |
| Provedor LLM lento | span do `agents` alto                            | Timeout/retry e modelo menor            |
| Carga              | RPS alto + p95 alto em todas as rotas            | Escalar/limitar e revisar pool          |

## 4. Ações

1. Se o gargalo for banco, corrija a query/índice e confirme o p95 de `db.query.duration`.
2. Se for SMTP, mova para assíncrono; até lá, considere timeout curto.
3. Se for LLM, aplique timeout e fallback; registre o modelo usado.

## Critério de saída

- p95 da rota dentro do SLO por 15 min.
- Trace lento com causa identificada e correção aplicada.
