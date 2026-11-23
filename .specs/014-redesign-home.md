---
title: Redesign da home autenticada (2ª geração)
status: draft
created: 2026-11-22
---

# Redesign da home autenticada (2ª geração)

> Elevar a home de chat (`/app`) e o app shell a uma experiência acolhedora e editorial — com hierarquia tipográfica clara, espaço em branco generoso e micro-interações discretas — preservando integralmente o comportamento de experts, streaming SSE, conexões, logout, navegação e guards.

## Contexto

A home autenticada já passou por um redesign na spec `012-ui-redesign` (ADR 013), que introduziu shadcn/ui em `packages/ui`, tokens semânticos, fontes Sora/Inter e o app shell com sidebar. A feature de experts (spec `013-experts`, ADR 014) adicionou o chat com streaming SSE, seleção de expert, sugestões e o sheet de conexões.

O resultado é funcional, mas visualmente plano: a área de conversa é uma caixa com borda, o estado vazio é um ícone centralizado com texto genérico, as mensagens não têm identidade de autor nem agrupamento, o composer parece um formulário, o contador de caracteres não existe e o botão de conexões flutua desconectado do fluxo. O shell também não comunica contexto de página nem a identidade do produto com a mesma qualidade das telas de auth.

Esta é a **segunda geração** do redesign: não é um recomeço. A base (shadcn/ui, tokens, tipografia, shell, comportamento) é mantida; o que muda é o nível de acabamento, a clareza editorial e a performance percebida durante o streaming.

## Objetivo

- Dar personalidade à tela vazia: saudação com o primeiro nome do usuário, uma frase curta sobre o que a plataforma faz e pontos de partida reais (faixa de experts + chips de sugestão).
- Tornar a conversa legível e humana: avatar/identidade do expert, agrupamento por autor, timestamps discretos, separadores de dia, markdown e mídia bem resolvidos.
- Transformar o composer em um card elevado e óbvio: seletor de expert integrado, textarea auto-resize, botão de envio claro, contador/limite discreto e acesso às conexões no fluxo.
- Fazer o app shell parecer parte da mesma casa: header com contexto da página e menu de conta, sidebar com identidade visual coerente e navegação clara.
- Preservar 100% do comportamento e dos seletores cobertos por testes.
- Reduzir o custo de renderização durante o streaming: a lista inteira de mensagens não pode re-renderizar a cada token, e o auto-scroll não pode causar layout thrashing.
- Garantir acessibilidade AA, operação por teclado e responsividade real em 360, 768, 1024 e 1440 px.

## Direção visual

**Conceito:** uma mesa de trabalho editorial e acolhedora — papel quente, tinta escura, pequenos acentos pastel e muito respiro. O produto é um time de liderança sob demanda; a home deve parecer uma conversa de alto nível, não um console de IA.

- **Paleta:** papel quente (`#fdf9f4` / `#f8f1e8`), tinta (`#35403f`), réguas finas (`#e9dccf`) e os pastéis existentes como identidade: `--soft-blush`, `--alice-blue`, `--mint-cream`, `--pale-sky`, `--powder-blue`. Nada de gradiente roxo, neon ou “AI glow”. O pastel aparece em avatares, seleção e detalhes, nunca como fundo dominante.
- **Tipografia:** Sora para display (saudação, nomes de expert, títulos), Inter para corpo; labels em caixa alta de 10–11 px com tracking generoso; timestamps e contador com `tabular-nums`. A saudação é o maior elemento da tela, com o primeiro nome do usuário destacado por um traço de marca-texto pastel (assinatura visual).
- **Layout:** composição assimétrica de revista. No desktop, a saudação ocupa ~8 colunas e uma nota contextual “Grounded in your data” ocupa ~4 colunas à direita; abaixo, a faixa de experts e os chips. Na conversa, uma coluna de leitura com trilho de avatar à esquerda e o composer como card elevado. No mobile, tudo empilha e a faixa de experts vira scroll horizontal com snap.
- **Assinatura:** o primeiro nome destacado com marca-texto + avatares de iniciais em pastéis que se repetem no composer e nas mensagens, criando continuidade entre escolha, conversa e identidade.
- **Movimento:** uma entrada orquestrada e curta (saudação e faixa com fade/rise de 240 ms), caret de streaming, três pontos de “writing” e hover sutil nos cards. Tudo desligado ou reduzido em `prefers-reduced-motion`.
- **O que evitar:** hero centralizado com ícone de sparkles, gradientes em excesso, bolhas de chat com sombra pesada, numeração decorativa 01/02/03 e qualquer estética de template genérico.

