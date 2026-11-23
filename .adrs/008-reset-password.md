# ADR 008 — Reset Password (token 24h/uso único, hash bcrypt, email de sucesso)

- **Status:** Aceito
- **Data:** 2026-08-11
- **Spec:** `.specs/008-reset-password.md`

## Contexto

A pessoa recebe o link de reset da `007` (`{APP_URL}/auth/reset-password?token=<token>`) e precisa definir uma nova senha: página com os dois campos (match, mín. 8), `POST /api/v1/auth/reset-password` validando o token (24h, uso único), atualizando `password_hash`, marcando o token como usado, enviando email de sucesso e redirecionando ao sign-in. A `001` entregou `password_reset_tokens`, `PasswordService` (bcrypt custo 10) e `EmailService.sendPasswordResetSuccessEmail`; a `003` entregou a rota placeholder; a `006` entregou o sign-in (reusado no teste de aceite).

## Decisões

### D1. Token consumido por hash SHA-256

- O body carrega o token cru (43 chars, vem do email); o lookup em `password_reset_tokens` usa `hashToken(token)` (`../session/session-token.ts`), mesmo padrão de 001/002/007.
- **Racional:** DRY; o banco só guarda o hash — um vazamento de banco não permite usar o link.

### D2. Validação do token antes de qualquer escrita

- Existe (`token_hash`) → `used_at` nulo → `expires_at` futuro; qualquer falha → `BadRequestException` (400) sem tocar em `users`.
- **Racional:** especificação exige "senha não alterada" nos modos de falha; a ordem garante isso.

### D3. Mensagens de erro distintas e claras

- Inexistente → "Invalid password reset link."; usado → "This password reset link has already been used."; expirado → "This password reset link has expired. Please request a new one."
- **Racional:** spec edge cases pedem clareza ("link expirado", "link já utilizado"). Distinguir não vaza estado de conta porque os tokens são inegáveis (32 bytes aleatórios) — o erro descreve o token, não a conta.

### D4. Update atômico em transaction

- `users.password_hash` (+ `updated_at`) e `password_reset_tokens.used_at` mudam no mesmo transaction.
- **Racional:** senha nova e token usado são um único fato de domínio — ou os dois acontecem ou nenhum.

### D5. Falha no email de sucesso não reverte o reset

- `sendPasswordResetSuccessEmail` em `try/catch`; falha loga `warn` e o fluxo retorna sucesso normalmente.
- **Racional:** spec edge case explícito — o reset já foi aplicado; reverter deixaria o usuário sem saber qual senha vale.

### D6. Match validado no server e no client

- Controller compara `dto.password !== dto.confirm_password` → `BadRequestException("Passwords do not match.")` antes do use case; a página repete a validação (obrigatório, mín. 8, match).
- **Racional:** spec exige "validado no client e no server" — server nunca confia no client.

### D7. Senha: mín. 8 + bcrypt custo 10, máx. 72

- `PasswordService.hash` (custo 10) via `PasswordModule`; DTO `@MinLength(8)` e `@MaxLength(72)` (limite do bcrypt).
- **Racional:** decisão do usuário na elicitação (documentada na spec); reusa a `001`.

### D8. Sucesso → `200` + redirecionamento no client

- Resposta `{ message: "Your password has been reset. You can now sign in." }`; a página navega para `/auth/sign-in` (não autentica diretamente).
- **Racional:** spec §Escopo exige redirecionar ao sign-in; manter a reautenticação explícita.

### D9. Módulo autônomo sem wiring

- `ResetPasswordModule` importa `PasswordModule` + `EmailModule` (DatabaseModule global). Controller `@Public()` + `@UsePipes(ValidationPipe({ whitelist, transform }))`.
- **Racional:** a orquestração faz o wiring em `auth.module.ts` ao final da onda; o pipe no controller mantém o módulo autocontido (padrão da 006/007).

### D10. Página preserva o heading "Reset password" no estado sem token

- Sem `?token=`: AuthShell com heading "Reset password" + painel "Invalid reset link" + links (nova solicitação / sign-in).
- **Racional:** critério de aceite "Página sem `?token=` → estado de erro" **e** compatibilidade com o Playwright existente (`auth-redirects.spec.ts` espera o heading).

### D11. Teste de aceite reusa o `SignInModule`

- O E2E importa `SignInModule` (com `AuthModule` via dependência) e chama `POST /api/v1/auth/sign-in` com a senha nova/antiga após o reset.
- **Racional:** instrução da orquestração — não recriar sign-in.

## Consequências

- **Positivas:** fluxo ponta a ponta completo (link → página → reset → login novo/antigo); tokens expirado/usado tratados sem alteração de senha; falha de email não reverte o reset; padrões de token/email/validação reutilizados.
- **Negativas:** mensagens distintas para usado/inexistente tornam o endpoint um oráculo fraco sobre o _token_ (aceitável: tokens inegáveis); sessões ativas continuam válidas após o reset (adiado por decisão do usuário).
- **Decidido adiante:** revogação de sessões ativas após reset; regra de "não repetir a senha anterior".

## Passos manuais de QA

1. `bun run dev`; com o link de reset real do Mailtrap (via 007): abrir `/auth/reset-password?token=<token>`, definir senha nova (mín. 8) → navega para `/auth/sign-in`; email "Your password has been reset" chega ao Mailtrap.
2. Login com a nova senha → sucesso; com a antiga → "Invalid email or password".
3. Reabrir o mesmo link → "This link has already been used".
4. Sem `?token=` → "Invalid reset link"; senhas diferentes ou <8 → erro por campo.
5. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build`.
