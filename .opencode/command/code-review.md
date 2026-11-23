---
description: Revisa um PR do GitHub de ponta a ponta — comentários inline em Conventional Comments, comentário geral final e veredito obrigatório (REQUEST_CHANGES se houver issue/blocking; APPROVE caso contrário). Uso: /code-review <pr-url|owner/repo#n|#n>.
agent: code-reviewer
---

Carregue a skill `code-review` e execute a revisão completa deste PR, seguindo exatamente a metodologia da skill (áreas de foco, formato Conventional Comments, comentário geral, regra de decisão do veredito e submissão via `gh`):

PR alvo: $ARGUMENTS
