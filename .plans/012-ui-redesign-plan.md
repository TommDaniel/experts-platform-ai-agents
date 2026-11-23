# Plano — 012-ui-redesign

## Objetivo

Redesenhar todas as páginas do `apps/app` (5 de auth + home + not-found) para um padrão profissional, fundar o design system em **shadcn/ui** dentro de `packages/ui` (`@repo/ui`), criar um **app shell** com sidebar para `/app` e gerar capturas **antes/depois** de 7 telas em `.screenshots/` via Playwright.

## Escopo

- **Dentro:** shadcn/ui em `packages/ui`; tokens semânticos + tipografia (Sora/Inter) no `index.css`; redesign do `AuthShell` + 5 páginas de auth; app shell (sidebar + header) + `HomePage`; `NotFoundPage` e `LoadingScreen`; 14 capturas em `.screenshots/`; ADR; QA gates.
- **Fora:** back-end, fluxos de auth, contratos de API, dark mode, i18n, features de produto.
- **Adiado:** storybook, teste visual contínuo (regression), migração do restante da lib.

## Restrições de testes (devem continuar passando)

- E2E `auth-redirects.spec.ts` e unit tests esperam: **h1** com os títulos atuais ("Sign in", "Create your account", "Forgot password", "Reset password", "Link not valid", "Home"), labels "Email"/"Password", botão "Sign out" e texto "Welcome, Ada" na home.
- Textos en-us e fluxos preservados; seletores de label/role mantidos.

## Etapas de implementação

### Etapa 0 — Baseline `_before` (obrigatória antes de qualquer mudança de código)

1. Garantir app/API rodando (`:5173`/`:3000` — já estão up).
2. Seed de usuário confirmado para a tela `home`: `bun run load:seed` (idempotente; cria `load.user@coders.local` com `email_verified_at`).
3. Via skill `playwright` (`.agents/skills/playwright/scripts/playwright_cli.sh`), capturar em `.screenshots/`:
   - `sign-in-before.png` → `/auth/sign-in`
   - `sign-up-before.png` → `/auth/sign-up`
   - `forgot-password-before.png` → `/auth/forgot-password`
   - `reset-password-before.png` → `/auth/reset-password`
   - `confirm-account-before.png` → `/auth/confirm-account` (estado estável sem token)
   - `not-found-before.png` → `/not-a-real-page`
   - `home-before.png` → login via API (`/api/v1/auth/sign-in` com seed), setar `localStorage.auth_token` e navegar a `/app`
4. Conferir os PNGs (abrir os arquivos) para validar baseline.

### Etapa 1 — shadcn/ui em `packages/ui`

1. Criar `packages/ui/components.json` manual (Tailwind v4, CSS variables, `iconLibrary: lucide`, aliases `@/*`, css apontando para `apps/app/src/index.css`).
2. Adicionar componentes via CLI: `npx shadcn@latest add button input label card alert badge skeleton separator avatar dropdown-menu sheet sidebar` (no `packages/ui`; deps Radix/clsx/tailwind-merge instalados automaticamente).
3. Wire de aliases `@/*`:
   - `packages/ui/tsconfig.json` → `paths: { "@/*": ["./src/*"] }`
   - `apps/app/tsconfig.json` → `paths: { "@/*": ["../../packages/ui/src/*"] }`
   - `apps/app/vite.config.ts` → `resolve.alias { "@": <packages/ui/src> }`
4. Atualizar `packages/ui/package.json` exports: manter `"./*": "./src/*.tsx"` (compat) e adicionar subpaths para `./components/*`, `./lib/*`, `./hooks/*` (arquivos `.tsx`/`.ts`).
5. Revisar os arquivos gerados (skill `shadcn`): imports `@/...`, `cn`, subcomponentes, `data-icon` etc.; corrigir o que estiver errado.
6. `bun run types:check` e `bun run lint` do `packages/ui` e `apps/app` para validar a infra.

### Etapa 2 — Tokens e tipografia (`apps/app/src/index.css`)

