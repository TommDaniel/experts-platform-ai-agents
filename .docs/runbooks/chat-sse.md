# Runbook — chat sem resposta / SSE com erro

## Sintomas

- O usuário envia uma mensagem e não recebe tokens, ou recebe `event: error` no SSE.
- `POST /api/v1/chat/conversations/:id/messages` pode continuar retornando **201** (o header já foi enviado).
- O trace pode terminar com `status: error` no span `chat.stream` e `chat.message.count{result="error"}` incrementa.

## 1. Confirme o sintoma

```bash
# troque <token> e <conversationId>
curl -sN -X POST "http://localhost:3000/api/v1/chat/conversations/<conversationId>/messages" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"content":"ping"}'
```

Procure `event: error` no corpo. O status HTTP sozinho não é confiável.

## 2. Verifique o serviço de agentes

```bash
docker compose ps agents
curl -s http://localhost:2024/ok
docker exec cu-agents printenv OPENAI_API_KEY | wc -c   # 1 = vazio; não imprima o valor
docker exec cu-agents printenv OTEL_ENABLED
```

Se `OPENAI_API_KEY` estiver vazio, o compose não carregou `.env.local` ou a chave é placeholder. O serviço `agents` usa `env_file: .env.local`; confira se o arquivo existe e contém uma chave válida.

## 3. Logs (Loki)

```logql
{service_name="api"} | context="ChatService"
{service_name="api"} | severity_text="ERROR"
```

O log deve trazer `Chat stream failed for conversation <id> (user <id>): <reason>` com `trace_id`. O `reason` é um rótulo estável (`provider_auth`, `agents_unavailable`, `timeout`, `persist_failed`, `unknown`).

## 4. Trace (Tempo)

Busque:

```text
{ resource.service.name = "api" && name = "chat.stream" }
{ resource.service.name = "agents" }
```

Abra o trace e verifique:

- `chat.stream` com `status: error` e o atributo `reason`.
- Span HTTP do `agents` (se `OTEL_ENABLED=true` e `traceparent` foi propagado).
- Ausência de span do `agents` indica que a instrumentação ou o env não está ativo.

## 5. Métricas (Mimir)

```promql
sum by (result, reason) (chat_message_count)
histogram_quantile(0.95, sum by (le) (rate(chat_stream_duration_bucket[5m])))
```

Se só houver `result="success"` e o usuário relata erro, a instrumentação não está cobrindo o caminho.

## 6. Ações

1. Se `provider_auth`: corrija a chave do provedor no `.env.local` e recrie o container `agents`.
2. Se `agents_unavailable`: verifique `docker compose ps agents`, `AGENTS_URL` e a porta `2024`.
3. Se `timeout`: verifique a latência do provedor e os timeouts do `AgentsClient`.
4. Se `persist_failed`: verifique o Postgres e os logs de `db.query.*`.
5. Após corrigir, confirme `chat_message_count{result="success"}` e um trace com span do `agents`.

## Critério de saída

- SSE termina com `event: done`.
- `chat_message_count{result="success"}` incrementa.
- Trace mostra `chat.stream` + span do `agents` no mesmo `trace_id`.

## Escalação

- Dono do fluxo `chat`.
- Se for credencial do provedor, quem administra as chaves.
- Se for indisponibilidade do LangGraph, dono do `agents`.
