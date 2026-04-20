import { existsSync, statSync } from 'fs';
import { appendEvent, readSessionMarker, resetSessionMarker, writeSessionMarker } from './session.js';
import { parseTranscriptUsage } from './context.js';

export function shouldResetForClear(newSize: number, lastSize: number): boolean {
  if (lastSize === 0) return false;
  return newSize < lastSize * 0.3;
}

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

  // Update session marker: detect new session_id or /clear
  const marker = readSessionMarker();
  const transcriptSize = existsSync(input.transcript_path)
    ? statSync(input.transcript_path).size
    : 0;

  if (!marker || marker.sessionId !== input.session_id) {
    resetSessionMarker(input.session_id, Date.now(), transcriptSize);
  } else if (shouldResetForClear(transcriptSize, marker.lastTranscriptSize)) {
    resetSessionMarker(input.session_id, Date.now(), transcriptSize);
  } else {
    writeSessionMarker({ ...marker, lastTranscriptSize: transcriptSize });
  }

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
