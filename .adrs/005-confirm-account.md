# ADR 005 — Confirm Account (ativação via token de uso único + sessão imediata)

- **Status:** Aceito
- **Data:** 2026-08-11
- **Spec:** `.specs/005-confirm-account.md`

## Contexto

O sign-up (004) cria a conta inativa (`email_verified_at` nulo) e envia um email com o link `{APP_URL}/auth/confirm-account?token=<token>`. A pessoa clica no link, o app valida o token, ativa a conta e **já entra autenticada** na home (`/app`) — decisão do usuário ("o link confirma a conta e cria sessão dirigindo à home"). A `001` entregou `email_confirmation_tokens` (token_hash, expires_at, used_at) e `EmailService.sendConfirmationEmail`; a `002` entregou `SessionService.createSession` (última sessão vence); a `003` entregou a rota placeholder `/auth/confirm-account`, o `AuthContext` e o `apiClient`.

## Decisões

### D1. Validação do token: hash + uso único + 24h

- `POST /auth/confirm-account` recebe o token cru no body; o banco é consultado por `token_hash` (SHA-256, reuso de `hashToken`/`generateSessionToken` da 002). Critérios: token existe, `used_at` nulo e `expires_at` no futuro.
- **Racional:** padrão de token já estabelecido (004/007) e spec §Decisões.

### D2. Erros distintos com `400 BadRequestException`

- `Invalid confirmation link.` (token inexistente), `This confirmation link has expired.` (expirado) e `This confirmation link has already been used.` (usado). Nenhum caminho de erro altera conta/token/sessão.
- **Racional:** spec pede "erro claro"; mensagens distintas permitem que a página mapeie cada estado para copy e ação próprias. 400 é apropriado (input do link do usuário inválido/consumido).

### D3. Conta já ativa com token válido = sucesso idempotente

- Se `email_verified_at` já está preenchido e o token ainda é válido, o fluxo segue normalmente: `email_verified_at = now()` (no-op), token consumido e sessão criada.
- **Racional:** spec §Riscos ("tratar como sucesso, decidir e documentar"). Simples e sem efeito colateral — é o mesmo resultado que o usuário espera ao clicar de novo num link ainda válido.

### D4. Ativação + consumo do token em transação; sessão via `SessionService`

- As duas escritas (ativar conta + `used_at = now`) rodam em um `db.transaction`. Em seguida, `SessionService.createSession(userId)` reutiliza a 002 (revoga sessões anteriores do usuário e insere a nova, "última vence").
- **Racional:** reuso explícito exigido pela orquestração (não recriar sessão). Trade-off aceito: `createSession` roda em transação própria, então os dois passos não são atômicos entre si. A janela de falha é mínima (mesma conexão/banco) e recuperável: se a criação da sessão falhar, a conta já está ativa e o sign-in (006) funciona.

### D5. Resposta `200 { token }` e página que persiste a sessão

- Contrato idêntico ao sign-in (006): o app chama `setStoredToken(token)`, `refresh()` (→ `/auth/me`) e navega para `/app` com `replace`. O token de confirmação nunca vira token de sessão — a sessão é gerada no server e transportada pela resposta.
- **Racional:** alinhado à decisão de transporte Bearer/localStorage e ao fluxo existente de sign-in; `replace` evita que a URL com token permaneça no histórico.

### D6. Página com guard contra efeito duplo (StrictMode)

- O POST roda uma única vez por mount via `useRef`; sem `?token=` a página mostra o estado "This link is invalid." sem chamar a API.
- **Racional:** `main.tsx` usa `StrictMode` (efeitos disparados 2× no dev); como o token é de uso único, a segunda chamada retornaria "already been used" — o guard preserva a experiência de dev e a idempotência do teste.

### D7. Módulo autônomo sem wiring

- `ConfirmAccountModule` importa `AuthModule` (para `SessionService`); controller usa `@Public()` + `@UsePipes(ValidationPipe({ whitelist, transform }))`. Nenhuma alteração em `auth.module.ts`/`app.module.ts`.
- **Racional:** padrão da 006/007; o orquestrador registra os módulos em `app.module.ts` ao final da onda (como fez para 004/006/007 — wiring em `AppModule` evita o ciclo com `AuthModule`).

## Consequências

- **Positivas:** link do email autentica e leva à home; token de confirmação é de uso único e curto (24h); erros claros e sem efeitos colaterais; reuso total de token/sessão/UI existentes.
- **Negativas:** token no query string pode vazar via referrer/histórico (mitigado: uso único + 24h, `replace` na navegação — trade-off aceito na spec); ativação e criação de sessão não são atômicas (janela mínima, recuperável por sign-in).
- **Decidido adiante:** reenvio do email de confirmação (fora de escopo); rate limiting (fora de escopo).

## Passos manuais de QA

1. `bun run dev`; fazer sign-up, pegar o link do email no Mailtrap (`http://localhost:5173/auth/confirm-account?token=...`) e abrir no navegador → sessão criada, `localStorage.auth_token` preenchido e navegação para `/app`.
2. Reabrir o mesmo link → "This link has already been used." com link para sign-in.
3. Token expirado (editar `expires_at` no banco) → "This link has expired." com link para sign-up.
4. URL `/auth/confirm-account` sem `?token=` → "This link is invalid.".
5. `bun run code:fix`, `types:check`, `test`, `test:e2e`, `build`.