## Escopo

- **Dentro:**
  - Home autenticada em `/app` (e rotas placeholder que hoje renderizam a mesma página).
  - App shell: sidebar, header, menu de conta, skip link.
  - Estados: loading, vazio, conversa, streaming, erro e conversa longa.
  - Composer: dropdown de expert, textarea, envio, contador/limite, hint de teclado, botão de conexões.
  - Chips de sugestão e faixa de experts do estado vazio.
  - Botão e sheet de conexões (apenas o visual e a integração na home; o fluxo de upload/URL/remoção é preservado).
  - Responsividade, acessibilidade, `prefers-reduced-motion` e performance de streaming/scroll.
  - Testes unitários novos para utilitários de apresentação; testes existentes preservados.
  - Screenshots antes/depois em `.screenshots/`.
- **Fora:**
  - Páginas de auth, API, `apps/agents`, `packages/experts` e regras de negócio.
  - Novas features de produto: histórico de conversas na sidebar, busca, CRUD de experts, stop generation, drag-and-drop de arquivos, exportação, temas.
  - Dark mode (o projeto é light-only por decisão do ADR 013).
  - Virtualização com biblioteca externa.
- **Adiado:**
  - Sidebar com conversas recentes (exigiria estado de chat compartilhado no shell).
  - Abortar streaming no cliente.
  - Tabelas no renderer de markdown.
  - Fila assíncrona para geração de mídia.

## Necessidade de negócio

- **Confiança e percepção de qualidade:** a home é a primeira tela após o login; ela precisa parecer um produto sênior, não um protótipo.
- **Ativação:** reduzir o tempo até a primeira pergunta, deixando claro qual expert escolher, o que perguntar e por que conectar dados.
- **Clareza do produto:** comunicar em uma frase que a plataforma transforma dados da empresa em decisões com experts de liderança.
- **Retenção:** uma conversa legível, com autoria e ritmo, aumenta a chance de o usuário voltar e continuar a thread.

## Critérios de aceite

- [ ] Seleção de expert continua funcionando: trocar o expert no composer ou na faixa carrega a conversa existente daquele expert ou limpa a thread; o placeholder e as sugestões mudam.
- [ ] Envio de mensagem continua funcionando por Enter, Shift+Enter (quebra de linha), clique no botão e clique em chip; o limite de 4.000 caracteres é respeitado e o contador é discreto.
- [ ] Streaming SSE continua funcionando: tokens aparecem progressivamente, o indicador de “writing” é visível, o `done` recarrega a thread e o `error` mostra um alerta sem travar a UI.
- [ ] O sheet de conexões abre pelo botão do composer e pela nota da tela vazia; upload, conexão por URL, listagem e remoção continuam funcionando.
- [ ] Logout funciona pela sidebar e pelo menu de conta; a navegação da sidebar (Home/Experts/Connectors) continua funcionando; guards de rota não mudam.
- [ ] Estado vazio contém: saudação com o primeiro nome (`Good morning, Ada.` / `Good afternoon, Ada.` / `Good evening, Ada.`), a frase `How can I help you today?`, uma frase curta sobre a plataforma, a faixa horizontal com todos os experts, chips de sugestão do expert selecionado e a nota `Grounded in your data`.
- [ ] Estado de conversa contém: avatar/iniciais do expert, nome e cargo, agrupamento por autor, timestamps discretos, separadores de dia, markdown, mídia gerada e indicador de streaming.
- [ ] Conversa longa: a thread mantém scroll fluido, o auto-scroll não “puxa” o usuário que subiu para ler, e existe um botão `Jump to latest` quando ele está longe do fim.
- [ ] Durante o streaming, a lista de mensagens não re-renderiza a cada token (apenas o bloco de streaming e o controle de scroll reagem); o auto-scroll é agendado em `requestAnimationFrame` e não intercala leituras/escritas de layout.
- [ ] O composer tem aparência de card elevado, seletor de expert com nome + cargo, botão de envio com `aria-label="Send message"`, contador `n / 4,000`, hint de teclado e botão de conexões com nome acessível `Open connections`.
- [ ] O app shell tem header com contexto da página (`Workspace / Home`), menu de conta com nome/e-mail e `Sign out`, sidebar com identidade visual coerente, item ativo com `aria-current="page"` e botão `Sign out` visível em 1280×720.
- [ ] Responsividade: sem overflow horizontal em 360, 768, 1024 e 1440 px; o composer permanece visível; a sidebar vira sheet no mobile; a faixa de experts rola com snap.
- [ ] Acessibilidade: um `h1` por estado, labels/`aria-label` em todos os controles, foco visível, navegação por teclado, contraste AA, `aria-live` no status de streaming, `role="log"` na conversa, `role="alert"` no erro, `prefers-reduced-motion` respeitado.
- [ ] Textos de UI em en-us; nenhum texto novo em português.
- [ ] Testes existentes (`App.test.tsx`, `chat-markdown.test.tsx`, e2e `app.spec.ts` e `auth-redirects.spec.ts`) passam sem remoção de cobertura; seletores `Message`, `Open connections`, `Sign out` e o texto `How can I help you today?` são preservados.
- [ ] Novos testes unitários cobrem saudação, iniciais de expert, agrupamento/separadores de dia e batching do store de streaming.
- [ ] Gates de QA verdes: `bun run code:fix`, `bun run types:check`, `bun run test`, `bun run test:e2e`, `bun run build`.
- [ ] Screenshots antes/depois em `.screenshots/`: `home-before-v2.png`, `home-after-v2.png`, `home-mobile-after.png` e, no mínimo, uma captura de conversa.
- [ ] Nenhuma dependência nova.

