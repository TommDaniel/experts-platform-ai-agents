---
description: Audita evolução e escalabilidade do projeto em duas lentes (carga e time) e entrega roadmap agora/próximo/depois com gatilho, esforço e impacto. Uso /audit-scalability [carga|time|área].
agent: scalability-auditor
---

Execute a auditoria de evolução e escalabilidade descrita no seu prompt de agente, seguindo a skill `audit-scalability`:

1. Leia `.docs/BUSINESS.md`, `ARCHITECTURE.md`, `DEVELOPMENT.md`, `RULES.md`, `docker-compose.yml`, `.adrs/`, `.specs/` e `.plans/`.
2. Monte o retrato atual (topologia, domínios, acoplamentos, estado, processo, ownership) com evidência.
3. Aplique as duas lentes — carga e time — e classifique cada ponto em agora/próximo/depois com gatilho mensurável.
4. Não duplique estrutura/performance: referencie os relatórios existentes e foque em evolução.
5. Escreva `./.plans/scalability-audit.md` e responda no chat com o diagnóstico + os 3 itens do horizonte "agora".

Escopo (opcional; vazio = carga + time): $ARGUMENTS
