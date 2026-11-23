# ADR-004: Sign-up (POST /auth/sign-up + página `/auth/sign-up`)

- **Status:** aceito
- **Data:** 2026-08-11
- **Spec:** `./.specs/004-sign-up.md`
- **Decisões load-bearing** da materialização do cadastro sobre a `001` (schema + `PasswordService` + `EmailService`) e a `003` (rota `/auth/sign-up`, `AuthContext`, `apiClient`).

## Contexto

A `001` entregou `users` + `email_confirmation_tokens` + `PasswordService` + `EmailService`; a `003` entregou a rota `/auth/sign-up` placeholder. Esta spec materializa o cadastro: `POST /api/v1/auth/sign-up` valida o payload, cria a conta com hash bcrypt, gera um token de confirmação de 24h, envia o email com o link e responde sempre com a **mesma** resposta genérica (anti-enumeração); a página `/auth/sign-up` coleta os 5 campos, valida no client e mostra a tela "check your email".

## Decisões

### 1. Módulo autônomo `sign-up/` (DTO, controller, use case, module) sem tocar em `auth.module.ts`/`app.module.ts`

O wiring dos controllers é centralizado pelo orquestrador no fim da onda. O `SignUpModule` importa `PasswordModule` e `EmailModule` (o `DatabaseModule` é global e provê o `DRIZZLE`) e registra `SignUpController` + `SignUpService`, exportando o serviço. `@Public()` + `@UsePipes(ValidationPipe({ whitelist, transform }))` no controller mantêm o módulo funcional tanto em produção (após o wiring) quanto nos testes (que não importam `AppModule`).

### 2. Anti-enumeração total: resposta `201` genérica idêntica para email novo e existente

`signUp` faz o lookup por email; se já existir, retorna imediatamente **sem criar usuário, sem token e sem email**. O controller responde `201 { message: "Check your email to confirm your account" }` em todos os caminhos de sucesso. Diferente do forgot-password (007), aqui o caso "existente" **não** envia email — decisão explícita da spec para não notificar o dono de uma tentativa de cadastro (evita spam/abuso). O trade-off (o usuário que já tem conta não recebe feedback de duplicidade) é aceito.

### 3. `SignUpDto` com `class-validator` + decorator custom `Match` e transform de email

DTO com `first_name`/`last_name` (`@IsString`, `@IsNotEmpty`, `@MaxLength(255)`), `email` (`@IsEmail`, `@MaxLength(255)`, `@Transform` trim+lowercase), `password` (`@IsString`, `@IsNotEmpty`, `@MinLength(8)`, `@MaxLength(72)` — limite de 72 bytes do bcrypt) e `confirm_password` (`@IsString`, `@IsNotEmpty`, `@Match("password")`). O decorator `Match` (via `registerDecorator`) valida `password === confirm_password` no server com mensagem por campo. O service também normaliza com `trim().toLowerCase()` (defesa em profundidade, padrão dos outros use cases).

### 4. Criação atômica (usuário + token) e rollback compensatório se o email falhar

Usuário e token são inseridos em uma **transação** (`db.transaction`). O envio do email acontece **fora** da transação e é **blocking** (fail-fast, rastreável — decisão da spec). Se o transporte falhar: o usuário criado é **deletado** (FK cascade remove o token) e o endpoint responde `500` genérico com a causa real logada. O rollback garante que re-submeter o form re-tenta o fluxo completo (senão o usuário ficaria preso no limbo "conta criada sem email" — e a anti-enumeração impediria qualquer novo envio). O token reutiliza `generateSessionToken()` (43 chars base64url) + `hashToken()` (sha256) da 002, com TTL de 24h.

### 5. Página `/auth/sign-up` reusa `AuthShell`/`AuthLink`/`apiClient` da 003

Form controlado com 5 campos, validação client espelhando o server (obrigatórios, email válido, senha mín. 8, match), erros por campo inline (`role="alert"`, `aria-invalid`, `aria-describedby`), foco no primeiro campo com erro no submit, `aria-busy` + "Creating account…" no botão, erro genérico de form e tela de sucesso "Check your email" com mensagem genérica. Campos com `name` semântico (`first_name`, `last_name`, `email`, `password`, `confirm_password`) e `autoComplete` apropriado. Paleta pastel via `AuthShell`/tokens de `DESIGN.md`; responsivo (grid `sm:grid-cols-2` em name/password no desktop).

## Consequências

- `/api/v1/auth/sign-up` fica disponível quando o orquestrador registrar o `SignUpController`; até lá os testes usam um `TestingModule` próprio (sem `AppModule`).
- Conta criada mas **sem** sessão — a confirmação é da spec 005 (o valor do fluxo aparece no conjunto).
- `class-validator` + `class-transformer` já estavam em `apps/api` (adicionados na 006) — nenhuma lib nova.
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando.

## Passos manuais de QA

1. `bun run dev`; `curl -X POST localhost:3000/api/v1/auth/sign-up -H 'Content-Type: application/json' -d '{"first_name":"Ada","last_name":"Lovelace","email":"ada@example.com","password":"password123","confirm_password":"password123"}'` → `201 {"message":"Check your email to confirm your account"}`; repetir com o mesmo email → `201` idêntico, sem novo email.
2. Com `EMAIL_TRANSPORT=mailtrap` e credenciais reais no `.env`, conferir o email no Mailtrap com link `http://localhost:5173/auth/confirm-account?token=<token>`.
3. No app, `/auth/sign-up`: form vazio → erros por campo; senha curta/diferente → erro; válido → tela "Check your email".
4. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build`.
