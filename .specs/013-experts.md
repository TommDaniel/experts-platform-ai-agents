---
title: Experts — agentes especialistas com chat, conectores e RAG (Weaviate + LangChain/LangGraph)
status: draft
created: 2026-08-12
---

# Experts — agentes especialistas com chat, conectores e RAG (Weaviate + LangChain/LangGraph)

> Entrega a feature central do produto (`BUSINESS.md`): uma home de chat simples (dropdown de expert + textarea + botão flutuante de conexões), 9 experts (CEO, CFO, COO, CPO, CMO, CTO, Sales Director, Customer Success Director, Customer Hero Director) que respondem em chat com base nos dados conectados via RAG (Weaviate), com pipeline de ingestão de arquivos/URLs (deduplicação via Postgres), sugestões de perguntas por expert e tools de geração de imagem (gpt-image-2) e vídeo (gemini + gemini-omni-flash), tudo rodando localmente via Docker (LangChain.js, LangGraph Server, LangSmith Cloud).

## Contexto

O produto é uma plataforma de gestão de agentes de IA que atuam como especialistas seniores de uma empresa (`BUSINESS.md`). Hoje o repositório tem autenticação completa (`001`–`008`), transporte de email (`011`), remoção do Supabase (`010`) e um redesign de UI com app shell (`012`), mas nenhuma feature de produto: não existe expert, conector, RAG nem chat. Esta spec é a primeira feature de produto de ponta a ponta e funda a camada de IA do sistema sobre a stack definida pelo usuário: **LangChain.js** (Document Loaders, DirectoryLoader, embeddings, splitter), **LangGraph** (grafo do agente), **LangSmith** (Deployment via LangGraph Server, Observability e Evaluations), **Weaviate** (vector store) e modelos OpenAI/Gemini — com todo o runtime local via Docker (exceções: chamadas a OpenAI e Gemini).

A home segue o layout pedido: barra inferior com dropdown de expert, textarea de prompt e botão flutuante para adicionar conexões, mantendo o componente de perfil do usuário (logout) do app shell de `012`.

## Objetivo

- Entregar 9 experts configuráveis (persona + sugestões de perguntas) que respondem em chat.
- Home de chat com barra inferior (dropdown de expert, textarea, envio) e botão flutuante de conexões; perfil/logout preservado.
- Conexões por arquivo (PDF, TXT, Markdown, JPG, JPEG, PNG, MP4, MP3) e URL externa.
- Pipeline de ingestão com deduplicação: conexão existente → reaproveita; nova → extrai texto, gera chunks, embeddings e insere no Weaviate + registra a fonte no Postgres.
- Chat com streaming (SSE), persistido no Postgres, com ferramentas de geração de imagem e vídeo.
- Tudo rodando local via Docker (Weaviate + LangGraph Server), exceções apenas para chamadas OpenAI/Gemini e tracing no LangSmith Cloud.

## Escopo

- **Dentro:**
  - Novo workspace `apps/agents`: aplicação LangGraph (TypeScript) com grafo por expert, tools (`knowledge_search`, `generate_image`, `generate_video`), empacotada para o LangGraph Server via `langgraph.json` e Docker.
  - Novo `packages/experts`: registry tipado dos 9 experts (slug, nome exibido, persona/system prompt, `suggestedQuestions`), compartilhado por `apps/api` e `apps/agents`.
  - `apps/api`: módulos `experts` (listagem + sugestões), `connections` (upload multipart, URL, listagem, remoção), `ingestion` (pipeline de extração/chunk/embed/upsert), `chat` (conversas, mensagens, proxy SSE para o LangGraph Server) e servimento estático de arquivos de `uploads/`.
  - Banco (Drizzle + Postgres): tabelas `sources` (deduplicação), `conversations` e `messages`.
  - Weaviate via Docker (`docker-compose.yml`): classe `Chunk` com vectorizer `none`, filtrada por usuário.
  - `apps/app`: home de chat (lista de mensagens com markdown e mídia, barra inferior com dropdown/textbox/enviar, chips de sugestões, botão flutuante `+` abrindo o modal/drawer de conexões), consumo de SSE, estados de loading/erro.
  - Suporte a geração de imagem (gpt-image-2) e vídeo (gemini + gemini-omni-flash) como tools do agente; mídia gerada salva localmente em `uploads/generated/` e referenciada na mensagem.
  - Observability via LangSmith (tracing do grafo) + LGTM (logs/traces da API) já existente.
  - Testes unitários/integração (mocks de LLM/embeddings) e E2E do fluxo de chat; ADR e passos manuais de QA (workflow `RULES.md`).

