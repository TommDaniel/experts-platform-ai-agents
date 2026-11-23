# ADR-001: Commitlint com Conventional Commits

- **Status:** aceito
- **Data:** 2026-08-10
- **Relacionado:** ADR-000 (decisão 3 — Git hooks com Lefthook)

## Contexto

O monorepo adota Lefthook + Lint-staged para hooks de código (pre-commit). Faltava uma guarda para as mensagens de commit, garantindo histórico legível e automatizável (changelog, semver, busca).

## Decisão

Usar **commitlint** com `@commitlint/config-conventional`, executado no hook `commit-msg` do lefthook (`bunx commitlint --edit "$1"`). Config em `commitlint.config.mjs`.

## Alternativas consideradas

- Regra manual/CLI sem ferramenta: rejeitada — não automatizável e fácil de burlar.
- Hook `commit-msg` apenas em pre-commit: rejeitada — `commit-msg` é o hook canônico e roda antes do commit ser gravado.
- `@commitlint/cli` global: rejeitada — devDependency na raiz mantém reprodutibilidade, como feito com o Supabase CLI.

## Consequências

- Mensagens fora do padrão Conventional Commits são bloqueadas no commit.
- Convenção esperada: `<type>(<scope>): <subject>` — ex.: `feat(api): add GET /health`.
- Adiciona dependências: `@commitlint/cli`, `@commitlint/config-conventional` (raiz).
