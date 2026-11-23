---
title: Reset Password
status: draft
created: 2026-08-10
---

# Reset Password

> Fluxo de redefinição de senha: página `/auth/reset-password` recebe o token (query string) e dois campos (nova senha + confirmação, com match e mínimo de 8), `POST /api/v1/auth/reset-password` valida o token (24h, uso único), atualiza o hash, envia email de sucesso e redireciona para o sign-in.

## Contexto

A `007` gera o token de reset e envia o link `{APP_URL}/auth/reset-password?token=<token>`. O prompt: "na página de reset, receber o token, campo para nova senha e campo para confirmação da nova senha, ambas as senhas devem dar match. Enviar email de sucesso em caso de sucesso e navegar para sign-in." A `001` entregou `password_reset_tokens` e `PasswordService`; a `003` entregou a rota placeholder.

## Objetivo

- Permitir redefinir a senha apenas com token válido (24h, uso único), nova senha e confirmação com match.
- Notificar o usuário por email em caso de sucesso e redirecioná-lo ao sign-in.
- Rejeitar links expirados ou já utilizados com mensagem clara, sem alterar a senha.

## Escopo

**Dentro:**

- Página `/auth/reset-password` lendo `?token=`, com campos `password` e `confirm_password` (validação client: obrigatórios, mín. 8, match) e estados de erro (token inválido/expirado/usado).
- `POST /api/v1/auth/reset-password` com DTO `{ token, password, confirm_password }`: valida token (existente, `used_at` nulo, `expires_at` futuro), atualiza `password_hash` (bcrypt custo 10), marca o token como usado, envia email de sucesso e retorna sucesso.
- Após sucesso, redirecionar para `/auth/sign-in`.

**Fora:**

- Solicitação do reset (spec 007).
- Sign-in (006), sign-up (004).
- Forçar logout de outras sessões após o reset.

**Adiado:**

- Regras de "não repetir a senha anterior" (permitido nesta fase).
- Expiração de sessões ativas após reset.

## Necessidade de negócio

Fecha o ciclo de recuperação de acesso: sem ele o email de reset (007) é um beco sem saída. A redefinição devolve o controle da conta ao dono e o email de sucesso sinaliza se algo não foi o dono que fez.

## Critérios de aceite

- [ ] `POST /api/v1/auth/reset-password` com token válido e senhas iguais (mín. 8) → `200`; `password_hash` atualizado; token marcado como usado; email de sucesso enviado via `EmailService`.
- [ ] Senhas que não batem → `400` de validação; nenhuma alteração.
- [ ] Token expirado → erro com mensagem clara; senha não alterada.
- [ ] Token já usado → erro com mensagem clara; senha não alterada.
- [ ] Página sem `?token=` → estado de erro ("link inválido").
- [ ] Após o reset, login com a nova senha funciona e com a antiga não (teste de integração).
- [ ] Página redireciona para `/auth/sign-in` após sucesso; email de sucesso chega ao Mailtrap (dev).
- [ ] `bun run code:fix`, `bun run types:check`, `bun run test` e `bun run test:e2e` passam.

## O que fazer

- Criar `ResetPasswordDto` (token, password, confirm_password) com class-validator (validação de match no server).
- Implementar `POST /auth/reset-password`: validar token, atualizar hash (bcrypt custo 10), marcar usado, enviar email de sucesso.
- Preencher a página `/auth/reset-password` (substitui o placeholder da `003`): ler `?token=`, campos, validação, estados de erro e navegação pós-sucesso.
- Escrever testes de integração (sucesso, mismatch, token expirado/usado, login com nova senha) e de componente/E2E da página.

## O que não fazer

- Gerar o token ou enviar o email de reset (spec 007).
- Implementar sign-in (006) — apenas redirecionar para ele.
- Revelar o estado da conta na resposta de erro do token.
- Revogar sessões ativas após o reset (adiado).

## Decisões

| Decisão            | Opção escolhida                                      | Racional                                                                                 |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Validação do token | `token_hash` + `used_at` nulo + `expires_at` futuro  | Uso único + 24h (decisão do usuário).                                                    |
| Nova senha         | Mín. 8 + bcrypt custo 10                             | Decisão do usuário na elicitação.                                                        |
| Match              | Validado no client e no server                       | Prompt exige; server nunca confia no client.                                             |
| Fluxo pós-sucesso  | Email de sucesso + redirecionar para `/auth/sign-in` | Prompt exige ambos.                                                                      |
| Sessões após reset | Não revogar sessões ativas nesta fase                | Fora de escopo; evita derrubar usuário logado em outro dispositivo (adiado, ver Riscos). |
| Idioma             | Campos, mensagens e email em en-us                   | Convenção do prompt (documentada na `001`).                                              |

## Dependências

- `003-auth-routes.md` (rota `/auth/reset-password`, `apiClient`).
- `007-forgot-password.md` (gera o token consumido aqui).
- `001-auth-schema.md` (`password_reset_tokens`, `PasswordService`, `EmailService`).
- `006-sign-in.md` (para o teste de login com a nova senha).
- Mailtrap (dev) para capturar o email de sucesso.

## Riscos e trade-offs

- **Não revogar outras sessões após reset:** uma sessão antiga permanece válida — risco de segurança pequeno, mitigado pela regra "última vence" no próximo login; aceito como adiado.
- **Token em query string:** pode vazar em logs; mitigado por uso único + 24h (mesmo trade-off da `005`).
- **Permitir repetir a senha anterior:** aceito nesta fase (não exigido); mitigação futura de histórico de senhas adiada.

## Edge cases e modos de falha

- **Token expirado:** mensagem clara "link expirado", sem alteração; usuário pode solicitar novo reset (007).
- **Token já usado (reclique no link):** "link já utilizado", sem alteração.
- **Acesso sem `?token=`:** estado de erro "link inválido".
- **Senhas diferentes:** erro de validação por campo (client e server).
- **Senha menor que 8:** erro de validação.
- **Usuário com conta não confirmada tenta reset:** token existe (gerado na 007) e reset funciona — confirmação e reset são independentes (documentar comportamento).
- **Transporte do email de sucesso falha:** o reset já foi aplicado; falha de envio deve ser logada e não reverter o reset.

## Resultado (definição de pronto)

- Reset funcional ponta a ponta: link → página → `POST /auth/reset-password` → senha nova válida, antiga inválida, email de sucesso, redirecionamento ao sign-in.
- Tokens expirado/usado e mismatch tratados com mensagens claras (testes de integração).
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`) passando.
- ADR em `./.adrs/` e resumo conforme `RULES.md`.

## Arquivos e diretórios envolvidos

- `apps/api/src/modules/auth/reset-password/` (novo) — DTO, controller, use case, testes.
- `apps/app/src/pages/auth/reset-password.tsx` (preenche o placeholder da `003`).
- `apps/api/e2e/**` e `apps/app/src/**/*.test.tsx` (testes).
- `./.adrs/008-reset-password.md` (novo).
