---
name: implement-me
description: Executa uma spec de ponta a ponta. Recebe o nome da spec, lê o contexto do projeto (AGENTS.md e .docs/), refina requisitos com a skill feature-concept, gera o plano em ./.plans/[spec]-plan.md, implementa de fato e entrega os artefatos do workflow (ADR, passos de QA, arquivos modificados, libs e racional). Use quando o usuário disser "implemente a spec", "execute a spec", "implement-me", "faz a spec <nome>", "implementa o plano" ou "executar a spec <nome>".
metadata:
  author: coders-university
  version: "1.0.0"
---

# Implement Me

Orquestra a execução completa de uma spec. Você recebe o **nome da spec**, adquire contexto, refina requisitos, planeja, implementa e entrega os artefatos exigidos por `RULES.md`.

## Convenções do projeto

- **Contexto:** `AGENTS.md` e documentos em `.docs/` (mapa em `AGENTS.md`).
- **Workflow obrigatório:** `RULES.md`.
- **Specs:** `./.specs/<nome>.md` (crie a pasta se não existir).
- **Planos:** `./.plans/[spec-file-name]-plan.md`.
- **ADRs:** `./.adrs/*.md`.

## Fluxo

### 1. Adquirir contexto

1. Leia `AGENTS.md` (raiz ou `.docs/AGENTS.md`).
2. Leia os documentos do mapa relevantes à spec (`BUSINESS.md`, `ARCHITECTURE.md`, `DESIGN.md`, `DESIGN_SYSTEM.md`, `DEVELOPMENT.md`, `QA.md`, `RULES.md`).
3. Localize a spec: tente `./.specs/<nome>.md`; se não existir, busque pelo nome no repositório; se não achar, pergunte ao usuário o caminho.

### 2. Refinar requisitos com feature-concept

1. Carregue a skill `feature-concept`.
2. Conduza a entrevista de elicitação para preencher lacunas da spec (uma pergunta por vez, com resposta recomendada).
3. Se a spec já estiver precisa e sem lacunas, pule direto ao plano — não burocratize.
4. Consolide o entendimento final (decisões, escopo, critérios de aceite, edge cases).

### 3. Gerar o plano

1. Monte o plano conforme `RULES.md` e salve em `./.plans/[spec-file-name]-plan.md`.
2. O plano deve conter, no mínimo: objetivo, escopo, etapas de implementação, arquivos-alvo, riscos/edge cases, critérios de aceite e checklist de QA.
3. Apresente o plano ao usuário para aprovação antes de implementar (exceto se já aprovado).

### 4. Implementar

1. Execute o plano passo a passo, seguindo `DEVELOPMENT.md` (princípios, arquitetura, a11y, responsividade).
2. Use as skills obrigatórias do contexto — ex.: `frontend-design` e `web-design-guidelines` para UI, `next-best-practices`, `shadcn`, `feature-concept`, etc. (ver `AGENTS.md`).
3. Rode os checks de `QA.md` ao final de cada mudança.
4. Use a ferramenta de lista de tarefas para rastrear as etapas do plano.

### 5. Entregar artefatos (por iteração)

Ao final de cada interação, conforme `RULES.md`:

1. **Decisões arquiteturais** — crie um ADR em `./.adrs/*.md` para decisões load-bearing e imprima um resumo.
2. **Passos manuais de QA** — lista de passos para validar a tarefa.
3. **Arquivos modificados** — lista dos arquivos alterados/criados.
4. **Bibliotecas instaladas** — lista das dependências adicionadas.
5. **Racional** — justificativa das decisões, implementações e mudanças.

## Verificação obrigatória

- Rode lint, tipagem, testes e build conforme `QA.md`.
- Não declare a tarefa concluída sem os checks passarem e os artefatos entregues.
