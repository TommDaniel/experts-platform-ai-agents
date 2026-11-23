---
title: Auth Session
status: draft
created: 2026-08-10
---

# Auth Session

> Capacidade transversal de sessão: criação de sessão com token opaco, regra de **uma sessão válida por pessoa (a última vence)**, validação do token em endpoints privados via guard da API, `GET /api/v1/auth/me` e `POST /api/v1/auth/logout`. É consumida pelos fluxos que criam sessão (confirm-account e sign-in) e pelo guard de rotas do cliente.

## Contexto

A `001-auth-schema` entregou o schema (`sessions` com `token_hash` e `revoked_at`), o `PasswordService` e o `EmailService`. O prompt exige que **apenas uma sessão seja válida por pessoa** ("se a mesma pessoa logar em duas máquinas, a última sessão é válida"), e que as páginas fora de `/auth/*` sejam privadas — o que implica validar o token em todos os endpoints protegidos.

Esta spec materializa a mecânica de sessão e a proteção da API, deixando o guard de rotas do cliente (que consome `/auth/me`) para a `003`.

## Objetivo

- Criar e revogar sessões de forma segura, garantindo uma única sessão ativa por usuário (última vence).
- Proteger todos os endpoints `/api/v1/*` (exceto `/api/v1/auth/*`) com autenticação via `Authorization: Bearer`.
- Expor `GET /api/v1/auth/me` (identidade da sessão atual) e `POST /api/v1/auth/logout`.

## Escopo

**Dentro:**

- `SessionService`: `createSession(userId)` (gera token, armazena SHA-256, revoga as sessões ativas anteriores), `validateSession(token)` (retorna sessão + usuário se ativa) e `revokeSession(token)`.
- Guard global da API (`AuthGuard`): lê o header `Authorization: Bearer <token>`, valida e injeta o usuário no request; desativa para as rotas públicas `/api/v1/auth/*`.
- `GET /api/v1/auth/me` — retorna o usuário autenticado.
- `POST /api/v1/auth/logout` — revoga a sessão atual (idempotente).
- Testes unitários (`SessionService`) e de integração (guard, `me`, `logout`, "última vence").

**Fora:**

- Fluxos sign-up, confirm-account, sign-in (criam sessão usando `SessionService`) — specs 004, 005, 006.
- Guard de rotas do cliente e rotas `/auth/*` `/app/*` — spec 003.
- Refresh token, expiração por tempo (decisão: sessão não expira) e dispositivos/multi-device UI.

**Adiado:**

- Auditoria/lista de sessões ativas para o usuário ver na UI.
- Notificação de nova sessão (email) — é da spec 006.

## Necessidade de negócio

Garante que uma conta não esteja "logada" em duas máquinas ao mesmo tempo, comportamento explicitamente exigido pelo produto. É também o mecanismo que protege qualquer página/endpoint privado futuro (experts, conectores) — sem sessão confiável, o produto não tem área autenticada.

## Critérios de aceite

- [ ] `createSession(userId)` gera um token aleatório (32 bytes, base64url), armazena o SHA-256 na tabela `sessions` e seta `revoked_at` em todas as sessões ativas anteriores do mesmo usuário; retorna o token puro **uma única vez**.
- [ ] `validateSession(token)` retorna a sessão + usuário apenas quando a sessão existe e `revoked_at` é nulo; token inválido/revogado retorna `null`.
- [ ] `revokeSession(token)` marca a sessão atual como revogada e é idempotente.
- [ ] Guard bloqueia endpoint privado com `401` quando: header ausente, formato inválido, token desconhecido ou token revogado.
- [ ] Guard libera as rotas `/api/v1/auth/*` sem token.
- [ ] `GET /api/v1/auth/me` retorna o usuário autenticado; `401` sem token válido.
- [ ] `POST /api/v1/auth/logout` revoga a sessão; repetir o chamado não gera erro (idempotente).
- [ ] Teste de integração prova "última vence": após criar 2 sessões para o mesmo usuário, só a segunda é válida.
- [ ] `bun run code:fix`, `bun run types:check`, `bun run test` e `bun run test:e2e` passam.

