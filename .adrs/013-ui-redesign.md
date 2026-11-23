# ADR-013: Redesign de UI com shadcn/ui e app shell

- **Status:** aceito
- **Data:** 2026-08-12
- **Decisão load-bearing:** redesenhar todas as páginas do `apps/app` (5 de auth + home + not-found) para um padrão visual profissional fundado em **shadcn/ui** hospedado em `packages/ui` (`@repo/ui`), com **tokens semânticos + tipografia (Sora/Inter) no `index.css`**, **app shell com sidebar** para a área autenticada `/app` e **capturas antes/depois** de 7 telas em `.screenshots/`.

## Contexto

A spec `012-ui-redesign` pediu elevar o padrão visual do app (tema claro, paleta pastel, gradientes suaves) mantendo o comportamento e os seletores preservados pelos testes (56 unitários + 11 e2e). O frontend do `apps/app` era um Vite/React (react-router) com Tailwind v4, sem design system: cada página estilizava seus próprios elementos. Para padronizar, a decisão foi adotar shadcn/ui como biblioteca de componentes no pacote compartilhado `packages/ui` (publicado como `@repo/ui`), seguindo o fluxo padrão `shadcn add` (criação de componentes com Radix UI + Tailwind) em vez de depender de runtime adicional.

## Decisões

### 1. shadcn/ui em `packages/ui` (`@repo/ui`)

- `packages/ui/components.json` criado com `style: "new-york"`, `rsc: false`, `baseColor: neutral`, `tsx` e `aliases` apontando `@` → `./src` (pacote) e `@repo/ui/*` para os consumers.
- Componentes gerados via `bunx shadcn add` (14 arquivos) em `packages/ui/src/components/ui/`: `button`, `input`, `label`, `card`, `alert`, `badge`, `skeleton`, `separator`, `avatar`, `dropdown-menu`, `sheet`, `tooltip`, `sidebar` (bloco completo com sidebar header/content/group/menu) e `use-mobile.ts` em `packages/ui/src/hooks/`.
- `packages/ui/src/lib/utils.ts` (helper `cn` com `clsx` + `tailwind-merge`).
- `packages/ui/package.json` ganhou exports (`./components/*`, `./hooks/*`, `./lib/*`, `./*`) e as deps `class-variance-authority`, `clsx`, `lucide-react`, `radix-ui`, `react`/`react-dom`, `tailwind-merge`.
- `packages/ui/tsconfig.json` com `module` ESNext e `moduleResolution: "bundler"` (resolução de `@/lib/utils` dentro do pacote).
- No `apps/app`: `tsconfig.json` com `paths` `@/*` → `../../packages/ui/src/*` e alias no `vite.config.ts` (`@` → `packages/ui/src` via `import.meta.dirname`), permitindo `import { Button } from "@repo/ui/components/button"`.

### 2. Tokens semânticos e tipografia no `index.css`

- Import das fontes Google: **Sora** (display, headings/CTA) e **Inter** (texto).
- `@theme` com paleta nomeada (linen, ink, ink-soft, mint-cream, alice-blue, powder-blue, etc.) e escala de raio (`--radius-xs` a `--radius-2xl`).
- `:root` com tokens semânticos de tema claro: `background` → `#fff1e6`, `foreground` → `#35403f`, `card`/`popover` → `#ffffff`, **`primary` → `#35403f`** (tinta; garante contraste AA sobre botões claros — um primary branco/powder-blue falharia ~2.3:1), `primary-foreground` → `#ffffff`, `secondary` → `#dbe7e4`, `muted` → `#f0efeb`, `muted-foreground` → `#5d6b6a`, `accent` → `#d6e2e9`, `destructive` → `#c0455f`, `border`/`input` → `#eddcd2`, `ring` → `#99c1de`, mais as variáveis `sidebar-*` (parchment/linen) e `--sidebar-width`/`--sidebar-width-icon`.
- Base layer: `color-scheme: light`, antialiasing, `::selection`.

### 3. Redesign das páginas

