# ADR-002: Comando `commit-and-push`

- **Status:** superseded (substituído por ADR-003)
- **Data:** 2026-08-10
- **Relacionado:** ADR-000 (workflow), ADR-001 (commitlint), ADR-003

## Contexto

O workflow exige commit e push ao final de cada spec, com mensagens em Conventional Commits e OpenCode Agent como co-author. Sem uma ferramenta padronizada, cada iteração faria isso ad hoc (mensagens inconsistentes, esquecer co-author ou upstream).

## Decisão

Criar o comando `bun run commit-and-push '<mensagem>'` (script `scripts/commit-and-push.sh`), que:

1. Imprime `git status` e `git diff HEAD --stat` (análise das mudanças pendentes).
2. Recebe a mensagem por argumento — ou via prompt interativo quando vazia.
3. Valida a mensagem com commitlint (Conventional Commits).
4. Faz `git add -A` (commita todas as mudanças pendentes).
5. Commita com trailer `Co-authored-by: OpenCode Agent <agent@opencode.ai>` (nome/email sobrescrevíveis via `OPENCODE_COAUTHOR_NAME`/`OPENCODE_COAUTHOR_EMAIL`).
6. Faz `git push`; no primeiro push sem upstream, executa `git push -u origin <branch>`.

## Alternativas consideradas

- Múltiplos commits por iteração: rejeitado — o comando assume um commit por iteração (escopo de cada spec), como definido no workflow.
- Gerar a mensagem dentro do script: rejeitado — um script não analisa semântica; a análise fica com o agente/dev, que fornece a mensagem.
- Sem validação commitlint no script: rejeitado — o hook `commit-msg` já valida, mas validar cedo dá feedback imediato com erro claro.

## Consequências

- Um commit por spec, mensagem validada e co-author OpenCode Agent garantido.
- RULES.md passou a exigir `commit-and-push` ao final de cada iteração.
- Primeiro push da branch configura upstream automaticamente.
