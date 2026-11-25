# Runbook — ingestão falhando

> **Lacuna conhecida:** a ingestão ainda não tem métrica de sucesso/falha. Hoje a investigação depende do log e do estado da `source` no banco.

## 1. Logs

```logql
{service_name="api"} | context="IngestionService"
{service_name="api"} | severity_text="ERROR"
```

O log de sucesso é `Indexed <n> chunks for source <id>`. A ausência dele para uma `source` em processamento indica travamento.

## 2. Dependências

- Weaviate: `curl -s http://localhost:8080/v1/.well-known/ready`
- OpenAI/Gemini: confira a chave e o erro no log (`provider_auth`, `429`, `timeout`).
- Postgres: `db.query.*` no Mimir.

## 3. Estado da source

Consulte a tabela `sources` (Drizzle/Postgres) e verifique `status`, `updated_at` e o último erro. Uma `source` presa em `processing` sem log novo é sinal de worker travado.

## 4. Ações

1. Se Weaviate estiver fora, suba o container e reprocesse a `source`.
2. Se a chave do provedor estiver inválida, corrija e reprocesse.
3. Se o processo morreu, reinicie a API e reenfileire a ingestão.
4. **Antes de considerar o fluxo observável**, implemente `ingestion.count{result}` e `ingestion.duration` e um alerta para `result="failed"`.

## Critério de saída

- Log `Indexed ... chunks` para a `source`.
- `status` final consistente no banco.
- Nenhum erro novo no Loki para `IngestionService`.
