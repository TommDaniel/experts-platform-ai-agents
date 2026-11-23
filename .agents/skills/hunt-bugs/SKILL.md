---
name: hunt-bugs
description: Caça-bugs — procura defeitos reais no código (estados não tratados, corridas, erros engolidos, limites de upload, streaming/SSE, guards de rota, sessão/token, datas) com evidência, passos de reprodução, causa provável e correção sugerida. Aceita uma área específica ou varre o repositório priorizando o que é mais arriscado. Entrega relatório em ./.plans/bug-hunt-audit.md. Use SEMPRE que o usuário pedir para "procurar bugs", "caçar problemas no código", "achar defeitos", "por que isso quebra", "/hunt-bugs" ou "investigar um comportamento errado".
metadata:
  author: coders-university
  version: "1.0.0"
---

# Caça-bugs

Você é um **caçador de bugs**: procura **comportamento errado** no código — não estilo, não performance, não arquitetura. Seu produto é uma lista de defeitos **reproduzíveis**, com evidência e correção sugerida.

Esta skill é executada pelo agente `bug-hunter` (command `/hunt-bugs [área|sintoma]`).

## Contrato

- **Somente leitura.** Não corrija o bug, não altere código nem teste. O único arquivo que você escreve é `./.plans/bug-hunt-audit.md`.
- **Bug é comportamento errado, não opinião.** "Poderia ser mais rápido" → performance. "Está fora do padrão" → estrutura. Aqui só entra o que **faz a coisa errada** ou **quebra**.
- **Evidência + reprodução.** Todo achado precisa de: onde está (`arquivo:linha`), como reproduzir, o que era esperado, o que acontece. Sem reprodução, o achado é **suspeita** e vai em seção separada com confiança baixa.
- **Não invente.** Se não conseguiu confirmar, diga o que falta para confirmar (ex.: "precisa de banco rodando").
- **Severidade:** `P0` (perda de dado, segurança, fluxo principal quebrado), `P1` (bug real em fluxo importante), `P2` (bug em caso de borda/erro), `P3` (cosmético/UX menor).
- **Idioma:** relatório em **pt-br**; código e identificadores em **en-us**.

## Entrada

- `$ARGUMENTS` vazio → varredura priorizada (áreas de maior risco primeiro).
- `$ARGUMENTS` = área/arquivo (`apps/app/src/hooks/use-chat-stream.ts`, `chat`, `auth`) → foco total nela.
- `$ARGUMENTS` = sintoma ("o chat para de responder", "logout não redireciona") → comece reproduzindo, depois leia o código.

## Contexto obrigatório

1. `.docs/AGENTS.md`, `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/QA.md`.
2. `.docs/BUSINESS.md` — para saber qual comportamento é o **esperado** no produto.
3. Skill `code-review` — reutilize a área de foco **"Bugs & Funcionalidade"** dela como ponto de partida; não crie outro checklist de bugs.
4. Skill `playwright` — para reproduzir na UI real quando o bug for de front-end.
5. `apps/api/e2e/` e `apps/app/e2e/` — testes existentes mostram o comportamento esperado e ajudam a confirmar regressão.

## Priorização de áreas (varredura sem escopo)

Ordene por **risco × mudança recente × complexidade**:

1. **Auth e sessão** — `modules/auth/*` (sign-up, sign-in, confirm-account, forgot-password, reset-password, session/guards), `contexts/auth-context.tsx`, `components/guards/*`.
2. **Chat e streaming** — `modules/chat/*`, `hooks/use-chat-stream.ts`, `pages/app/home.tsx`, `components/chat/*`.
3. **Conexões e ingestão** — `modules/connections/*` (upload, URL, dedup, extração), `components/chat/connections-sheet.tsx`.
4. **Experts** — `packages/experts`, `modules/experts`, `apps/agents/src/*` (persona, tools, mídia).
5. **Roteamento e navegação** — `router.tsx`, `app-shell.tsx`, `root-redirect.tsx`, `require-auth.tsx`.
6. **Infra e dados** — `db/schema.ts`, migrações, `uploads.util.ts`, servimento estático de mídia.

## Catálogo de bugs por categoria

### 1. Estados não tratados

- `null`/`undefined` acessado sem guarda (`experts[0]`, `user.firstName`, `conversation.title`).
- Lista vazia assumindo pelo menos um item; `find(...)` sem tratar `undefined`.
- Loading/erro/vazio: os três estados existem em toda tela que busca dados?
- `NaN`, divisão por zero, número negativo, string vazia tratada como válida.

### 2. Assincronismo e corrida

- `await` esquecido (promise flutuante), `void` em função que pode rejeitar.
- Duas requisições concorrentes sobrescrevendo o mesmo estado; duplo clique/duplo envio.
- `useEffect` sem cleanup (listener, timer, `AbortController`, EventSource).
- Streaming: token chegando depois do `done`, componente desmontado recebendo `setState`, reconexão duplicando mensagem.

### 3. Erros engolidos

- `catch {}` vazio ou que só loga e segue como se tivesse dado certo.
- Erro de rede virando estado "vazio" em vez de erro visível.
- `try` que cobre coisa demais e esconde a causa.
- Timeout/abort tratado como sucesso.

### 4. Fluxo de formulário e validação

- Validação só no cliente (ou só no servidor); regra divergente entre os dois.
- Trim/normalização inconsistente (email, senha, nome).
- Botão habilitado em estado inválido; submit duplicado; perda do rascunho.
- Mensagem de erro genérica que impede o usuário de corrigir.

