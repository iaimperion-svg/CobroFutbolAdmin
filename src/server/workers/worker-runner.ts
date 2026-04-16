import { createServer } from "node:http";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

if (process.env.PORT) {
  const port = Number.parseInt(process.env.PORT, 10);
  createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("worker ok");
  }).listen(port, () => {
    console.log(`[worker] health server listening on ${port}`);
  });
}

void import("@/server/workers/worker-main").catch((error) => {
  console.error("[worker] startup failed", error);
  process.exit(1);
});
