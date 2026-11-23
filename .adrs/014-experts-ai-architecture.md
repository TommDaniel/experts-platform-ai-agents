# ADR-014: Arquitetura de IA — Experts com LangGraph Server, Weaviate e RAG

- **Status:** aceito
- **Data:** 2026-08-12
- **Decisão load-bearing:** entregar a feature central do produto (home de chat + 9 experts + conectores + RAG) com **LangGraph Server rodando em um workspace Docker próprio (`apps/agents`, porta 2024)** consumido pela API via **SSE**, **Weaviate** como vector store (classe `Chunk`, isolamento por usuário), **embeddings OpenAI** (`text-embedding-3-small`), **deduplicação de fontes via Postgres** (índice único `(user_id, type, reference)`) e **registry de experts em `packages/experts`** compartilhado entre API e agentes — com runtime 100% local (Docker), exceção apenas para chamadas OpenAI/Gemini e tracing no LangSmith Cloud.

## Contexto

A spec `013-experts` pediu a primeira feature de produto de ponta a ponta: 9 experts (CEO, CFO, COO, CPO, CMO, CTO, Sales Director, Customer Success Director, Customer Hero Director) que respondem em chat com base em dados conectados (arquivos PDF/TXT/MD/JPG/PNG/MP4/MP3 e URLs) via RAG, com sugestões de perguntas, tools de geração de imagem (`gpt-image-2`) e vídeo (Gemini), tudo em inglês (UI/API) e rodando localmente. A stack foi definida pelo usuário: **LangChain.js**, **LangGraph**, **LangSmith**, **Weaviate**. Hoje a API é NestJS + Drizzle/Postgres (com auth completa das specs 001–008); não existia camada de IA nem workspace de agentes.

## Decisões

### 1. `apps/agents` como aplicação LangGraph isolada em Docker

- Novo workspace TypeScript (ESM, NodeNext) com o grafo `experts` (um nó LLM `gpt-4o-mini` com tools) consumindo a persona do expert via `config` (`@repo/experts`), empacotado para o **LangGraph Server** via `langgraph.json` (`graphs → dist/graph.js:graph`).
- O server roda em container próprio no `docker-compose.yml` (serviço `agents`, porta 2024, healthcheck `GET /ok`), com env `OPENAI_API_KEY`, `GEMINI_API_KEY`, `LANGSMITH_API_KEY`, `LANGCHAIN_TRACING_V2=true`, `WEAVIATE_URL`, `UPLOADS_DIR` (volume `./uploads:/uploads`). Compose repassa as keys do host com `${VAR:-}` — sem keys reais o grafo sobe, mas runs falham com erro claro de credenciais.
- **Bug de imagem resolvido:** a imagem base `oven/bun` expõe um `node` que é wrapper do bun, fazendo o tsx do langgraph-cli falhar no Linux (`Cannot find module './cjs/index.cjs' from ''`). Solução: instalar Node real via apt (`git nodejs npm`), `npm install -g @langchain/langgraph-cli`, e rodar `langgraphjs dev --host 0.0.0.0 --port 2024 --no-browser -c .` sob Node. `.dockerignore` **não** exclui `.git` (o lefthook `prepare` precisa dele).

### 2. SDK oficial do cliente (`@langchain/langgraph-sdk`)

- A API mudou na v1.9.29: `client.runs.stream(threadId, assistantId, { input, streamMode: ["messages"], config: { configurable: { userId } } })`. A thread **precisa existir antes do run**: `await client.threads.create({ threadId, ifExists: "do_nothing" })`.
- `thread_id` é derivado da conversa: `00000000-0000-4000-8000-{conversationId com padding de 12}` (`threadIdFor`), garantindo histórico no checkpointer in-memory do server quando persistência própria falhar.
- A API não confia no checkpointer para contexto: cada run envia o histórico completo do Postgres no estado (`input.messages`), tornando o chat robusto a server in-memory.

### 3. Chat com streaming SSE via NestJS `@Sse()`

- `apps/api/src/modules/chat`: `POST/GET /api/v1/chat/conversations`, `GET /api/v1/chat/conversations/:id/messages` e `POST /api/v1/chat/conversations/:id/messages` (SSE proxy para o LangGraph Server).
- Mensagens persistidas em `conversations`/`messages` (Drizzle). Eventos SSE do NestJS usam `type` (não `event`): `token` (delta), `done` (`{ messageId }`), `error` (`{ message }`). Deltas calculados por diferença do conteúdo **cumulativo** dos eventos `messages/partial|complete|metadata`; mensagens não-`ai` são ignoradas (evita eco do user message).
- Mídia gerada detectada por regex `uploads/generated/(image|video)-…` no texto final; `mediaUrl`/`mediaType` persistidos na mensagem do assistente e `uploads/generated/` servido estaticamente pela API (`main.ts`).
- Geração de imagem/vídeo é **síncrona** dentro do run (adiado: fila assíncrona com status de progresso).

### 4. Vector store Weaviate com isolamento por usuário

