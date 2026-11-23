---
title: Sign-up
status: draft
created: 2026-08-10
---

# Sign-up

> Fluxo de cadastro de conta: página `/auth/sign-up` (nome, sobrenome, email, senha e confirmação de senha com match), endpoint `POST /api/v1/auth/sign-up`, criação do usuário com hash bcrypt, resposta **sempre genérica** (anti-enumeração) e envio do email de confirmação de conta com token de 24h.

## Contexto

A `001` entregou schema + `PasswordService` + `EmailService`; a `002` entregou sessão; a `003` entregou as rotas `/auth/*` com a página `sign-up` placeholder. O prompt pede o cadastro com validação de match de senha e o envio de um email de confirmação cujo link (com token) leva a pessoa à plataforma para confirmar a conta.

## Objetivo

- Permitir que uma pessoa crie sua conta informando nome, sobrenome, email, senha e confirmação de senha (com match e mínimo de 8 caracteres).
- Enviar o email de confirmação de conta com link contendo token (24h, uso único) apontando para `/auth/confirm-account`.
- Não revelar se um email já está cadastrado (anti-enumeração total, decisão do usuário).

## Escopo

**Dentro:**

- Página `/auth/sign-up` com campos `first_name`, `last_name`, `email`, `password`, `confirm_password` + validação client (obrigatórios, email válido, senha mín. 8, senha == confirmação) e tela de sucesso "check your email".
- `POST /api/v1/auth/sign-up` com DTO validado (class-validator, mesmas regras no server).
- Criação do usuário (email normalizado a lowercase, `password_hash` com bcrypt custo 10, `email_verified_at` nulo).
- Geração de `email_confirmation_tokens` (24h, uso único) e envio do email de confirmação via `EmailService` (template en-us com link para o app).

**Fora:**

- Confirmação da conta e criação da sessão pelo link — spec 005.
- Sign-in — spec 006.
- Reenvio de email de confirmação.

**Adiado:**

- Edição de perfil, termos de uso/privacy, reCAPTCHA.

## Necessidade de negócio

É a porta de entrada do produto: sem conta criada e confirmada, ninguém acessa os experts/conectores. O email de confirmação valida que a pessoa possui a caixa declarada, reduzindo contas falsas e fricção no suporte.

## Critérios de aceite

- [ ] `POST /api/v1/auth/sign-up` valida: campos obrigatórios, `email` válido, `password` com mínimo de 8 caracteres e `password === confirm_password`; falha com `400` e mensagens por campo.
- [ ] Email novo → `201` com resposta genérica; usuário criado com `email_verified_at = null`; token de confirmação (24h) persistido; email de confirmação enviado via `EmailService` com link `{APP_URL}/auth/confirm-account?token=<token>`.
- [ ] Email já cadastrado → **mesma** resposta genérica; nenhum usuário novo criado; **nenhum** email enviado.
- [ ] Email é normalizado a lowercase antes de salvar e de checar duplicidade.
- [ ] Página exibe erros de validação por campo; após sucesso mostra mensagem genérica de verificação de email (en-us).
- [ ] Email de confirmação chega ao inbox do Mailtrap (dev) com o link e o token.
- [ ] `bun run code:fix`, `bun run types:check`, `bun run test` e `bun run test:e2e` passam.

## O que fazer

- Criar o DTO `SignUpDto` (first_name, last_name, email, password, confirm_password) com class-validator e transformação de email para lowercase.
- Implementar `POST /auth/sign-up`: verificar email existente; se existir, retornar resposta genérica (sem criar, sem enviar); senão criar usuário, gerar token (24h) e enviar email.
- Preencher a página `/auth/sign-up` (substitui o placeholder da `003`) com os campos, validação, estados de erro e tela de sucesso.
- Escrever testes de integração (Supertest) para os cenários acima e testes de UI/componente.

## O que não fazer

- Confirmar a conta ou criar sessão (spec 005).
- Implementar sign-in (spec 006).
- Revelar em qualquer resposta se o email já está cadastrado.
- Enviar o email de confirmação quando o email já existe.

## Decisões

| Decisão               | Opção escolhida                                                                        | Racional                                                                  |
| --------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Anti-enumeração       | Resposta genérica em todos os casos; email de confirmação só sai quando o email é novo | Decisão do usuário na elicitação ("esconder também no sign-up").          |
| Política de senha     | Mínimo 8 caracteres; hash bcrypt custo 10                                              | Decisão do usuário na elicitação.                                         |
| Match de senha        | Validado no client e no server (`confirm_password`)                                    | Prompt exige; server nunca confia no client.                              |
| Normalização de email | lowercase antes de salvar/consultar                                                    | Unicidade robusta (case-insensitive na prática).                          |
| Link de confirmação   | `{APP_URL}/auth/confirm-account?token=<token>` (app)                                   | Prompt: o link navega à plataforma; a página processa o token (spec 005). |
| Token                 | `email_confirmation_tokens`, 24h, uso único                                            | Decisão do usuário na elicitação.                                         |
| Idioma                | Campos, mensagens e email em en-us                                                     | Convenção do prompt, documentada na `001`.                                |

## Dependências

- `001-auth-schema.md` (`users`, `email_confirmation_tokens`, `PasswordService`, `EmailService`).
- `003-auth-routes.md` (rota `/auth/sign-up`, `AuthContext` e `apiClient`).
- Mailtrap (dev) para receber o email.
- Docs: `DEVELOPMENT.md`, `QA.md`, `DESIGN.md` (paleta para a página).

## Riscos e trade-offs

- **Resposta genérica no sign-up:** usuário que já tem conta pode reenviar o form sem feedback de duplicidade — trade-off aceito pela decisão de anti-enumeração.
- **Email de confirmação é blocking no request:** o envio acontece na requisição; se o transporte falhar, o cadastro falha (fail-fast, rastreável). Retry/fila ficou adiado.
- **Confirmação fora desta spec:** a pessoa cria a conta mas só ganha sessão ao confirmar (spec 005) — o valor do fluxo aparece no conjunto.

## Edge cases e modos de falha

- **Senhas que não batem:** erro por campo (client e server).
- **Senha com menos de 8 caracteres:** erro de validação.
- **Email com maiúsculas/acentos:** normalizado para lowercase; acentos mantidos (validação aceita emails internacionais).
- **Email já existente:** resposta genérica idêntica ao sucesso; nenhum email enviado (não notifica o dono, evitando spam/abuso).
- **Transporte de email indisponível:** `500` com erro rastreável; o cadastro não é confirmado.
- **Token gerado mas email não enviado:** nenhum retry nesta spec; o usuário pode tentar reenviar o form (limitação aceita, reenvio está fora do escopo).

## Resultado (definição de pronto)

- Cadastro funcional ponta a ponta: página → `POST /auth/sign-up` → usuário no banco → email no Mailtrap com link+token.
- Resposta genérica idêntica para email novo e existente (verificado por teste).
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`) passando.
- ADR em `./.adrs/` e resumo conforme `RULES.md`.

## Arquivos e diretórios envolvidos

- `apps/api/src/modules/auth/sign-up/` (novo) — DTO, controller, use case, testes.
- `apps/app/src/pages/auth/sign-up.tsx` (preenche o placeholder da `003`).
- `apps/api/e2e/**` e `apps/app/src/**/*.test.tsx` (testes).
- `./.adrs/004-sign-up.md` (novo).
