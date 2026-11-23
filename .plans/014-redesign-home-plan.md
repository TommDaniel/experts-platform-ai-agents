# Plano — Redesign da home autenticada (2ª geração)

> Spec: `.specs/014-redesign-home.md`
> ADR esperado: `.adrs/015-redesign-home.md`
> Estratégia: elevar a home e o app shell sem tocar em API, agentes, experts ou auth; preservar comportamento e seletores; medir o antes/depois com screenshots e validar streaming, scroll e responsividade.

## 1. Objetivo do plano

Transformar a home de chat em uma experiência editorial acolhedora, com:

- estado vazio com saudação pessoal, proposta de valor, faixa de experts e chips;
- conversa com identidade do expert, agrupamento por autor, timestamps e separadores de dia;
- composer em card elevado, com seletor de expert, contador e conexões no fluxo;
- shell coerente com a home;
- streaming sem re-render da lista inteira e auto-scroll sem layout thrashing;
- acessibilidade AA e responsividade em 360/768/1024/1440;
- zero dependências novas.

## 2. Estratégia geral

1. **Congelar o “antes”** com API mockada e screenshots determinísticos.
2. **Fundação primeiro:** tokens, classes utilitárias e animações no `index.css`.
3. **Comportamento antes de beleza:** refatorar o hook/store de streaming e o fluxo de erro com testes, sem mudar contrato.
4. **Componentes de apresentação** isolados e memoizados, para que o composer e o streaming não re-renderizem a thread inteira.
5. **Compor a home** por último, quando todas as peças já estiverem testáveis.
6. **QA em ordem**, screenshots “depois”, ADR e commit.

A ordem evita o pior cenário: reescrever a UI em cima de um hook que ainda re-renderiza a lista a cada token.

## 3. Fases de execução

### Fase 0 — Baseline e “antes”

- [ ] Confirmar `bun` no PATH (`~/.bun/bin/bun`) e dependências instaladas (`bun install --ignore-scripts` se o `prepare` do lefthook falhar por falta de `.git`).
- [ ] Criar um mock de API local em `/tmp/opencode/mock-api.ts` (fora do repositório) com:
  - `GET /api/v1/auth/me` → Ada Lovelace;
  - `GET /api/v1/experts` → os 9 experts de `packages/experts`;
  - `GET /api/v1/chat/conversations` → vazio ou uma conversa, conforme o token;
  - `GET /api/v1/chat/conversations/:id/messages` → thread semeada (incluindo markdown e mensagem longa);
  - `POST /api/v1/chat/conversations/:id/messages` → SSE com `token`/`done`/`error` e delays;
  - `GET/POST/DELETE /api/v1/connections` → 2 conexões de exemplo;
  - `POST /api/v1/auth/logout` → sucesso;
  - `/mock-image.svg` para validar mídia.
- [ ] Subir o mock em `:3000` e o app em `:5173` (Vite faz proxy de `/api`).
- [ ] Capturar com Playwright:
  - `home-before-v2.png` — desktop 1440×900, estado vazio;
  - `home-before-conversation-v2.png` — desktop 1440×900, conversa semeada;
  - `home-mobile-before-v2.png` — 360×800, estado vazio.
- [ ] Fixar o relógio do Playwright (`page.clock.setFixedTime`) para a saudação ser determinística.

### Fase 1 — Fundação visual (`apps/app/src/index.css`)

- [ ] Adicionar tokens no `@theme`:
  - `--color-app-canvas: #fdf9f4`
  - `--color-app-canvas-deep: #f8f1e8`
  - `--color-app-rule: #e9dccf`
  - `--shadow-lift` e `--shadow-composer` (sombras quentes, baixa opacidade).
- [ ] Ajustar `:root`:
  - `--sidebar: #fbf6ef`, `--sidebar-accent: #f3e9de`, `--sidebar-border: #e9dccf`;
  - manter `--background`, `--card`, `--primary`, `--ring` e demais tokens intactos para não alterar auth.