## O que fazer

1. **Fundação visual (`apps/app/src/index.css`)**
   - Adicionar tokens de superfície do app (`--color-app-canvas`, `--color-app-canvas-deep`, `--color-app-rule`) sem alterar os tokens semânticos usados pelas telas de auth.
   - Ajustar os tokens `--sidebar-*` para o papel quente e manter contraste AA.
   - Adicionar sombras suaves (`--shadow-lift`, `--shadow-composer`) e keyframes utilitários (`caret`, `rise`, `typing-dot`).
   - Adicionar regra global de `prefers-reduced-motion` e `scrollbar-gutter`/`overscroll-behavior` para a thread.
2. **App shell (`apps/app/src/components/app/app-shell.tsx`)**
   - Sidebar com brand mark em pastel, wordmark Sora, subtítulo curto, nav com item ativo, `aria-current`, tooltips no modo colapsado e rodapé com “Signed in as {firstName}” + `Sign out`.
   - Header com `SidebarTrigger`, contexto `Workspace / {page}`, menu de conta (avatar, nome, e-mail, `Sign out`).
   - `SidebarInset` com canvas quente e um brilho pastel ambiente muito sutil, `aria-hidden`.
   - Manter o skip link e o botão `Sign out` com nome acessível exato.
3. **Utilitários de apresentação (`apps/app/src/components/chat/chat-utils.ts`)**
   - `getGreeting(date)` → `Good morning` / `Good afternoon` / `Good evening`.
   - `expertInitials(name)` → `CEO`, `SD`, `CS`, `CH`.
   - `expertAccent(slug)` → classes pastel estáveis por expert.
   - `formatMessageTime(iso)` e `dayLabel(iso)` com `Intl.DateTimeFormat` em en-US.
   - `buildMessageTimeline(messages, expert)` → itens de dia + grupos por autor, sem agrupar user e assistant.
4. **Store de streaming (`apps/app/src/hooks/use-chat-stream.ts`)**
   - Criar um store externo (`subscribe`/`getSnapshot`/`append`/`reset`) com batching em `requestAnimationFrame`, consumido por `useSyncExternalStore` apenas no bloco de streaming.
   - Manter `messages`, `isStreaming`, `error`, `experts`, `conversation` como estado React; tokens não entram no estado do componente da lista.
   - Corrigir o fluxo de `sendMessage` para que falhas em `createConversation` também resetem `isStreaming`/`busyRef` e mostrem erro.
   - Tratar falha de refetch no `done` sem unhandled rejection.
   - Expor `reloadWorkspace` para o botão `Retry` do erro de carregamento inicial.
