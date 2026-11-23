# ADR-003: Auth routes do cliente (router SPA, AuthContext, guards, apiClient)

- **Status:** aceito
- **Data:** 2026-08-11
- **Spec:** `./.specs/003-auth-routes.md`
- **Decisões load-bearing** da materialização do roteamento público/privado do app (`apps/app`) sobre a sessão da `002`.

## Contexto

O app (`apps/app`, React + Vite) renderizava um hello world sem roteamento. O prompt exige separação por caminho: páginas de autenticação públicas em `/auth/*` e demais páginas privadas em `/app/*`. A `002` entregou `GET /api/v1/auth/me` e `POST /api/v1/auth/logout`, consumidos aqui para validar sessão e deslogar. Nada de `apps/api` foi tocado.

## Decisões

### 1. `react-router-dom` (v7) com `createBrowserRouter` + `RouterProvider`

`react-router-dom@7` é o router SPA de facto e o app não tinha router. `createBrowserRouter` com rotas declarativas em `src/router.tsx` e layout raiz `<AuthProvider><Outlet/></AuthProvider>`: o `AuthProvider` fica **dentro** do router para poder usar `useNavigate` no `signOut` sem expor o contexto fora do router.

### 2. `AuthContext` com validação real via `GET /auth/me` e persistência em `localStorage`

Estado global de sessão: `user`, `token`, `isLoading`, `isAuthenticated`, `signOut`, `refresh`. O token vive em `localStorage.auth_token` (decisão de transporte do usuário). A presença do token **não** basta: no mount (e em `refresh`) o provider chama `GET /auth/me` — token revogado/vazio (`401`) limpa storage e estado. Isso reutiliza a `002` e cumpre "token revogado derruba a sessão".

### 3. Falha de rede na validação = manter `isLoading` (retry), nunca expulsar

Edge case da spec: se a rede cair durante `/auth/me`, o guard não redireciona para sign-in (o que "expulsaria" o usuário por instabilidade). O provider mantém `isLoading: true` e expõe `refresh()` para retry. Conteúdo protegido nunca "pisca" (o guard renderiza a tela de loading).

### 4. Guards: `RequireAuth`, `RedirectIfAuthenticated`, `RootRedirect` + `LoadingScreen`

- `RequireAuth` (envolve `/app` e `/app/*`): loading → tela de loading; não autenticado → `<Navigate to="/auth/sign-in" replace>`; senão `<Outlet/>`.
- `RedirectIfAuthenticated` (envolve as 5 rotas `/auth/*`): autenticado → `/app`; senão `<Outlet/>`.
- `RootRedirect` (rota `/`): segue o estado da sessão (`/app` ou `/auth/sign-in`).
- `LoadingScreen` usa `<output>` (role `status` implícito, `aria-live`), spinner na paleta e `motion-reduce:animate-none`.

### 5. `apiClient` com Bearer e base relativa + proxy do Vite

`src/lib/api-client.ts` é um fetch wrapper: base `import.meta.env.VITE_API_URL ?? "/api/v1"`, injeta `Authorization: Bearer <token>` do storage, lança `ApiError` (status + payload) em `!ok` e trata `204`. Como a API **não** habilita CORS e mexer em `apps/api` está fora do escopo, o Vite ganhou `server.proxy: { "/api": "http://localhost:3000" }` — o app chama same-origin em dev e `VITE_API_URL` permite outro alvo (ex.: produção). Convenção do `.env.example` (`APP_URL=http://localhost:5173`).

### 6. `signOut()` best-effort: revoga, limpa e navega

`signOut` chama `POST /auth/logout`, mas falha de envio **nunca** bloqueia: limpa storage/estado e navega para `/auth/sign-in` (replace). Idempotente mesmo sem sessão (o endpoint da `002` responde 200 sempre).

### 7. Tokens neutros `ink`/`ink-soft` no design tokens (a11y de contraste)

A paleta de `DESIGN.md` é pastel e não tem tom escuro; o próprio hello world usava `text-powder-petal` (#eddcd2 sobre #fff1e6 ≈ 1.2:1, falha WCAG). Foram adicionados `--color-ink` (#35403f) e `--color-ink-soft` (#5d6b6a) em `apps/app/src/index.css` para texto primário/secundário (contraste AA/AAA). Mudança pequena e aditiva, no escopo de `apps/app`, que também serve às specs 004–008.

### 8. Placeholders `/auth/*` com shell compartilhado e home autenticada

`AuthShell` (card na paleta, brand `translate="no"`, skip link, `text-balance` nos h1, foco visível com `focus-visible:ring`) padroniza as 5 páginas de auth; o conteúdo real chega nas specs 004–008. A `HomePage` autenticada mostra `user.firstName` e o botão "Sign out", permitindo testar o guard e o `signOut` de ponta a ponta. A catch-all `*` renderiza um 404 (edge case "URL inválida em `/app/*`").

### 9. Testes: unitários com mocks e E2E Playwright com rede mockada

- Unitários: `api-client` (Bearer, `ApiError`, falha de rede, JSON, 204), `AuthProvider` (fetch stub global: sem token, token válido, `401` limpa, falha de rede mantém loading, signOut revoga+limpa+navega) e guards (hook `useAuth` mockado via `vi.mock`).
- E2E: `playwright.config.ts` ganhou `webServer` em **array** (API em `../api` + app em `.`) — o servidor da API sobe para garantir `/api/v1/auth` respondendo. Os cenários "com sessão" mockam `/auth/me` e `/auth/logout` via `page.route` para não depender de usuário/sessão reais no banco.

## Consequências

- O hello world saiu: `App.tsx`, `App.test.tsx` e `e2e/app.spec.ts` foram atualizados (a raiz agora redireciona para sign-in sem sessão).
- `AuthContext` e `apiClient` ficam prontos para consumo das specs 004–008 (sign-up, confirm-account, sign-in, forgot/reset) — futuros fluxos persistem o token com `setStoredToken` + `refresh()`.
- Sem sessão, toda URL pública/privada converge para `/auth/sign-in`; com sessão, `/auth/*` converge para `/app`.
- Rede indisponível deixa o app em tela de loading (retry via `refresh`) em vez de expulsar o usuário — comportamento documentado.
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando.

## Passos manuais de QA

1. `bun run dev` na raiz; conferir `curl http://localhost:3000/api/v1/auth` → `{"status":"ok"}`.
2. Sem sessão: visitar `/`, `/app`, `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/confirm-account` → placeholders e redirecionamentos corretos (sem token não há chamada à API).
3. Com sessão (token válido no `localStorage.auth_token`): `/app` renderiza a home; `/auth/*` redireciona para `/app`; "Sign out" limpa o storage e volta ao sign-in.
4. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build`.