- [ ] Adicionar classes utilitárias:
  - `.app-canvas` — fundo papel + dois gradientes radiais pastel muito sutis;
  - `.eyebrow` — caixa alta 10–11 px, tracking 0.18em, muted;
  - `.marker-highlight` — marca-texto pastel no primeiro nome;
  - `.chat-scroll` — `scrollbar-gutter: stable`, `overscroll-behavior: contain`;
  - `.chat-thread--long .chat-group` — `content-visibility: auto` + `contain-intrinsic-size`;
  - `.animate-caret`, `.animate-rise`, `.animate-typing-dot` e keyframes.
- [ ] Adicionar regra global de `prefers-reduced-motion` (animações/transições reduzidas, scroll automático).
- [ ] Não mexer no `@source` existente.

### Fase 2 — App shell (`apps/app/src/components/app/app-shell.tsx`)

- [ ] `Sidebar`:
  - brand mark em `bg-soft-blush/70` com ícone `BrainCircuit` e wordmark Sora;
  - subtítulo “Leadership, on call.”;
  - nav com `tooltip`, `aria-current="page"` e estado ativo em card claro;
  - footer com “Signed in as {firstName}” (oculto no modo ícone) + `Sign out` com tooltip;
  - manter o botão nativo com nome acessível exato `Sign out`.
- [ ] Header:
  - `SidebarTrigger` + breadcrumb semântico `Workspace / {pageTitle}`;
  - menu de conta com avatar, nome, e-mail e `Sign out` (menuitem);
  - `aria-label="Account menu"` no trigger.
- [ ] `SidebarInset`:
  - `bg-app-canvas` + `.app-canvas`;
  - header `h-16`, borda `app-rule`, fundo translúcido com `backdrop-blur`;
  - conteúdo `flex-1` com padding responsivo, sem `max-w` fixo no shell (a home controla a largura).
- [ ] Manter skip link, guards e rotas intactos.

### Fase 3 — Utilitários, store e hook

- [ ] Criar `apps/app/src/lib/streaming-store.ts`:
  - `createStreamingStore(scheduler?)` com `subscribe`, `getSnapshot`, `append`, `reset`;
  - batching em `requestAnimationFrame` (fallback `setTimeout`), notificação única por frame;
  - `reset` cancela o frame pendente e notifica imediatamente.
- [ ] Criar `apps/app/src/components/chat/chat-utils.ts`:
  - `getGreeting(date)`;
  - `expertInitials(name)`;
  - `expertAccent(slug)` com classes pastel estáticas;
  - `formatMessageTime(iso)`, `dayKey(iso)`, `dayLabel(iso, now)`;
  - `buildMessageTimeline(messages, expert)` com separadores de dia e grupos por autor.
- [ ] Refatorar `apps/app/src/hooks/use-chat-stream.ts`:
  - instanciar o store uma vez (`useState(createStreamingStore)`);
  - remover `streamingContent` do estado React e expor `streamingStore`;
  - `onToken` → `store.append(delta)`;
  - `sendMessage` com `try/finally` cobrindo `createConversation` + stream (corrige travamento em falha de criação);
  - `onDone` com refetch protegido por `catch`;
  - `selectExpert` com guarda de `busyRef` e reset do store;
  - `loadWorkspace` extraído, `mountedRef` e `reloadWorkspace` exposto;
  - manter o contrato de `messages`, `isStreaming`, `error`, `experts`, `conversation`, `selectedSlug`.
- [ ] Testes:
  - `apps/app/src/lib/streaming-store.test.ts` com scheduler manual (append não notifica antes do frame; reset limpa e notifica).
  - `apps/app/src/components/chat/chat-utils.test.ts` para saudação, iniciais, acentos, labels de dia e agrupamento.

### Fase 4 — Componentes de conversa

- [ ] `expert-avatar.tsx`:
  - `ExpertAvatar` com tamanhos `xs/sm/md/lg`, iniciais e acento estável;
  - fallback neutro quando não há expert.
- [ ] `message-bubble.tsx`:
  - `MessageMedia` (imagem com `alt`, `loading="lazy"`, `decoding="async"`; vídeo com `aria-label`);
  - `UserMessage` (bolha ink à direita, timestamp discreto);
  - `AssistantMessageGroup` (avatar no trilho, nome/cargo, timestamp, card de resposta com markdown e mídia, separador entre mensagens do mesmo grupo);
  - `memo` nos componentes e em `ChatMarkdown`.
