# Plano — 013-experts

> Plano de execução da spec `.specs/013-experts.md`. Stack: LangChain.js + LangGraph + LangSmith Cloud + Weaviate (Docker), modelos OpenAI/Gemini, tudo local via Docker.

## Objetivo

Entregar a feature de experts de ponta a ponta: home de chat (dropdown de expert, textarea, botão flutuante de conexões, perfil/logout preservado), 9 experts com sugestões de perguntas, conexões por arquivo (PDF/TXT/MD/JPG/JPEG/PNG/MP4/MP3) e URL com deduplicação, pipeline de ingestão (extração → chunks → embeddings OpenAI → Weaviate), chat com streaming (SSE) e tools de geração de imagem (gpt-image-2) e vídeo (gemini + gemini-omni-flash).

## Escopo

- **Dentro:** `packages/experts` (registry), infra Docker (Weaviate + LangGraph Server), tabelas `sources`/`conversations`/`messages`, módulos API (`experts`, `connections`, `ingestion`, `chat`), `apps/agents` (grafo + tools), home de chat no front, testes, ADR e entregáveis.
- **Fora:** conectores externos (Notion/Drive/etc.), LangSmith self-hosted, fila assíncrona de geração, edição de experts via UI.

## Etapas de implementação

### Fase 1 — Baseline e contexto

- [ ] Validar estado atual: infra de pé (Postgres), `bun run types:check`/`test` no estado atual (não commitar mudanças pendentes da 012).
- [ ] Adicionar ao `.env.example`: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `LANGSMITH_API_KEY`, `LANGSMITH_TRACING`, `AGENTS_URL`, `WEAVIATE_URL`, `UPLOADS_DIR`, limites de upload.

### Fase 2 — `packages/experts`

- [ ] Criar `packages/experts` (`@repo/experts`): tipos (`ExpertDefinition`), registry com os 9 experts (slug, name, persona, `suggestedQuestions` >= 3 en-us), `getExpert(slug)`.
- [ ] Testes unitários do registry (slugs únicos, campos obrigatórios, sugestões).
- [ ] Wire no `turbo.json`/tsconfigs de consumo.

### Fase 3 — Infra Docker

- [ ] `docker-compose.yml`: serviço `weaviate` (imagem `semitechnologies/weaviate`, portas 8080/50051, volume, healthcheck) e serviço `agents` (imagem `cu-agents`, porta 2024, env OpenAI/Gemini/LangSmith, binds de `uploads`).
- [ ] `apps/agents/Dockerfile` + script `agents:build` no root (bundle do grafo + `npx @langchain/langgraph-cli build`). Se o build de imagem falhar no ambiente, fallback documentado: o serviço `agents` roda via `langgraph dev` (server local em Docker, bind do monorepo).
- [ ] Verificar `bun run infra:up` sobe Weaviate e (se aplicável) o server de agents; healthcheck.

### Fase 4 — Banco (Drizzle)

- [ ] `schema.ts`: adicionar `sources`, `conversations`, `messages` (+ `expertsSchema`), índice único `(user_id, type, reference)`; ajustar `database.factory.ts` para o schema combinado.
- [ ] Gerar migração (`drizzle-kit generate`) e aplicar (`bun run db:migrate`).
- [ ] Testes do factory atualizados.

### Fase 5 — API: módulo experts

- [ ] `GET /api/v1/app/experts` (autenticado) → lista do registry (sem persona exposta? não — persona é internally, expor nome+slug+sugestões).

### Fase 6 — API: módulo connections

- [ ] `POST /api/v1/app/connections` (multipart, limite 50 MB, extensões permitidas) → sha256 do conteúdo; dedup em `sources`; salvar em `uploads/{userId}/`; disparar ingestão.
- [ ] `POST /api/v1/app/connections/url` → valida URL; dedup por URL normalizada.
- [ ] `GET /api/v1/app/connections` e `DELETE /api/v1/app/connections/:id`.
- [ ] Servir arquivos estáticos de `uploads/` via rota `GET /api/v1/uploads/*`.

### Fase 7 — API: pipeline de ingestão

- [ ] `IngestionService` por tipo: PDF/TXT/MD → loaders LangChain.js (`PDFLoader`, `TextLoader`); URL → `WebBaseLoader`; MP3 → OpenAI `gpt-4o-transcribe`; MP4 → `ffmpeg-static` extrai áudio + `gpt-4o-transcribe`; JPG/JPEG/PNG → visão `gpt-4o-mini` (descrição/OCR).
- [ ] Chunking `RecursiveCharacterTextSplitter` (~800 tokens, overlap 200).
- [ ] `OpenAIEmbeddings` (`text-embedding-3-small`) + `WeaviateStore` (classe `Chunk`: `text`, `userId`, `sourceId`, `chunkIndex`), criação idempotente do schema, filtro por `userId`.
- [ ] Status da fonte `processing → ready | failed` com `error`.
- [ ] Testes com mocks (LLM, embeddings, Weaviate).

### Fase 8 — `apps/agents` (grafo LangGraph)

