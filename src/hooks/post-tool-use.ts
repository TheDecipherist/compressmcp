import { shouldCompress } from '../compress/detect.js';
import { compress } from '../compress/terse.js';
import { formatOutput } from '../compress/dictionary.js';
import { appendEvent } from '../session.js';

export interface ContentBlock {
  type: 'text' | 'image' | 'resource';
  text?: string;
}

export interface HookInput {
  session_id: string;
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: ContentBlock[];
  cwd: string;
}

export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: 'PostToolUse';
    updatedMCPToolOutput?: ContentBlock[];
  };
}

export function processHook(input: HookInput): HookOutput | null {
  if (!input.tool_name.startsWith('mcp__')) {
    return null;
  }

  let anyCompressed = false;
  let totalTokensIn = 0;
  let totalTokensSaved = 0;

  const updatedBlocks: ContentBlock[] = input.tool_response.map(block => {
    if (block.type !== 'text' || !block.text) {
      return block;
    }
    if (!shouldCompress(block.text)) {
      return block;
    }
    const result = compress(block.text);
    const formatted = formatOutput(result);
    anyCompressed = true;
    totalTokensIn += result.originalTokens;
    totalTokensSaved += result.originalTokens - result.compressedTokens;
    return { type: 'text', text: formatted };
  });

  if (!anyCompressed) {
    return null;
  }

  appendEvent(input.session_id, {
    type: 'compress',
    tokensSaved: totalTokensSaved,
    tokensIn: totalTokensIn,
    ts: Date.now(),
  });

  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      updatedMCPToolOutput: updatedBlocks,
    },
  };
}

export async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');

  let input: HookInput;
  try {
    input = JSON.parse(raw) as HookInput;
  } catch {
    process.exit(0);
  }

  const output = processHook(input);
  if (output) {
    process.stdout.write(JSON.stringify(output));
  }
}
