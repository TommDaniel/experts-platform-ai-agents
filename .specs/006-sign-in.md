---
title: Sign-in
status: draft
created: 2026-08-10
---

# Sign-in

> Fluxo de login: página `/auth/sign-in` (email + senha), `POST /api/v1/auth/sign-in` valida credenciais, envia o email de nova sessão, cria sessão **revogando as anteriores** (uma sessão válida por pessoa) e redireciona para a home (`/app`). Erros de credenciais são genéricos (não revelam se o email existe).

## Contexto

A `002` entregou `SessionService` (última vence) e guard; a `003` entregou a rota `/auth/sign-in` placeholder e o `AuthContext`. O prompt exige: login com email + senha, envio de "um email de nova sessão para cada sessão" e que "apenas uma sessão seja válida por pessoa — se a mesma pessoa logar em duas máquinas, a última sessão é válida".

## Objetivo

- Autenticar email + senha com resposta genérica em qualquer falha.
- Notificar por email a criação de cada nova sessão.
- Garantir que a sessão mais recente invalide todas as anteriores e levar a pessoa à home.

## Escopo

**Dentro:**

- Página `/auth/sign-in` com campos `email` e `password`, validação de campos e exibição de erro genérico de credenciais; após sucesso, guarda o token e navega para `/app`.
- `POST /api/v1/auth/sign-in` com DTO validado: localiza usuário por email; `PasswordService.verify`; se inválido → `401` genérico ("Invalid email or password"); se válido → `EmailService.sendNewSession`, `SessionService.createSession` (revoga anteriores) e retorna o token de sessão.
- Email de nova sessão (en-us) notificando o usuário sobre o novo login.

**Fora:**

- Confirmação de conta (spec 005), sign-up (spec 004).
- Gerenciamento de múltiplos dispositivos na UI.
- Refresh token (sessão sem expiração — decisão).

**Adiado:**

- "Estou logado em outra máquina, quero revogar" na UI (auditoria de sessões).
- Login social.

## Necessidade de negócio

É o acesso diário ao produto. A notificação de nova sessão protege a conta (usuário detecta acesso não autorizado) e a regra "última vence" cumpre o requisito do prompt de uma sessão ativa por pessoa.

## Critérios de aceite

- [ ] `POST /api/v1/auth/sign-in` com email+senha corretos → `200` com token de sessão; `SessionService.createSession` revoga as sessões ativas anteriores do usuário; email de nova sessão enviado via `EmailService`.
- [ ] Senha incorreta → `401` com mensagem genérica (não revela se o email existe).
- [ ] Email não cadastrado → `401` com a **mesma** mensagem genérica.
- [ ] Usuário com conta ainda não confirmada (`email_verified_at` nulo): comportamento definido — login bloqueado com resposta genérica (decidir e documentar; ver Decisões).
- [ ] Página valida campos obrigatórios e mostra erro genérico de credenciais; sucesso persiste o token no `localStorage` e navega para `/app`.
- [ ] Email de nova sessão chega ao Mailtrap (dev) para cada login válido.
- [ ] Após novo login, a sessão anterior é invalidada (teste de integração com duas sessões).
- [ ] `bun run code:fix`, `bun run types:check`, `bun run test` e `bun run test:e2e` passam.

## O que fazer

- Criar `SignInDto` (email, password) com class-validator.
- Implementar `POST /auth/sign-in`: lookup por email (lowercase), `PasswordService.verify`, respostas genéricas, envio do email de nova sessão e criação de sessão.
- Preencher a página `/auth/sign-in` (substitui o placeholder da `003`): campos, erro genérico, persistência do token e navegação.
- Escrever testes de integração (credenciais válidas, senha errada, email inexistente, última vence, conta não confirmada) e de componente/E2E da página.

## O que não fazer

- Revelar, em qualquer resposta, se o email existe ou se a conta está confirmada (anti-enumeração).
- Implementar sign-up (004) ou confirmação (005).
- Enviar mais de um email por login (apenas o de nova sessão).

## Decisões

| Decisão              | Opção escolhida                                                                  | Racional                                                                |
| -------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Erro de credenciais  | `401` genérico "Invalid email or password" para senha errada e email inexistente | Anti-enumeração (decisão do usuário).                                   |
| Conta não confirmada | Login bloqueado com a mesma resposta genérica de credenciais inválidas           | Não vaza estado da conta; o usuário deve confirmar (spec 005) primeiro. |
| Email de nova sessão | `EmailService.sendNewSession` em todo login válido                               | Prompt: "enviar um email de nova sessão para cada sessão".              |
| Sessão               | `SessionService.createSession` — revoga as anteriores (última vence)             | Prompt: uma sessão válida por pessoa.                                   |
| Fluxo pós-sucesso    | Persistir token no `localStorage` e navegar `/app`                               | Transporte Bearer/localStorage (decisão do usuário) + guard da `003`.   |
| Idioma               | Mensagens, labels e email em en-us                                               | Convenção do prompt (documentada na `001`).                             |

## Dependências

- `002-auth-session.md` (`SessionService`, guard `/app`).
- `003-auth-routes.md` (rota `/auth/sign-in`, `apiClient`, `AuthContext`).
- `001-auth-schema.md` (`users`, `PasswordService`, `EmailService`).
- Mailtrap (dev) para capturar o email de nova sessão.

## Riscos e trade-offs

- **Anti-enumeração no login:** usuário com conta não confirmada recebe a mesma mensagem de credencial inválida e pode não entender por quê — trade-off aceito pela segurança da decisão.
- **Email de nova sessão sincrono:** falha do transporte falha o login? Não — decisão de implementação: enviar sem bloquear o sucesso (logar o erro e registrar observabilidade), para não impedir acesso se o email falhar. Documentar.
- **"Última vence" derruba a pessoa da outra máquina sem aviso:** comportamento exigido pelo prompt; o email de nova sessão avisa o dono.

## Edge cases e modos de falha

- **Senha errada 5x:** sem rate limiting nesta fase (adiado); resposta continua genérica.
- **Email com maiúsculas:** normalizado a lowercase no lookup.
- **Email inexistente:** mesmo fluxo de resposta da senha errada (evita timing diferente — ver implementação: executar verify mesmo sem usuário).
- **Sessão anterior ativa:** revogada pela nova (teste explícito).
- **Login com conta não confirmada:** resposta genérica; sem email de nova sessão.
- **Transporte de email falho:** login continua válido; erro logado (decisão acima).

## Resultado (definição de pronto)

- Login funcional ponta a ponta: página → `POST /auth/sign-in` → sessão ativa → `/app`; sessão anterior revogada.
- Email de nova sessão no Mailtrap para cada login válido.
- Respostas genéricas idênticas para senha errada/email inexistente/conta não confirmada (testado).
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`) passando.
- ADR em `./.adrs/` e resumo conforme `RULES.md`.

## Arquivos e diretórios envolvidos

- `apps/api/src/modules/auth/sign-in/` (novo) — DTO, controller, use case, testes.
- `apps/app/src/pages/auth/sign-in.tsx` (preenche o placeholder da `003`).
- `apps/api/e2e/**` e `apps/app/src/**/*.test.tsx` (testes).
- `./.adrs/006-sign-in.md` (novo).