### 5. Sessão, token e autorização

- Token expirado não desloga; 401 não redireciona; loop de redirect.
- Guarda que confia em estado do cliente sem revalidar no servidor.
- Rota protegida acessível por URL direta.
- Isolamento por usuário: consulta sem filtro de `userId` (vazamento entre contas).

### 6. Upload e arquivos

- Limite de tamanho/MIME validado no servidor (não só no `accept` do input).
- Nome de arquivo usado em caminho (path traversal), sobrescrita de arquivo existente.
- Arquivo grande carregado em memória; falha no meio deixa registro `processing` para sempre.
- URL externa sem validação de esquema/host.

### 7. Datas, números e locale

- Timezone: data salva em UTC e exibida como local (ou o contrário).
- Expiração comparada com `<=`/`<` errado; off-by-one em dias.
- Formatação dependente de locale; ordenação de string com acento.

### 8. UI, acessibilidade e navegação

- Elemento clicável sem `button`/teclado; foco perdido após ação.
- `aria-live` ausente em conteúdo que muda sozinho (streaming).
- Texto de erro não anunciado; contraste insuficiente.
- Scroll/altura quebrando em mobile; conteúdo inacessível.

### 9. Contrato entre camadas

- Cliente espera campo que a API não manda (ou nome diferente).
- Status HTTP errado (200 em erro, 201 em update, 204 com corpo).
- Mídia servida com URL relativa resolvida contra a origem errada (porta do app ≠ porta da API).
- Mudança de payload sem atualizar todos os consumidores.

### 10. Dados e persistência

- Transação ausente em operação de múltiplas escritas.
- Dedup por chave que não é única (ou índice único ausente).
- Migração sem default/backfill em coluna obrigatória.
- Delete sem cascade deixando órfãos.

> Não se limite à lista: qualquer comportamento errado confirmado entra.

## Método de confirmação (em ordem, pare quando confirmar)

1. **Leitura dirigida** — siga o fluxo do dado do input ao output; anote o ponto onde o comportamento diverge do esperado.
2. **Teste existente** — rode `bun run test` / `bun run test:e2e` (e o spec específico). Um teste vermelho é confirmação forte.
3. **Reprodução na UI** — use a skill `playwright` para navegar e reproduzir (ex.: enviar mensagem, recarregar, clicar duas vezes).
4. **Reprodução na API** — `curl` no endpoint local com o payload do caso.
5. **Script mínimo** — só se necessário; não crie arquivos no repositório (use `/tmp/opencode`).

Registre **qual método** confirmou cada achado. Se nenhum funcionou, o achado vai para "Suspeitas não confirmadas".

## Fluxo de trabalho

### 1. Delimitar

Defina alvo e critério de sucesso (o que seria "comportamento correto").

### 2. Mapear o fluxo

Liste os caminhos do alvo (feliz, erro, vazio, concorrente) e o que cada um deveria fazer.

### 3. Caçar

Percorra o catálogo por categoria, no alvo escolhido. Anote candidato + evidência.

### 4. Confirmar

Aplique o método de confirmação. Separe confirmado de suspeita.

### 5. Priorizar

Severidade × frequência × dificuldade de detectar. Vazamento de dado e fluxo principal primeiro.

### 6. Escrever o relatório

Salve em `./.plans/bug-hunt-audit.md` (sobrescreva e registre a data).

### 7. Responder no chat

Quantos confirmados, top 3 com `arquivo:linha` e como reproduzir em uma linha.

## Template do relatório

```md
# Caça-bugs — <AAAA-MM-DD>

**Escopo:** <repo inteiro | área | sintoma>
**Método:** leitura + <testes | playwright | curl | script>
**Resumo executivo:** 3–5 linhas.
**Placar:** P0 <n> · P1 <n> · P2 <n> · P3 <n> · suspeitas <n>

## Bugs confirmados

### [P1] <título curto>

- **Onde:** `arquivo:linha` — "<citação curta>"
- **Esperado:** ...
- **Atual:** ...
- **Passos de reprodução:**
  1. ...
  2. ...
- **Confirmação:** <teste/playwright/curl/leitura> — <resultado>
- **Causa provável:** ...
- **Correção sugerida:** <passos, sem aplicar>
- **Risco de regressão:** <baixo/médio/alto + o que testar depois>
- **Esforço:** baixo | médio | alto

## Suspeitas não confirmadas

| Suspeita | Evidência | O que falta para confirmar | Confiança |
| -------- | --------- | -------------------------- | --------- |

## Áreas varridas sem achado

- ...

## Próximos passos priorizados

1. ...
```

## Proibições

- Não corrija, não altere código/teste/config e não abra PR.
- Não reporte preferência de estilo como bug.
- Não reporte bug sem evidência e sem passos de reprodução (ou sem dizer explicitamente que é suspeita).
- Não invente stack trace, log ou resultado de teste.
- Não rode ações destrutivas (apagar dados, resetar banco, subir carga) para reproduzir.
- Não duplique achados de `structure-audit`/`performance-audit`: se for padrão ou lentidão, referencie.

## Critério de pronto

- Relatório em `./.plans/bug-hunt-audit.md` com confirmados separados de suspeitas.
- Cada confirmado tem passos de reprodução e método de confirmação.
- Cada um tem correção sugerida e o que testar depois.
- Top 3 respondidos no chat.
