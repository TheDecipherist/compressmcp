export interface PreHookInput {
  session_id: string;
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd: string;
}

export interface PreHookOutput {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    decision: 'block';
    reason: string;
  };
}

const CURL_WGET_PATTERN = /^\s*(curl|wget)\s/;
const URL_PATTERN = /https?:\/\/[^\s'"]+/;

export function detectHttpCommand(command: string): string | null {
  if (!CURL_WGET_PATTERN.test(command)) return null;
  const match = command.match(URL_PATTERN);
  return match ? match[0] : null;
}

export function processPreHook(input: PreHookInput): PreHookOutput | null {
  if (input.tool_name !== 'Bash') return null;

  const command = (input.tool_input.command as string) ?? '';
  const url = detectHttpCommand(command);
  if (!url) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      decision: 'block',
      reason: `Use mcp__compressmcp__fetch instead of curl/wget to get lossless JSON compression. URL: ${url}`,
    },
  };
}

export async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');

  let input: PreHookInput;
  try {
    input = JSON.parse(raw) as PreHookInput;
  } catch {
    process.exit(0);
  }

  const output = processPreHook(input);
  if (output) {
    process.stdout.write(JSON.stringify(output));
  }
}