- **Fora:**
  - Self-hosting do LangSmith completo (Enterprise) — somente Cloud (observability/evals) nesta spec.
  - Conectores de serviços externos (Notion, Drive, Google Docs/Sheets, Confluence, Jira, Linear, ClickUp) previstos em `BUSINESS.md` — somente arquivos e URL nesta spec.
  - Autenticação/multitenancy nova — reaproveita a auth existente.
  - Administração/edição de experts via UI — configuração em código.
  - Avaliações (LangSmith Evaluations) com datasets — apenas configurado/mencionado como uso, não como conjunto de evals automatizados no CI.
  - Deploy em produção (Vercel/cloud) — o objetivo é 100% local.

- **Adiado:**
  - Geração de mídia assíncrona com fila/status de progresso (nesta spec a geração é síncrona dentro do run, com timeout generoso).
  - Modele exame de chunks com multimodalidade além de visão em imagens (ex.: frames de vídeo).
  - Embeddings locais (Ollama) e transcrição local (faster-whisper).
  - Edição de conexões e pastas (uploads em lote por diretório).

## Necessidade de negócio

Os experts são o coração do produto: a proposta de valor é um executivo conversar com agentes seniores que conhecem os dados da empresa. Sem esta feature não há produto vendável. O RAG sobre dados conectados (arquivos e URLs) é o que diferencia o expert de um chat genérico; a deduplicação evita custos e embeddings duplicados; a stack LangChain/LangGraph/Weaviate local via Docker mantém custo zero de infra e controle total dos dados, com exceção apenas das chamadas de modelo (OpenAI/Gemini).

## Critérios de aceite

