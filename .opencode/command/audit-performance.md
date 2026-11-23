---
description: Audita performance do projeto (API, banco, React, build, infra), mede baseline com k6/Grafana/Playwright quando possível e aponta gargalos com ganho esperado. Uso /audit-performance [caminho|fluxo].
agent: performance-auditor
---

Execute a auditoria de performance completa descrita no seu prompt de agente, seguindo a skill `audit-performance`:

1. Meça o baseline antes de opinar (k6 via `load/`, `curl -w`, `EXPLAIN (ANALYZE, BUFFERS)`, `bun run build` + tamanho dos assets, Playwright). Sem infra, registre e siga com análise estática — sem números inventados.
2. Carregue `vercel-react-best-practices` para a parte de React e `playwright` para medir a UI real.
3. Percorra os checklists de back-end, front-end, dados e build; confirme cada achado com evidência.
4. Escreva o relatório em `./.plans/performance-audit.md` e responda no chat com baseline + top 3 gargalos + ganho esperado.

Escopo (opcional; vazio = fluxo principal + build): $ARGUMENTS
