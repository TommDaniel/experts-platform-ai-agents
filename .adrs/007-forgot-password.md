# ADR 007 — Forgot Password (solicitação de reset com anti-enumeração)

- **Status:** Aceito
- **Data:** 2026-08-11
- **Spec:** `.specs/007-forgot-password.md`

## Contexto

A pessoa precisa recuperar o acesso pedindo um reset pelo email. A decisão do usuário é anti-enumeração total: a resposta do endpoint nunca pode revelar se o email existe. A `001` entregou `password_reset_tokens` (token_hash, expires_at, used_at) e `EmailService.sendPasswordResetEmail`; a `003` entregou a rota `/auth/forgot-password` placeholder e o `apiClient`.

## Decisões

### D1. Token: 24h, uso único, apenas o hash no banco

- Link do email carrega o token cru (43 chars, `randomBytes(32)` base64url); o banco guarda apenas o SHA-256 (`token_hash`), reaproveitando `generateSessionToken`/`hashToken` da 002 (DRY). `expires_at = now + 24h`, `used_at` nulo.
- **Racional:** um vazamento do banco não permite usar tokens; o padrão já existe na base (sessões).

### D2. Novo request revoga tokens ativos anteriores

- Antes de inserir, marca `used_at = now` em todos os `password_reset_tokens` do usuário com `used_at IS NULL` e `expires_at > now`.
- **Racional:** spec edge case — "gerar novo token invalida o anterior? Sim". Evita que links antigos continuem válidos.

### D3. Falha no transporte de email não vaza existência

- Em caso de falha do `sendPasswordResetEmail`: loga `warn` e **responde `202` genérico mesmo assim**; o token permanece persistido (uso único fica disponível para a spec 008).
- **Racional:** `500` para conta existente vs `202` para inexistente seria um canal de enumeração. Anti-enumeração prevalece; o usuário pode solicitar de novo (e o request seguinte revoga o token anterior pela D2).

### D4. Timing anti-enumeração

- O token é gerado (`randomBytes` + hash) em **todos** os caminhos, antes do branch existe/inexiste.
- **Racional:** especificação pede minimizar diferenças observáveis. A diferença residual (insert + envio de email) é trade-off aceito e documentado — não há hash de senha neste fluxo e rate limiting está adiado.

### D5. Resposta `202` idêntica nos dois casos

- `{ message: "If the account exists, we sent a link" }`, `202 Accepted`, igual para conta existente e inexistente. Email inexistente → nenhum token, nenhum email.
- **Racional:** decisão do usuário (spec).

### D6. Módulo autônomo sem wiring

- `ForgotPasswordModule` importa apenas `EmailModule` (DatabaseModule é global). Controller usa `@Public()` + `@UsePipes(ValidationPipe({ whitelist, transform }))`.
- **Racional:** a orquestração faz o wiring em `auth.module.ts` ao final da onda; o pipe no controller mantém o módulo autocontido sem alterar `main.ts` (padrão da 006).

### D7. UI sempre genérica

- A página mostra a mesma tela de sucesso ("If the account exists, we sent a link.") independentemente da existência; erros de rede/500 mostram mensagem genérica que não vaza estado.
- **Racional:** preserva a anti-enumeração também no client.

## Consequências

- **Positivas:** enumeração de contas via endpoint inviabilizada; tokens expiram e são revogados em re-solicitação; padrões de token/sessão reutilizados (menos código).
- **Negativas:** sem rate limiting, uma vítima pode receber múltiplos emails de reset (mitigado parcialmente por 24h/token e revogação); a diferença de timing entre existir/não existir não é zero.
- **Decidido adiante:** rate limiting e reenvio de email ficam fora do escopo (spec).

## Passos manuais de QA

1. `bun run dev`; com usuário existente, `curl -X POST localhost:3000/api/v1/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"<email>@example.com"}'` → `202` com `{ message: "If the account exists, we sent a link" }`; conferir o email com o link `{APP_URL}/auth/reset-password?token=...` no Mailtrap; repetir e conferir que o token anterior foi revogado (novo email).
2. Email inexistente → `202` com exatamente o mesmo body; nenhum email no Mailtrap.
3. Email malformado → `400`.
4. No app: `/auth/forgot-password` com email válido → mensagem genérica de sucesso; vazio/malformado → erro por campo.
5. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build`.