5. **Componentes de conversa (`apps/app/src/components/chat/*`)**
   - `expert-avatar.tsx`: avatar de iniciais com acento pastel e tamanhos.
   - `message-list.tsx` (ou `conversation-thread.tsx`): timeline com separadores de dia, grupos por autor, `role="log"`, `aria-live="polite"`, `aria-label="Conversation with {expert}"`, `content-visibility` progressivo para threads longas.
   - `message-bubble.tsx`: bolha de usuário à direita; bloco editorial do expert à esquerda com avatar, nome, cargo, timestamp, markdown e mídia; `break-words`, `min-w-0`, imagens com `alt`/`loading="lazy"`, vídeo com `aria-label`.
   - `streaming-message.tsx`: avatar + “{expert} is writing…”, três pontos CSS, markdown progressivo, caret; conteúdo visual `aria-hidden` e status separado em `role="status"`.
   - `jump-to-latest.tsx`: pill flutuante acima do composer quando o usuário não está no fim.
6. **Composer (`apps/app/src/components/chat/chat-composer.tsx`)**
   - Card elevado com borda quente, `focus-within` ring, seletor de expert (avatar + nome + cargo) usando `Select` do `@repo/ui`, botão `Connections` (ícone + texto no desktop; ícone com `aria-label="Open connections"` no mobile), textarea auto-resize, hint `Enter to send · Shift + Enter for a new line`, contador `n / 4,000` e botão `Send message`.
   - Respeitar IME (`event.nativeEvent.isComposing`), `maxLength`, `aria-describedby` e foco visível.
   - Não desabilitar a textarea durante o streaming; apenas envio/seleção.
7. **Estado vazio (`apps/app/src/components/chat/home-empty-state.tsx`)**
   - Eyebrow editorial, saudação com nome destacado, deck `How can I help you today?`, frase de valor, nota `Grounded in your data` com CTA `Connect data`, faixa horizontal com os 9 experts (scroll snap, cards com `aria-pressed`), chips `Try asking {expert}`.
   - Sem experts (caso do e2e): renderizar o estado vazio sem crash, seletor desabilitado, sem cards/chips e com uma nota curta.
8. **Home (`apps/app/src/pages/app/home.tsx`)**
   - Orquestrar estados: loading skeleton, vazio, conversa, streaming, erro; `h1` visível no vazio e `h1` sr-only na conversa.
   - Auto-scroll com `ResizeObserver` + `requestAnimationFrame`, detecção de “pinned” e `Jump to latest`; não usar `useEffect` que escreve scroll a cada token.
   - Banner de erro com `role="alert"`, `Dismiss` e `Retry` quando for falha de carregamento do workspace.
   - Integrar o sheet de conexões ao composer e à nota do estado vazio.
9. **Sheet de conexões (`apps/app/src/components/chat/connections-sheet.tsx`)**
   - Polir hierarquia, ícones por tipo, contagem de fontes, empty state com borda tracejada, status badges e lista com `min-w-0`/truncate; manter upload, URL e remoção.
10. **Markdown (`apps/app/src/components/chat/chat-markdown.tsx`)**
    - Ajustar tipografia/ritmo para a coluna editorial, manter code blocks com overflow e links acessíveis; memoizar o componente.
11. **Testes e QA**
    - Adicionar `chat-utils.test.ts` e `streaming-store.test.ts` (ou equivalente) para as funções puras e o batching.
    - Preservar seletores e textos exigidos pelos testes existentes.
    - Capturar antes/depois com API mockada e validar os estados manualmente.
12. **Documentação**
    - Atualizar `.docs/DESIGN_SYSTEM.md` se novos padrões/tokens forem consolidados.
    - Criar `.adrs/015-redesign-home.md` ao final.

## O que não fazer

- Não alterar API, `apps/agents`, `packages/experts`, páginas de auth ou contratos de dados.
- Não recriar primitivos de UI localmente; usar `@repo/ui/components/ui/*` e, se faltar um componente, adicioná-lo ao pacote via `bunx shadcn add` seguindo o ADR 013.
- Não adicionar dependências novas (bibliotecas de animação, virtualização, markdown, datas ou estado).
- Não remover ou enfraquecer testes; se um seletor mudar, atualizar o teste mantendo a cobertura.
- Não implementar dark mode, temas alternativos ou preferência de densidade.
- Não inventar features de produto (histórico na sidebar, stop generation, drag-and-drop, CRUD de experts).
- Não usar `transition: all`, `outline-none` sem substituto de foco, `user-scalable=no` ou animações sem `prefers-reduced-motion`.
- Não deixar a home com aparência de template genérico (hero centralizado, sparkles, gradiente roxo, cards uniformes sem hierarquia).