- [ ] `streaming-message.tsx`:
  - `useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)`;
  - avatar + “{expert} is writing…” + três pontos CSS quando vazio;
  - markdown progressivo + caret quando há conteúdo;
  - `aria-hidden="true"` no bloco visual.
- [ ] `conversation-thread.tsx`:
  - scroll container com `.chat-scroll`, `ResizeObserver` no conteúdo, `requestAnimationFrame` para auto-scroll;
  - `pinnedRef`/`isPinned` com threshold de ~96 px;
  - `Jump to latest` quando fora do fim;
  - timeline memoizada; `role="log"`, `aria-live="polite"`, `aria-label="Conversation with {expert}"`;
  - `h1` sr-only na conversa; `role="status"` sr-only para “{expert} is writing…”;
  - `ThreadSkeleton` para loading com `role="status"` e `motion-reduce`;
  - classe `chat-thread--long` quando `messages.length > 24`.

### Fase 5 — Composer

- [ ] Criar `apps/app/src/components/chat/chat-composer.tsx`:
  - estado `draft` local (evita re-render da home a cada tecla);
  - `Select` de expert com avatar + nome + cargo; trigger `aria-label="Select expert"`;
  - botão `Connections` (ícone + texto no desktop, ícone com `aria-label="Open connections"` no mobile);
  - `Textarea` `aria-label="Message"`, `maxLength=4000`, `aria-describedby`;
  - auto-resize com `requestAnimationFrame`, altura máxima 160 px;
  - Enter envia, Shift+Enter quebra linha, IME respeitado;
  - contador `n / 4,000` com `tabular-nums`, cor de alerta perto do limite;
  - botão `Send message` com spinner durante streaming;
  - card com `focus-within` ring, `shadow-composer` e safe area no wrapper;
  - limpar draft no envio e quando `isStreaming` vira true (cobre envio por chip).
- [ ] Não desabilitar a textarea durante streaming; desabilitar apenas select e envio.

### Fase 6 — Estado vazio

- [ ] Criar `apps/app/src/components/chat/home-empty-state.tsx`:
  - eyebrow `Workspace · {n} experts`;
  - `h1` `Good morning, {firstName}.` com `marker-highlight`; fallback `Welcome back.`;
  - deck `How can I help you today?` (texto preservado para o e2e);
  - frase `Pick an expert, connect your company's data, and turn a question into a decision.`;
  - nota `Grounded in your data` + `Connect data`;
  - faixa horizontal com todos os experts (`snap-x`, cards `aria-pressed`, check no selecionado);
  - chips `Try asking {expert.name}` com `line-clamp-2`;
  - caso `experts=[]`: sem cards/chips, nota curta, sem crash.
- [ ] Cards de expert não inventam descrições: usam `name` e `role` do registry.

### Fase 7 — Home, conexões e markdown

- [ ] Reescrever `apps/app/src/pages/app/home.tsx` como orquestrador:
  - `useChatStream` + `useState` de sheet;
  - banner de erro `role="alert"` com `Dismiss` e `Retry` (falha de workspace);
  - `ConversationThread` + `HomeEmptyState` + `ChatComposer` + `ConnectionsSheet`;
  - sem `draft`, `scrollRef` ou efeito de scroll na home;
  - `h1` por estado (vazio visível, conversa sr-only, loading sr-only).
- [ ] Polir `connections-sheet.tsx`:
  - header com título/descrição e contagem;
  - ícone por tipo (arquivo/URL), status badge, lista com truncate;
  - empty state tracejado;
  - input de arquivo `hidden`/`tabIndex=-1` (o botão é o controle);
  - `SheetContent` full width no mobile (`w-full sm:max-w-md`), `overscroll-contain`;
  - manter upload/URL/remoção e `role="alert"`.
- [ ] Ajustar `chat-markdown.tsx`:
  - `memo`, tipografia 15 px/leading-7, headings Sora, code blocks com borda/overflow, links com foco visível.

### Fase 8 — Testes, acessibilidade e performance

