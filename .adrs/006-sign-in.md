# ADR-006: Sign-in (POST /auth/sign-in + página `/auth/sign-in`)

- **Status:** aceito
- **Data:** 2026-08-11
- **Spec:** `./.specs/006-sign-in.md`
- **Decisões load-bearing** da materialização do login sobre a `002` (sessão) e a `003` (router/apiClient/AuthContext).

## Contexto

A `001` entregou `users` + `PasswordService` + `EmailService`; a `002` entregou `SessionService` (última vence); a `003` entregou a rota `/auth/sign-in` placeholder, o `apiClient` e o `AuthContext`. Esta spec materializa o login: `POST /api/v1/auth/sign-in` valida credenciais, envia o email de nova sessão, cria sessão revogando as anteriores e a página `/auth/sign-in` autentica a pessoa e a leva a `/app`.

## Decisões

### 1. Módulo autônomo `sign-in/` (DTO, controller, use case, module) sem tocar em `auth.module.ts`/`app.module.ts`

O wiring dos controllers é centralizado pelo orquestrador no fim da onda. O `SignInModule` importa `AuthModule` (exporta `SessionService`), `PasswordModule` e `EmailModule`; registra `SignInController` e `SignInService`. Reutiliza `SessionService.createSession` (002) — não recria sessão.

### 2. Anti-enumeração por timing com hash bcrypt dummy

`signIn` sempre executa `PasswordService.verify(password, hash)` — com o hash real do usuário quando existe, ou com `DUMMY_PASSWORD_HASH` (bcrypt custo 10 de uma string fixa) quando o email não existe. Resposta `401 UnauthorizedException("Invalid email or password")` idêntica para senha errada, email inexistente e conta não confirmada (`email_verified_at` nulo). Isso iguala o custo de CPU entre os caminhos (mitiga timing side-channel) e não vaza estado da conta.

### 3. Email de nova sessão best-effort (nunca falha o login)

`sendNewSessionEmail` roda em `try/catch`: qualquer falha do transporte loga `warn` e o login **continua** e retorna o token. Decisão da spec ("o login NÃO deve falhar se o email falhar"). As credenciais Mailtrap locais são placeholder, então em dev o envio pode falhar sem impedir acesso; nos testes, o `EMAIL_TRANSPORT` é substituído por test-double via `overrideProvider`.

### 4. Validação do DTO no controller via `@UsePipes(new ValidationPipe({ whitelist, transform }))`

Não existe pipe global em `main.ts` (e o wiring é da onda). O pipe no controller mantém o módulo autônomo: validação ativa tanto em produção (após o wiring) quanto nos testes. `SignInDto`: `email` (`@IsEmail`, `@MaxLength(255)`) e `password` (`@IsString`, `@IsNotEmpty`, `@MaxLength(72)` — limite de 72 bytes do bcrypt). `whitelist` descarta campos extras; `transform` habilita class-transformer.

### 5. Resposta `200 { token }` e normalização do email

Sucesso → `200` com `{ token }` (token opaco de sessão da 002). O email é normalizado com `trim().toLowerCase()` no use case antes do lookup (unicidade case-insensitive). Falha de DTO → `400` com mensagens por campo.

### 6. Página `/auth/sign-in` reusa `AuthContext`/`apiClient` da 003

Form controlado com `email` + `password`, validação client (obrigatórios + formato de email), erro genérico "Invalid email or password." (qualquer falha do POST, sem vazar causa), botão com estado de loading ("Signing in…") e `aria-busy`. Sucesso → `setStoredToken(response.token)` + `refresh()` + `navigate("/app")`; o guard da 003 valida a sessão no destino. A11y: labels com `htmlFor`, `aria-invalid`/`aria-describedby` nos erros, `role="alert"` nas mensagens, foco no primeiro campo com erro no submit, `touch-manipulation` e foco visível com `focus-visible:ring`.

## Consequências

- `/api/v1/auth/sign-in` fica disponível quando o orquestrador registrar o `SignInController`; até lá os testes usam um `TestingModule` próprio (sem `AppModule`).
- O login derruba sessões anteriores por design ("última vence" da 002) e avisa o dono via email de nova sessão.
- `class-validator` + `class-transformer` adicionados a `apps/api` (peer deps de `@nestjs/common` necessárias ao `ValidationPipe`).
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando.

## Passos manuais de QA

1. `bun run dev`; criar/confirmar um usuário e testar: `curl -X POST localhost:3000/api/v1/auth/sign-in -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'` → `200 { token }`; o token autentica em `/api/v1/auth/me`.
2. Repetir o login e conferir que o token anterior agora responde `401` em `/auth/me` (última vence).
3. Senha errada, email inexistente e conta não confirmada → `401` com o mesmo body `{ message: "Invalid email or password", ... }`.
4. No app: `/auth/sign-in` com credenciais válidas → home `/app`; inválidas → erro genérico no card; campos vazios → erros por campo.
5. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build`.