- Classe `Chunk` com `vectorizer: none` (embeddings gerados pelo app), propriedades `text`, `userId`, `sourceId`, `chunkIndex`; coleção garantida na inicialização (`ensureChunkCollection`).
- `@langchain/weaviate@1.1.0` (`WeaviateStore` + `connectToCustom`; API v3 do weaviate-client). **Toda leitura filtra por `userId`** (`sourceIdFilter` + filtro do usuário) — um usuário nunca recebe contexto de outro.
- Chunking: `RecursiveCharacterTextSplitter` (~800 tokens, overlap ~200); embeddings `OpenAIEmbeddings` (`text-embedding-3-small`).

### 5. Ingestão de fontes com deduplicação via Postgres

- Tabela `sources` (`user_id`, `type`, `name`, `reference`, `mime_type`, `size_bytes`, `file_path`, `status`, `error`) com índice único `(user_id, type, reference)` e status `processing → ready | failed`.
- Arquivo → `reference = sha256(conteúdo)`; URL → a própria URL. Reenvio do mesmo conteúdo/URL → retorna a fonte existente sem re-embedding.
- Extração por tipo: PDF/TXT/MD → loaders LangChain (`PDFLoader` de `@langchain/community`, `TextLoader` de `@langchain/classic`); MP3 → `gpt-4o-transcribe`; MP4 → extração de trilha via `ffmpeg-static` + transcrição; JPG/JPEG/PNG → visão `gpt-4o-mini`; URL → `HTMLWebBaseLoader`. Upload multipart (limite 50 MB) e conexão por URL em `/api/v1/connections` (`upload`, `url`, `DELETE :id`).

### 6. Tools do agente

- `knowledge_search`: RAG no Weaviate filtrado por `userId`, top-k 5, com mensagem explícita quando não há dados conectados (o expert responde com conhecimento do modelo e avisa).
- `generate_image` (gpt-image-2 → salva em `uploads/generated/` → URL relativa) e `generate_video` (Gemini `gemini-omni-flash`/modelo configurável por env `GEMINI_VIDEO_MODEL`, erro amigável se falhar).

### 7. Frontend (home de chat)

- `apps/app`: home de chat com área de mensagens (markdown renderizado por renderer leve próprio + mídia), barra inferior (dropdown de expert via `Select` do shadcn, textarea auto-resize, envio por Enter/clique), chips de sugestões por expert (clique envia), botão flutuante `+` abrindo o sheet de conexões (upload/URL/listagem/remoção) e estados loading/erro/vazio.
- Consumo SSE com `fetch` + `Authorization: Bearer` em hook `useChatStream` (parse de eventos `token`/`done`/`error`); mensagem otimista do usuário e refetch da thread no `done`.
- `packages/ui` ganhou `select` e `textarea` (padrão shadcn/Radix via pacote unificado `radix-ui`).

## Consequências

**Positivas:**

- Stack IA 100% local (Docker) com custo zero de infra; únicas dependências cloud são os modelos OpenAI/Gemini e o tracing LangSmith.
- Camadas bem separadas: `packages/experts` (config), `apps/agents` (grafo), API (orquestração/REST/SSE), frontend (consumo). Trocar o LangGraph Server de lugar não muda a API.
- RAG com isolamento real entre usuários (filtro `userId` no Weaviate e no Postgres).
- Deduplicação evita custo de embeddings/processamento repetido.
- Observabilidade: tracing do grafo no LangSmith + logs/traces da API no LGTM já existente.

**Negativas/custos:**

- Geração de mídia síncrona: runs longos podem passar do timeout do proxy/SSE; fila assíncrona fica adiada.
- `apps/agents` exige Node real + npm global no container (imagem maior que só bun); aviso `langgraph-checkpoint 0.0.0` no boot é inofensivo.
- Sem `OPENAI_API_KEY`/`GEMINI_API_KEY` o fluxo E2E de chat não responde (erro claro de credenciais); testes unitários mockam o LangGraph Server e o SDK.
- Conectores externos (Notion, Drive, etc.) e administração de experts via UI permanecem fora do escopo (config em código).
- Renderização markdown é um subconjunto próprio (sem tabelas); suficiente para respostas do agente.

## Arquivos

- **Novos:** `packages/experts/*` (registry 9 experts), `apps/agents/*` (src: `graph.ts`, `tools.ts`, `media.ts`; `langgraph.json`, `Dockerfile`, `package.json`), `apps/api/src/modules/{experts,connections,ingestion,chat}/*`, migração Drizzle `0001_experts-sources-conversations.sql`, `apps/app/src/components/chat/*` (markdown, connections sheet), `apps/app/src/hooks/use-chat-stream.ts`, `apps/app/src/lib/chat-api.ts`, `packages/ui/src/components/ui/{select,textarea}.tsx`, `.dockerignore`.
- **Alterados:** `docker-compose.yml` (serviços `weaviate` e `agents`), `apps/api/src/app.module.ts`, `apps/api/src/main.ts` (static uploads), `apps/api/src/db/schema.ts`, `apps/api/package.json` (deps LangChain/Weaviate/ffmpeg/express/@repo/experts), `apps/app/src/pages/app/home.tsx`, `apps/app/e2e/auth-redirects.spec.ts` (seletores da home de chat), `.gitignore` (`/uploads`), `.env.example`.
