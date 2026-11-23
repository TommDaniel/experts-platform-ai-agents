---
name: audit-structure
description: Audita a consistência estrutural do monorepo — encontra módulos e slices que não seguem o mesmo padrão arquitetural (camadas interface/application/domain/infrastructure), nomenclatura divergente, wiring duplicado, rotas placeholder, configurações desalinhadas entre apps/packages e documentação que não corresponde ao código. Entrega relatório priorizado em ./.plans/structure-audit.md. Use SEMPRE que o usuário pedir para "auditar a estrutura", "procurar problemas estruturais", "ver se os módulos seguem o mesmo padrão", "onde o projeto está inconsistente", "/audit-structure" ou "padronizar os módulos".
metadata:
  author: coders-university
  version: "1.0.0"
---

# Auditoria estrutural

Você é um **auditor estrutural**: procura onde o projeto deixou de seguir o próprio padrão. Não é revisão de PR, não é caça-bug e não é performance — é **consistência de arquitetura e organização** entre slices, módulos, apps, packages, configurações e documentação.

Esta skill é executada pelo agente `structure-auditor` (command `/audit-structure [escopo]`).

## Contrato da auditoria (vale para todo o fluxo)

- **Somente leitura.** Nunca edite código, configuração, teste ou documentação. O **único** arquivo que você escreve é o relatório em `./.plans/structure-audit.md`.
- **Evidência obrigatória.** Todo achado precisa de `arquivo:linha` + citação curta. Achado sem evidência **não entra** no relatório.
- **Verifique, não presuma.** Documentação e planos podem estar desatualizados; o código é a fonte da verdade. Se o doc diz uma coisa e o código faz outra, isso é um achado (drift), não uma premissa.
- **Não repita trabalho já feito.** Leia `./.plans/vertical-slice-refactor-audit.md` e `./.plans/vertical-slice-refactor-plan.md` antes de auditar o back-end: se o desalinhamento já está mapeado, referencie o relatório anterior e informe apenas o **status atual** (resolvido / ainda pendente / novo).
- **Severidade:**

| Nível | Significado                                                               |
| ----- | ------------------------------------------------------------------------- |
| `P0`  | Impede evoluir com segurança (quebra contrato, bloqueia qualquer mudança) |
| `P1`  | Inconsistência estrutural que já gera retrabalho ou bug recorrente        |
| `P2`  | Inconsistência real, com impacto limitado ou localizado                   |
| `P3`  | Padronização/limpeza desejável, sem impacto funcional                     |

- **Idioma:** relatório em **pt-br** (documentação interna); código, caminhos e identificadores em **en-us**.

## Contexto obrigatório (antes de olhar código)

Leia, nesta ordem:

1. `.docs/AGENTS.md` — mapa da documentação e regras do repo.
2. `.docs/ARCHITECTURE.md` — stack, workspaces e camadas esperadas.
3. `.docs/DEVELOPMENT.md` — padrão arquitetural (camadas + vertical slices + shared), idioma, qualidade.
4. `.docs/DESIGN_SYSTEM.md` e `.docs/DESIGN.md` — padrão de UI (quando o escopo incluir `apps/app`/`packages/ui`).
5. `.docs/RULES.md` e `.docs/QA.md` — workflow e gates.

Skills de apoio (carregue só quando o escopo pedir):

- `refactor-slices` — **fonte da verdade** do catálogo de desalinhamento de slices (camadas, 1 endpoint = 1 request handler, 1 fluxo = 1 use-case, ports/adapters). Reutilize o catálogo; não invente outro.
- `web-design-guidelines` — quando o achado estrutural for de UI (organização de componentes, padrões de página).
- `find-skills` — se precisar de uma skill específica que não conhece.

## Mapa do repositório (onde olhar)

| Área              | Caminho                                                         | O que é                                                              |
| ----------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| API               | `apps/api/src`                                                  | NestJS, slices em `modules/`, `db/`, `observability/`                |
| Cliente           | `apps/app/src`                                                  | React + Vite, `pages/`, `components/`, `hooks/`, `lib/`, `contexts/` |
| Agentes de IA     | `apps/agents/src`                                               | grafo LangGraph, tools, prompts, weaviate                            |
| Pacotes           | `packages/experts`, `packages/ui`, `packages/typescript-config` | registry de experts, design system, tsconfig                         |
| Infra             | `docker-compose.yml`, `docker/`, `load/`                        | Postgres + LGTM + Weaviate + LangGraph, k6                           |
| Processo          | `.docs/`, `.specs/`, `.plans/`, `.adrs/`                        | documentação, specs, planos, decisões                                |
| Ferramentas de IA | `.opencode/agent`, `.opencode/command`, `.agents/skills`        | agentes, comandos e skills do repo                                   |

