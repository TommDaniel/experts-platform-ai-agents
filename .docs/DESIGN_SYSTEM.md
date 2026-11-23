# Design System

> Status: a base em **shadcn/ui** é `[planejada]`; os componentes ainda não foram migrados. A fundação já entrega os tokens de cor da paleta (TailwindCSS v4) em `apps/app/src/index.css`.

## Base

- O design system é construído sobre a biblioteca **shadcn/ui** `[planejado]`.
- Os componentes vivem em `packages/ui` (`@repo/ui`) `[implementado]`.
- Gerar um novo componente: `bun run generate:component` (a partir de `packages/ui`).

## Tokens

- Cores seguem a paleta de `DESIGN.md`.
- Todo componente deve ser **acessível** e **responsivo** (ver `DEVELOPMENT.md`).

## Superfícies do app autenticado

- Papel quente e réguas: `--color-app-canvas`, `--color-app-canvas-deep`, `--color-app-rule`; sombras `--shadow-lift` e `--shadow-composer` `[implementado]`.
- Utilitários em `apps/app/src/index.css`: `.app-canvas`, `.eyebrow`, `.marker-highlight`, `.chat-scroll`, `.chat-thread--long` e animações CSS (`animate-rise`, `animate-caret`, `animate-typing-dot`), todas desligadas em `prefers-reduced-motion` (ver ADR-015).

## Convenções

- Preferir compor componentes shadcn a criar componentes customizados do zero.
- Manter unicamente o tema claro (ver `DESIGN.md`).
