import { appendEvent } from './session.js';
import { parseTranscriptUsage } from './context.js';

interface TrackInput {
  session_id: string;
  transcript_path?: string;
}

export async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');

  let input: TrackInput;
  try {
    input = JSON.parse(raw) as TrackInput;
  } catch {
    process.exit(0);
  }

  if (!input.session_id || !input.transcript_path) process.exit(0);

  const usage = parseTranscriptUsage(input.transcript_path);
  if (!usage) process.exit(0);

  appendEvent(input.session_id, {
    type: 'context',
    inputTokens: usage.inputTokens,
    cacheCreation: usage.cacheCreation,
    cacheRead: usage.cacheRead,
    model: usage.model,
    ts: Date.now(),
  });
}
