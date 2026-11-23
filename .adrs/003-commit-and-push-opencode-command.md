# ADR-003: `commit-and-push` como command de agent opencode

- **Status:** aceito
- **Data:** 2026-08-10
- **Relacionado:** ADR-000 (workflow), ADR-001 (commitlint), ADR-002 (substituído)

## Contexto

O ADR-002 criou `bun run commit-and-push` (script `scripts/commit-and-push.sh`). Com a adoção de agents e commands do opencode, o fluxo deve ser orquestrado pelo próprio opencode: um command dispara um agent responsável pelo commit-and-push, sem camada de script. O comando vive versionado dentro do projeto (`.opencode/`), acessível a qualquer agent.

## Decisão

Substituir o script `scripts/commit-and-push.sh` pelo command de agent do opencode `/commit-and-push`, definido em escopo de projeto:

- **Agent:** `.opencode/agent/committer.md` (modo `primary`) — responsável pelo workflow.
- **Command:** `.opencode/command/commit-and-push.md` (frontmatter `agent: committer`) — invoca o agent com a mensagem de commit (`$ARGUMENTS`).

O workflow preserva o comportamento do ADR-002:

1. Imprime `git status --short` e `git diff HEAD --stat` (análise das mudanças pendentes).
2. Usa a mensagem de `$ARGUMENTS` — ou pede ao usuário, quando vazia (Conventional Commits).
3. Valida a mensagem com commitlint antes de commitar.
4. Faz `git add -A` (um commit por iteração).
5. Commita com trailer `Co-authored-by: OpenCode Agent <agent@opencode.ai>` (nome/email sobrescrevíveis via `OPENCODE_COAUTHOR_NAME`/`OPENCODE_COAUTHOR_EMAIL`).
6. Faz `git push`; no primeiro push sem upstream, executa `git push -u origin <branch>`.

## Alternativas consideradas

- Manter o script e chamá-lo do command: rejeitado — o agent deve orquestrar via tools, sem camada de script intermediária.
- Command sem agent dedicado: rejeitado — o fluxo fica sob responsabilidade de um agent (`committer`).

## Consequências

- `scripts/commit-and-push.sh` removido; `commit-and-push` removido de `package.json`.
- `.docs/ARCHITECTURE.md`, `.docs/RULES.md` e `README.md` atualizados para o novo comando `/commit-and-push`.
- Command e agent versionados no repo (`.opencode/`), disponíveis a qualquer agent do projeto.
- Co-author `OpenCode Agent <agent@opencode.ai>`: o email não é noreply do GitHub para não colidir com contas reais — `opencode@users.noreply.github.com` mapeia para o usuário existente `github.com/opencode`, atribuindo co-autoria a terceiros.
- Requer restart do opencode para carregar o agent/command.
