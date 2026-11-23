---
description: Audita o ciclo de vida do software (docs, pós-produção, manutenção, debug) usando o Grafana via MCP (Loki/Mimir/Tempo/alertas/incidentes) e entrega relatório com runbooks. Uso /audit-lifecycle [área|sintoma].
agent: lifecycle-auditor
---

Execute a auditoria do ciclo de vida descrita no seu prompt de agente, seguindo a skill `audit-lifecycle`:

1. Confirme o Grafana via MCP: `user_info` → `list_datasources` → `check_datasources_health`. Se falhar, registre o motivo e siga com análise estática (sem inventar telemetria).
2. Monte o retrato da observabilidade: dashboards (`search_dashboards`), alertas (`alerting_rules_read`), incidentes/OnCall (`list_incidents`, `list_oncall_schedules`), logs (`query_loki_logs`), métricas (`query_prometheus`) e traces (`search_tempo_traces`).
3. Cubra os checklists A–D (documentação, pós-produção, manutenção, debug) com evidência. Se houver sintoma, aplique o roteiro de investigação (logs → traces → métricas → hipótese).
4. Escreva `./.plans/lifecycle-audit.md` com runbooks prontos e responda no chat com o estado da observabilidade + P0/P1.

Escopo (opcional; vazio = auditoria completa): $ARGUMENTS
