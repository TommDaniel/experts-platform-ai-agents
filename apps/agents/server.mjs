import "./dist/observability.js";
import http from "node:http";
import { graph } from "./dist/graph.js";

const PORT = Number(process.env.PORT ?? 2024);
const HOST = process.env.HOST ?? "0.0.0.0";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : (part?.text ?? ""))).join("");
  }
  return "";
}

async function handleStream(req, res, threadId) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const emit = (type, payload) => {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  try {
    const body = await readBody(req);
    const payload = JSON.parse(body);
    const input = payload.input ?? {};
    const configurable = {
      ...payload.config?.configurable,
      thread_id: threadId,
    };

    const stream = await graph.streamEvents(input, {
      version: "v2",
      streamMode: ["messages"],
      configurable,
    });

    let full = "";
    for await (const event of stream) {
      const chunk = event.data?.chunk ?? event.data?.message;
      const content = textOf(chunk?.content);
      if (content && content !== full) {
        full = content.startsWith(full) ? content : full + content;
        emit("chunk", { content: full });
      }
    }
    emit("end", {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit("error", { message });
  } finally {
    res.end();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/ok") {
      writeJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname.endsWith("/runs/stream")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const threadId = parts[0] === "threads" && parts[1] ? parts[1] : `thread-${Date.now()}`;
      await handleStream(req, res, threadId);
      return;
    }
    writeJson(res, 404, { error: "Not found" });
  } catch (err) {
    writeJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[agents] server running at ${HOST}:${PORT}`);
});