- [ ] Rodar testes unitários dos utilitários/store.
- [ ] Conferir seletores e textos do e2e:
  - `getByRole("textbox", { name: "Message" })`;
  - `getByText("How can I help you today?")`;
  - `getByRole("button", { name: "Open connections" })`;
  - `getByRole("button", { name: "Sign out" })`.
- [ ] Auditoria de a11y manual:
  - tab order: skip link → sidebar → header → experts → chips → composer → send;
  - foco visível em cards, chips, select, textarea e botões;
  - `aria-current`, `aria-pressed`, `role=log`, `role=status`, `role=alert`;
  - contraste AA (texto muted sobre papel, destructive sobre blush, ink sobre pastéis);
  - `prefers-reduced-motion` via Playwright `emulateMedia`.
- [ ] Auditoria de performance:
  - confirmar que apenas `StreamingMessage` assina o store;
  - confirmar que `ConversationThread` não recebe `streamingContent`;
  - verificar com React Profiler/console temporário que a lista não renderiza por token (remover instrumentação depois);
  - testar thread com 30+ mensagens e scroll manual durante streaming.
- [ ] Atualizar `.docs/DESIGN_SYSTEM.md` se os tokens/classes novos forem considerados padrão (provável: sim, uma seção curta).

### Fase 9 — QA, screenshots, ADR e commit

- [ ] `bun run code:fix`
- [ ] `bun run types:check`
- [ ] `bun run test`
- [ ] `bun run test:e2e` (subir `bun run infra:up` + `bun run db:migrate` se a API exigir Postgres)
- [ ] `bun run build`
- [ ] Capturar “depois” com o mesmo mock e os mesmos viewports:
  - `home-after-v2.png` (1440×900, vazio);
  - `home-after-conversation-v2.png` (1440×900, conversa);
  - `home-mobile-after.png` (360×800, vazio);
  - `home-streaming-after-v2.png` (1440×900, durante o SSE);
  - `home-error-after-v2.png` (1440×900, erro de workspace);
  - `home-connections-after-v2.png` (1440×900, sheet aberto).
- [ ] Validar manualmente: vazio, conversa, streaming, erro, mobile, sidebar colapsada, sheet, teclado e reduced motion.
- [ ] Criar `.adrs/015-redesign-home.md` com decisão load-bearing, contexto, decisões, trade-offs e consequências.
- [ ] `git init` (conforme escolha), baseline opcional, e commit final:
  - mensagem: `feat(app): redesign authenticated home`;
  - co-author OpenCode Agent conforme `RULES.md`;
  - sem push (não há remote).
- [ ] Entregar resumo do ADR, passos manuais de QA, arquivos modificados, bibliotecas instaladas (nenhuma) e racional.

## 4. Arquivos

### Novos

- `apps/app/src/lib/streaming-store.ts`
- `apps/app/src/lib/streaming-store.test.ts`
- `apps/app/src/components/chat/chat-utils.ts`
- `apps/app/src/components/chat/chat-utils.test.ts`
- `apps/app/src/components/chat/expert-avatar.tsx`
- `apps/app/src/components/chat/message-bubble.tsx`
- `apps/app/src/components/chat/streaming-message.tsx`
- `apps/app/src/components/chat/conversation-thread.tsx`
- `apps/app/src/components/chat/chat-composer.tsx`
- `apps/app/src/components/chat/home-empty-state.tsx`
- `.plans/014-redesign-home-plan.md` (este arquivo)
- `.adrs/015-redesign-home.md`
- `.screenshots/home-*.png` (antes/depois)

### Alterados

- `apps/app/src/pages/app/home.tsx`
- `apps/app/src/components/app/app-shell.tsx`
- `apps/app/src/components/chat/connections-sheet.tsx`
- `apps/app/src/components/chat/chat-markdown.tsx`
- `apps/app/src/hooks/use-chat-stream.ts`
- `apps/app/src/index.css`
- `.docs/DESIGN_SYSTEM.md` (se necessário)
- `.specs/014-redesign-home.md` (status/ajustes ao final, se necessário)

### Intocados por contrato

