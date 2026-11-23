# Plano — Transporte de email por NODE_ENV (`011-email-transport-node-env`)

> Executa a spec `./.specs/011-email-transport-node-env.md`. Remove a env `EMAIL_TRANSPORT` e resolve o transporte de email exclusivamente por `NODE_ENV`: `production` → Resend; qualquer outro valor (ou ausência, padrão `development`) → Mailtrap. Mantém o token DI `EMAIL_TRANSPORT` (Symbol) e o fail-fast de credenciais.

## Decisões do refinamento (feature-concept)

Não houve entrevista: a spec já é precisa e determinística, sem lacunas materiais (decisões de mapeamento, padrão `development` e manutenção do token DI já foram definidas e aprovadas).

## Objetivo

- `createEmailTransport` decide o transporte por `nodeEnv` (`process.env.NODE_ENV ?? "development"`), sem ler `EMAIL_TRANSPORT`.
- `EMAIL_TRANSPORT` removida de `.env.example` e de mensagens de erro; símbolo DI inalterado.
- Testes unitários da factory cobrindo produção, não-produção e ausência de `NODE_ENV` (padrão `development`) + fail-fast de credenciais.
- Novo ADR registrando a decisão.
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando.

## Escopo

**Dentro:** `email-transport.factory.ts`, `email-transport.factory.spec.ts`, `.env.example`, novo ADR em `.adrs/`.

**Fora:** `MailtrapTransport`/`ResendTransport`/`EmailTransport`/`EmailService`/`EmailModule`; token DI `EMAIL_TRANSPORT` em `email.constants.ts`; specs/ADRs históricos; `.env` (só remoção manual, não commitar).

## Etapas

### E1. Factory (`apps/api/src/modules/shared/email/infrastructure/email-transport.factory.ts`)

- Manter assinatura `createEmailTransport(env, nodeEnv = process.env.NODE_ENV ?? "development")`.
- `nodeEnv === "production"` → `new ResendTransport({ apiKey: env.get("RESEND_API_KEY") ?? "", from: env.get("RESEND_FROM") ?? "" })`.
- Caso contrário → `new MailtrapTransport({ host, port, user, pass, from })` (credenciais `MAILTRAP_*`).
- Remover leitura de `EMAIL_TRANSPORT` e o bloco "mailtrap not allowed in production".
- Mensagens de erro atualizadas (descrevem decisão por `NODE_ENV`, sem citar a env removida).

### E2. Testes (`email-transport.factory.spec.ts`)

- `fakeConfig` mantida; fixtures `mailtrapEnv`/`resendEnv` sem `EMAIL_TRANSPORT`.
- Casos:
  - `NODE_ENV=production` → `ResendTransport`.
  - `NODE_ENV=development`, `test`, `staging`, `unknown` → `MailtrapTransport`.
  - `NODE_ENV` ausente (default) → `development` → `MailtrapTransport`.
  - Credenciais Resend ausentes em produção → throw `RESEND_API_KEY is missing`.
  - Credenciais Mailtrap ausentes em não-produção → throw `Mailtrap SMTP credentials are incomplete`.

### E3. `.env.example`

- Remover a linha `EMAIL_TRANSPORT=mailtrap` e o comentário associado.
- Ajustar comentários das seções Mailtrap (non-prod por `NODE_ENV`) e Resend (prod por `NODE_ENV`).

### E4. ADR

- Criar `.adrs/012-email-transport-node-env.md` registrando a decisão (estilo dos ADRs existentes).

### E5. QA gates

- `bun run code:fix`, `bun run types:check`, `bun run test`, `bun run test:e2e`, `bun run build`.

## Arquivos-alvo

- `apps/api/src/modules/shared/email/infrastructure/email-transport.factory.ts`
- `apps/api/src/modules/shared/email/infrastructure/email-transport.factory.spec.ts`
- `.env.example`
- `.adrs/012-email-transport-node-env.md` (novo)

## Riscos e edge cases

- `NODE_ENV` ausente em deploy de prod → assume `development` → tenta Mailtrap → credenciais ausentes derrubam a inicialização (fail-fast, erro visível).
- `NODE_ENV=test` (Vitest) → Mailtrap; testes/E2E usam `overrideProvider(EMAIL_TRANSPORT)` (inalterado).
- `NODE_ENV=staging` → Mailtrap (trade-off documentado na spec).
- `EMAIL_TRANSPORT` residual no `.env` local → ignorado (env deixa de ser lida).

## Critérios de aceite (da spec)

- `EMAIL_TRANSPORT` fora de `.env.example`.
- Factory retorna Resend em `production` e Mailtrap em qualquer outro valor/ausência (padrão `development`).
- Fail-fast de credenciais mantido com mensagens claras.
- Nenhuma referência ativa a `EMAIL_TRANSPORT` como env; token DI intacto.
- QA gates passando.

## Checklist de QA manual

- [ ] `grep -r "EMAIL_TRANSPORT" apps/api/src .env.example` → só o símbolo DI em `email.constants.ts`, `email.module.ts`, `email.service.ts` e `overrideProvider` de testes/E2E (nenhuma leitura de env).
- [ ] Remover `EMAIL_TRANSPORT` do `.env` local; manter `NODE_ENV` ausente ou `development` em dev.
- [ ] Fluxo de email em dev continua capturando no Mailtrap.
