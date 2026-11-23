---
name: create-spec
description: Cria uma spec refinada a partir de um prompt ou ideia vaga e salva em ./.specs/[number]-<nome>.md. Carrega a skill feature-concept quando a ideia estiver vaga, adquire contexto da documentação (.docs/), monta a spec seguindo o template ./.specs/_template.md e apresenta para aprovação. Não implementa — entrega apenas o arquivo de spec. Use SEMPRE que o usuário pedir para criar ou gerar uma spec, ou transformar uma ideia em spec: "crie uma spec", "cria a spec", "spec para <feature>", "gera uma spec de <feature>", "me dá uma spec de <feature>", "escreve a spec de <feature>".
metadata:
  author: coders-university
  version: "1.0.0"
---

# Create Spec

Converte um prompt em um arquivo de spec refinado, pronto para ser consumido pelo `implement-me`. Você é o redator da spec: captura a intenção, preenche lacunas e entrega um documento assertivo e sem ambiguidades.

## Convenções do projeto

- **Specs:** `./.specs/[number]-[number]-<nome>.md`
- **Template:** `./.specs/_template.md` (estrutura canônica — siga à risca).
- **Contexto:** `AGENTS.md` e documentos em `.docs/` (mapa em `AGENTS.md`).
- **Elicitação:** skill `feature-concept` (entrevista uma pergunta por vez).

## Fluxo

### 1. Entender a ideia

1. Leia o prompt do usuário sem interromper. Separe o que está **dito** do que está **implícito**.
2. Se a ideia estiver vaga ou com lacunas materiais, carregue a skill `feature-concept` e conduza a entrevista (uma pergunta por vez, com resposta recomendada) até a fronteira de decisões esvaziar.
3. Se o prompt já for preciso, não burocratize — siga direto.

### 2. Adquirir contexto

1. Leia `AGENTS.md`.
2. Leia os documentos do mapa relevantes à feature (`BUSINESS.md`, `ARCHITECTURE.md`, `DESIGN.md`, `DESIGN_SYSTEM.md`, `DEVELOPMENT.md`, `QA.md`). Se a resposta já existir na documentação, use-a — não pergunte ao usuário.

### 3. Montar a spec

1. Estruture a spec seguindo o template `./.specs/_template.md`.
2. Escreva em português (BR), objetivo e sem "TODO" — todo espaço em branco do template deve ser preenchido com conteúdo real.
3. Conteúdo vago (ex.: "usar uma lib") deve virar uma decisão explícita (ex.: "usar date-fns").
4. Critérios de aceite devem ser verificáveis e objetivos.

### 4. Salvar

1. Salve em `./.specs/<slug>.md`, onde `<slug>` é o nome da feature em kebab-case (ex.: `./.specs/auth-refresh-token.md`).
2. Se já existir uma spec com esse nome, não sobrescreva sem aprovação do usuário.

### 5. Apresentar e aprovar

1. Imprima um resumo: nome do arquivo, decisões principais, critérios de aceite e pontos em aberto (se houver).
2. Aguarde a aprovação do usuário antes de encerrar.

## Regras

- **Não implemente.** Esta skill entrega o documento de spec; a execução é do `implement-me`.
- **Não invente contexto técnico.** Decisões de stack devem estar alinhadas a `.docs/` (ex.: `ARCHITECTURE.md`). Marque como "em aberto" o que não for confirmável.
- **Não altere o template nem outras specs** — apenas crie o arquivo solicitado.
- **Use a linguagem do projeto** (português BR) no documento, independentemente do idioma do prompt.
