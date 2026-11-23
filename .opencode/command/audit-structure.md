---
description: Audita a estrutura do projeto e aponta onde módulos/slices fogem do padrão (camadas, nomes, wiring, fronteiras entre apps/packages, rotas placeholder, docs vs código). Uso /audit-structure [caminho|área].
agent: structure-auditor
---

Execute a auditoria estrutural completa descrita no seu prompt de agente, seguindo a skill `audit-structure`:

1. Leia o contexto em `.docs/` e carregue `refactor-slices` para reutilizar o catálogo de slices.
2. Audite o escopo abaixo contra o catálogo de inconsistências da skill (evidência obrigatória, nada de suposição).
3. Verifique o status do `./.plans/vertical-slice-refactor-audit.md` (se existir) para não repetir achados.
4. Escreva o relatório em `./.plans/structure-audit.md` e responda no chat com placar + top 3.

Escopo (opcional; vazio = repositório inteiro): $ARGUMENTS
