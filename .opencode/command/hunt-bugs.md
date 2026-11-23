---
description: Procura bugs reais no código com evidência, passos de reprodução e correção sugerida; aceita área ou sintoma. Uso /hunt-bugs [área|arquivo|sintoma].
agent: bug-hunter
---

Execute a caça-bugs descrita no seu prompt de agente, seguindo a skill `hunt-bugs`:

1. Defina o alvo e o comportamento esperado (`.docs/BUSINESS.md` + testes existentes em `apps/*/e2e`).
2. Percorra o catálogo de bugs da skill (estados não tratados, corridas, erros engolidos, validação, sessão/autorização, uploads, datas, a11y, contrato entre camadas, persistência).
3. Confirme cada candidato com leitura dirigida, teste existente, `curl` ou reprodução com Playwright. O que não confirmar vai para "Suspeitas não confirmadas".
4. Não corrija nada: apenas relate. Escreva `./.plans/bug-hunt-audit.md` e responda no chat com contagem + top 3 + como reproduzir.

Alvo (opcional; vazio = varredura priorizada): $ARGUMENTS
