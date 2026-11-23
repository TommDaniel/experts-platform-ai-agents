---
name: code-review
description: Revisa PRs do GitHub de ponta a ponta — lê o diff, posta comentários inline no formato Conventional Comments, adiciona um comentário geral final e submete a revisão com veredito obrigatório APPROVE (se só houver praise/nitpick/suggestion/thought/question/chore) ou REQUEST_CHANGES (se houver ao menos um issue ou blocking). Cobre padrões, performance, bugs/funcionalidade, legibilidade, a11y, i18n, QA (testes) e o11y, além de segurança e dependências. Use SEMPRE que o usuário pedir para revisar um PR, "code review", "revisa esse PR", "/code-review <link>", "avalia o pull request", "review do PR" ou pedir feedback em código de terceiros/aberto em PR.
metadata:
  author: coders-university
  version: "1.0.0"
---

# Code Review

Revisão completa de um Pull Request do GitHub. Você é o revisor: entende o objetivo do PR, analisa o diff arquivo por arquivo, deixa **comentários inline** no formato **Conventional Comments**, escreve um **comentário geral** no final e submete o veredito — **sempre** `APPROVE` ou `REQUEST_CHANGES`, nunca revisão neutra.

Esta skill é executada pelo agente `code-reviewer` (command `/code-review <pr-url>`).

## Entrada

- Aceita: URL completa (`https://github.com/owner/repo/pull/123`), shorthand (`owner/repo#123`) ou `#123` quando a branch atual pertence ao repo.
- Extraia `owner`, `repo` e `pull_number` — você vai precisar deles para a API.

## Contexto do projeto (sempre)

Antes de opinar, adquira as convenções do repositório em `.docs/` (mapa em `AGENTS.md`):

- `ARCHITECTURE.md` — stack e estrutura do monorepo.
- `DEVELOPMENT.md` — padrões de código e arquitetura (ex.: camadas hexagonal, vertical slices, idioma en-us).
- `RULES.md` — workflow obrigatório do repo (plano, ADR, entregáveis).
- `QA.md` — comandos de qualidade e ordem de verificação.

Um PR que viola convenção documentada do repo merece no mínimo um `suggestion`/`issue` — convenção do projeto é critério de revisão.

## Fluxo de trabalho

### 1. Coletar dados do PR

```sh
# Metadados (estado, base/head, autor, tamanho, draft, checks)
gh pr view <pr> --json number,title,body,author,baseRefName,headRefName,headRefOid,url,state,isDraft,additions,deletions,changedFiles,reviewDecision,mergeable

# Diff completo (fonte da verdade das linhas)
gh pr diff <pr>

# Comentários/discussões já existentes (não repita o que já foi respondido)
gh pr view <pr> --comments

# Status dos checks (CI verde?)
gh pr checks <pr>
```

- Se o diff vier grande, processe por arquivo com `gh pr view <pr> --json files` e leia os hunks individualmente.
- Para contexto além do diff (funções adjacentes, arquivos não tocados): `gh api repos/{owner}/{repo}/contents/{path}?ref=<headRefOid>` — ou leia do checkout local se a branch estiver disponível.

### 2. Analisar o diff

- Leia o diff **inteiro** antes de comentar. Entenda o objetivo do PR (descrição + testes).
- Avalie **cada arquivo alterado** contra as áreas de foco abaixo. Não revise arquivos fora do PR (não é o momento).
- Para cada achado, decida o label (seção Conventional Comments) e se posiciona inline ou vai para o comentário geral.

### 3. Áreas de foco (checklist por arquivo)

1. **Padrões & Arquitetura** — o código segue as convenções do repo (`DEVELOPMENT.md`)? SOLID, DRY, camadas corretas (interface/application/domain/infrastructure), nomenclatura, 1 fluxo = 1 use-case, DTOs validados, composition root coerente, migrations versionadas, Conventional Commits no título do PR?
2. **Performance** — N+1, loops aninhados, consultas sem índice, queries em loop, paginação ausente, recomputação desnecessária (memo/render), bundle bloat, assets pesados, operações síncronas bloqueantes, `await` em série que podia ser `Promise.all`, cache desnecessário ou ausente.
3. **Bugs & Funcionalidade** — edge cases (null/undefined, string vazia, lista vazia), validação incompleta, estados não tratados, race conditions, timezone/datas, off-by-one, overflow, mudança de contrato sem migração, erros engolidos (`catch` vazio), caminho feliz X caminho de erro, comportamento diverge da descrição do PR.
4. **Legibilidade & Manutenibilidade** — nomes claros, funções pequenas, complexidade ciclomática alta, dead code, código comentado, magic numbers, lógica duplicada (WET) que o DRY resolveria sem abstração prematura, tipos `any`, `@ts-ignore`, imports órfãos.
5. **Acessibilidade (a11y)** — HTML semântico, labels em inputs, foco visível e ordem de tabulação, operável por teclado, ARIA correto (não excessivo), contraste, alt text, tamanho de alvo de toque, `aria-live` para mudanças dinâmicas, não depender de cor sozinha.
6. **Internacionalização (i18n)** — strings hardcoded em UI/mensagens/emails, textos fora do sistema de tradução, formato de data/número/moeda local-dependente, pluralização, sort/compare locale-aware, charset/encoding.
7. **QA & Testes** — o PR tem testes para os comportamentos novos/alterados? Unitários, de integração e e2e cobrem o caminho feliz E os edge cases? Testes testam comportamento ou detalhe de implementação? Fixtures/setup coerentes, testes que não são flaky, o autor rodou os gates de `QA.md`?
8. **Observabilidade (o11y)** — logs estruturados com contexto (request id, ids de domínio), erros com stack/contexto, sem PII/segredos em logs, métricas/tracing para fluxos críticos, propagação de trace, tempo de resposta/logar em hot path.
9. **Segurança** — secrets commitados, injeção (SQL/XSS/command), sanitização de input, authz além de authn, IDOR, rate limiting, headers de segurança, dependências vulneráveis, validação server-side.
10. **Dependências & DX** — lib nova sem justificativa, versões compatíveis, lockfile atualizado, scripts/documentação atualizados, mudanças que quebram API pública sem aviso.

