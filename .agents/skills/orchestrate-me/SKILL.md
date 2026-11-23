---
name: orchestrate-me
description: Orquestra a implementação de um RANGE de specs de uma vez, em paralelo. Recebe um range numérico (ex.: "001-010"), resolve as specs em ./.specs/, mapeia as dependências entre elas, calcula as ondas de execução (ordem topológica) e sobe UM subagent por spec (em background, em paralelo) para implementar cada spec de ponta a ponta seguindo a skill implement-me. O agente principal vira orquestrador: spawna subagents, acompanha o progresso (todo list + notificações), valida os commits por spec e entrega um relatório consolidado. Use quando o usuário disser "implementa as specs 001 a 008", "executa o range 001-010", "faz as specs 004 até 007", "orchestra as specs", "implementa as specs 001-008 em paralelo", "roda o range de specs", "implement-me no range ..." ou pedir para implementar VÁRIAS specs de uma vez — inclusive sem dizer a palavra "range".
metadata:
  author: coders-university
  version: "1.0.0"
---

# Orchestrate Me

Orquestra a implementação de **várias specs de uma vez**. Você é o **orquestrador**: não implementa specs. Para cada spec do range você sobe **um subagent** (em background, em paralelo) que executa a spec de ponta a ponta seguindo a skill `implement-me`. Seu trabalho: resolver o range, planejar, spawnar, acompanhar o progresso, validar commits por spec e reportar o resultado consolidado.

Por que subagents e não "fazer você mesmo": cada spec tem contexto, plano, implementação, QA e commit próprios. Rodando N specs em paralelo com um subagent dedicado por spec, o tempo total cai para o da spec mais demorada da cadeia crítica — e o orquestrador fica livre para gerenciar progresso, conflitos e dependências.

## Convenções do projeto

- **Contexto:** `AGENTS.md` e documentos em `.docs/` (mapa em `AGENTS.md`).
- **Workflow obrigatório:** `RULES.md`.
- **Specs:** `./.specs/NNN-<nome>.md`.
- **Planos:** `./.plans/` — cada subagent gera `./.plans/[spec-file-name]-plan.md`; você gera o plano de orquestração.
- **ADRs:** `./.adrs/*.md` — um por spec, criado pelo subagent.

## Fluxo

### 1. Resolver o range de specs

1. Interprete o range dado pelo usuário:
   - `001-010` → todas as specs numeradas de 001 a 010.
   - `001,003,005` → apenas as specs listadas.
   - `001` → uma spec só. Para um número único, sugira usar `implement-me` (sem overhead de orquestração).
2. Para cada número, localize o arquivo `./.specs/NNN-*.md` (glob).
3. Reporte números sem spec correspondente (ex.: `011` não existe) e pergunte se o range está correto antes de seguir.

### 2. Adquirir contexto

Leia `AGENTS.md` e os documentos relevantes do mapa (`RULES.md`, `ARCHITECTURE.md`, `DEVELOPMENT.md`, `QA.md`). Leia o suficiente para **planejar**. Não absorva o contexto completo de cada spec — os subagents carregam tudo de novo via `implement-me`; seu papel é a visão geral (dependências, ondas, riscos).

### 3. Classificar as specs

Para cada spec do range, verifique se **já está implementada**: existe `./.adrs/NNN-*.md` **e** há commit no git tocando os arquivos da spec (`git log --oneline -- <pasta/arquivos da spec>`).

- **Já implementada** → marque como tal e **não spawna subagent** (evita retrabalho e commits vazios).
- **Pendente** → segue para a orquestração.

### 4. Mapear dependências e calcular as ondas

1. Leia a seção `## Dependências` de cada spec pendente e extraia as referências a outras specs do range (ex.: `004-sign-up.md`).
2. Uma dependência é **satisfeita** se a spec dependida **não está no range** (presume-se pronta) **ou** já está implementada (passo 3).
3. Monte a **ordem topológica** em ondas: uma spec só entra na onda atual quando todas as dependências in-range dela estiverem em ondas anteriores ou satisfeitas. Exemplo com o range `001-008` do repositório:
   - Onda 1: `001` · Onda 2: `002` · Onda 3: `003` · Onda 4: `004`, `006`, `007` · Onda 5: `005`, `008`.
4. **Ciclo de dependências** (A depende de B e B depende de A): reporte ao usuário e peça orientação — não force uma ordem arbitrária.
5. **Colisão de arquivos:** compare as seções "Arquivos e diretórios envolvidos" das specs da **mesma onda**. Se duas specs tocam os mesmos arquivos (ex.: o mesmo `auth.module.ts`), registre como **risco no plano**: o commit que vier por último pode sobrescrever mudanças do outro. Specs que colidem podem ser serializadas (uma espera a outra) — decida caso a caso e registre no plano.

### 5. Escrever o plano de orquestração

Salve em `./.plans/orchestration-<range>-plan.md` (ex.: `orchestration-001-008-plan.md`):

- Range resolvido e specs encontradas.
- Status de cada spec (já implementada / pendente).
- Grafo de dependências e ondas.
- Subagents a spawnar (um por spec pendente).
- Estratégia de commit (por spec, arquivos explícitos, co-author — ver passos 7 e 8) e desvio consciente do `git add -A` do `/commit-and-push`.
- Riscos: colisão de arquivos na mesma onda, migrações de banco concorrentes, falhas de subagent.
- Critérios de aceite do range: todas as specs concluídas, QA gates passando, um commit Conventional por spec com co-author.