- [ ] `langgraph.json` (graphs → `dist/graph.js:graph`), build via bun → `dist/`.
- [ ] Grafo por expert: estado `{ messages, userId, expertSlug }`; nó LLM (`gpt-4o-mini`) com tools.
- [ ] Tools: `knowledge_search` (RAG Weaviate filtrado por usuário, top-k 5), `generate_image` (gpt-image-2 → salva em `uploads/generated/` → retorna URL relativa), `generate_video` (gemini + gemini-omni-flash → salva → retorna URL).
- [ ] Persona do expert injetada via config (`@repo/experts`); streaming habilitado.
- [ ] .env: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `LANGSMITH_API_KEY`, `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_PROJECT`, `WEAVIATE_URL`, `UPLOADS_DIR`.

### Fase 9 — API: módulo chat

- [ ] `POST /api/v1/app/chat` { expertSlug, conversationId?, message } → cria/acha conversa, insere mensagem do usuário, chama LangGraph Server `/runs/stream` com histórico, devolve SSE.
- [ ] Agregar resposta e persistir mensagem do assistente (+ `mediaUrl`/`mediaType`).
- [ ] `GET /api/v1/app/conversations` e `GET /api/v1/app/conversations/:id/messages`.
- [ ] Tests com LangGraph server mockado.

### Fase 10 — Frontend (home de chat)

- [ ] Skills `frontend-design` + `web-design-guidelines`.
- [ ] `home.tsx`: layout de chat — área de mensagens (markdown, mídia), barra inferior (dropdown de expert, textarea auto-resize, botão enviar), chips de sugestões por expert (clique envia), botão flutuante `+` (Sheet de conexões: upload/URL/lista/remoção), estados loading/erro/vazio.
- [ ] Consumo SSE com `fetch` + `Authorization` (parsing de eventos) em hook `useChatStream`.
- [ ] Componentes shadcn a adicionar em `packages/ui`: `select`, `textarea` (e ajustes se necessário).
- [ ] Manter perfil/logout do app shell intactos.

### Fase 11 — QA e entregáveis

- [ ] Rodar `code:fix`, `types:check`, `test`, `test:e2e`, `build`; corrigir o que quebrar (seletores/E2E da 012).
- [ ] ADR em `.adrs/014-experts-ai-architecture.md`.
- [ ] Entregar passos manuais de QA, arquivos modificados, libs instaladas, racional.

## Arquivos-alvo

- Novos: `packages/experts/*`, `apps/agents/*` (src, langgraph.json, Dockerfile, package.json), `apps/api/src/modules/{experts,connections,ingestion,chat}/*`, migração Drizzle, componentes de chat no `apps/app`.
- Alterados: `docker-compose.yml`, `.env.example`, `package.json` (root: script `agents:build`), `apps/api/src/db/schema.ts`, `apps/api/src/db/database.factory.ts`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts` (static uploads), `apps/app/src/pages/app/home.tsx`, `apps/app/src/router.tsx`, `packages/ui` (select/textarea), turborepo/tsconfigs.

## Riscos e edge cases

- **LangGraph Server em Docker (JS):** build de imagem via CLI pode falhar no ambiente (workspaces/bun). Fallback: rodar o server via `langgraph dev` em container com bind-mount. Servidor expõe `/runs/stream` e `/info`.
- **Thread/checkpointer:** persistência de histórico garantida na nossa tabela `messages`; cada run envia o histórico no estado (robusto mesmo com server in-memory).
- **Gemini vídeo:** API de geração de vídeo pode variar; tool configurável por env (`GEMINI_VIDEO_MODEL`) com erro amigável se falhar.
- **Transcrição/voz:** arquivos grandes → limites e truncamento; ffmpeg via `ffmpeg-static`.
- **Dedup:** mesmo conteúdo com nome diferente → deduplica; arquivo alterado → nova fonte.
- **Sem dados conectados:** agente responde com conhecimento do modelo e avisa.
- **Vazamento entre usuários:** todos os filtros Weaviate por `userId`; testes cobrem.
- **API Keys ausentes:** módulos só ativam se configuradas; erros 503/400 claros em dev.

## Critérios de aceite (resumo da spec)

Registry com 9 experts + sugestões; Weaviate + agents de pé via `infra:up`; endpoints de experts/connections/chat; dedup por hash/URL; ingestão por tipo (loaders/transcrição/visão); embeddings e upsert no Weaviate com filtro por usuário; home de chat com barra inferior/chips/botão flutuante/perfil; streaming SSE; geração de imagem/vídeo com mídia salva e visível; fontes com status `ready|failed`; QA gates passando; ADR entregue.

## Checklist de QA

1. `bun run code:fix`
2. `bun run types:check`
3. `bun run test`
4. `bun run test:e2e`
5. `bun run build`
6. Manual: subir infra, migrar, logar com seed user, criar conexão de arquivo/URL, perguntar a um expert, clicar sugestão, gerar imagem/vídeo, validar dedup e isolamento de usuário.