> Não se limite ao checklist: qualquer problema real de qualidade, correção ou manutenibilidade merece comentário.

### 4. Comentários inline (Conventional Comments)

Formato canônico:

```
<label>: <subject>

<porquê — o que está errado e o impacto>

<alternativa/sugestão de código, se houver>

<footer: links/refs>
```

Labels (ordem de severidade):

| Label           | Significado                                        | Bloqueia? |
| --------------- | -------------------------------------------------- | --------- |
| `blocking` 🛑   | Impede o merge (bug, segurança, contrato quebrado) | **Sim**   |
| `issue` 🔴      | Problema real que precisa ser corrigido            | **Sim**   |
| `suggestion` 💡 | Melhoria, sem impedir o merge                      | Não       |
| `nitpick` 🔧    | Detalhe trivial de estilo                          | Não       |
| `thought` 🤔    | Reflexão/observação para discussão                 | Não       |
| `question` ❓   | Dúvida para o autor                                | Não       |
| `chore` 🏕️      | Pequena limpeza (dead code, typo)                  | Não       |
| `praise` 👍     | Reconhecimento de boa solução                      | Não       |

Regras:

- `issue`/`blocking` → veredito `REQUEST_CHANGES`. Qualquer outro label → não bloqueia.
- Cite `arquivo:linha` no corpo quando ajudar. Seja específico e proponha alternativa concreta; "isso está ruim" sem direção não é revisão.
- Elogie código bom (`praise`) — revisão não é só crítica.

### 5. Comentário geral final (body da revisão)

Sempre presente, no idioma do PR. Estrutura:

```
## Code Review — <título do PR>

**Veredito:** ✅ APPROVE | 🔴 REQUEST_CHANGES

**Resumo:** o que o PR faz e como ficou a qualidade geral (2-4 linhas).

**Forças:** bullets curtos.

**Preocupações por área:** padrões / performance / bugs / legibilidade / a11y / i18n / QA / o11y / segurança — só as que tiverem algo.

**Comentários inline:** n total (x blocking, y issue, z suggestion/nitpick/thought/question, w praise).

**Próximos passos:** o que o autor precisa fazer (se REQUEST_CHANGES) ou sugestões opcionais.
```

### 6. Decidir o veredito

- Havia ≥1 comentário `issue` **ou** `blocking` → `REQUEST_CHANGES`.
- Caso contrário (mesmo que só `praise`) → `APPROVE`.
- **Nunca** submeta `COMMENT` (revisão neutra com comentários e sem aprovação/reprovação).

### 7. Submeter via `gh`

1. Monte o payload em um arquivo JSON temporário:

```json
{
  "commit_id": "<headRefOid>",
  "event": "REQUEST_CHANGES",
  "body": "<comentário geral final>",
  "comments": [
    {
      "path": "apps/api/src/modules/auth/sign-up/sign-up.use-case.ts",
      "line": 42,
      "side": "RIGHT",
      "body": "**issue:** `email` não é normalizado antes do hash.\n\n<detalhe>"
    }
  ]
}
```

2. Envie:

```sh
gh api --method POST repos/{owner}/{repo}/pulls/{pull_number}/reviews --input payload.json
```

Regras de posicionamento (importante):

- **`line` + `side: "RIGHT"`** para linhas **adicionadas/modificadas** (conte a partir do número inicial do lado novo do hunk `@@ -a,b +c,d @@`: a primeira linha do bloco tem número `c`, depois `c+1`, ...).
- Comentários só podem ancorar em linhas que **fazem parte do diff** (adições/modificações do lado RIGHT ou remoções do lado LEFT). Linhas de contexto não são ancoráveis.
- Para problemas em código **removido** (`side: "LEFT"`), a GitHub exige que o review tenha **pelo menos um comentário em linha do lado RIGHT** — se todos os comentários fossem LEFT, o payload é rejeitado (422). Solução: ancore na linha nova mais próxima do hunk e cite o código antigo no corpo, ou leve ao comentário geral.
- Valide cada `line` contra o `gh pr diff` antes de enviar — linha inventada = API 422.

## Proibições (nunca)

- **Nunca edite código, commite, faça merge ou altere o estado do PR além da revisão.**
- Nunca submeta revisão neutra (`COMMENT`) — veredito é sempre APPROVE ou REQUEST_CHANGES.
- Nunca posicione comentário em linha que não existe no diff nem invente números de linha.
- Nunca publique secrets/PII nos comentários.
- Não repita comentários já feitos/respondidos no PR (confira em `gh pr view <pr> --comments`).
- Não elogie sem veredito nem aprove sem ter lido o diff inteiro.

## Idiomas

- Comentários no PR seguem o idioma do PR (padrão do projeto: **en-us**, já que código, PRs e docs de produto são en-us).
- Esta skill e a comunicação com o usuário podem ficar em pt-br.