- [ ] `packages/experts` exporta o registry com exatamente 9 experts (slugs `ceo`, `cfo`, `coo`, `cpo`, `cmo`, `cto`, `sales-director`, `customer-success-director`, `customer-hero-director`), cada um com `name`, `persona` (system prompt) e `suggestedQuestions` (>= 3, en-us), consumido por `apps/api` e `apps/agents`.
- [ ] `docker-compose.yml` adiciona os serviços `weaviate` (porta 8080/gRPC 50051) e `agents` (LangGraph Server, porta 2024, com `OPENAI_API_KEY`, `GEMINI_API_KEY`, `LANGSMITH_API_KEY`, `LANGCHAIN_TRACING_V2=true`, conexão com Postgres e Weaviate); `bun run infra:up` sobe tudo e o healthcheck passa.
- [ ] `GET /api/v1/app/experts` retorna os 9 experts com sugestões de perguntas (autenticado).
- [ ] `POST /api/v1/app/connections` aceita upload de PDF, TXT, MD, JPG, JPEG, PNG, MP4, MP3 (limite de 50 MB) e `POST /api/v1/app/connections/url` aceita uma URL válida; ambos retornam a conexão criada.
- [ ] Deduplicação: reenviar o mesmo arquivo (mesmo conteúdo — hash sha256) ou a mesma URL para o mesmo usuário não reprocessa; a API responde com a fonte existente (status `ready`) e não gera novos embeddings.
- [ ] Ingestão de arquivo: PDF e TXT/MD → Document Loaders do LangChain.js; MP3 → `gpt-4o-transcribe`; MP4 → extração de trilha de áudio via ffmpeg + `gpt-4o-transcribe`; JPG/JPEG/PNG → descrição/extração de texto via visão do `gpt-4o-mini`; URL → `WebBaseLoader` do LangChain.js.
- [ ] Chunking com `RecursiveCharacterTextSplitter` (chunk ~800 tokens, overlap ~200) e embeddings via `OpenAIEmbeddings` (`text-embedding-3-small`), com inserção no Weaviate (classe `Chunk`, propriedades `text`, `userId`, `sourceId`, `chunkIndex`) usando `langchain-weaviate` `WeaviateStore`.
- [ ] Toda leitura de vetores é filtrada por `userId` — um usuário nunca recebe contexto de dados de outro.
- [ ] Tabelas `sources`, `conversations`, `messages` criadas por migração Drizzle; `sources` tem índice único `(user_id, type, reference)`; status da fonte evolui `processing → ready | failed`.
- [ ] Home de chat: barra inferior fixa com dropdown de expert, textarea e botão de envio; chips das sugestões do expert selecionado enviam a pergunta automaticamente ao clicar; botão flutuante `+` abre o modal/drawer de conexões (upload + URL + listagem + remoção); perfil do usuário com logout preservado do app shell.
- [ ] Chat: `POST /api/v1/app/chat` cria/reutiliza a conversa (thread LangGraph = `conversation.id`), persiste mensagem do usuário, faz streaming via SSE do LangGraph Server e persiste a resposta do assistente (com `mediaUrl`/`mediaType` quando a resposta incluir imagem/vídeo gerado).
- [ ] Respostas em formato chat (markdown renderizado), com mídia gerada (imagem/vídeo) visível na thread e arquivo salvo em `uploads/generated/` servido pela API.
- [ ] Estado de falha: fonte com erro de extração fica `failed` com `error` preenchido e a API devolve mensagem clara; chat sem dados conectados responde com base no conhecimento do modelo e avisa que não há dados conectados.
- [ ] Todos os textos de UI e identificadores em en-us (regra de `DEVELOPMENT.md`).
- [ ] `bun run code:fix`, `bun run types:check`, `bun run test`, `bun run test:e2e` e `bun run build` passam.
- [ ] ADR novo em `.adrs/` registrando a arquitetura de IA (LangGraph Server separado, Weaviate, embeddings OpenAI, dedup via Postgres).

## O que fazer

1. **`packages/experts`:** criar o registry tipado dos 9 experts (slug, name, persona, suggestedQuestions) e exportá-lo via `@repo/experts`; turborepo configurado para os consumidores.
2. **Infra:** adicionar `weaviate` e `agents` ao `docker-compose.yml` (volumes, healthchecks, env de API keys), além de `.env.example` com `OPENAI_API_KEY`, `GEMINI_API_KEY`, `LANGSMITH_API_KEY` e flags de tracing; garantir criação da classe `Chunk` no Weaviate na inicialização.
3. **Banco:** criar tabelas `sources`, `conversations` e `messages` em `apps/api/src/db/schema.ts` + migração Drizzle.
4. **`apps/api` — experts:** módulo que lista o registry (vindo de `@repo/experts`).
5. **`apps/api` — connections:** endpoints de upload (multipart, validação de extensão/tamanho), URL e listagem/remoção; persistência em `sources` com dedup por `(userId, type, reference)`; arquivos salvos em `uploads/{userId}/`.
6. **`apps/api` — ingestion:** pipeline por tipo (loaders LangChain.js para PDF/TXT/MD e `WebBaseLoader` para URL; `gpt-4o-transcribe` + ffmpeg para MP3/MP4; visão `gpt-4o-mini` para imagens) → `RecursiveCharacterTextSplitter` → `OpenAIEmbeddings` (`text-embedding-3-small`) → `WeaviateStore` (classe `Chunk`, metadados `userId`/`sourceId`/`chunkIndex`) → status `ready`/`failed`. Usar `DirectoryLoader` do LangChain.js para varrer o diretório de uploads do usuário (integração pedida pelo usuário).
7. **`apps/agents`:** aplicação LangGraph (grafo com tools `knowledge_search` — RAG filtrado por usuário —, `generate_image` — gpt-image-2 — e `generate_video` — gemini + gemini-omni-flash), modelo base `gpt-4o-mini`, persona do expert por `thread_id`/config; `langgraph.json` e Dockerfile para o LangGraph Server.
8. **`apps/api` — chat:** criar/reutilizar conversa, persistir mensagens, abrir thread no LangGraph Server (`/threads/{id}/runs/stream`), repassar eventos via SSE (controller `@Sse`), agregar a resposta e salvar mídia gerada em `uploads/generated/`.
9. **`apps/app`:** home de chat conforme layout (barra inferior com dropdown de expert, textarea, envio; chips de sugestões; botão flutuante `+`; mensagens em markdown; mídia gerada; perfil/logout do app shell). Skills obrigatórias de UI: `frontend-design` e revisão com `web-design-guidelines`.
10. **Observability:** garantir tracing do grafo no LangSmith (projeto dedicado), logs/traces da API no LGTM.
11. **Testes:** unitários/integração com mocks (LLM, embeddings, Weaviate) cobrindo dedup, pipeline por tipo e endpoints; E2E do fluxo de chat com API mockada; atualizar testes quebrados.
12. **QA e entregáveis:** rodar portões de `QA.md`, criar ADR e entregar passos manuais de QA, arquivos modificados, bibliotecas instaladas e racional.