- `apps/api/**`, `apps/agents/**`, `packages/experts/**`, `packages/ui/**` (a menos que falte um primitivo; nesse caso, adicionar via `bunx shadcn add` e registrar).
- `apps/app/src/pages/auth/**`, `apps/app/src/components/auth/**`, guards e router.
- `apps/app/src/App.test.tsx`, `apps/app/e2e/app.spec.ts`, `apps/app/e2e/auth-redirects.spec.ts` (sem remoção de cobertura; ajustes só se um seletor mudar).

## 5. Componentes e tokens novos

### Componentes de app (não são primitivos de design system)

| Componente                                | Responsabilidade                                                  |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `ExpertAvatar`                            | Iniciais + acento pastel estável por expert.                      |
| `MessageBubble` / `AssistantMessageGroup` | Mensagem do usuário e grupo de respostas do expert com mídia.     |
| `StreamingMessage`                        | Único assinante do store de tokens; markdown progressivo + caret. |
| `ConversationThread`                      | Scroll, pinned, `Jump to latest`, timeline, log e status.         |
| `ChatComposer`                            | Draft local, select, textarea, contador, envio e conexões.        |
| `HomeEmptyState`                          | Saudação, proposta de valor, experts, chips e nota de dados.      |

### Tokens/classes

| Token/classe                                               | Uso                                                 |
| ---------------------------------------------------------- | --------------------------------------------------- |
| `--color-app-canvas` / `--color-app-canvas-deep`           | Papel do shell e superfícies internas.              |
| `--color-app-rule`                                         | Réguas finas, bordas de cards e separadores.        |
| `--shadow-lift` / `--shadow-composer`                      | Elevação discreta de cards/composer.                |
| `--sidebar` / `--sidebar-accent` / `--sidebar-border`      | Sidebar em papel quente.                            |
| `.app-canvas`                                              | Fundo do shell com brilho pastel ambiente.          |
| `.eyebrow`                                                 | Labels editoriais em caixa alta.                    |
| `.marker-highlight`                                        | Assinatura do primeiro nome.                        |
| `.chat-scroll`                                             | Scrollbar estável e `overscroll` contido.           |
| `.chat-thread--long`                                       | `content-visibility` progressivo em threads longas. |
| `.animate-caret` / `.animate-rise` / `.animate-typing-dot` | Micro-interações CSS.                               |

Nenhum primitivo novo de `@repo/ui` é esperado. Se o composer precisar de um primitivo inexistente, adicionar ao pacote via `bunx shadcn add` (seguindo o ADR 013) e registrar no ADR 015.

## 6. Como validar visualmente

### Preparação

1. `bun run infra:up` (se for usar a API real) ou subir o mock em `:3000`.
2. `bun run dev` (app em `:5173`; o Vite faz proxy de `/api`).
3. Playwright com `page.clock.setFixedTime(new Date("2026-11-22T09:00:00"))` e `localStorage.auth_token` definido.
4. Tokens de mock:
   - `test-session-token-empty` → estado vazio;
   - `test-session-token-chat` → conversa semeada;
   - `test-session-token-error` → erro de workspace;
   - `test-session-token-long` → 30+ mensagens.

### Checklist por estado

- **Vazio:** saudação com nome, deck, frase, nota de dados, 9 cards, chips; nenhum overflow horizontal; composer visível.
- **Conversa:** avatar/nome/cargo, agrupamento, timestamps, separador de dia, markdown, mídia; scroll até o fim.
- **Streaming:** indicador “writing”, caret, tokens progressivos, composer com spinner; rolar para cima durante o stream e confirmar que não é puxado; `Jump to latest` aparece e funciona.
- **Erro:** banner `role=alert`, `Retry` no erro de workspace, `Dismiss`; composer continua utilizável.
- **Longa:** 30+ mensagens, scroll fluido, `content-visibility` sem saltos; foco não se perde.
- **Conexões:** sheet abre pelo composer e pela nota; upload/URL/lista/remoção; foco preso no sheet; fecha com Esc.
- **Mobile (360×800):** sidebar em sheet, composer com safe area, cards em scroll horizontal, sem overflow, botões com alvo ≥ 44 px quando possível.
- **Tablet (768×1024) e desktop (1024×768 / 1440×900):** sidebar expandida/colapsada, coluna de leitura confortável, composer centralizado.
- **Teclado:** Tab por skip link, sidebar, header, experts, chips, composer, envio; foco visível em todos.
- **Reduced motion:** `emulateMedia({ reducedMotion: "reduce" })`; sem animações de entrada/caret/dots.

