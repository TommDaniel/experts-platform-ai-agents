# Agentes

Diretrizes obrigatórias para qualquer agente de código atuando neste repositório.

## Leitura de contexto

Sempre carregue o contexto antes de trabalhar. Os documentos vivem em `.docs/`.

| Documento          | O que cobre                                    | Quando ler                                |
| ------------------ | ---------------------------------------------- | ----------------------------------------- |
| `ARCHITECTURE.md`  | Stack, estrutura do monorepo e camadas         | Sempre, antes de qualquer mudança         |
| `BUSINESS.md`      | Domínio do produto (experts e conectores)      | Tarefas de produto/feature                |
| `DESIGN_SYSTEM.md` | Base de componentes (shadcn/ui)                | Trabalho de UI                            |
| `DESIGN.md`        | Diretrizes visuais e paleta                    | Trabalho de UI                            |
| `DEVELOPMENT.md`   | Padrões de código e arquitetura                | Sempre, antes de qualquer mudança         |
| `QA.md`            | Comandos de qualidade e verificação            | Ao finalizar qualquer mudança             |
| `RULES.md`         | Workflow obrigatório (plano, ADR, entregáveis) | Antes de iniciar qualquer desenvolvimento |

## Regras

1. **UI obriga skill de design.** Toda alteração de UI exige carregar a skill `frontend-design` (obrigatória) e `web-design-guidelines` (obrigatória para revisão de UI).
2. **Use a skill certa para o contexto.** Carregue a skill mais específica para a tarefa. Exemplos:
   - Criar uma spec a partir de um prompt → skill `create-spec`
   - Refinar/melhorar uma spec existente → skill `refine-spec`
   - Levantar requisitos de uma feature → skill `feature-concept`
   - Banco de dados → skill de Postgres
   - Next.js → skill de Next.js
   - React → skill de React
   - Copy/redação → skill de copy
   - Textos → skill de SEO
3. **Descubra skills** com a skill `find-skills` quando não souber se existe uma adequada ao contexto.
4. **Siga o workflow obrigatório** descrito em `RULES.md` (feature-concept, plano, ADR, entregáveis). Use a skill `implement-me` para executar specs de ponta a ponta e `orchestrate-me` para executar um range de specs em paralelo (um subagent por spec).
5. **Rode os checks de qualidade** de `QA.md` antes de declarar qualquer mudança concluída.