## O que não fazer

- Não subir LangSmith self-hosted (requer licença Enterprise) — usar Cloud para observability/evals e LangGraph Server local para o deployment.
- Não implementar conectores externos (Notion, Drive, Docs/Sheets, Confluence, Jira, Linear, ClickUp) nem planilhas nesta spec.
- Não alterar fluxos de auth existentes, contratos das rotas de auth, o app shell de `012` nem a paleta/tema de `DESIGN.md`.
- Não usar embedder local (Ollama) nem transcrição local (faster-whisper) — decisão adiada.
- Não criar fila assíncrona para geração de mídia — geração síncrona no run com timeout.
- Não expor chaves/segredos em código ou `.env` commitado.
- Não editar specs/ADRs históricos nem o template de specs.

## Decisões

| Decisão              | Opção escolhida                                                                                            | Racional                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Escopo               | Spec única `013-experts`                                                                                   | Feature coesa de produto; `implement-me` executa em fases.                                   |
| Runtime dos agentes  | LangGraph Server como serviço Docker separado (`apps/agents`, porta 2024)                                  | Usa LangSmith Deployment local; API NestJS só orquestra via HTTP (threads + streaming).      |
| LangSmith            | Cloud (observability/evals) + LangGraph Studio desktop local                                               | Self-hosted completo é Enterprise (licença); exceção externa aceita, como OpenAI/Gemini.     |
| Embeddings           | OpenAI `text-embedding-3-small` (1536 dims) via LangChain `OpenAIEmbeddings`                               | Barato, robusto, de primeira classe no LangChain.js + Weaviate; alinhado às exceções OpenAI. |
| Vector store         | Weaviate via Docker, classe `Chunk` com vectorizer `none`                                                  | Embeddings gerados pela aplicação (LangChain); Weaviate só armazena/busca.                   |
| Transcrição          | OpenAI `gpt-4o-transcribe`; MP4 → ffmpeg (extração de áudio)                                               | Qualidade alta e simplicidade; exceção OpenAI aceita.                                        |
| Imagens              | Descrição/extração de texto via visão do `gpt-4o-mini` (modelo base)                                       | Aproveita o modelo base sem serviço extra.                                                   |
| URLs                 | `WebBaseLoader` do LangChain.js                                                                            | Mantém a leitura de URL dentro do ecossistema LangChain.                                     |
| Chunking             | `RecursiveCharacterTextSplitter` (chunk ~800 tokens, overlap ~200)                                         | Padrão recomendado para RAG de documentos.                                                   |
| Modelo base          | `gpt-4o-mini` (ChatOpenAI)                                                                                 | Definição do usuário.                                                                        |
| Geração de imagem    | `gpt-image-2` como tool (`generate_image`)                                                                 | Definição do usuário; mídia salva localmente em `uploads/generated/`.                        |
| Geração de vídeo     | `gemini` + `gemini-omni-flash` como tool (`generate_video`)                                                | Definição do usuário; mídia salva localmente em `uploads/generated/`.                        |
| Experts              | Registry tipado em `packages/experts` (compartilhado API/agents)                                           | 9 cargos fixos; evita duplicação e mantém API e grafo em sincronia.                          |
| Deduplicação         | Tabela `sources` com índice único `(userId, type, reference)` (sha256 p/ arquivo, URL normalizada p/ link) | Reenvio não gera embeddings duplicados.                                                      |
| Persistência de chat | Tabelas `conversations` e `messages`; `conversation.id` = `thread_id` do LangGraph                         | Histórico durável e resumo entre sessões; checkpointer no Postgres.                          |
| Isolamento           | Todo dado (fontes, vetores, conversas) escopado por `userId`                                               | Multitenancy simples via auth existente.                                                     |
| Streaming            | SSE (NestJS `@Sse`) repassando eventos do LangGraph Server                                                 | UX de chat em tempo real.                                                                    |
| Idioma               | en-us em UI, rotas e identificadores                                                                       | Regra de `DEVELOPMENT.md`.                                                                   |

