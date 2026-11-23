# ADR-015: Redesign da home autenticada (2ª geração)

- **Status:** aceito
- **Data:** 2026-11-22
- **Decisão load-bearing:** isolar o texto em streaming num **store externo com batching em `requestAnimationFrame`** (`useSyncExternalStore`, só `StreamingMessage` assina) e compor a home como **orquestrador de componentes memoizados** (thread, composer, estado vazio), com direção visual **editorial** (papel quente + tinta + pastéis pontuais), sem nenhuma dependência nova.

## Contexto

A spec `014-redesign-home` pediu elevar a home `/app` e o app shell, preservando experts, envio, SSE, chips, conexões, logout, navegação e guards. A home da ADR-013/014 era funcional, mas plana: uma caixa com borda, estado vazio genérico, mensagens sem autoria, FAB de conexões desconectado do fluxo. Tecnicamente, cada token SSE atualizava o estado do `HomePage`, re-renderizando a lista inteira (incluindo markdown reparseado), e o auto-scroll forçava o fim a cada token, puxando quem rolava para cima. O resize do textarea lia/escrevia layout a cada tecla.

## Decisões

### 1. Streaming fora do estado React

- `lib/streaming-store.ts`: `subscribe`/`getSnapshot`/`append`/`reset`. `append` acumula e agenda **uma** notificação por frame; `reset` cancela o frame e notifica.
- `useChatStream` expõe `streamingStore` em vez de `streamingContent`. `StreamingMessage` usa `useSyncExternalStore`; a lista de mensagens não recebe o conteúdo parcial e não re-renderiza por token.
- Lista memoizada (`AssistantMessageGroup`, `UserMessage`, `ChatMarkdown` com `memo`) e timeline calculada com `useMemo`.

### 2. Auto-scroll sem layout thrashing

- `ResizeObserver` no conteúdo + `requestAnimationFrame` (uma escrita por frame); estado "pinned" (limiar 96 px) e botão **Jump to latest**.
- Scroll programático ignora o evento de scroll resultante (flag liberada em dois frames) — sem isso, imagens que carregam depois marcavam o usuário como "não fixado".
- Threads > 24 mensagens ganham `content-visibility: auto` nos grupos (enhancement, sem biblioteca de virtualização).

### 3. Correções de comportamento no hook

- Falha em `createConversation` agora reseta `isStreaming`/`busyRef` e mostra erro (antes a UI travava em "streaming").
- Refetch no `done` tem `catch` (sem unhandled rejection); `mountedRef` evita `setState` após unmount; `selectExpert` é ignorado durante streaming; `Retry` recarrega o workspace.

### 4. Composição e componentes

- `home.tsx` virou orquestrador. Novos: `ChatComposer` (draft local, não re-renderiza a home por tecla; Enter/Shift+Enter/IME; contador `n / 4,000`), `HomeEmptyState` (saudação com primeiro nome, deck, nota "Grounded in your data", faixa de 9 experts com snap, chips), `ConversationThread`, `MessageBubble`/`AssistantMessageGroup`, `StreamingMessage`, `ExpertAvatar`, `chat-utils` (saudação, iniciais, acentos, dias, agrupamento).
- Conexões saem do FAB e vão para o composer (`aria-label="Open connections"`) + nota no estado vazio.
- Somente primitivos existentes de `@repo/ui` (`button`, `select`, `textarea`, `sheet`, `sidebar`, `avatar`, `badge`, `skeleton`, `dropdown-menu`); nenhum `shadcn add` necessário.

### 5. Direção visual e tokens

- Papel quente `#fdf9f4`/`#f8f1e8`, réguas `#e9dccf`, tinta `#35403f`, pastéis existentes como acento. Assinatura: primeiro nome com marca-texto pastel e avatares de iniciais coerentes entre cards, composer e mensagens.
- Novos tokens/classes em `index.css`: `--color-app-canvas`, `--color-app-canvas-deep`, `--color-app-rule`, `--shadow-lift`, `--shadow-composer`, `.app-canvas`, `.eyebrow`, `.marker-highlight`, `.chat-scroll`, `.chat-thread--long`, animações CSS e regra global de `prefers-reduced-motion`. Tokens `--sidebar-*` ficaram quentes; tokens usados pelas páginas de auth não mudaram.
- Shell: sidebar com marca + "Leadership, on call.", item ativo com `aria-current`, "Signed in as {name}"; header com breadcrumb `Workspace / Home` e menu de conta.

### 6. Acessibilidade

`h1` por estado (visível no vazio, `sr-only` na conversa/loading), `role="log"` + `aria-live="polite"`, status sr-only de "writing", `role="alert"` no erro, `aria-pressed` nos cards de expert, foco visível, `prefers-reduced-motion`, tags semânticas (`hr`, `output`, `time`, `nav`).

## Trade-offs

- **Store externo** adiciona uma peça no hook, em troca de render por token só no bloco de streaming; fica isolada e testada.
- **`content-visibility`** reduz custo mas não substitui virtualização (adiada); pode ser removida se causar salto de scroll.
- **Faixa horizontal** esconde cards fora da viewport; mitigado por snap, cards parcialmente visíveis e Tab.
- **Sem retry automático de mensagem** para evitar duplicação no servidor.
- Dependência de Google Fonts mantida (fallback `system-ui`).
- O renderer de markdown segue sem suporte a imagens (`![]()`) e tabelas; mídia gerada vem por `mediaUrl`.

## Consequências

- Streaming e scroll mais baratos; UI não trava mais em falha de criação de conversa.
- Seletores dos testes preservados (`Message`, `Open connections`, `Sign out`, `How can I help you today?`); estado vazio funciona com `experts=[]`.
- Novos testes: `streaming-store.test.ts`, `chat-utils.test.ts`. Nenhuma dependência nova.
- Histórico de conversas na sidebar, abortar streaming e virtualização continuam como evolução futura.