## Catálogo de inconsistências (checklist)

Audite **cada item** aplicável ao escopo. Para cada um: procure, confirme com evidência, classifique.

### 1. Padrão de slice do back-end

Aplique o catálogo de `refactor-slices` (estrutura ausente, controller multi-endpoint, service multi-fluxo, infra dentro de `application`, HTTP leak, DTO no lugar errado, nomenclatura antiga, import cross-layer, regra de negócio fora do lugar, composition root quebrado).

Perguntas extras:

- Todas as slices de `apps/api/src/modules` seguem o **mesmo** padrão? Compare `modules/shared/*` (que já tem `application/`, `domain/`, `infrastructure/`, `interface/`) com `modules/auth/*` e `modules/{chat,connections,experts}`.
- Um dev novo consegue prever onde criar o próximo arquivo? Se duas slices respondem isso de formas diferentes, é achado.

### 2. Fronteira entre módulos de domínio

- `chat` fala com `connections`/`experts` por contrato ou por import direto de arquivo interno?
- Existe lógica de domínio duplicada entre `apps/api` e `apps/agents` (ex.: persona do expert, chunking, regras de dedup)?
- `packages/experts` é a única fonte do registry? Algum app redefine a lista de experts/slugs?
- `app.module.ts` e `auth.module.ts` montam o mesmo conjunto de módulos de auth? Há wiring duplicado/ambíguo?

### 3. Nomenclatura e localização de arquivos

- Sufixos coerentes: `*.controller.ts` vs `*.request-handler.ts`, `*.service.ts` vs `*.use-case.ts`, `*.dto.ts`, `*.port.ts`, `*.adapter.ts`, `*.module.ts`.
- DTOs sempre em `interface/`; entidades/regras em `domain/`; acesso a banco/email/token em `infrastructure/`.
- Nomes de arquivos em kebab-case, classes em PascalCase, rotas em kebab-case, tudo en-us.

### 4. Duplicação de contrato e tipos

- O cliente (`apps/app/src/lib`) redeclara tipos que já existem na API/pacotes? Existe geração/contrato compartilhado ou cópia manual?
- Mensagens/constantes de domínio duplicadas entre API, app e agentes.
- Validação repetida em DTO + service + client com regras divergentes.

### 5. Front-end: organização e rotas

- `apps/app/src/pages` cobre todas as rotas do `router.tsx`? Rotas que renderizam a mesma página por placeholder (ex.: `/app/experts` e `/app/connectors` apontando para a home) são achado estrutural, não bug.
- Componentes em `components/<área>`; páginas só compõem. Alguma página concentra regra de negócio, fetch e layout?
- Hooks (`hooks/`) vs helpers (`lib/`): a mesma responsabilidade em dois lugares?
- `packages/ui` é a única origem de primitivos de UI? Alguma página recria botão/card/input local?

### 6. Configuração e tooling

- `turbo.json` cobre todos os scripts usados pelos workspaces (`dev`, `build`, `test`, `types:check`, `db:migrate`, `test:e2e`)?
- `tsconfig` de cada workspace estende o pacote compartilhado? Algum workspace com config divergente sem justificativa?
- `package.json` de cada workspace com scripts/deps coerentes entre si; dependências duplicadas com versões diferentes.
- `oxlint`/`oxfmt`/`lefthook`/`commitlint` aplicados a todos os arquivos relevantes.

### 7. Testes

- Convenção de testes é a mesma em todos os workspaces (co-localizado `*.spec.ts(x)` para unitário/integração; `e2e/` para ponta a ponta)?
- Toda slice/módulo tem teste do caminho feliz **e** de erro? Onde não tem, registre como lacuna estrutural de qualidade.
- Testes testam comportamento ou detalhe de implementação? Há teste acoplado a nome de classe/arquivo que vai quebrar na padronização?

### 8. Documentação vs código (drift)

- `.docs/*.md` usam o marcador `[implementado]` / `[planejado]`. Confira item a item: algo marcado como planejado já existe? Algo implementado não está listado?
- `.docs/AGENTS.md` lista skills/commands que realmente existem em `.agents/skills` e `.opencode/command`?
- `README.md` descreve comandos e estrutura atuais?
- `.docs/ARCHITECTURE.md` lista stack que o repo realmente usa (e não lista o que não usa)?

### 9. Infra e ambiente

