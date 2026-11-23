---
title: Forgot Password
status: draft
created: 2026-08-10
---

# Forgot Password

> Fluxo de solicitação de reset de senha: página `/auth/forgot-password` coleta o email e `POST /api/v1/auth/forgot-password` **sempre** responde de forma genérica; o email com o link de reset (token 24h, uso único) só é enviado quando a conta existe. Anti-enumeração total.

## Contexto

A `001` entregou a tabela `password_reset_tokens` e o `EmailService`; a `003` entregou a rota `/auth/forgot-password` placeholder. O prompt: "As pessoas podem pedir para resetar senha através do email. Caso o email exista, enviar um email para a pessoa, ao clicar no link vamos para a página de reset." (a resposta não deve revelar se o email existe — decisão de anti-enumeração do usuário).

## Objetivo

- Permitir que a pessoa solicite um reset de senha informando apenas o email.
- Enviar o email de reset apenas quando a conta existir, sem nunca revelar a existência da conta na resposta.
- Direcionar o clique do link para a página de reset (`/auth/reset-password`).

## Escopo

**Dentro:**

- Página `/auth/forgot-password` com campo `email`, validação de email, mensagem genérica de sucesso ("If the account exists, we sent a link") e link de volta ao sign-in.
- `POST /api/v1/auth/forgot-password` com DTO validado: se o email existe → gera `password_reset_tokens` (24h, uso único) e envia email com link `{APP_URL}/auth/reset-password?token=<token>`; se não existe → não faz nada. Resposta **idêntica** nos dois casos.

**Fora:**

- Reset em si — spec 008.
- Sign-in (006) e sign-up (004).
- Rate limiting do endpoint.

**Adiado:**

- Envio de email "conta não existe" (anti-enumeração: não enviar nada é a decisão).

## Necessidade de negócio

Recuperação de acesso sem atrito: o único caminho de recuperação é o email, e o fluxo precisa existir sem abrir vetor de enumeração de contas.

## Critérios de aceite

- [ ] `POST /api/v1/auth/forgot-password` com email cadastrado → `202` genérico; `password_reset_tokens` criado (24h); email de reset enviado com link `{APP_URL}/auth/reset-password?token=<token>`.
- [ ] Email não cadastrado → `202` com **exatamente a mesma** resposta; nenhum token criado; nenhum email enviado.
- [ ] Página valida o formato do email e mostra a mensagem genérica de sucesso em ambos os casos (o usuário não sabe distinguir).
- [ ] Email de reset chega ao Mailtrap (dev) quando a conta existe.
- [ ] Link do email aponta para `/auth/reset-password` com o token na query string.
- [ ] `bun run code:fix`, `bun run types:check`, `bun run test` e `bun run test:e2e` passam.

## O que fazer

- Criar `ForgotPasswordDto` (email) com class-validator.
- Implementar `POST /auth/forgot-password`: lookup por email; se existe → gerar token + enviar email; em todos os casos responder genérico.
- Preencher a página `/auth/forgot-password` (substitui o placeholder da `003`).
- Escrever testes de integração (conta existe/não existe, mesmo body de resposta) e de componente/E2E da página.

## O que não fazer

- Revelar a existência da conta em qualquer resposta ou comportamento observável (timing, mensagens).
- Implementar o reset de senha (spec 008).
- Enviar email quando a conta não existe.

## Decisões

| Decisão         | Opção escolhida                                                    | Racional                                                           |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Anti-enumeração | Resposta genérica idêntica; envia email somente se a conta existir | Decisão do usuário na elicitação.                                  |
| Token           | `password_reset_tokens`, 24h, uso único                            | Decisão do usuário na elicitação.                                  |
| Link            | `{APP_URL}/auth/reset-password?token=<token>`                      | Prompt: o clique leva à página de reset (consumida pela spec 008). |
| Status HTTP     | `202` (aceito) com resposta genérica                               | Sucesso de "processamento aceito" sem confirmar existência.        |
| Idioma          | Mensagens e email em en-us                                         | Convenção do prompt (documentada na `001`).                        |

## Dependências

- `001-auth-schema.md` (`password_reset_tokens`, `EmailService`).
- `003-auth-routes.md` (rota `/auth/forgot-password`, `apiClient`).
- Mailtrap (dev) para capturar o email.
- Consumido pela `008-reset-password.md` (gera o token usado lá).

## Riscos e trade-offs

- **Nunca confirmar existência:** usuário pode reenviar várias vezes sem feedback — mitigação: mensagem clara explicando o comportamento esperado.
- **Sem rate limiting:** permite "inundar" o email da vítima com solicitações de reset — mitigado parcialmente pelo limite de 24h por token; rate limiting ficou adiado.
- **Timing de resposta:** lookup + hash + email podem ter tempo diferente entre "existe" e "não existe"; a implementação deve minimizar diferenças observáveis (ex.: sempre executar o mesmo caminho de hash) — documentar.

## Edge cases e modos de falha

- **Email inexistente:** nenhum token, nenhum email, resposta idêntica.
- **Email malformado:** `400` de validação (isso é aceito — é validação de formato, não de existência).
- **Usuário pede reset para conta já com token válido:** gerar novo token invalida o anterior? Sim — usar `used_at`/expiração: opcionalmente revogar tokens ativos anteriores do usuário (decidir na implementação; recomendado para evitar links velhos válidos).
- **Transporte de email falho:** `500` rastreável; sem token persistido? Decidir: persistir token e logar erro de envio, permitindo retry manual na spec 008 — documentar.
- **Link clicado após 24h:** cai no fluxo de token expirado da spec 008 (mensagem clara).

## Resultado (definição de pronto)

- Solicitação de reset funcional: página → `POST /auth/forgot-password` → email no Mailtrap (quando existir) com link+token.
- Resposta idêntica para conta existente e inexistente (verificado por teste de integração).
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`) passando.
- ADR em `./.adrs/` e resumo conforme `RULES.md`.

## Arquivos e diretórios envolvidos

- `apps/api/src/modules/auth/forgot-password/` (novo) — DTO, controller, use case, testes.
- `apps/app/src/pages/auth/forgot-password.tsx` (preenche o placeholder da `003`).
- `apps/api/e2e/**` e `apps/app/src/**/*.test.tsx` (testes).
- `./.adrs/007-forgot-password.md` (novo).
