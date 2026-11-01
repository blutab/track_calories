export {};
/**
 * Smoke-test the MCP endpoint with raw JSON-RPC.
 *   MCP_URL=http://localhost:3000/api/mcp/<secret> npm run test:mcp
 * Pass tool calls as args: npm run test:mcp -- get_day '{"date":"today"}'
 */
const url = process.env.MCP_URL;
if (!url) throw new Error("Set MCP_URL to the full endpoint, including the secret");

let id = 0;
async function rpc(method: string, params: unknown = {}) {
  const res = await fetch(url!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${text.slice(0, 300)}`);
  // Responses may come back as JSON or as a single SSE event.
  const json = text.startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).pop()!;
  const msg = JSON.parse(json);
  if (msg.error) throw new Error(`${method}: ${JSON.stringify(msg.error)}`);
  return msg.result;
}

const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "smoke-test", version: "0" },
});
console.log("Server:", init.serverInfo, "\nInstructions:", init.instructions);
const tools = await rpc("tools/list");
console.log("Tools:", tools.tools.map((t: { name: string }) => t.name).join(", "));

const [toolName, args] = process.argv.slice(2);
const calls: [string, unknown][] = toolName ? [[toolName, JSON.parse(args || "{}")]] : [["list_recipes", {}], ["get_day", {}]];
for (const [tool, a] of calls) {
  const r = await rpc("tools/call", { name: tool, arguments: a });
  console.log(`\n# ${tool}${r.isError ? " (error)" : ""}\n${r.content[0].text}`);
}
