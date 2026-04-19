import { fetchAndCompress } from './fetch-tool.js';

// Minimal MCP server over stdio (JSON-RPC 2.0)
// Handles: initialize, tools/list, tools/call

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

function reply(id: string | number, result: unknown): string {
  const resp: JsonRpcResponse = { jsonrpc: '2.0', id, result };
  return JSON.stringify(resp) + '\n';
}

function replyError(id: string | number, code: number, message: string): string {
  const resp: JsonRpcResponse = { jsonrpc: '2.0', id, error: { code, message } };
  return JSON.stringify(resp) + '\n';
}

const TOOLS = [
  {
    name: 'fetch',
    description: 'Make an HTTP request and return the response with lossless JSON compression applied if the response is JSON above the token threshold.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        method: { type: 'string', description: 'HTTP method (default: GET)', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        headers: { type: 'object', description: 'HTTP headers', additionalProperties: { type: 'string' } },
        body: { type: 'string', description: 'Request body for POST/PUT/PATCH' },
      },
      required: ['url'],
    },
  },
];

export async function runServer(): Promise<void> {
  const rl = await import('readline');
  const iface = rl.createInterface({ input: process.stdin });

  for await (const line of iface) {
    if (!line.trim()) continue;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line) as JsonRpcRequest;
    } catch {
      continue;
    }

    if (req.method === 'initialize') {
      process.stdout.write(reply(req.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'compressmcp', version: '0.1.0' },
      }));
    } else if (req.method === 'tools/list') {
      process.stdout.write(reply(req.id, { tools: TOOLS }));
    } else if (req.method === 'tools/call') {
      const params = req.params as { name: string; arguments: Record<string, unknown> };
      if (params.name !== 'fetch') {
        process.stdout.write(replyError(req.id, -32601, `Unknown tool: ${params.name}`));
        continue;
      }

      const args = params.arguments as { url: string; method?: string; headers?: Record<string, string>; body?: string };
      const result = await fetchAndCompress({
        url: args.url,
        method: args.method,
        headers: args.headers,
        body: args.body,
      });

      process.stdout.write(reply(req.id, {
        content: [{ type: 'text', text: result.content }],
        isError: result.statusCode >= 400 || result.statusCode === 0,
      }));
    } else if (req.method === 'notifications/initialized') {
      // no-op notification
    } else {
      process.stdout.write(replyError(req.id, -32601, `Method not found: ${req.method}`));
    }
  }
}
