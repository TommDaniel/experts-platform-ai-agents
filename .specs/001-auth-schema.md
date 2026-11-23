---
title: Auth Schema (base)
status: draft
created: 2026-08-10
---

# Auth Schema (base)

> Prepara a base do domínio de autenticação: schema das tabelas (`users`, `sessions`, `email_confirmation_tokens`, `password_reset_tokens`) via Drizzle, hashing bcrypt, `EmailService` com transporte Mailtrap/Resend, o prefixo de versionamento `/api/v1` e a documentação da convenção en-us. Todas as specs de auth (002–008) consomem esta base.

## Contexto

A `000-foundation` entregou o monorepo com API Nest.js (`apps/api`, porta 3000), cliente React + Vite (`apps/app`, porta 5173), Supabase local e migrações versionadas via Supabase CLI (`bun run db:migrate`). Não há autenticação no repositório.

O prompt pede o fluxo completo de autenticação (sign-up, confirmação de conta, sign-in, forgot/reset de senha, sessão única por pessoa, páginas públicas `/auth/*` e privadas `/app/*`, endpoints em `/api/v1/auth/*` e tudo em en-us). Esta spec cria a **fundação do domínio auth**: os dados, a infraestrutura de envio de email, o hashing e as convenções transversais, para que cada fluxo seja uma spec pequena e verificável.

## Objetivo

- Ter o schema do domínio auth aplicado no banco local (Supabase Postgres), com as 4 tabelas e suas constraints.
- Ter o `PasswordService` (bcrypt, custo 10) e o `EmailService` (abstração com transporte Mailtrap em non-prod e Resend em prod) prontos e testados.
- Ter a API Nest servindo sob `/api/v1/*`, com o módulo `auth` em `/api/v1/auth/*`.
- Ter a convenção en-us documentada em `.docs/`.

## Escopo

**Dentro:**

- Drizzle ORM (`drizzle-orm` + `drizzle-kit`) instalado e configurado em `apps/api`, com `DATABASE_URL` no `.env.example`.
- Tabelas: `users`, `sessions`, `email_confirmation_tokens`, `password_reset_tokens` (migrações em `supabase/migrations/`, aplicadas por `bun run db:migrate`).
- `PasswordService` — hash e verificação com bcrypt (custo 10).
- `EmailService` — interface de envio + `MailtrapTransport` (SMTP de captura, non-prod) + `ResendTransport` (prod), selecionados por variável de ambiente.
- Preﬁxo global `api/v1` na API Nest e scaffolding do módulo `auth`.
- Seção "Idioma" em `.docs/DEVELOPMENT.md` documentando que páginas, endpoints e código são em en-us.

**Fora:**

- Endpoints e fluxos de auth (sign-up, confirm-account, sign-in, forgot-password, reset-password) — specs 004–008.
- Guard de sessão e endpoints `/auth/me`, `/auth/logout` — spec 002.
- Rotas e guardas do cliente (`/auth/*` e `/app/*`) — spec 003.

**Adiado:**

- Configuração da chave real do Resend (só haverá produção quando houver deploy).
- Filas/retry de envio de email, templates visuais ricos.
- Rate limiting dos endpoints de auth.

## Necessidade de negócio

Sem esta base nenhum fluxo de autenticação pode existir: é ela que garante que os dados do usuário, as sessões e os tokens de email tenham representação correta e segura no banco, que senhas nunca sejam armazenadas em claro e que os emails cheguem ao destinatário. Também estabelece as convenções (versionamento `/api/v1` e en-us) que o prompt exige para todo o produto.

## Critérios de aceite

- [ ] `bun run db:migrate` aplica as migrações das 4 tabelas no Supabase local sem erro.
- [ ] `users` tem `email` único (case-insensitive na prática: email normalizado a lowercase) e `password_hash`; `sessions` tem `token_hash` único e `revoked_at`; tabelas de tokens têm `expires_at` e `used_at`.
- [ ] `PasswordService` gera hash com bcrypt (custo 10) e `verify` retorna `true` para a senha correta e `false` para a incorreta (teste unitário).
- [ ] `EmailService` resolve o transporte por env: `EMAIL_TRANSPORT=mailtrap` → Mailtrap em non-prod; `resend` → Resend em prod; transporte desconhecido → erro claro (teste unitário com mock).
- [ ] `EmailService` expõe métodos por tipo de email: confirmação de conta, nova sessão, reset de senha e sucesso do reset.
- [ ] A API Nest responde sob o prefixo `api/v1` (ex.: o scaffolding de saúde do módulo `auth` acessível em `/api/v1/auth`).
- [ ] `.docs/DEVELOPMENT.md` contém seção "Idioma" declarando que páginas, endpoints e código são em en-us.
- [ ] `bun run code:fix`, `bun run types:check`, `bun run test` e `bun run build` passam.

## O que fazer