## Dependências

- Docs: `BUSINESS.md` (domínio experts/conectores), `ARCHITECTURE.md` (monorepo, infra, observabilidade), `DEVELOPMENT.md` (idioma, camadas, a11y, o11y), `DESIGN.md`/`DESIGN_SYSTEM.md` (paleta/shadcn para UI), `QA.md` (portões), `RULES.md` (workflow).
- Specs anteriores: `010-remove-supabase` (base da API/banco), `012-ui-redesign` (app shell, perfil/logout, componentes shadcn).
- Skills: `frontend-design`, `web-design-guidelines` (UI), `playwright` (E2E/capturas).
- Libs (novas): `langchain`, `langgraph`/`@langchain/langgraph`, `@langchain/openai`, `langchain-weaviate` (ou `@langchain/weaviate`), `langsmith`, `pdf-parse`, `weaviate-ts-client`, `ffmpeg-static` (ou `ffmpeg` via Docker), `@nestjs/platform-express` (multipart) e `@repo/experts`.
- Externas (exceções aceitas): OpenAI API (`gpt-4o-mini`, `text-embedding-3-small`, `gpt-4o-transcribe`, `gpt-image-2`) e Gemini API (`gemini`, `gemini-omni-flash`), além de LangSmith Cloud.
- Infra local: Docker (Weaviate, LangGraph Server, Postgres, LGTM).

## Riscos e trade-offs

- **LangSmith Cloud como exceção externa:** traces saem do ambiente local; aceito por não haver self-host viável sem licença Enterprise. Mitigado por só trafegar texto/prompts de dev.
- **Geração de mídia síncrona:** vídeos podem ser lentos/caros; a alternativa (fila assíncrona) fica adiada e o run usa timeout generoso com mensagem de erro amigável em falha.
- **`gpt-4o-mini` como modelo base sem tool-calling perfeito:** erros de tool-calling são tratados com retry/mensagem de fallback.
- **Qualidade de RAG depende da extração:** OCR/descrição de imagens e transcrição podem perder fidelidade; mitigado com metadados (filename, sourceId) e chunking adequado.
- **Weaviate adiciona infra:** mais um serviço Docker; mitigado com healthcheck e criação idempotente do schema.
- **Deduplicação por hash:** conteúdo idêntico com nome diferente deduplica (desejado); alterar o arquivo gera nova fonte (esperado).

## Edge cases e modos de falha

