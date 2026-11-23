# Plano — Auth Routes (`003-auth-routes`)

> Executa a spec `./.specs/003-auth-routes.md`. Cria o roteamento SPA do cliente (`apps/app`, React + Vite): área pública `/auth/*`, área privada `/app/*`, guard de autenticação (valida sessão via `GET /api/v1/auth/me`), `AuthContext` (user/token/isLoading/signOut + localStorage), `apiClient` (fetch wrapper com `Authorization: Bearer`), proxy do Vite para a API e páginas placeholder. Consome os endpoints da `002` (`me`/`logout`) — não recria nada da API.

## Premissas do refinamento (feature-concept — sem entrevista, decisões documentadas)

| Premissa                     | Decisão                                                                                                  | Racional                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Transporte da sessão         | Token em `localStorage` (`auth_token`) + header `Authorization: Bearer`                                  | Decisão do usuário registrada na spec; reutilizado por todas as rotas.                                                         |
| Validação da sessão          | `GET /api/v1/auth/me` sempre que houver token no storage (não apenas presença)                           | Token revogado/vazio derruba a sessão; reaproveita a `002`.                                                                    |
| Rede indisponível ao validar | Manter `isLoading` verdadeiro (guard mostra loading, não expulsa o usuário) + `refresh()` para retry     | Edge case da spec: não derrubar usuário por instabilidade de rede.                                                             |
| CORS                         | Proxy do Vite (`/api` → `http://localhost:3000`) + base relativa `/api/v1` no client                     | API não tem CORS habilitado (fora do meu escopo); proxy evita cross-origin em dev e prod pode sobrescrever via `VITE_API_URL`. |
| Rotas `/app/*` inválidas     | `/app` e `/app/*` sob `RequireAuth`; catch-all `*` → página 404                                          | Com sessão, subrotas inválidas caem na 404; sem sessão, o guard redireciona.                                                   |
| Placeholders                 | Páginas `/auth/*` com layout compartilhado (`AuthShell`), copy en-us e links entre fluxos                | Specs 004–008 substituem os corpos; o esqueleto já é navegável e testável.                                                     |
| A11y de contraste            | Adicionar tokens neutros `ink`/`ink-soft` ao `index.css` (paleta não tem tom escuro)                     | `#eddcd2` sobre `#fff1e6` falha contraste; neutral garante WCAG AA/AAA no texto.                                               |
| E2E com sessão               | Mock de rede no Playwright (`page.route` para `/auth/me` e `/auth/logout`)                               | Evita depender de usuário/sessão reais no banco; testa o redirecionamento do client.                                           |
| `signOut()`                  | Best-effort `POST /auth/logout` (erro não bloqueia), limpa storage, estado e navega para `/auth/sign-in` | Spec exige logout + limpeza + navegação; falha de rede não pode prender o usuário logado.                                      |

## Objetivo

- Roteamento SPA público/privado com redirecionamentos corretos (sem sessão → sign-in; com sessão → `/app`).
- `AuthContext` (user, token, isLoading, isAuthenticated, signOut, refresh) com persistência em `localStorage`.
- `apiClient` com `Authorization: Bearer` e tratamento de `401`/erros de rede.
- Guards `RequireAuth`, `RedirectIfAuthenticated` e `RootRedirect` (redireciona `/`).
- Páginas placeholder de `/auth/sign-up`, `/auth/sign-in`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/confirm-account` e `/app/home` (+ 404).
- Proxy do Vite e tipagem de `VITE_API_URL`.
- Testes unitários (apiClient, AuthContext, guards) e E2E Playwright (redirecionamentos).
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando; ADR em `./.adrs/003-auth-routes.md`.

## Escopo

**Dentro:** `react-router-dom` em `apps/app`; `router.tsx`; `AuthContext`; `apiClient`; guards; páginas placeholder; 404; proxy Vite; tokens `ink`/`ink-soft`; testes unitários + E2E; atualização do `App.tsx`, `App.test.tsx`, `app.spec.ts` (hello world saiu) e `playwright.config.ts` (webServer em array: API + app).

**Fora:** formulários/validações dos fluxos (004/006/007/008); processamento de token de confirmação (005); páginas de produto; qualquer mudança em `apps/api/`; lazy-loading; SPA fallback para produção.

## Etapas

### E1. Dependência — `react-router-dom` em `apps/app`

`bun add react-router-dom` (workspace app). Atualiza `apps/app/package.json` e `bun.lock`.

### E2. `vite.config.ts` — proxy `/api` → `http://localhost:3000`

`server.proxy` mantendo `port: 5173`/`strictPort` e a config de teste.

### E3. `vite-env.d.ts` — tipagem de `VITE_API_URL`

### E4. `index.css` — tokens neutros `ink`/`ink-soft`

### E5. `lib/api-client.ts` — fetch wrapper

- `API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api/v1"`.
- `getStoredToken/setStoredToken/clearStoredToken` (`localStorage.auth_token`).
- `ApiError` (status + payload) e `request<T>` (injetar Bearer, JSON, erro em `!ok`, `204` → undefined).
- `apiClient.{get,post,put,patch,delete}`.

### E6. `contexts/auth-context.tsx`

- `AuthProvider` dentro do router (usa `useNavigate` no `signOut`).
- Estado inicial `isLoading = !!getStoredToken()`; efeito inicial → `refresh()`.
- `refresh()`: sem token → limpa; valida `/auth/me`; `401` → limpa storage/estado; falha de rede → mantém loading (retry via `refresh`).
- `signOut()`: `POST /auth/logout` best-effort → limpa storage/estado → `navigate("/auth/sign-in")`.
- `useAuth()` com erro claro se fora do provider.