- Instalar `drizzle-orm` e `drizzle-kit` em `apps/api`; adicionar `DATABASE_URL` (e `EMAIL_*`) ao `.env.example` com instruções de preenchimento.
- Definir os schemas Drizzle de `users`, `sessions`, `email_confirmation_tokens` e `password_reset_tokens`, gerar o SQL das migrações via `drizzle-kit generate` e versioná-las em `supabase/migrations/` (aplicação segue pelo pipeline existente `bun run db:migrate`).
- Criar o `PasswordService` (bcrypt, custo 10).
- Criar o `EmailService` (interface + transports + factory por env), com métodos tipados por fluxo e templates de email em en-us.
- Configurar `app.setGlobalPrefix('api/v1')` e criar o módulo `auth` com um endpoint de scaffolding.
- Adicionar a seção "Idioma" em `.docs/DEVELOPMENT.md`.

## O que não fazer

- Implementar endpoints/fluxos de auth (sign-up, confirm, sign-in, forgot, reset) — são specs próprias.
- Criar guard de sessão, `/auth/me` ou `/auth/logout` — é a spec 002.
- Usar Supabase Auth, PostgREST ou expor RLS como porta de entrada.
- Configurar a chave real do Resend nesta spec.
- Alterar specs existentes (`000-foundation.md`) ou renumerar arquivos.

## Decisões

| Decisão                          | Opção escolhida                                                                                      | Racional                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Acesso a dados                   | Drizzle ORM                                                                                          | Escolha do usuário; substitui "sem ORM" da fundação para o acesso a dados.                                    |
| Migrações                        | SQL gerado por `drizzle-kit` versionado em `supabase/migrations/`, aplicado via `bun run db:migrate` | Mantém o pipeline existente da fundação; Drizzle é usado para schema + query, sem trocar o fluxo de migração. |
| Tabelas                          | `users`, `sessions`, `email_confirmation_tokens`, `password_reset_tokens`                            | Separa tokens por fluxo; sessão com `revoked_at` suporta "última sessão vence".                               |
| Armazenamento de senha           | Hash bcrypt (custo 10)                                                                               | `[planejado]` em `ARCHITECTURE.md`.                                                                           |
| Armazenamento de token de sessão | `token_hash` (SHA-256 do token), nunca o token em claro                                              | O token puro só é devolvido uma vez na criação; vazamento de banco não expõe sessões utilizáveis.             |
| Envio de email                   | `EmailService` com `Mailtrap` (non-prod) / `Resend` (prod), abstrato                                 | Decisão do usuário na elicitação; sem custo nem credencial em dev; plugável em prod.                          |
| Versionamento da API             | Prefixo global `api/v1`                                                                              | Prompt exige `/api/v1/*`; auth fica em `/api/v1/auth/*`.                                                      |
| Idioma                           | en-us em páginas, endpoints e código, documentado                                                    | Prompt exige e pede a documentação da convenção.                                                              |

## Dependências

- `000-foundation.md` (monorepo, API Nest, app React/Vite, Supabase local, `db:migrate`, QA gates).
- Supabase local rodando (`bun run infra:up`) para aplicar migrações.
- Mailtrap: conta de email testing (SMTP) para capturar os emails em dev.
- Docs: `ARCHITECTURE.md` (stack), `DEVELOPMENT.md` (camadas), `QA.md` (portões).

## Riscos e trade-offs

- **Drizzle + Supabase CLI:** manter dois "donos" de schema (Drizzle e SQL) exige disciplina para não divergir. Escolhemos gerar as migrações pelo Drizzle e versioná-las no pipeline existente.
- **`revoked_at` em vez de deletar sessões:** mais dados retidos (audit trail), com custo de armazenamento irrisório para o contexto.
- **Token hasheado:** não é possível reenviar o token a partir do banco; ele só trafega no momento da criação (aceitável — os flows já o enviam via email/HTTP na hora).

## Edge cases e modos de falha

- **`DATABASE_URL` ausente:** falha de conexão com mensagem clara apontando o `.env`.
- **Migração já aplicada:** `db:migrate` é idempotente (Supabase CLI sinaliza já aplicadas).
- **`EMAIL_TRANSPORT` desconhecido ou sem credenciais:** o `EmailService` deve falhar na inicialização com erro explícito (fail-fast), nunca silenciosamente.
- **Email com maiúsculas:** normalizado para lowercase antes de salvar/consultar para preservar a unicidade.
- **Mailtrap fora do ar em dev:** o fluxo de email falha com erro rastreável; a regra de negócio (anti-enumeração) não deve depender do transporte.

## Resultado (definição de pronto)

- Migrações das 4 tabelas aplicadas no banco local; schemas Drizzle versionados.
- `PasswordService` e `EmailService` com testes unitários passando.
- API respondendo sob `/api/v1` com módulo `auth` scaffolding.
- Seção "Idioma" presente em `.docs/DEVELOPMENT.md`.
- QA gates (`code:fix`, `types:check`, `test`, `build`) passando.
- ADR em `./.adrs/` registrando as decisões (Drizzle, migrações, email, versionamento, en-us) e resumo conforme `RULES.md`.

## Arquivos e diretórios envolvidos

- `apps/api/src/modules/auth/**` (novo) — schema Drizzle, serviços, módulo.
- `apps/api/src/modules/shared/**` (novo) — `PasswordService`, `EmailService` e transports.
- `supabase/migrations/*.sql` (novas migrações).
- `apps/api/package.json` (drizzle-orm, drizzle-kit, bcrypt), `.env.example`.
- `.docs/DEVELOPMENT.md` (seção "Idioma").
- `./.adrs/001-auth-schema.md` (novo).
