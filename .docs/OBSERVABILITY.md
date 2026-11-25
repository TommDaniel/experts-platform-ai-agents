# Observabilidade local

Stack LGTM do `docker-compose.yml` (Grafana, Loki, Mimir, Tempo), instrumentação da API e dos agentes com OpenTelemetry, e o que fazer quando algo quebra.

## Subir e verificar

```bash
bun run infra:up
docker compose ps
curl -s http://localhost:3001/api/health   # Grafana
curl -s http://localhost:3100/ready        # Loki
curl -s http://localhost:9009/ready        # Mimir
curl -s http://localhost:3200/ready        # Tempo
```

| Serviço | Endereço local                     | Observação                                                             |
| ------- | ---------------------------------- | ---------------------------------------------------------------------- |
| Grafana | `http://localhost:3001`            | login obrigatório (`admin` / `GRAFANA_ADMIN_PASSWORD`, padrão `admin`) |
| Loki    | `http://localhost:3100`            | OTLP em `/otlp/v1/logs`                                                |
| Mimir   | `http://localhost:9009/prometheus` | OTLP em `/otlp/v1/metrics`                                             |
| Tempo   | `http://localhost:3200`            | OTLP em `:4318` (HTTP) e `:4317` (gRPC)                                |

Todas as portas são publicadas apenas em `127.0.0.1`.

> Loki e Mimir usam imagens **distroless** (sem shell, `wget` ou `curl`), então não têm healthcheck no Docker. Verifique com `curl` no host, como acima; `docker compose ps` mostra apenas `running` para eles.

## Token do Grafana (MCP)

O MCP `grafana` (configurado em `opencode.json`) autentica com uma **service account**, não com `admin`.

1. Crie a service account e o token no Grafana (Administration → Users and access → Service accounts).
2. Salve o token **apenas** em `.secrets/grafana-token` e restrinja a permissão:

   ```bash
   mkdir -p .secrets
   chmod 700 .secrets
   printf '%s' '<token>' > .secrets/grafana-token
   chmod 600 .secrets/grafana-token
   ```

3. `.secrets/` está no `.gitignore`. Nunca cole o token em issue, chat, log ou arquivo rastreado.
4. O `opencode.json` referencia o arquivo com `{file:./.secrets/grafana-token}`; não use o valor literal.
5. Valide com as tools do MCP: `user_info`, `list_datasources` e `check_datasources_health`.

Se o MCP não conectar, use a API HTTP do Grafana como fallback:

```bash
curl -s -H "Authorization: Bearer $(cat .secrets/grafana-token)" \
  http://localhost:3001/api/datasources
```

## Sinais disponíveis

| Sinal                                         | Onde  | Notas                                                                      |
| --------------------------------------------- | ----- | -------------------------------------------------------------------------- |
| `http.server.request.count`                   | Mimir | contador por `http_route`, método e status                                 |
| `http.server.request.duration`                | Mimir | histograma em **segundos**, emitido só pela `HttpInstrumentation`          |
| `chat.message.count` / `chat.stream.duration` | Mimir | `result=success\|error`, `reason` estável                                  |
| `auth.signup.count`                           | Mimir | `result=created\|email_failure\|...`                                       |
| `db.query.count` / `db.query.duration`        | Mimir | spans de banco via instrumentação                                          |
| Logs estruturados                             | Loki  | `trace_id`/`span_id`; use structured metadata (`\| severity_text="ERROR"`) |
| Traces                                        | Tempo | `api` e `agents`, correlacionados por `traceparent`                        |

Log de acesso: `METHOD /route STATUS DURATIONms` com `context="HTTP"`, sem corpo e sem PII.

## Alertas

- Regra `API 5xx rate > 5%` (folder `API Observability`, grupo `api-5xx`, `for: 1m`).
- Contact point `lifecycle-audit` é um **e-mail placeholder**. Configure a seção `[smtp]` do Grafana antes de confiar na notificação; sem SMTP o envio falha com `SMTP not configured`.
- Dashboard `API — visão geral` em `http://localhost:3001/d/api-overview`.

## Runbooks

Índice em [`.docs/runbooks/README.md`](runbooks/README.md):

- [chat-sse.md](runbooks/chat-sse.md)
- [api-5xx.md](runbooks/api-5xx.md)
- [latency.md](runbooks/latency.md)
- [service-down.md](runbooks/service-down.md)
- [ingestion.md](runbooks/ingestion.md)

## Limitações conhecidas

- O link "open in Grafana" devolvido pelo MCP aponta para `:3000`; o Grafana local está em `:3001`. Use a URL manual.
- O `agents` lê `.env.local` via `env_file`; sem `OPENAI_API_KEY`/`GEMINI_API_KEY` válida o chat falha e o runbook `chat-sse` se aplica.
- A ingestão ainda não tem métrica de sucesso/falha (ver `runbooks/ingestion.md`).
