# Design System

> Status: a base em **shadcn/ui** é `[implementada]` em `packages/ui` (`@repo/ui`) e já é usada pelas telas de auth, pela home autenticada e pelo app shell. Os tokens de cor e tipografia (TailwindCSS v4) ficam em `apps/app/src/index.css`.

## Base

- O design system é construído sobre a biblioteca **shadcn/ui** `[implementado]`.
- Os componentes vivem em `packages/ui/src/components/ui` e são consumidos via `@repo/ui/components/ui/*` `[implementado]`.
- Componentes disponíveis `[implementado]`: `alert`, `avatar`, `badge`, `button`, `card`, `dropdown-menu`, `input`, `label`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `textarea`, `tooltip`.
- Adicionar um componente novo: `bunx shadcn add <componente>` a partir de `packages/ui` (seguindo o ADR-013); o gerador interno continua disponível em `bun run generate:component`.

## Tokens

- Cores seguem a paleta de `DESIGN.md`.
- Tipografia: **Sora** (display/títulos) e **Inter** (texto), importadas em `apps/app/src/index.css`.
- Todo componente deve ser **acessível** e **responsivo** (ver `DEVELOPMENT.md`).

## Superfícies do app autenticado

- Papel quente e réguas: `--color-app-canvas`, `--color-app-canvas-deep`, `--color-app-rule`; sombras `--shadow-lift` e `--shadow-composer` `[implementado]`.
- Utilitários em `apps/app/src/index.css`: `.app-canvas`, `.eyebrow`, `.marker-highlight`, `.chat-scroll`, `.chat-thread--long` e animações CSS (`animate-rise`, `animate-caret`, `animate-typing-dot`), todas desligadas em `prefers-reduced-motion` (ver ADR-015).

## Convenções

- Preferir compor componentes shadcn a criar componentes customizados do zero.
- Manter unicamente o tema claro (ver `DESIGN.md`).
- Preservar os nomes acessíveis e textos cobertos pelos testes (`Message`, `Open connections`, `Sign out`, `How can I help you today?`).
