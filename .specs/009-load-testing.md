---
title: Teste de carga e geração de massa de dados com k6
status: draft
created: 2026-08-11
---

# Teste de carga e geração de massa de dados com k6

> Adiciona scripts de teste de carga (k6) que estressam todos os endpoints da API para gerar massa de dados de observabilidade (traces/logs/métricas) e validar o comportamento sob carga. k6 roda via Docker one-shot, sem entrar no `docker-compose.yml` principal.

## Contexto

A stack LGTM (Loki, Grafana, Mimir, Tempo) já recebe dados da API via OpenTelemetry (ADR-009), mas o volume real de tráfego em dev é baixo: os dashboards abrem com pouca massa. Para enriquecer as dashboards de observabilidade e fazer um primeiro teste de carga da API de auth, precisamos gerar tráfego sintético nos **9 endpoints atuais**. k6 não está instalado na máquina; a infra já é dockerizada.

## Objetivo

- Estressar todos os endpoints atuais da API (`apps/api`, base `/api/v1`), gerando massa de dados de observabilidade.
- Realizar teste de carga com perfil ramping configurável, produzindo relatório de métricas (latência, erros, throughput).
- Tudo reproduzível via scripts npm, sem instalar binário na máquina.

## Escopo

- **Dentro:** scripts k6 (`smoke` + `load`) cobrindo os 9 endpoints; seed de usuário confirmado; scripts npm (`load:seed`, `load:smoke`, `load:test`); README de execução; thresholds e checks; perfil ramping env-configurável.
- **Fora:** k6 como serviço do `docker-compose.yml` principal; happy path de `confirm-account` e `reset-password` (exigem token real do banco); envio de resultados para Grafana Cloud/relatórios remotos; soak test.
- **Adiado:** soak test dedicado; scripts de carga para endpoints futuros fora de auth.

## Necessidade de negócio

Dashboards de observabilidade com massa real de dados para análise de latência, erros e volumes por rota. Teste de carga valida capacidade da API de auth (bcrypt CPU-bound) antes de expor a produto.

## Critérios de aceite

- [ ] `bun run load:seed` cria/garante um usuário confirmado no banco local.
- [ ] `bun run load:smoke` valida os 9 endpoints em segundos com checks passando.
- [ ] `bun run load:test` roda o perfil ramping (VUs/duração via env) e gera relatório de métricas k6.
- [ ] Durante o `load:test`, Grafana (`:3001`) mostra métricas (`http_server_request_*`), logs (`{service_name="api"}`) e traces (`service.name=api`) em volume proporcional ao tráfego.
- [ ] Endpoints que exigem token real do banco (confirm-account, reset-password) são cobertos por error-path com status 400 esperado.
- [ ] Sem alteração no comportamento da API e sem dependência nova de runtime.

## O que fazer

- Criar `load/common.js`, `load/smoke.js`, `load/load.js` (k6 v2.2.0 via imagem `grafana/k6:2.2.0`).
- Criar seed de usuário confirmado (`apps/api/scripts/load-seed.mjs`) usando `postgres` + `bcrypt` (já deps da API).
- Adicionar scripts npm: `load:seed`, `load:smoke`, `load:test`.
- Documentar execução, env vars e comportamento esperado em `load/README.md`.

## O que não fazer

- Não adicionar k6 como serviço do `docker-compose.yml` principal.
- Não ler tokens reais do banco de dentro do k6.
- Não enviar emails em volume para transporte de produção (dev usa Mailtrap).
- Não alterar código da API.

## Decisões

| Decisão          | Opção escolhida                                                    | Racional                                                              |
| ---------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Execução do k6   | Docker one-shot (`docker run`)                                     | Reproduzível, versão fixa, sem instalar binário; não afeta `infra:up` |
| Cobertura        | Happy path onde a API alcança; error-path (400) para confirm/reset | k6 autocontido, sem acoplar ao banco; 400 ainda gera massa de dados   |
| Perfil           | Ramping (estágios) configurável via env                            | Testa comportamento sob crescimento; defaults 50 VUs/5m hold          |
| Autenticação     | Seed de usuário confirmado + pool de tokens no `setup()`           | `me`/`logout` precisam de sessão válida; setup minta tokens uma vez   |
| Versão da imagem | `grafana/k6:2.2.0` (pinada)                                        | Repro<br>duzibilidade; imagem verificada na máquina                   |

## Dependências

- Infra local de pé: `bun run infra:up` (Supabase local + LGTM) e API rodando (`bun run dev`).
- Migrações aplicadas (`bun run db:migrate`) para as tabelas `users`, `sessions`, `email_confirmation_tokens`, `password_reset_tokens`.
- Docker disponível.

## Riscos e trade-offs

- **Flood de emails no Mailtrap:** `sign-up`, `sign-in`, `forgot-password` enviam email a cada request sob carga. Aceitável em dev (Mailtrap é inbox de teste), mas pode virar gargalo de latência. Monitorar; reduzir VUs desses cenários se necessário.
- **Crescimento do banco:** sign-up gera usuários únicos por run e sign-in gera sessões. Massa de dados desejada; limpar quando conveniente.
- **bcrypt cost 10:** endpoints de auth são CPU-bound; esperado que sejam os mais lentos (p95 maior).
- **Error-path 400 conta em `http_req_failed`:** mitigado com `expectedResponse: false` nos requests 4xx intencionais (validado no smoke) e thresholds por cenário.

## Edge cases e modos de falha

- API fora do ar: k6 falha no `setup()` com mensagem clara (checar `load:seed` e API antes).
- Seed não executado: `setup()` do `load` aborta — README manda rodar `load:seed` primeiro.
- Emails repetidos entre runs de sign-up: endpoint é anti-enumeração e responde 201 sem side effect; email leva sufixo de run (`runId`) para gerar usuários novos por run.
- `logout` revoga o token: cenário faz `sign-in` + `logout` por iteração (ciclo de sessão real), nunca reusa token revogado.

## Resultado (definição de pronto)

- Scripts k6 + seed + npm scripts + README criados e rodando.
- Smoke passa com checks verdes contra a API local.
- Load test gera tráfego visível no Grafana (métricas/logs/traces) e relatório k6.
- QA gates do repo (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) sem regressão.
- ADR-010 registrado.

## Arquivos e diretórios envolvidos

- `load/common.js`, `load/smoke.js`, `load/load.js`, `load/README.md`
- `apps/api/scripts/load-seed.mjs`
- `package.json` (scripts `load:*`)
- `.specs/009-load-testing.md`, `.plans/009-load-testing-plan.md`, `.adrs/010-load-testing.md`