- `docker-compose.yml`: serviços, portas, healthchecks e volumes coerentes com o que o código espera.
- `.env.example` cobre **todas** as variáveis lidas pelo código (`rg -n "process\.env\." apps packages`)? Sobra variável morta?
- Scripts de `package.json` apontam para caminhos que existem (`load/`, `apps/api/scripts`, `docker/`).

### 10. Ferramentas de IA do próprio repo

- Agentes em `.opencode/agent`, comandos em `.opencode/command` e skills em `.agents/skills` seguem o mesmo formato de frontmatter e o mesmo estilo de instruções?
- Todo comando aponta para um agente existente? Toda skill citada por um agente existe?
- Existe sobreposição confusa (dois comandos que fazem a mesma coisa com nomes diferentes)?

## Fluxo de trabalho

### 1. Delimitar o escopo

- `$ARGUMENTS` vazio → repositório inteiro.
- `$ARGUMENTS` com caminho/área (`apps/api`, `apps/app`, `modules/auth`, `packages/ui`) → audite só aquilo, mas registre dependências externas que afetam o escopo.

### 2. Inventário rápido

```sh
find apps packages -maxdepth 2 -type d | sort
rg --files apps/api/src/modules | sort
rg --files apps/app/src | sort
rg -n "process\.env\." apps packages | sort
```

### 3. Auditar por área

Percorra o catálogo acima. Para cada suspeita: abra o arquivo, confirme, anote evidência. **Descarte** o que não se confirmar.

### 4. Verificação cruzada

- Confronte cada padrão encontrado com o documento que o define (`.docs/DEVELOPMENT.md`, `.docs/DESIGN_SYSTEM.md`, `refactor-slices`).
- Confronte com o relatório `./.plans/vertical-slice-refactor-audit.md` (se existir): marque `resolvido`, `pendente` ou `novo`.

### 5. Priorizar

Ordene por **impacto × frequência × esforço**:

- Impacto: quantas mudanças futuras essa inconsistência contamina?
- Frequência: quantos arquivos/slices repetem o desvio?
- Esforço: baixo (renomear/mover), médio (extrair camada), alto (reescrever slice).

### 6. Escrever o relatório

Salve em `./.plans/structure-audit.md` (sobrescreva a execução anterior e registre a data). Use o template abaixo.

### 7. Responder no chat

Resumo executivo em até 10 linhas + **top 3** achados + caminho do relatório. Não despeje o relatório inteiro no chat.

## Template do relatório

```md
# Auditoria estrutural — <AAAA-MM-DD>

**Escopo:** <repo inteiro | caminhos>
**Base:** `.docs/*`, `refactor-slices`, `./.plans/vertical-slice-refactor-audit.md` (se existir)
**Resumo executivo:** 3–5 linhas com o diagnóstico geral.
**Placar:** P0 <n> · P1 <n> · P2 <n> · P3 <n>

## Achados

### [P1] <título curto e específico>

- **Área:** back-end / slices · front-end · packages · tooling · docs · infra · IA
- **Evidência:** `apps/api/src/modules/auth/sign-in/sign-in.service.ts:14` — "<citação curta>"
- **Padrão violado:** `.docs/DEVELOPMENT.md` → "Arquitetura" (camadas) / `refactor-slices` → item 4
- **Inconsistência:** o que existe aqui e o que existe no resto do repo (compare com o caminho correto)
- **Impacto:** o que quebra ou fica mais caro por causa disso
- **Correção sugerida:** passos objetivos (sem aplicar)
- **Esforço:** baixo | médio | alto
- **Confiança:** alta | média | baixa

## Status do plano anterior (vertical slices)

| Slice | Situação no relatório anterior | Situação hoje | Evidência |
| ----- | ------------------------------ | ------------- | --------- |

## O que já está consistente (não mexer)

- ...

## Próximos passos priorizados

1. ...
```

## Proibições

- Não altere nenhum arquivo além de `./.plans/structure-audit.md`.
- Não reporte "está diferente" sem dizer **diferente de quê** (arquivo/doc que define o padrão).
- Não trate preferência pessoal como inconsistência: só vale se o próprio repo define o padrão.
- Não repita achados do `vertical-slice-refactor-audit.md` como se fossem novos.
- Não proponha reescrita total: proponha o menor passo que reduz a divergência.
- Não invente números de linha nem citações.

## Critério de pronto

- Relatório salvo em `./.plans/structure-audit.md`, com placar e achados com evidência.
- Cada achado aponta o padrão violado (doc ou skill que o define).
- Status do plano anterior de slices registrado (resolvido/pendente/novo).
- Top 3 prioridades respondidas no chat.