### E7. Guards — `components/guards/*`

- `loading-screen.tsx` (`role="status"` + spinner com paleta).
- `require-auth.tsx`: loading → LoadingScreen; não autenticado → `Navigate /auth/sign-in`; senão `<Outlet/>`.
- `redirect-if-authenticated.tsx`: loading → LoadingScreen; autenticado → `Navigate /app`; senão `<Outlet/>`.
- `root-redirect.tsx`: `/` → `/app` (sessão) ou `/auth/sign-in`.

### E8. Páginas placeholder

- `components/auth/auth-shell.tsx` — card central na paleta (linen/parchment/powder-blue), título h1, subtítulo, children.
- `pages/auth/sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `confirm-account.tsx` — placeholders com links entre fluxos.
- `pages/app/home.tsx` — home autenticada (boas-vindas com `user.firstName` + botão "Sign out").
- `pages/not-found.tsx` — 404.

### E9. `router.tsx` + `App.tsx`

- Layout raiz `<AuthProvider><Outlet/></AuthProvider>` (AuthProvider dentro do router para o `signOut` navegar).
- Rotas públicas/privadas conforme o escopo; `App.tsx` vira `<RouterProvider router={router}/>`.

### E10. Testes unitários

- `lib/api-client.test.ts`: Bearer injetado; ausente sem token; `ApiError` 401; falha de rede propaga; POST JSON; parse de sucesso; base `/api/v1`.
- `contexts/auth-context.test.tsx` (MemoryRouter + fetch stub): sem token; token válido; 401 limpa; falha de rede mantém loading + token; signOut revoga, limpa e navega.
- `components/guards/guards.test.tsx` (useAuth mockado): loading, não-autenticado, autenticado para os 3 guards.
- `App.test.tsx`: `/` sem sessão → renderiza "Sign in".

### E11. E2E Playwright

- `playwright.config.ts`: `webServer` em array (API em `../api` + app em `.`).
- `e2e/app.spec.ts`: atualizar (sem sessão, `/` → `/auth/sign-in`).
- `e2e/auth-redirects.spec.ts`: sem sessão `/app` e `/` → sign-in; 5 rotas `/auth/*` renderizam; com sessão (mock `page.route` em `/auth/me`) `/auth/*` → `/app` e `/app` renderiza; signOut limpa storage e volta ao sign-in.

### E12. QA gates

Ordem de `.docs/QA.md`: `code:fix`, `types:check`, `test`, `test:e2e`, `build`.

### E13. ADR + artefatos

`./.adrs/003-auth-routes.md` com as decisões load-bearing.

### E14. Commit

Um commit Conventional Commits apenas com os arquivos da spec (seção "Arquivos e diretórios envolvidos" + arquivos auxiliares do app); co-author OpenCode Agent; validar com `bunx commitlint`; `git pull --rebase` se a main andou.

## Arquivos-alvo

- Novo: `apps/app/src/router.tsx`, `apps/app/src/lib/api-client.ts`, `apps/app/src/contexts/auth-context.tsx`, `apps/app/src/components/guards/*`, `apps/app/src/components/auth/auth-shell.tsx`, `apps/app/src/pages/auth/*`, `apps/app/src/pages/app/home.tsx`, `apps/app/src/pages/not-found.tsx`, `apps/app/src/{lib,contexts,components/guards}/*.test.*`, `apps/app/e2e/auth-redirects.spec.ts`, `./.plans/003-auth-routes-plan.md`, `./.adrs/003-auth-routes.md`.
- Alterado: `apps/app/package.json`, `apps/app/vite.config.ts`, `apps/app/src/vite-env.d.ts`, `apps/app/src/index.css`, `apps/app/src/App.tsx`, `apps/app/src/App.test.tsx`, `apps/app/playwright.config.ts`, `apps/app/e2e/app.spec.ts`, `bun.lock`.
- Não tocado: `apps/api/**` (nenhum arquivo).

## Riscos e edge cases

- **Hello world deixa de existir:** `App.tsx`, `App.test.tsx` e `e2e/app.spec.ts` são atualizados (o app agora redireciona `/`).
- **CORS API (sem `enableCors`):** resolvido com proxy do Vite; `VITE_API_URL` permite outro alvo em produção.
- **Sessão revogada entre navegações:** `401` no `/me` → guard limpa storage e redireciona para sign-in.
- **`/auth/*` já autenticado:** `RedirectIfAuthenticated` → `/app`.
- **Rede indisponível ao validar:** loading persistente + `refresh()` (documentado no ADR).
- **Testes e2e sem usuário real:** mock de rede via `page.route` cobre o caso "com sessão"; caso sem sessão não chama a API.
- **Fluxo de navegação do `signOut`:** `AuthProvider` fica dentro do router (layout raiz) para poder usar `useNavigate`.

## Critérios de aceite (da spec)

Checklist de `003-auth-routes.md` §Critérios de aceite — cobertos por E5/E6/E7/E10/E11 e QA gates.

## Checklist de QA manual

1. `bun run dev` (raiz) sobe API (:3000) + app (:5173); conferir `curl localhost:3000/api/v1/auth`.
2. Sem sessão: visitar `/`, `/app`, `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/confirm-account` → placeholders e redirecionamentos corretos.
3. Com sessão (token válido no `localStorage`): `/app` renderiza a home; `/auth/*` redireciona para `/app`; "Sign out" limpa e volta ao sign-in.
4. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build` passam.