## Decisões

| Decisão              | Opção escolhida                                                                  | Racional                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Direção visual       | Editorial acolhedora, papel quente + tinta + pastéis pontuais                    | Diferencia de consoles de IA e conversa com a identidade já usada no auth; transmite senioridade e calma. |
| Base de componentes  | shadcn/ui em `@repo/ui`                                                          | Já é o padrão do projeto (ADR 013); evita primitivos duplicados e mantém acessibilidade.                  |
| Expert na tela vazia | Faixa horizontal com todos os 9, scroll snap                                     | Não hierarquiza experts arbitrariamente; funciona bem no mobile e mantém a tela compacta.                 |
| Conexões             | Botão no composer + nota “Grounded in your data” no vazio                        | Coloca a ação no fluxo principal e explica o benefício; remove o FAB desconectado.                        |
| Streaming            | Store externo com `useSyncExternalStore` + batching em rAF                       | Evita re-render da lista a cada token e mantém o markdown progressivo fluido.                             |
| Auto-scroll          | `ResizeObserver` + pinned state + `Jump to latest`                               | Evita layout thrashing e respeita quem está lendo o histórico.                                            |
| Conversa longa       | `content-visibility: auto` progressivo, sem lib                                  | Melhora o custo de renderização sem dependência nova; fallback natural quando não suportado.              |
| Agrupamento          | Grupos por autor + separadores de dia                                            | Dá ritmo editorial e reduz ruído visual em threads longas.                                                |
| Timestamps           | `Intl.DateTimeFormat` en-US, `time` semântico                                    | Consistência de locale e acessibilidade sem dependência nova.                                             |
| Contador             | `n / 4,000`, visível e discreto, com `aria-describedby`                          | Torna o limite previsível sem competir com o envio.                                                       |
| Erro                 | Banner com `Dismiss`; `Retry` só para falha de workspace                         | Recuperação clara sem inventar retry de mensagem (risco de duplicação).                                   |
| Seletores de teste   | Preservar `Message`, `Open connections`, `Sign out`, `How can I help you today?` | Evita regressão de cobertura e mantém o contrato com os e2e.                                              |
| Dependências         | Nenhuma nova                                                                     | CSS cobre animações; `Intl` cobre datas; shadcn cobre componentes.                                        |
| Tema                 | Light-only                                                                       | Decisão existente do ADR 013.                                                                             |

## Dependências

- Specs anteriores: `012-ui-redesign`, `013-experts`.
- ADRs: `013-ui-redesign`, `014-experts-ai-architecture`.
- Componentes `@repo/ui`: `button`, `textarea`, `select`, `avatar`, `badge`, `sheet`, `skeleton`, `dropdown-menu`, `sidebar`, `tooltip`, `separator`.
- `lucide-react` (já instalado) para ícones.
- APIs nativas: `Intl.DateTimeFormat`, `ResizeObserver`, `requestAnimationFrame`, `useSyncExternalStore`.
- Nenhuma biblioteca nova.

## Riscos e trade-offs

- **Regressão de e2e por texto/seletor:** mitigado mantendo os nomes acessíveis e o texto `How can I help you today?`; rodar `test:e2e` antes de finalizar.
- **Mudança de tokens da sidebar:** afeta apenas o app shell; auth usa `--background`/`--card` e não deve ser alterado. Validar visualmente as telas de auth por precaução.
- **Faixa horizontal de experts:** pode esconder cards fora da viewport; mitigado com label, contagem, snap, cards parcialmente visíveis e navegação por Tab.
- **`content-visibility`:** pode interferir em scroll anchoring/foco em alguns navegadores; aplicar como enhancement e remover se causar salto ou perda de foco.
- **Store de streaming:** aumenta a complexidade do hook; isolar em função testável e manter fallback síncrono quando `requestAnimationFrame` não existir.
- **Fontes via Google Fonts:** dependência de rede já existente; fallback `ui-sans-serif`/`system-ui` continua.
- **Screenshots:** o agente não julga pixels com precisão; as capturas servem para revisão humana e comparação antes/depois.
- **Sem virtualização:** threads muito longas ainda renderizam todos os grupos no DOM; `content-visibility` reduz o custo, mas não substitui virtualização (adiada).
- **Retry de mensagem:** não será automático para evitar duplicação no servidor; o usuário reenvia manualmente.