- **`AuthShell`**: layout de dupla coluna assimétrica — painel de marca com gradiente, título display e features (Expert agents, Connectors, Private by design) à esquerda; formulário em `Card` à direita; brand compacta no topo em mobile.
- **5 páginas de auth** (`sign-in`, `sign-up`, `forgot-password`, `reset-password`, `confirm-account`) refatoradas com `Button`/`Input`/`Label`/`Alert` do `@repo/ui`, preservando h1, labels e fluxos que os testes exigem.
- **`AppShell`**: sidebar (`collapsible="icon"`, `SidebarProvider`) com brand, nav Home/Experts/Connectors, footer com botão nativo "Sign out" e header com `SidebarTrigger` + `DropdownMenu` de conta (avatar + email + item "Sign out"). O item de dropdown é `role=menuitem` e não casa com `getByRole("button", { name: "Sign out" })` do e2e — por isso o footer mantém um botão nativo visível (visível em 1280×720 com sidebar expandida).
- **`HomePage`**: h1 "Home", saudação "Welcome, {firstName}", cards placeholder de Experts e Connectors (sub-rotas `/app/experts` e `/app/connectors` renderizam a mesma página por enquanto).
- **`NotFoundPage`** (404 display, brand, `Button asChild` → "Go home") e **`LoadingScreen`** (`Skeleton` + `<output role="status">` + `motion-reduce:animate-none`).
- **Router**: rota `/app` com layout `AppShell`; `*` raiz → `NotFoundPage` (fora do `RequireAuth`).

### 4. Tailwind v4 com fonte fora da raiz (`@source`)

Bug crítico encontrado no smoke test: a sidebar renderizava `display: none` em desktop porque o utilitário `md:flex` do container **não era gerado** — o detector automático do Tailwind v4 não escaneava `packages/ui/src` (fora da raiz do app no monorepo). A árvore de acessibilidade ficava sem a sidebar inteira (nav links e botão "Sign out" inexistentes para `getByRole`). Correção: diretivas `@source` explícitas no `index.css` apontando para `../../../packages/ui/src/**/*.{ts,tsx}` (caminho relativo ao arquivo CSS, 3 níveis para subir ao root do monorepo). Sem isso, o teste e2e de sign out falhava com timeout em `getByRole("button", { name: "Sign out" })`.

## Consequências

**Positivas:**

- Design system reutilizável: componentes consistentes em `@repo/ui` com variantes/estados acessíveis (focus-visible, aria, reduced-motion) em vez de CSS ad-hoc por página.
- Acessibilidade e qualidade visual elevadas: landmark sidebar, skip link, contrastes AA, landmark/aside para navegação, `color-scheme` e antialiasing globais.
- Todas as 56 suítes unitárias e os 11 e2e passam sem alterar seletores de teste; QA gates verdes (`code:fix`, `types:check`, `test`, `test:e2e`, `build`).
- 14 capturas (7 before + 7 after) em `.screenshots/` documentando o redesign.

**Negativas/custos:**

- `packages/ui` vira fonte de truth de estilos: mudanças de tema devem respeitar os tokens semânticos do `index.css` (tema claro apenas; sem dark mode por decisão de escopo).
- Fontes carregadas via Google Fonts CDN (import no CSS) — requer rede; fallback `ui-sans-serif`/`system-ui` quando offline.
- A sidebar usa o bloco `sidebar` do shadcn (mais de ~700 linhas em `sidebar.tsx`) — componente grande versionado no pacote, com variantes que hoje não são todas usadas.
- Visual validado estruturalmente (DOM/árvore de acessibilidade), não pixel-perfect: o agente não interpreta imagens; os PNGs em `.screenshots/` devem ser revisados por humano.

## Arquivos

- **Novos:** `packages/ui/components.json`, `packages/ui/src/components/ui/*.tsx` (14), `packages/ui/src/hooks/use-mobile.ts`, `packages/ui/src/lib/utils.ts`, `apps/app/src/components/app/*` (AppShell), `.screenshots/*.png` (14), este ADR.
- **Modificados:** `apps/app/src/index.css` (tokens + `@source`), `apps/app/src/components/auth/auth-shell.tsx`, `apps/app/src/pages/auth/{sign-in,sign-up,forgot-password,reset-password,confirm-account}.tsx`, `apps/app/src/pages/app/home.tsx`, `apps/app/src/pages/not-found.tsx`, `apps/app/src/components/guards/loading-screen.tsx`, `apps/app/src/router.tsx`, `apps/app/tsconfig.json`, `apps/app/vite.config.ts`, `packages/ui/package.json`, `packages/ui/tsconfig.json`, `bun.lock`.

## Libs adicionadas

- `apps/app`: nenhuma nova.
- `packages/ui`: `class-variance-authority`, `clsx`, `lucide-react`, `radix-ui`, `tailwind-merge` (plus peer `react`/`react-dom` já no workspace).
