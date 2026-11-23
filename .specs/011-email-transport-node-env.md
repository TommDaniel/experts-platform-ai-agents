---
title: Derivar transporte de email de NODE_ENV (remover EMAIL_TRANSPORT)
status: draft
created: 2026-08-12
---

# Derivar transporte de email de NODE_ENV (remover EMAIL_TRANSPORT)

> Remove a variável de ambiente `EMAIL_TRANSPORT` e passa a resolver o transporte de email exclusivamente por `NODE_ENV`: `production` → Resend; qualquer outro valor (ou ausência, com padrão `development`) → Mailtrap.

## Contexto

O `EmailService` resolve hoje o transporte a partir da env `EMAIL_TRANSPORT` (`mailtrap` | `resend`) na factory `email-transport.factory.ts`, com regra extra que proíbe `mailtrap` em produção. Essa variável é redundante: a decisão já é binária por ambiente (non-prod → Mailtrap, prod → Resend) e `NODE_ENV` já é a fonte canônica que distingue produção de não-produção em qualquer deploy (ex.: Vercel define `NODE_ENV=production` automaticamente).

Manter `EMAIL_TRANSPORT` adiciona superfície de configuração desnecessária e um modo de falha a mais (valor inválido, `mailtrap` esquecido em produção). Removê-la elimina essa variável do `.env` e simplifica a factory para uma única fonte de verdade.

## Objetivo

- Eliminar a env `EMAIL_TRANSPORT` de toda configuração ativa do projeto (`.env.example`, factory e erros).
- Resolver o transporte de email apenas por `NODE_ENV`: `production` → Resend; não-produção → Mailtrap.
- Considerar `NODE_ENV` como **não obrigatória**: quando ausente, assumir `development` como padrão.
- Manter o comportamento fail-fast (credenciais ausentes derrubam a inicialização com erro explícito) e os portões de QA passando.

## Escopo

- **Dentro:**
  - `createEmailTransport` deixa de ler `EMAIL_TRANSPORT` e decide o transporte por `NODE_ENV` (padrão `development` quando ausente).
  - Atualização dos testes unitários da factory para o novo critério de resolução.
  - Remoção de `EMAIL_TRANSPORT` do `.env.example` e ajuste dos comentários das seções Mailtrap/Resend.
  - Atualização de mensagens de erro que citam `EMAIL_TRANSPORT`.
  - Atualização da doc ativa (ADR novo registrando a decisão; referências em `.adrs/` e docs, quando aplicável).
  - Passo manual de QA para remover `EMAIL_TRANSPORT` do `.env` local (nunca commitar `.env`).

- **Fora:**
  - Alterações nas classes `MailtrapTransport`/`ResendTransport` e na interface `EmailTransport`.
  - Alterações no `EmailService` (métodos e templates por fluxo).
  - Renomear o token de DI `EMAIL_TRANSPORT` em `email.constants.ts` (continua existindo como símbolo; os `overrideProvider(EMAIL_TRANSPORT)` dos testes e E2E permanecem intactos).
  - Alterar specs ou ADRs históricos (são registros; registram-se novas decisões, não se reescrevem os antigos).

- **Adiado:**
  - Validação rígida dos valores de `NODE_ENV` (qualquer valor que não seja exatamente `production` é tratado como não-produção).

## Necessidade de negócio

Menos configuração para o operador (uma variável a menos no `.env` e no pipeline de deploy), menos chance de erro humano (impossível esquecer `mailtrap` em produção, pois a escolha passa a ser determinística por ambiente) e fonte única de verdade para o comportamento prod/não-prod. O envio de email continua funcionando da mesma forma nos fluxos de auth já entregues (sign-up, confirm-account, sign-in, forgot-password, reset-password).

## Critérios de aceite

- [ ] `EMAIL_TRANSPORT` não aparece mais em `.env.example`.
- [ ] `createEmailTransport(env)` com `NODE_ENV=production` retorna `ResendTransport` (teste unitário).
- [ ] `createEmailTransport(env)` com `NODE_ENV=development`, `test`, `staging` ou valor desconhecido retorna `MailtrapTransport` (teste unitário).
- [ ] `createEmailTransport(env)` com `NODE_ENV` ausente assume o padrão `development` e retorna `MailtrapTransport` (teste unitário).
- [ ] Credenciais ausentes continuam derrubando a inicialização com erro explícito: `RESEND_API_KEY`/`RESEND_FROM` ausentes em produção e `MAILTRAP_HOST`/`MAILTRAP_USER`/`MAILTRAP_PASS` ausentes em não-produção (teste unitário).
- [ ] Nenhuma mensagem de erro ou código ativo referencia `EMAIL_TRANSPORT` como variável de ambiente (o símbolo de DI permanece, sem referências a env).
- [ ] `.env` local atualizado manualmente (passo de QA documentado) e `EMAIL_TRANSPORT` removido.
- [ ] `bun run code:fix`, `bun run types:check`, `bun run test`, `bun run test:e2e` e `bun run build` passam.

## O que fazer

- Reescrever `createEmailTransport` para decidir por `nodeEnv` (parâmetro com padrão `process.env.NODE_ENV ?? "development"`): `production` → `new ResendTransport(...)` lendo `RESEND_API_KEY`/`RESEND_FROM`; qualquer outro valor → `new MailtrapTransport(...)` lendo `MAILTRAP_*`. Remover o bloco que lia `EMAIL_TRANSPORT` e a checagem "mailtrap not allowed in production".
- Atualizar as mensagens de erro para descrever a decisão por `NODE_ENV` (sem citar `EMAIL_TRANSPORT`).
- Atualizar `email-transport.factory.spec.ts`: remover os casos baseados em `EMAIL_TRANSPORT` e cobrir a resolução por `NODE_ENV` (produção, não-produção, ausente com padrão `development`) e os fail-fast de credenciais.
- Remover a linha `EMAIL_TRANSPORT=mailtrap` e o comentário associado do `.env.example`; ajustar os comentários das seções Mailtrap e Resend para indicar quando cada transporte é usado (non-prod/prod por `NODE_ENV`).
- Registrar a decisão em um novo ADR em `.adrs/`.
- Documentar no QA da spec o passo manual de atualizar o `.env` local (remover `EMAIL_TRANSPORT`, garantir `NODE_ENV` ausente ou `development` em dev).