## O que fazer

- Implementar `SessionService` usando a tabela `sessions` (Drizzle) com `token_hash = sha256(token)`.
- Criar utilitário de token (`generateSessionToken`, `hashToken`).
- Implementar `AuthGuard` global com decorator/marcação de rota pública para `/api/v1/auth/*`.
- Criar controllers `me` e `logout` no módulo `auth`.
- Escrever testes unitários e de integração (Supertest) cobrindo os critérios acima.

## O que não fazer

- Implementar sign-up/confirm-account/sign-in (specs 004, 005, 006).
- Implementar rotas do cliente ou guard de navegação (spec 003).
- Usar JWT/refresh token — a sessão é opaca e revogável por banco.
- Adicionar expiração por tempo à sessão (decisão: não expira).

## Decisões

| Decisão              | Opção escolhida                                                            | Racional                                                                        |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Tipo de token        | Opaco aleatório (32 bytes, base64url)                                      | Simples, revogável por banco, sem claims; alinhado ao schema da `001`.          |
| Armazenamento        | SHA-256 do token                                                           | Decisão da `001`: vazamento do banco não expõe sessões utilizáveis.             |
| Transporte           | `Authorization: Bearer` + localStorage no cliente                          | Decisão do usuário na elicitação.                                               |
| Regra "última vence" | Nova sessão seta `revoked_at` nas ativas anteriores do usuário (transação) | Prompt exige uma sessão válida por pessoa.                                      |
| Proteção da API      | Guard global exceto `/api/v1/auth/*`                                       | Toda rota fora de auth é privada (coerente com `/app/*` privado do prompt).     |
| Identidade           | `GET /api/v1/auth/me`                                                      | Permite ao cliente validar a sessão e popular o usuário (consumido pela `003`). |
| Logout               | `POST /api/v1/auth/logout` revoga a sessão atual                           | Decisão do usuário na elicitação; idempotente.                                  |
| Expiração de sessão  | Sem expiração                                                              | Decisão do usuário: sessão morre por novo login, logout ou remoção da conta.    |

## Dependências

- `001-auth-schema.md` (tabela `sessions`, Drizzle, módulo `auth` em `/api/v1`).
- Infra local (Supabase) para testes de integração.
- Docs: `DEVELOPMENT.md` (camadas), `QA.md` (portões).

## Riscos e trade-offs

- **Revogação em vez de exclusão:** mantém histórico (audit trail); a "última vence" depende de `revoked_at` estar sempre atualizado — a criação de sessão deve ser transacional.
- **Guard global:** todo endpoint novo nasce protegido por padrão; esquecer de marcar uma rota como pública gera `401` confuso em dev (documentar o decorator).
- **Sem expiração:** uma máquina que nunca faz logout mantém a sessão até outro login; aceito por decisão do usuário.

## Edge cases e modos de falha

- **Token malformado (sem prefixo Bearer, base64 inválido):** `401` com mensagem genérica, sem quebra.
- **Sessão revogada usada depois:** `401` (o guard consulta `revoked_at`).
- **Logout sem sessão válida:** resposta de sucesso (idempotente), sem erro.
- **Usuário inexistente com token válido na tabela (consistência):** o guard deve tratar como inválido (`401`).
- **Criação concorrente de sessão (mesmo usuário, duas abas):** transação garante que apenas uma fique ativa; a última a cometer vence.

## Resultado (definição de pronto)

- `SessionService` com testes unitários cobrindo create/validate/revoke e "última vence".
- Guard ativo na API com whitelist `/api/v1/auth/*`; testes de integração de `me` e `logout`.
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`) passando.
- ADR em `./.adrs/` e resumo conforme `RULES.md`.

## Arquivos e diretórios envolvidos

- `apps/api/src/modules/auth/session/` (novo) — service, token utils, guard, controllers `me`/`logout`.
- `apps/api/src/modules/auth/auth.module.ts` (registro do guard/controllers).
- `apps/api/src/**/*.spec.ts` e `apps/api/e2e/**` (testes).
- `./.adrs/002-auth-session.md` (novo).
