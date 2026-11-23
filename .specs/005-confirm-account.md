---
title: Confirm Account
status: draft
created: 2026-08-10
---

# Confirm Account

> Fluxo de confirmação de conta: a página `/auth/confirm-account` lê o token do link do email, chama `POST /api/v1/auth/confirm-account`, ativa a conta (`email_verified_at`), cria uma sessão e redireciona para a home (`/app`). Token inválido, expirado ou já usado exibe mensagem clara.

## Contexto

O sign-up (spec 004) criou a conta inativa e enviou um email com link `{APP_URL}/auth/confirm-account?token=<token>`. O prompt: "a pessoa irá clicar no link para navegar até a plataforma, o link deve ter um token para que a gente confirme a conta e crie uma nova sessão direcionando a pessoa para a home." A `002-auth-session` fornece a criação de sessão (última vence); a `003` fornece a rota `/auth/confirm-account` e o `AuthContext`.

## Objetivo

- Validar o token de confirmação (24h, uso único), ativar a conta e criar uma sessão.
- Levar a pessoa autenticada à home (`/app`) a partir do link do email.
- Apresentar erro claro quando o link for inválido, expirado ou já consumido.

## Escopo

**Dentro:**

- `POST /api/v1/auth/confirm-account` com body `{ token }`: valida existência, `used_at` nulo e `expires_at` futuro; ativa a conta; marca o token como usado; cria sessão (revogando anteriores); retorna o token de sessão.
- Página `/auth/confirm-account` (substitui o placeholder da `003`): lê `?token=`, chama a API, persiste o token de sessão no `localStorage` e navega para `/app`.
- Estados de erro na página: token ausente, inválido, expirado ou já usado — com mensagem clara e ação (ex.: refazer sign-up).

**Fora:**

- Sign-up (spec 004), sign-in (spec 006).
- Reenvio do email de confirmação.
- Página de reset de senha (spec 008).

**Adiado:**

- Fluxo de "reenviar email de confirmação".

## Necessidade de negócio

É o passo que converte uma conta criada em conta utilizável: sem confirmação o usuário não acessa a plataforma. Também atende ao requisito explícito de que o clique no link já autentique a pessoa e a leve à home.

## Critérios de aceite

- [ ] Token válido (existe, `used_at` nulo, `expires_at` no futuro) → conta ativada (`email_verified_at` preenchido), token marcado como usado, sessão criada (revogando sessões anteriores do usuário) e resposta com o token de sessão.
- [ ] Token expirado → erro com mensagem clara; conta **não** ativada; nenhuma sessão criada.
- [ ] Token já usado → erro com mensagem clara; nenhuma alteração.
- [ ] Página sem `?token=` na URL → estado de erro ("link inválido").
- [ ] Sucesso → `localStorage` recebe o token de sessão e a navegação vai para `/app` (renderizada como área privada via `003`).
- [ ] A sessão criada funciona no guard de rota e no `GET /auth/me` (integração com `002`).
- [ ] `bun run code:fix`, `bun run types:check`, `bun run test` e `bun run test:e2e` passam.

## O que fazer

- Implementar `POST /auth/confirm-account`: consultar token por hash, checar `used_at`/`expires_at`, ativar conta, marcar usado, criar sessão (`SessionService.createSession`), retornar token.
- Preencher a página `/auth/confirm-account` com a chamada à API, persistência do token e navegação; tratar e exibir os estados de erro.
- Escrever testes de integração (token válido/expirado/usado) e de componente/E2E da página.

## O que não fazer

- Criar conta ou enviar o email de confirmação (spec 004).
- Implementar sign-in (spec 006).
- Enviar emails neste fluxo (nenhum email novo; o de confirmação já saiu no sign-up).
- Permitir reuso do token (uso único obrigatório).

## Decisões

| Decisão            | Opção escolhida                                                        | Racional                                                                  |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Validação do token | `token_hash` + `used_at` nulo + `expires_at` no futuro                 | Uso único + 24h (decisão do usuário na elicitação).                       |
| Ativação           | `email_verified_at = now()`                                            | Marca a conta confirmada.                                                 |
| Sessão             | `SessionService.createSession` (002)                                   | Prompt: o link confirma a conta **e** cria sessão dirigindo à home.       |
| Página             | `/auth/confirm-account?token=...` (pública)                            | Rota definida na `003`; o link do email aponta para o app.                |
| Consumo do token   | O token aparece apenas no query string; página o envia no body do POST | Token de confirmação não vira token de sessão; sessão é gerada no server. |
| Comportamento      | Sucesso → sessão no `localStorage` + navegar `/app`                    | Alinhado ao transporte Bearer/localStorage (decisão do usuário).          |

## Dependências

- `002-auth-session.md` (`SessionService.createSession`, guard `/app`).
- `003-auth-routes.md` (rota `/auth/confirm-account`, `apiClient`, `AuthContext`).
- `004-sign-up.md` (gera o token consumido aqui).
- `001-auth-schema.md` (tabela `email_confirmation_tokens`).

## Riscos e trade-offs

- **Token no query string:** pode vazar em logs de referrer/histórico; mitigado por ser uso único e curto (24h) — trade-off aceito por simplicidade do fluxo via link de email.
- **Conta já ativa com token válido:** tratado como sucesso (ativação idempotente) — decidir e documentar na implementação.
- **Sessão criada mesmo sem o usuário "ver" a página:** o token de sessão só chega ao app pela página; sem ela, nada persiste.

## Edge cases e modos de falha

- **Token expirado:** página mostra "link expirado" e orienta a tentar cadastrar novamente (reenvio fora de escopo).
- **Token já usado (reclique no link do email):** mensagem de "link já utilizado"; nenhuma sessão nova.
- **Acesso direto sem `?token=`:** estado de erro "link inválido".
- **Usuário da conta já ativada clica de novo:** dependendo do estado do token (não usado), ativação é idempotente e a sessão é criada normalmente.
- **Sessão anterior do usuário:** é revogada pela criação da nova sessão ("última vence" da `002`).

## Resultado (definição de pronto)

- Link do email leva à home com sessão ativa (E2E do fluxo completo sign-up → confirm).
- Tokens inválido/expirado/usado exibem mensagem clara (testes de integração).
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`) passando.
- ADR em `./.adrs/` e resumo conforme `RULES.md`.

## Arquivos e diretórios envolvidos

- `apps/api/src/modules/auth/confirm-account/` (novo) — controller, use case, testes.
- `apps/app/src/pages/auth/confirm-account.tsx` (preenche o placeholder da `003`).
- `apps/api/e2e/**` e `apps/app/src/**/*.test.tsx` (testes).
- `./.adrs/005-confirm-account.md` (novo).