1. Carregar Google Fonts: **Inter** (texto) + **Sora** (display) via `@import`.
2. Manter a paleta pastel de `DESIGN.md`; adicionar tokens semânticos shadcn derivados (light only):
   - `background` → linen; `foreground` → ink; `card` → white; `muted` → parchment; `muted-foreground` → ink-soft; `border`/`input` → powder-petal; `ring` → powder-blue.
   - `primary` → ink (#35403f) com `primary-foreground` branco (CTAs com contraste AA — branco sobre powder-blue atual falha ~2.3:1); accent/highlights mantêm powder-blue/pale-sky/light-cyan.
   - `destructive` → rose derivado de soft-blush/petal-frost (mais escuro p/ contraste).
   - Variáveis de `sidebar`, `popover`, `accent` e `radius`.
3. `@theme inline` mapeando `--color-background`, `--color-primary`, etc.; fontes `--font-sans`/`--font-display`.

### Etapa 3 — Auth: `AuthShell` + 5 páginas

1. Redesenhar `auth-shell.tsx`:
   - Layout **dupla coluna assimétrica** em desktop: painel de identidade à esquerda (gradiente suave pastel, marca "Coders University", tagline + 2 destaques com ícones lucide — Experts/Connectors) e formulário à direita.
   - Mobile: apenas o formulário (painel esquerdo oculto).
   - **h1 continua sendo o título do formulário** (testes dependem disso).
   - Manter skip link, `aria-describedby`/`aria-invalid`, e o card de formulário centralizado à direita.
2. Refatorar as 5 páginas (`sign-in`, `sign-up`, `forgot-password`, `reset-password`, `confirm-account`) para usarem `Button`/`Input`/`Label`/`Card`/`Alert`/`Skeleton` de `@repo/ui` — preservando estados (erro, sucesso, loading, token ausente), textos en-us e comportamento.

### Etapa 4 — App shell + `HomePage`

1. Criar `apps/app/src/components/app/app-shell.tsx` usando o bloco **Sidebar** shadcn: sidebar fixa (logo, nav `Home`/`Experts`/`Connectors` com placeholders) + header (título da página, `DropdownMenu` com avatar e `Sign out`).
2. Sidebar colapsa para `Sheet` (drawer) em telas pequenas (responsivo).
3. `HomePage`: hero "Home" + boas-vindas com nome do usuário + cartões placeholder de Experts e Connectors (estados vazios honestos, ícones lucide).
4. Manter h1 "Home" e texto "Welcome, {firstName}" (testes/E2E) e botão `Sign out` acessível.

### Etapa 5 — `NotFoundPage` + `LoadingScreen`

1. `NotFoundPage`: 404 em display (Sora), mensagem e link home no padrão visual.
2. `LoadingScreen`: skeleton com `Skeleton` shadcn (ou spinner brand), mantendo `min-h-screen` e `aria-live`/sr-only.

### Etapa 6 — Revisão `web-design-guidelines`

1. Buscar as diretrizes atuais (fonte do skill) e revisar os arquivos tocados.
2. Corrigir achados de a11y/usabilidade (contraste, foco, toque, landmarks).
3. Verificar responsividade (viewports mobile/tablet/desktop).

### Etapa 7 — Capturas `_after`

1. Repetir o mesmo fluxo da Etapa 0, gerando os 7 arquivos `<pagina>-after.png`.
2. Abrir e comparar cada par before/after visualmente (verificar que o `_after` reflete o redesign).

### Etapa 8 — QA gates e entregáveis

1. `bun run code:fix`, `bun run types:check`, `bun run test`, `bun run test:e2e`, `bun run build`.
2. Corrigir testes que quebrarem (seletores preservados sempre que possível).
3. ADR novo em `.adrs/` (decisão shadcn/ui + app shell + tokens).
4. Passos manuais de QA, arquivos modificados, libs instaladas, racional.

## Arquivos-alvo

- `packages/ui/components.json`, `packages/ui/package.json`, `packages/ui/tsconfig.json`
- `packages/ui/src/components/ui/*.tsx` (novos, shadcn), `packages/ui/src/lib/utils.ts`, `packages/ui/src/hooks/*` (se gerados)
- `apps/app/src/index.css`
- `apps/app/vite.config.ts`, `apps/app/tsconfig.json`
- `apps/app/src/components/auth/auth-shell.tsx`
- `apps/app/src/pages/auth/{sign-in,sign-up,forgot-password,reset-password,confirm-account}.tsx`
- `apps/app/src/components/app/*` (novo shell)
- `apps/app/src/pages/app/home.tsx`, `apps/app/src/pages/not-found.tsx`
- `apps/app/src/components/guards/loading-screen.tsx`
- `.screenshots/*.png` (14)
- `.adrs/*.md` (novo ADR)

## Riscos / edge cases

- **shadcn em monorepo**: aliases `@/*` e exports do `@repo/ui` são o ponto mais delicado — validar com `types:check` logo após a Etapa 1.
- **CLI shadcn** pode exigir `init`/css markers: se `add` falhar, escrever `components.json` compatível e re-tentar; se persistir, ajustar manualmente seguindo a skill `shadcn` (nunca baixar do GitHub à mão).
- **Contraste**: CTAs primários em ink (não powder-blue) para AA; accent pastel usado em destaques não-textuais.
- **Testes**: headings/labels/botões preservados para não quebrar unit/E2E.
- **confirm-account**: captura no estado sem token (estável); fluxo de sucesso redireciona.
- **Fontes externas**: fallback para fontes do sistema se Google Fonts falhar.
- **Sidebar em página única**: placeholders honestos (Experts/Connectors "em breve") para não parecer vazia.

## Critérios de aceite (resumo da spec)

1. shadcn/ui inicializado em `packages/ui`; páginas consomem componentes de `@repo/ui` (sem classes inline duplicadas).
2. Tipografia nova (Sora/Inter) aplicada globalmente com fallback.
3. 7 telas com a mesma design language (tokens/raios/sombras/botões consistentes).
4. Auth com dupla coluna assimétrica mantendo todos os estados atuais.
5. `/app` com sidebar + header (Sign out funcional); not-found e loading redesenhados.
6. Acessibilidade revisada (`web-design-guidelines`): labels, aria, skip link, foco visível.
7. Responsivo em mobile/tablet/desktop (sidebar vira drawer).
8. `.screenshots/` com 14 arquivos `<pagina>-before/-after.png`; `_before` com o código original e `_after` com o redesign.
9. QA gates passando; ADR criado.

## Checklist QA

```sh
bun run code:fix
bun run types:check
bun run test
bun run test:e2e
bun run build
```

Infra: `bun run infra:up` (Postgres/LGTM já esperados) e `bun run db:migrate` se necessário.
