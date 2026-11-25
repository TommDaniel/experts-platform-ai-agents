# SLO e processo de incidente

Define o que significa "saudável" e o que fazer quando não está. Os alvos são iniciais e devem ser recalibrados com 30 dias de dados reais do Mimir.

## SLIs e SLOs

| Serviço                | SLI                                            | Fonte                              | Alvo inicial | Janela  |
| ---------------------- | ---------------------------------------------- | ---------------------------------- | ------------ | ------- |
| API — disponibilidade  | proporção de requests sem 5xx                  | `http_server_request_count`        | ≥ 99,5%      | 30 dias |
| API — latência de auth | p95 de `/api/v1/auth/*`                        | `http_server_request_duration` (s) | < 500 ms     | 7 dias  |
| API — latência de chat | p95 até o primeiro token                       | `chat.stream.duration`             | < 2 s        | 7 dias  |
| API — banco            | p95 de `db.query.duration`                     | `db_query_duration`                | < 50 ms      | 7 dias  |
| Chat — sucesso         | `chat_message_count{result="success"}` / total | Mimir                              | ≥ 99%        | 7 dias  |
| Auth — sign-up         | `auth_signup_count{result="created"}` / total  | Mimir                              | ≥ 99%        | 7 dias  |

> `http.server.request.duration` é emitido **apenas** pela `HttpInstrumentation`, em segundos. Não crie um segundo histograma em milissegundos.

### Error budget

- 99,5% em 30 dias ⇒ ~3h36min de indisponibilidade permitida.
- Consumiu 50% do budget em uma semana? Congele features e priorize confiabilidade.
- Consumiu 100%? Só correções e estabilização até o budget voltar.

## Alertas

| Alerta                                             | Condição                                             | Severidade | Ação                                     |
| -------------------------------------------------- | ---------------------------------------------------- | ---------- | ---------------------------------------- |
| `API 5xx rate > 5%`                                | 5xx/total > 5% por 1 min                             | critical   | [api-5xx](runbooks/api-5xx.md)           |
| p95 de auth > 1 s                                  | 2× o SLO por 10 min                                  | warning    | [latency](runbooks/latency.md)           |
| `chat_message_count{result="error"}` > 0 por 5 min | qualquer erro                                        | warning    | [chat-sse](runbooks/chat-sse.md)         |
| serviço sem tráfego                                | `rate(http_server_request_count[5m]) == 0` por 5 min | warning    | [service-down](runbooks/service-down.md) |

Os dois últimos ainda não existem no Grafana; crie-os quando houver tráfego de produção.

## Processo de incidente

### Severidades

| Nível | Critério                                                   | Comunicação              | Prazo de resposta |
| ----- | ---------------------------------------------------------- | ------------------------ | ----------------- |
| SEV-1 | indisponibilidade total, perda de dados ou 5xx > 25%       | imediata, todos os donos | 15 min            |
| SEV-2 | 5xx entre 5% e 25%, ou fluxo crítico (auth/chat) degradado | canal do time            | 30 min            |
| SEV-3 | degradação parcial, sem impacto amplo                      | ticket                   | próximo dia útil  |

### Fluxo

1. **Detectar** — alerta, relato ou dashboard.
2. **Declarar** — abra um incidente (Grafana Incident ou canal) com severidade e uma frase de impacto.
3. **Mitigar primeiro** — rollback, feature flag, restart ou scale. Diagnóstico completo vem depois.
4. **Comunicar** — atualize a cada 15 min (SEV-1) ou 30 min (SEV-2), mesmo sem novidade.
5. **Resolver** — confirme os SLIs voltando ao normal por 15 min.
6. **Postmortem** — em até 3 dias úteis para SEV-1/2, sem culpa, com ações e donos.

### Papéis mínimos

- **Incident commander** — decide e coordena; não depura.
- **Operador** — executa mitigação.
- **Comunicação** — atualiza stakeholders.

Em time pequeno, uma pessoa pode acumular papéis, mas o registro do incidente é obrigatório.

## Lacunas atuais

- Sem SLO de ingestão (não há métrica de sucesso/falha).
- Sem alerta de chat/erro nem de "sem tráfego".
- Sem SMTP no Grafana local: notificações por e-mail não saem.
- Sem histórico de 30 dias: os alvos acima são hipóteses até a primeira calibração.
