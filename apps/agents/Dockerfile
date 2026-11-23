FROM oven/bun:1.3.13

WORKDIR /repo

RUN apt-get update && apt-get install -y --no-install-recommends git nodejs npm \
  && rm -rf /var/lib/apt/lists/*

COPY . .

RUN bun install --frozen-lockfile
RUN npm install -g @langchain/langgraph-cli

WORKDIR /repo/apps/agents

RUN bun run build

EXPOSE 2024

CMD ["node", "server.mjs"]
