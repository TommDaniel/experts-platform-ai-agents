# Plano — Confirm Account (`005-confirm-account`)

> Executa a spec `./.specs/005-confirm-account.md`. Implementa a confirmação de conta ponta a ponta: `POST /api/v1/auth/confirm-account` (DTO validado, token de 24h/uso único validado por hash, ativação de conta, consumo do token e criação de sessão via `SessionService` da 002) e a página `/auth/confirm-account` (lê `?token=`, chama a API, persiste a sessão e navega para `/app`, com estados de erro claros). Módulo autônomo em `apps/api/src/modules/auth/confirm-account/`; não toca `auth.module.ts`/`app.module.ts` (wiring centralizado na onda).

## Premissas do refinamento (feature-concept — sem entrevista, decisões documentadas)

| Premissa                      | Decisão                                                                                                                                                                                                    | Racional                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validação do token            | `token_hash` (SHA-256, reuso de `hashToken`) + `used_at` nulo + `expires_at > now`                                                                                                                         | Spec §Decisões: uso único + 24h.                                                                                                                            |
| Erros de token                | `BadRequestException` (400) com mensagens distintas: `Invalid confirmation link.` (inexistente), `This confirmation link has expired.` (expirado), `This confirmation link has already been used.` (usado) | "Erro claro" da spec; a UI mapeia cada mensagem para copy própria. Nenhuma alteração de conta/token/sessão nesses caminhos.                                 |
| Resposta de sucesso           | `200 { token }` (token de sessão)                                                                                                                                                                          | Mesmo contrato do sign-in (006); a página persiste e chama `refresh()` → `/auth/me`.                                                                        |
| Ativação                      | `email_verified_at = now()`                                                                                                                                                                                | Spec §Decisões.                                                                                                                                             |
| Sessão                        | `SessionService.createSession(userId)` (revoga anteriores, "última vence")                                                                                                                                 | Instrução da orquestração: REUTILIZAR a 002, não recriar.                                                                                                   |
| Atomicidade                   | Ativação + consumo do token num `db.transaction`; `createSession` roda depois (transação própria da 002)                                                                                                   | Reuso do `SessionService` impede transação única; falha de `createSession` é improvável e recuperável (conta ativa → sign-in funciona). Documentado no ADR. |
| Conta já ativa + token válido | Sucesso idempotente: reativa (no-op), consome o token e cria sessão                                                                                                                                        | Spec §Edge cases e §Riscos. Documentado no ADR.                                                                                                             |
| Token ausente/vazio na URL    | Página mostra erro "This link is invalid." sem chamar a API                                                                                                                                                | Spec critério de aceite.                                                                                                                                    |
| Reuso do token (reclique)     | Consumido no primeiro uso; segundo request → 400 "already been used", nenhuma sessão nova                                                                                                                  | Spec §Edge cases.                                                                                                                                           |
| StrictMode dev (efeito duplo) | Guard com `useRef` para disparar o POST uma única vez por mount                                                                                                                                            | `main.tsx` usa `StrictMode`; a dupla invocação do effect consumiria o token 2× no dev.                                                                      |
| UI                            | `AuthShell` (003), paleta `.docs/DESIGN.md`, estados de loading/erro/sucesso com `role="alert"` e `aria-live`                                                                                              | Skills obrigatórias `frontend-design`/`web-design-guidelines`.                                                                                              |
| Módulo                        | `ConfirmAccountModule` importa `AuthModule` (exporta `SessionService`); controller com `@Public()` + `ValidationPipe`                                                                                      | Padrão da 006/007; `DatabaseModule` é global.                                                                                                               |

## Objetivo

- `POST /api/v1/auth/confirm-account` valida o token (existe, não usado, não expirado), ativa a conta, consome o token e cria a sessão; erros claros sem efeitos colaterais.
- Página `/auth/confirm-account` confirma a conta a partir do link do email, persiste a sessão no `localStorage` e navega para `/app`, exibindo erro claro para token ausente/inválido/expirado/usado.
- QA gates passando; ADR em `./.adrs/005-confirm-account.md`.

## Escopo

**Dentro:** `confirm-account/` (dto, controller, use case, module) + testes (`src/*.spec.ts`, `e2e/*.e2e-spec.ts`), página `confirm-account.tsx` + teste de componente, plano e ADR.

**Fora:** `auth.module.ts`/`app.module.ts` (wiring da onda), sign-up (004), sign-in (006), reenvio de email, migrações (schema da 001).

## Etapas

### E1. `confirm-account.dto.ts`

`ConfirmAccountDto` com `token` (`@IsString`, `@IsNotEmpty`, `@MaxLength(128)`), espelhando os DTOs existentes.

### E2. `confirm-account.service.ts`

Injeta `DRIZZLE`, `SessionService` e `Logger`. `confirmAccount(token: string): Promise<string>`:

1. `tokenHash = hashToken(token)`; lookup único por `token_hash` em `emailConfirmationTokens`;
2. inexistente → `BadRequestException("Invalid confirmation link.")`;
3. `usedAt !== null` → `BadRequestException("This confirmation link has already been used.")`;
4. `expiresAt <= now` → `BadRequestException("This confirmation link has expired.")`;
5. transação: `users.email_verified_at = now` (idempotente) + `email_confirmation_tokens.used_at = now`;
6. `sessionToken = sessionService.createSession(userId)` (revoga anteriores, insere nova);
7. retorna `sessionToken`.

