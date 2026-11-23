# Regras

Workflow obrigatório antes, durante e ao final de qualquer desenvolvimento.

> Status: `[implementado]` = já existe no repositório · `[planejado]` = parte da stack-alvo, ainda pendente.

## Antes de iniciar

1. **Levantamento de requisitos** — use a skill `feature-concept` `[implementada]` para fazer todas as perguntas necessárias e obter um entendimento completo e assertivo do que deve ser implementado.
2. **Plano** — monte um plano e salve em `./.plans/[spec-file-name]-plan.md` `[implementado]`. Para executar uma spec de ponta a ponta, use a skill `implement-me` `[implementada]`. Para executar várias specs de uma vez em paralelo (range numérico, ex.: `001-008`), use a skill `orchestrate-me` `[implementada]`.

## Ao final de cada iteração

3. Entregue:
   1. **Decisões arquiteturais**
      - Crie um **ADR** (Architecture Decision Record) em `./.adrs/*.md` `[implementado]` e imprima um resumo.
   2. **Passos manuais de QA** — lista de passos para validar a tarefa.
   3. **Arquivos modificados** — lista dos arquivos alterados.
   4. **Bibliotecas instaladas** — lista das dependências adicionadas.
   5. **Racional** — justificativa das decisões, implementações e mudanças.
4. **Commit e push** `[implementado]` — ao final de cada spec, rode `/commit-and-push '<mensagem conventional>'` (Conventional Commits) para analisar as mudanças pendentes, commitar tudo (com **OpenCode Agent** como co-author) e fazer push.
