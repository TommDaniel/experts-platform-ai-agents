---
title: Auth Routes
status: draft
created: 2026-08-10
---

# Auth Routes

> Estrutura de rotas do cliente: adiciona `react-router`, define a área pública `/auth/*` e a privada `/app/*`, implementa o guard de autenticação (redireciona para sign-in quando não autenticado e para `/app` quando autenticado em página de auth), persistência do token em localStorage e o client HTTP com `Authorization: Bearer`. As specs 004–008 preenchem o conteúdo de cada página.

## Contexto

O app (`apps/app`, React + Vite) hoje só renderiza um hello world e não tem roteamento. O prompt exige: "Todas as páginas de autenticação são públicas, e as demais páginas são privadas. As páginas de autenticação devem ser acessíveis em `/auth/*`. E privadas em `/app/*`." A `002-auth-session` já entrega `GET /api/v1/auth/me` e `POST /api/v1/auth/logout`, que esta spec consome para validar a sessão e deslogar.

## Objetivo

- Ter roteamento SPA com áreas pública e privada separadas por caminho, com redirecionamentos corretos em cada caso.
- Ter um guard de autenticação que valida a sessão (token no localStorage + `GET /auth/me`) e protege `/app/*`.
- Ter a base de estado de sessão (AuthContext) e o client HTTP reutilizáveis pelas specs de fluxo.

## Escopo

**Dentro:**

- Instalação e configuração do `react-router-dom`.
- `AuthContext`/provider: estado `user`, `token`, `isLoading`, `signOut()`; token persistido em `localStorage`; `signOut` chama `POST /api/v1/auth/logout`, limpa o storage e navega para `/auth/sign-in`.
- Client HTTP (`apiClient`) que injeta `Authorization: Bearer <token>` do localStorage.
- Guards: `RequireAuth` (protege `/app/*`; valida via `GET /auth/me`; redireciona para `/auth/sign-in` quando inválido) e `RedirectIfAuthenticated` (páginas `/auth/*` redirecionam para `/app` quando há sessão válida).
- Rotas públicas `/auth/*`: `sign-up`, `sign-in`, `forgot-password`, `reset-password`, `confirm-account` (com páginas placeholder; o conteúdo real é das specs 004–008).
- Rota privada `/app/*` com uma página `Home` placeholder autenticada.
- Redirecionamento de `/` conforme sessão (autenticado → `/app`, senão → `/auth/sign-in`).

**Fora:**

- Conteúdo/validação dos formulários de auth — specs 004, 006, 007, 008.
- Processamento do token de confirmação — spec 005.
- Páginas de produto (experts, conectores) — futuro.

**Adiado:**

- SPA fallback/rewrite para produção (Vercel) — só relevante com deploy.
- Lazy-loading das rotas e codesplitting (pode vir em otimização futura).

## Necessidade de negócio

Sem a separação pública/privada, qualquer página poderia ser acessada sem login — o produto (gestão de experts e conectores) é inteiramente privado. A estrutura de rotas e o guard são o esqueleto sobre o qual todos os fluxos de auth navegam.

## Critérios de aceite

- [ ] Sem sessão, qualquer URL `/app/*` redireciona para `/auth/sign-in`.
- [ ] Com sessão válida (confirmada via `GET /api/v1/auth/me`), `/app/*` renderiza e `/auth/*` redireciona para `/app`.
- [ ] Token salvo no `localStorage` e reutilizado nas requisições como `Authorization: Bearer`.
- [ ] `signOut()` chama `POST /api/v1/auth/logout`, limpa o `localStorage` e navega para `/auth/sign-in`.
- [ ] Durante a validação inicial da sessão, a UI não "pisca" conteúdo protegido (estado de loading no guard).
- [ ] Rota `/` redireciona conforme o estado da sessão.
- [ ] As 5 rotas `/auth/*` existem e respondem (placeholder), prontas para receber o conteúdo das specs 004–008.
- [ ] `bun run code:fix`, `bun run types:check`, `bun run test` e `bun run test:e2e` passam.

## O que fazer