## O que não fazer

- Não renomear o token DI `EMAIL_TRANSPORT` nem alterar os `overrideProvider(EMAIL_TRANSPORT)` dos testes/E2E.
- Não alterar `MailtrapTransport`, `ResendTransport`, a interface `EmailTransport` nem o `EmailService`.
- Não tornar `NODE_ENV` obrigatória nem validar a lista de valores possíveis.
- Não editar specs/ADRs históricos (ex.: `001-auth-schema.md`, `.adrs/001-auth-schema.md`) — as referências antigas a `EMAIL_TRANSPORT` permanecem como registro histórico.
- Não commitar `.env`.

## Decisões

| Decisão                        | Opção escolhida                                                             | Racional                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Fonte de decisão do transporte | `NODE_ENV` exclusivamente (remover env `EMAIL_TRANSPORT`)                   | Fonte canônica de ambiente; elimina config redundante e o modo de falha de valor errado.           |
| Mapeamento produção            | `NODE_ENV=production` → Resend                                              | Resend é o transporte de prod definido na spec `001`.                                              |
| Mapeamento não-produção        | Qualquer valor ≠ `production` (incl. `test`, `staging`) → Mailtrap          | Mailtrap captura emails em qualquer ambiente não-produto; evita envio real fora de produção.       |
| `NODE_ENV` ausente             | Padrão `development` (variável não obrigatória)                             | Prompt: "vamos assumir dev como valor padrão, a mesma não é obrigatória".                          |
| Símbolo DI                     | `EMAIL_TRANSPORT` mantido em `email.constants.ts`                           | É token de injeção (Symbol), não env; testes continuam usando `overrideProvider(EMAIL_TRANSPORT)`. |
| Comportamento de falha         | Fail-fast: credenciais ausentes derrubam a inicialização com erro explícito | Mantém a decisão da spec `001`; nunca silencioso.                                                  |
| Registro da decisão            | Novo ADR em `.adrs/`                                                        | Workflow obrigatório de `RULES.md`.                                                                |

## Dependências

- `001-auth-schema.md` (origem da factory e dos transports; define o contrato de envio de email e o fail-fast).
- Docs: `ARCHITECTURE.md` (stack), `DEVELOPMENT.md` (camadas e idioma), `QA.md` (portões).
- `NODE_ENV` definido pelo runtime de deploy (ex.: Vercel define `production` automaticamente em produção).

## Riscos e trade-offs

- **Ambientes intermediários (staging) usam Mailtrap:** qualquer valor que não seja exatamente `production` cai em não-produção. Aceitável — evita envio real fora de produção; se um dia staging precisar de Resend, isso vira decisão própria.
- **`NODE_ENV` ausente em um deploy de produção:** o sistema assume `development` e tentaria Mailtrap — mas a ausência de credenciais `MAILTRAP_*` derruba a inicialização com erro explícito (fail-fast), tornando o erro visível em vez de silencioso.
- **`EMAIL_TRANSPORT` residual no `.env` local:** ignorado pela factory (variável deixa de ser lida); o passo manual de QA limpa o `.env`.

## Edge cases e modos de falha

- `NODE_ENV` ausente → padrão `development` → Mailtrap.
- `NODE_ENV=test` (Vitest) → não-produção → Mailtrap; nos testes unitários/E2E o transporte real é substituído por test-double via `overrideProvider(EMAIL_TRANSPORT)` (sem mudança).
- `NODE_ENV=production` sem `RESEND_API_KEY`/`RESEND_FROM` → erro explícito na inicialização (fail-fast).
- `NODE_ENV=development` sem `MAILTRAP_HOST`/`MAILTRAP_USER`/`MAILTRAP_PASS` → erro explícito na inicialização.
- `NODE_ENV=production` com credenciais `MAILTRAP_*` presentes → ignoradas (transporte é Resend por decisão de ambiente).
- Valor desconhecido de `NODE_ENV` (ex.: `prod`) → tratado como não-produção → Mailtrap (validação de valores fica adiada).
- Mailtrap fora do ar em dev → o envio falha com erro rastreável; a regra de negócio (anti-enumeração) não depende do transporte (inalterada).

## Resultado (definição de pronto)

- Nenhuma referência ativa a `EMAIL_TRANSPORT` como variável de ambiente (factory, mensagens de erro, `.env.example`).
- Testes unitários da factory cobrindo resolução por `NODE_ENV` (produção, não-produção, ausente → padrão `development`) e fail-fast de credenciais, passando.
- ADR novo em `.adrs/` registrando a decisão.
- `.env` local com `EMAIL_TRANSPORT` removido (validação manual).
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando.

## Arquivos e diretórios envolvidos

- `apps/api/src/modules/shared/email/infrastructure/email-transport.factory.ts`
- `apps/api/src/modules/shared/email/infrastructure/email-transport.factory.spec.ts`
- `.env.example`
- `.env` (local, apenas remoção manual — não commitar)
- `.adrs/` (novo ADR)
- Sem alterações em `apps/api/src/modules/shared/email/domain/email.constants.ts`, `email.module.ts`, `email.service.ts`, `mailtrap.transport.ts`, `resend.transport.ts` nem nas specs/ADRs históricos.
