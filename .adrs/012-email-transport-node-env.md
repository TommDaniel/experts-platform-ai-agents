# ADR-012: Transporte de email derivado de NODE_ENV (remover EMAIL_TRANSPORT)

- **Status:** aceito
- **Data:** 2026-08-12
- **Spec:** `./.specs/011-email-transport-node-env.md`
- **Decisão load-bearing:** o transporte de email passa a ser resolvido exclusivamente por `NODE_ENV` — `production` → Resend; qualquer outro valor (ou ausência, com padrão `development`) → Mailtrap — e a env `EMAIL_TRANSPORT` é removida. O token DI `EMAIL_TRANSPORT` (Symbol) permanece.

## Contexto

O `EmailService` resolve o transporte pela env `EMAIL_TRANSPORT` (`mailtrap` | `resend`) na factory `email-transport.factory.ts`, com regra extra que proíbe `mailtrap` em produção. Essa variável é redundante: a decisão já é binária por ambiente (non-prod → Mailtrap, prod → Resend) e `NODE_ENV` já é a fonte canônica que distingue produção de não-produção em qualquer runtime (ex.: Vercel define `NODE_ENV=production` automaticamente). Manter `EMAIL_TRANSPORT` adiciona superfície de configuração e um modo de falha a mais (valor inválido, `mailtrap` esquecido em produção).

## Decisões

### 1. Fonte de decisão: `NODE_ENV` exclusivamente

`createEmailTransport(env, nodeEnv = process.env.NODE_ENV ?? "development")` deixa de ler `EMAIL_TRANSPORT` e escolhe o transporte por `nodeEnv`:

- `nodeEnv === "production"` → `ResendTransport` (lê `RESEND_API_KEY`/`RESEND_FROM`).
- Qualquer outro valor (incl. `development`, `test`, `staging`) → `MailtrapTransport` (lê `MAILTRAP_*`).

O bloco `EMAIL_TRANSPORT=mailtrap ... not allowed in production` e o erro `Unknown EMAIL_TRANSPORT` são removidos — a escolha é determinística, não existe mais valor inválido possível.

### 2. `NODE_ENV` não obrigatória, padrão `development`

Quando `NODE_ENV` não é definida explicitamente, assume-se `development` (→ Mailtrap). Vale tanto na factory (`?? "development"`) quanto no bootstrap; nenhuma validação de lista de valores é feita.

### 3. Token DI `EMAIL_TRANSPORT` mantido

O símbolo em `email.constants.ts` e o provider no `EmailModule` não mudam; `overrideProvider(EMAIL_TRANSPORT)` dos testes unitários e E2E continua substituindo o transporte real por test-double. Remoção é só da **variável de ambiente**, não do token de injeção.

### 4. Fail-fast de credenciais preservado

`MailtrapTransport` e `ResendTransport` continuam validando credenciais no construtor (erros explícitos: `Mailtrap SMTP credentials are incomplete` / `RESEND_API_KEY is missing` / `RESEND_FROM is missing`). Sem credenciais, a inicialização falha de forma visível.

## Consequências

**Positivas:**

- Uma variável a menos no `.env` e no pipeline de deploy; impossível configurar transporte errado.
- Elimina o modo de falha "mailtrap em produção": produção é determinística por `NODE_ENV`.
- Menos código na factory e nos testes (removidos os casos de valor desconhecido e da checagem de produção).

**Negativas/custos:**

- Ambientes intermediários (ex.: staging) usam Mailtrap, pois só `NODE_ENV=production` ativa o Resend. Se staging precisar de Resend no futuro, será decisão própria.
- `NODE_ENV` ausente num deploy de produção seria tratado como `development` → tentaria Mailtrap; a ausência das credenciais `MAILTRAP_*` derruba a inicialização (fail-fast), tornando o erro visível em vez de silencioso.