- Instalar `react-router-dom` em `apps/app` e criar a estrutura de rotas.
- Criar `AuthContext` (token/user/loading/signOut) e o `apiClient` (fetch wrapper com Bearer).
- Implementar `RequireAuth` e `RedirectIfAuthenticated` usando `GET /auth/me`.
- Criar as páginas placeholder de `/auth/sign-up`, `/auth/sign-in`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/confirm-account` e `/app/home`.
- Escrever testes unitários (guard/contexto com mocks) e E2E Playwright dos redirecionamentos.

## O que não fazer

- Implementar formulários/validações dos fluxos (specs 004, 006, 007, 008).
- Processar token de confirmação (spec 005).
- Criar páginas de produto.
- Alterar o comportamento da API.

## Decisões

| Decisão             | Opção escolhida                                                 | Racional                                                                    |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Router              | `react-router-dom` (SPA)                                        | Padrão de facto para React SPA; app não tem router.                         |
| Validação da sessão | `GET /api/v1/auth/me` (não apenas presença de token no storage) | Token vazio/revogado deve derrubar a sessão; reutiliza a `002`.             |
| Estado global       | `AuthContext` (user, token, isLoading, signOut)                 | Sessão é global; TanStack Query cuida de dados, não da identidade.          |
| Persistência        | `localStorage` + header `Authorization: Bearer`                 | Decisão do usuário na elicitação (transporte de sessão).                    |
| Link de confirmação | Rota pública `/auth/confirm-account?token=...`                  | O link do email navega à plataforma e a página processa o token (spec 005). |
| Caminhos            | `/auth/*` público · `/app/*` privado                            | Exigência literal do prompt.                                                |

## Dependências

- `002-auth-session.md` (`GET /api/v1/auth/me`, `POST /api/v1/auth/logout`).
- `DESIGN.md` / `DESIGN_SYSTEM.md` (base shadcn/ui e paleta para as páginas placeholder).
- Docs: `DEVELOPMENT.md` (A11y, responsividade), `QA.md`.

## Riscos e trade-offs

- **Validar via `/me` a cada navegação:** adiciona latência; mitigado com estado `isLoading` (não piscar conteúdo) e cache do usuário no contexto.
- **Token só no localStorage:** exposto a XSS — trade-off aceito na decisão de transporte do usuário.
- **Placeholders antes do conteúdo real:** as rotas existem, mas páginas vazias podem "quebrar" visualmente; mitigado com esqueleto mínimo e coerente com a paleta.

## Edge cases e modos de falha

- **Sessão revogada entre navegações:** `/me` retorna `401` → guard limpa o storage e redireciona para sign-in.
- **`/auth/*` acessado já autenticado:** redireciona para `/app` (evita "cair" no sign-in logado).
- **Rede indisponível ao validar:** tratar como não autenticado? Não — manter estado de loading e permitir retry, evitando expulsar usuário por instabilidade (decisão de comportamento na implementação, documentar).
- **URL inválida em `/app/*`:** cai no guard e redireciona para sign-in (sem sessão) — OK; com sessão, renderiza fallback 404 da área privada.

## Resultado (definição de pronto)

- Rotas pública/privada funcionando com redirecionamentos testados (unit + E2E).
- `AuthContext` + `apiClient` prontos para consumo das specs 004–008.
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`) passando.
- ADR em `./.adrs/` e resumo conforme `RULES.md`.

## Arquivos e diretórios envolvidos

- `apps/app/src/router.tsx` (novo) — definição de rotas.
- `apps/app/src/contexts/auth-context.tsx` (novo) — estado de sessão.
- `apps/app/src/lib/api-client.ts` (novo) — client HTTP com Bearer.
- `apps/app/src/components/guards/*` (novo) — `RequireAuth`, `RedirectIfAuthenticated`.
- `apps/app/src/pages/auth/*` e `apps/app/src/pages/app/home.tsx` (novos placeholders).
- `apps/app/src/**/*.test.tsx`, `apps/app/e2e/**` (testes).
- `apps/app/package.json` (react-router-dom).
- `./.adrs/003-auth-routes.md` (novo).