## 7. Riscos de quebrar testes

| Risco                                                                    | Mitigação                                                                                |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `getByRole("textbox", { name: "Message" })` some se o label mudar        | Manter `aria-label="Message"` no `Textarea`.                                             |
| `getByText("How can I help you today?")` some se o copy mudar            | Manter a frase exata no deck do estado vazio.                                            |
| `getByRole("button", { name: "Open connections" })` some ao mover o FAB  | Manter `aria-label="Open connections"` no botão do composer; visível em 1280×720.        |
| `getByRole("button", { name: "Sign out" })` quebra se o texto/role mudar | Manter botão nativo com texto `Sign out` na sidebar; o item do menu continua `menuitem`. |
| E2E com `experts=[]` quebra se a home assumir experts                    | Estado vazio defensivo, seletor desabilitado, sem cards/chips.                           |
| `chat-markdown.test.tsx` depende de roles/textos                         | Não alterar a semântica de headings/listas/links/code; só classes.                       |
| `App.test.tsx`                                                           | Não tocar em router/guards/auth.                                                         |
| `test:e2e` precisa da API                                                | Subir infra/Postgres ou mock; rodar `db:migrate` se necessário.                          |
| `code:fix` reformata arquivos                                            | Rodar no início e no fim; revisar diff.                                                  |
| `types:check` com `useSyncExternalStore`/`ResizeObserver`                | Tipar `lib.dom` (já incluso) e evitar `any`; usar `number` para frames.                  |

## 8. Estratégia de screenshots

- **Antes:** capturar com o código atual, antes de qualquer edição, usando o mock e os mesmos viewports/dados do “depois”.
- **Depois:** repetir exatamente o mesmo script, relógio, token e viewport para comparação justa.
- **Arquivos mínimos:**
  - `home-before-v2.png` / `home-after-v2.png` (1440×900, vazio);
  - `home-before-conversation-v2.png` / `home-after-conversation-v2.png` (1440×900, conversa);
  - `home-mobile-after.png` (360×800, vazio).
- **Extras recomendados:**
  - `home-streaming-after-v2.png` (SSE em andamento);
  - `home-error-after-v2.png` (banner de erro);
  - `home-connections-after-v2.png` (sheet aberto).
- **Script:** `/tmp/opencode/capture-home.mjs` (fora do repo), com:
  - `chromium.launch()`;
  - contextos `1440×900`, `768×1024`, `360×800`;
  - `page.addInitScript` para `auth_token`;
  - `page.clock.setFixedTime`;
  - `page.goto("/app")`, `waitForSelector` do estado;
  - `page.screenshot({ path: ".screenshots/..." })`.
- **Streaming:** o mock segura os tokens por ~60 ms; o script clica em enviar, espera o texto “writing” e captura antes do `done`.
- **Revisão:** as imagens são para revisão humana; o agente valida estrutura/DOM e estados, não pixels.

## 9. QA gates

Executar na ordem, conforme `.docs/QA.md`:

1. `bun run code:fix`
2. `bun run types:check`
3. `bun run test`
4. `bun run test:e2e`
5. `bun run build`

Se a API exigir banco: `bun run infra:up` + `bun run db:migrate` antes do passo 3/4.

## 10. Critérios de saída

- [ ] Spec 014 implementada por completo, sem itens “pela metade”.
- [ ] Nenhum comportamento de chat/expert/conexões/auth removido.
- [ ] Nenhuma dependência nova.
- [ ] Testes existentes e novos verdes; e2e sem remoção de cobertura.
- [ ] Screenshots antes/depois e estados extras gerados.
- [ ] ADR 015 escrito e resumido.
- [ ] Commit `feat(app): redesign authenticated home` criado no repositório local.
- [ ] Entrega final com ADR, passos de QA, arquivos, libs, racional e gates.