## Edge cases e modos de falha

- **`experts=[]` (e2e):** estado vazio sem cards/chips, seletor desabilitado, sem crash; `How can I help you today?` e `Open connections` visíveis.
- **Falha ao carregar workspace:** banner `role="alert"` com `Retry`; skeleton sai do estado de loading.
- **Falha em `createConversation`:** `isStreaming` e `busyRef` são resetados; erro exibido; nenhuma mensagem otimista é criada.
- **Erro SSE:** banner com a mensagem, thread preservada, streaming encerrado; `Dismiss` limpa.
- **Falha no refetch do `done`:** erro exibido, sem unhandled rejection; a thread permanece com o que já estava carregado.
- **Usuário sobe durante o streaming:** auto-scroll pausa; `Jump to latest` aparece; ao clicar, volta ao fim.
- **Mensagem longa/URL/código:** `break-words`, `min-w-0`, code block com `overflow-x-auto`, sem overflow horizontal na página.
- **4.000 caracteres:** `maxLength` impede ultrapassar; contador muda de cor perto do limite; envio desabilitado quando vazio/streaming.
- **IME (composição):** Enter durante composição não envia.
- **Primeiro nome ausente:** saudação `Welcome back.` sem nome.
- **Data inválida:** timestamp vazio, sem “Invalid Date”.
- **Mídia ausente/quebrada:** bloco de mídia não renderiza se faltar URL/tipo; imagem com `alt` descritivo.
- **Sidebar colapsada:** tooltips nos itens, `Sign out` acessível por nome, brand mark visível.
- **Mobile:** sidebar em sheet, composer com safe area, teclado não cobre o envio (layout com `svh`/`dvh`), sem zoom bloqueado.
- **Troca de expert durante streaming:** seletor desabilitado; sem corrida entre threads.
- **Duplo envio:** `busyRef` bloqueia.
- **Unmount durante fetch:** evitar `setState` após desmontar (flag/ref).

## Resultado (definição de pronto)

- Todos os critérios de aceite acima marcados.
- `bun run code:fix`, `bun run types:check`, `bun run test`, `bun run test:e2e` e `bun run build` verdes.
- Validação manual dos estados vazio, conversa, streaming, erro e mobile documentada.
- Screenshots antes/depois em `.screenshots/`.
- ADR `015-redesign-home.md` criado com decisões, trade-offs e consequências.
- Nenhuma dependência nova e nenhum comportamento de produto removido.

## Arquivos e diretórios envolvidos

- **Spec/plano/ADR:** `.specs/014-redesign-home.md`, `.plans/014-redesign-home-plan.md`, `.adrs/015-redesign-home.md`.
- **App shell:** `apps/app/src/components/app/app-shell.tsx`.
- **Home e chat:**
  - `apps/app/src/pages/app/home.tsx`
  - `apps/app/src/components/chat/chat-composer.tsx` (novo)
  - `apps/app/src/components/chat/home-empty-state.tsx` (novo)
  - `apps/app/src/components/chat/conversation-thread.tsx` (novo)
  - `apps/app/src/components/chat/message-bubble.tsx` (novo)
  - `apps/app/src/components/chat/streaming-message.tsx` (novo)
  - `apps/app/src/components/chat/expert-avatar.tsx` (novo)
  - `apps/app/src/components/chat/chat-utils.ts` (novo)
  - `apps/app/src/components/chat/chat-markdown.tsx`
  - `apps/app/src/components/chat/connections-sheet.tsx`
  - `apps/app/src/hooks/use-chat-stream.ts`
- **Estilos:** `apps/app/src/index.css`.
- **Testes:** `apps/app/src/components/chat/chat-utils.test.ts` (novo), `apps/app/src/hooks/streaming-store.test.ts` (novo), testes existentes preservados.
- **Screenshots:** `.screenshots/home-before-v2.png`, `.screenshots/home-after-v2.png`, `.screenshots/home-mobile-after.png`, `.screenshots/home-conversation-after-v2.png`.
- **Docs:** `.docs/DESIGN_SYSTEM.md` (se necessário).