**Apresente o plano ao usuário e aguarde aprovação** antes de spawnar — exceto se o usuário já aprovou a execução do range.

### 6. Spawnar subagents (paralelo, background)

Regras de ouro:

- **Um subagent por spec pendente**, via ferramenta `task` com `subagent_type: general`, em **background**.
- **Spawne os subagents da mesma leva na MESMA mensagem** (chamadas paralelas) — nunca em série.
- **Você não implementa.** Se um subagent estiver lento, não faça o trabalho por ele.
- Spawne uma spec **assim que todas as dependências in-range dela estiverem concluídas**. Na prática: ao receber a notificação de conclusão de um subagent, verifique quais specs dependiam dela e spawne as que ficaram prontas — as ondas andam sozinhas.

Prompt do subagent (self-contained — ele não enxerga esta skill):

```
Você é o subagent responsável pela spec <NNN-nome> no repositório <caminho-raiz>.

1. Carregue a skill `implement-me` em .agents/skills/implement-me/SKILL.md e siga o fluxo dela:
   adquira contexto (AGENTS.md e .docs/), refine requisitos com `feature-concept` APENAS para
   preencher lacunas reais (NÃO entreviste o usuário — decida com base na spec e documente as
   premissas no plano), gere o plano em ./.plans/<spec-file-name>-plan.md, implemente de ponta
   a ponta, crie o ADR em ./.adrs/ e rode os QA gates de QA.md.
2. Não altere arquivos de .specs/, nem planos/ADRs de OUTRAS specs.
3. COMMIT (importante): ao final, faça UM commit com APENAS os arquivos da sua spec (use a
   seção "Arquivos e diretórios envolvidos" da spec como referência), com
   `git add <caminhos explícitos>` — NUNCA `git add -A` (evita commitar trabalho de outras
   specs que rodam em paralelo). Mensagem em Conventional Commits, validada com:
   printf '%s\n' "$mensagem" | bunx commitlint. Inclua o trailer:
   Co-authored-by: ${OPENCODE_COAUTHOR_NAME:-OpenCode Agent} <${OPENCODE_COAUTHOR_EMAIL:-agent@opencode.ai}>
   Se houver commits novos na main durante o seu trabalho, rode `git pull --rebase` antes do
   commit para reconciliar. Se a spec gera migrações de banco e NÃO for a única da sua leva a
   tocar apps/api/drizzle/, apenas GERE os arquivos de migração (`drizzle-kit generate`) sem
   rodar `bun run db:migrate` (o orquestrador aplica ao final da leva).
4. Retorne: status (concluída/falhou), arquivos modificados, libs instaladas, QA gates
   (cada um: passou/falhou), caminho do ADR e do plano, e o racional das decisões.
```

### 7. Acompanhar o progresso

- Mantenha uma **todo list** (`todowrite`) com uma entrada por spec: `pending` → `in_progress` (spawnada) → `concluída` / `falhou`.
- Ao receber cada notificação de conclusão (background): atualize a todo list, spawne as specs dependentes liberadas, verifique falhas e reporte o progresso ao usuário.
- Se uma spec da leva falhar: **continue as demais** (decisão do projeto) e registre a falha para o relatório final.

### 8. Validar commits por spec

O commit é feito pelo **próprio subagent** (decisão do projeto: arquivos explícitos, nunca `-A`). Na conclusão de cada subagent, confira:

- `git log --oneline -N` mostra um commit Conventional por spec concluída, com co-author `OpenCode Agent`.
- O commit contém apenas arquivos da spec (diff coerente com o que o subagent reportou).

Se um subagent commitar arquivos de outra spec ou mensagem fora do Conventional, reporte ao usuário — **não** force push nem amende commits sem o usuário pedir.

### 9. Migrações de banco concorrentes

- Se **mais de uma spec da mesma leva** gera migrações de banco (toca `apps/api/drizzle/`), os subagents apenas geram os arquivos de migração (`drizzle-kit generate`, instrução do passo 6). Ao final da leva (todas concluídas), você roda `bun run db:migrate` uma vez antes de liberar a próxima — evita corrida no versionamento de migrações.
- Se **apenas uma spec** da leva mexe em migrações, o subagent roda `db:migrate` normalmente (critério de aceite da própria spec).

### 10. Relatório final

Ao final de todas as ondas:

- **Tabela consolidada** por spec: status (concluída / já implementada / falhou) · ADR · plano · arquivos modificados · libs · QA gates.
- **Falhas:** liste specs que falharam, o motivo reportado e o próximo passo sugerido (ex.: rodar `implement-me` na spec isolada).
- Encerre deixando claro se o range foi concluído por completo ou com pendências — nunca declare concluído com falhas não reportadas.

## Verificação obrigatória

- Nenhuma spec pendente fica sem subagent spawnado.
- Todos os commits: Conventional + co-author, um por spec, sem `git add -A`.
- O plano de orquestração foi aprovado antes do spawn (ou já aprovado pelo usuário).
- Range só é dado como concluído com todas as specs concluídas (ou falhas explicitamente reportadas).