- Reenvio do mesmo arquivo/URL → resposta com fonte existente (status `ready`), sem reprocessar.
- Arquivo acima de 50 MB ou extensão não permitida → 400 com mensagem clara; fonte não criada.
- URL inacessível/timeout → fonte `failed` com `error`; API retorna mensagem e permite tentar de novo.
- MP4/MP3 muito longos → transcrição grande é truncada/splitada no limite do modelo; aviso quando exceder.
- Imagem sem texto legível → ainda vira descrição textual e é indexada.
- Chat sem conexões → agente responde com conhecimento do modelo e informa que não há dados conectados (sem quebrar).
- Usuário consultando dados de outro usuário → filtro `userId` no Weaviate impede vazamento.
- Weaviate indisponível → ingestão falha com `failed`; chat responde com erro claro e status 503/502.
- Falha na chamada OpenAI/Gemini (rate limit/timeout) → mensagem de erro amigável; em ingestão, fonte marcada `failed` com `error`.
- Streaming interrompido (cliente desconecta) → run LangGraph pode ser cancelado; API marca a mensagem como não concluída e permite reenviar.
- Tool de geração retorna mídia inválida → mensagem com erro do tool; run continua com fallback textual.
- Dropdown sem expert selecionado → botão enviar desabilitado ou usa expert padrão (CEO) — decisão de UI a definir na implementação com o `frontend-design`.

## Resultado (definição de pronto)

- 9 experts funcionais respondendo em chat com RAG sobre dados conectados, streaming, sugestões de perguntas e geração de imagem/vídeo.
- Home de chat com barra inferior, botão flutuante de conexões e perfil/logout preservados.
- Pipeline de conexões (arquivos + URL) com deduplicação, ingestão completa (extração → chunks → embeddings → Weaviate) e fontes rastreadas no Postgres.
- Stack local via Docker (Weaviate + LangGraph Server) com observability (LangSmith Cloud + LGTM).
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando.
- ADR novo em `.adrs/`, passos manuais de QA, arquivos modificados, bibliotecas instaladas e racional entregues (workflow `RULES.md`).

## Arquivos e diretórios envolvidos

- `packages/experts/` (novo) — registry dos 9 experts (`src/experts.ts`, `src/index.ts`, `package.json`), exportado como `@repo/experts`.
- `apps/agents/` (novo) — aplicação LangGraph: `src/graph.ts`, `src/nodes/*`, `src/tools/*` (`knowledge-search.ts`, `generate-image.ts`, `generate-video.ts`), `src/weaviate.ts`, `langgraph.json`, `Dockerfile`, `package.json`.
- `apps/api/src/modules/experts/` (novo) — controller/serviço de listagem.
- `apps/api/src/modules/connections/` (novo) — upload/URL/listagem/remoção.
- `apps/api/src/modules/ingestion/` (novo) — pipeline de extração por tipo, splitter, embeddings, upsert Weaviate.
- `apps/api/src/modules/chat/` (novo) — conversas, mensagens, proxy SSE para o LangGraph Server.
- `apps/api/src/db/schema.ts` — tabelas `sources`, `conversations`, `messages` + migração Drizzle em `apps/api/drizzle/`.
- `apps/app/src/pages/app/home.tsx` — home de chat (barra inferior, chips, botão flutuante).
- `apps/app/src/components/app/` — componentes de chat, drawer/modal de conexões, lista de mensagens (novos).
- `docker-compose.yml` — serviços `weaviate` e `agents`.
- `.env.example` / `.env` — `OPENAI_API_KEY`, `GEMINI_API_KEY`, `LANGSMITH_API_KEY`, flags de tracing.
- `uploads/` (novo, ignorado pelo git) — arquivos conectados e mídia gerada.
- `.adrs/` — novo ADR; `.plans/` — plano `013-experts-plan.md`.
- Testes associados (unitários/integração em `apps/api/src/modules/**`, E2E em `apps/app/e2e/*` e `apps/api/test/*`).