### E3. `confirm-account.controller.ts`

`@Controller("auth")` + `@Public()` + `@UsePipes(ValidationPipe({ whitelist, transform }))`; `@Post("confirm-account")` + `@HttpCode(200)` → `{ token }`.

### E4. `confirm-account.module.ts`

Imports `AuthModule` (para `SessionService`); providers `[ConfirmAccountService]`; controllers `[ConfirmAccountController]`. Sem exports.

### E5. Teste do use case (`confirm-account.service.spec.ts`)

TestingModule: `ConfigModule.forRoot({isGlobal:true})` + `DatabaseModule` + `PasswordModule` + `EmailModule` + `AuthModule` + `ConfirmAccountModule`, com `overrideProvider(EMAIL_TRANSPORT)` fake. Cenários:

- token válido → conta ativada, token usado, sessão ativa criada;
- token expirado → `BadRequestException`; conta **não** ativada, token **não** usado, nenhuma sessão;
- token já usado → `BadRequestException`; nenhuma alteração, nenhuma sessão nova;
- token inexistente → `BadRequestException`;
- conta já ativa com token válido → sucesso idempotente (sessão criada, token usado);
- token válido cria sessão única (sessões anteriores revogadas).

### E6. E2E HTTP (`apps/api/e2e/confirm-account.e2e-spec.ts`)

Supertest contra `/api/v1/auth/confirm-account` (mesmo TestingModule, `setGlobalPrefix("api/v1")`):

- token válido → `200 { token }`; conta ativada, token usado, sessão válida em `GET /auth/me`;
- token expirado → `400` mensagem de expirado; conta não ativada; `GET /auth/me` com sessão inexistente → 401;
- token já usado → `400` mensagem de usado; nenhuma sessão nova;
- token inexistente → `400` mensagem genérica de link inválido;
- body sem token / token vazio → `400` de validação.

### E7. Página `confirm-account.tsx`

Estados: `checking` (loading), `error` (invalid/expired/used/generic), sucesso (persiste token, `refresh()`, navega `/app`). `useSearchParams` lê `?token=`; sem token → erro "This link is invalid." sem fetch. Efeito único com guard de `useRef`. Copy de erro por mensagem da API + `AuthLink` de ação (sign-up para invalid/expired, sign-in para used). Acessível (heading, `role="alert"`, `aria-live`), paleta AuthShell.

### E8. Teste da página (`apps/app/src/pages/auth/confirm-account.test.tsx`)

MemoryRouter + fetch stub: sem token → erro sem fetch; token com sucesso → `localStorage` recebe token, `refresh` chamado, navega `/app`; token expirado/usado → mensagens próprias; erro genérico → mensagem genérica.

### E9. QA gates

Ordem de `.docs/QA.md`: `code:fix`, `types:check`, `test`, `test:e2e`, `build`.

### E10. ADR + artefatos + commit

`./.adrs/005-confirm-account.md`; commit Conventional Commits com `git add <caminhos explícitos>` (sem `auth.module.ts`/`app.module.ts`), validação `bunx commitlint`, co-author OpenCode Agent, `git pull --rebase` se a main andou.

## Arquivos-alvo

- Novo: `apps/api/src/modules/auth/confirm-account/{confirm-account.module.ts,confirm-account.controller.ts,confirm-account.service.ts,confirm-account.dto.ts,confirm-account.service.spec.ts}`, `apps/api/e2e/confirm-account.e2e-spec.ts`, `apps/app/src/pages/auth/confirm-account.test.tsx`, `./.plans/005-confirm-account-plan.md`, `./.adrs/005-confirm-account.md`.
- Alterado: `apps/app/src/pages/auth/confirm-account.tsx` (preenche o placeholder da 003).
- Não tocado: `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/app.module.ts`, `.specs/`, planos/ADRs de outras specs, `.env`.

## Riscos e edge cases

- **Concorrência 008 (reset-password) no mesmo tree:** arquivos totalmente distintos (`confirm-account/*`, `confirm-account.*`); nenhuma edição compartilhada.
- **Reuso do token:** o consumo é idempotente (update), mas o guard `usedAt !== null` no início impede reuso; dois requests concorrentes no mesmo token → ambos ativam (idempotente) e a última sessão vence.
- **StrictMode dev:** guard de `useRef` evita consumir o token 2×.
- **Banco compartilhado:** emails/tokens únicos por teste (`Date.now()` + random) e cleanup em `afterAll` (`email_confirmation_tokens` → `sessions` → `users`).

## Critérios de aceite (da spec)

Checklist de `005-confirm-account.md` §Critérios de aceite — cobertos por E2/E3/E5/E6/E7/E8 e QA gates.

## Checklist de QA manual

1. `bun run dev`; via Mailtrap pegue o link `http://localhost:5173/auth/confirm-account?token=...` de um sign-up; abra no navegador → sessão criada, navega para `/app` com `localStorage.auth_token` preenchido.
2. Reabra o mesmo link → mensagem "This link has already been used.".
3. Token expirado (editar `expires_at` no banco) → mensagem de expirado.
4. URL sem `?token=` → "This link is invalid.".
5. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build` passam.
