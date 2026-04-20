import { existsSync, readFileSync, statSync, openSync, readSync, closeSync } from 'fs';

export interface TranscriptUsage {
  inputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  model: string;
}

const LAST_40KB = 40 * 1024;

export function parseTranscriptUsage(transcriptPath: string): TranscriptUsage | null {
  if (!existsSync(transcriptPath)) return null;

  let content: string;
  try {
    const size = statSync(transcriptPath).size;
    if (size > LAST_40KB) {
      const buf = Buffer.alloc(LAST_40KB);
      const fd = openSync(transcriptPath, 'r');
      readSync(fd, buf, 0, LAST_40KB, size - LAST_40KB);
      closeSync(fd);
      content = buf.toString('utf8');
    } else {
      content = readFileSync(transcriptPath, 'utf8');
    }
  } catch {
    return null;
  }

  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const scanLines = lines.slice(-20).reverse();

  for (const line of scanLines) {
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;
      const message = msg.message as Record<string, unknown> | undefined;
      if (msg.type === 'assistant' && message?.usage) {
        const usage = message.usage as Record<string, unknown>;
        return {
          inputTokens: (usage.input_tokens as number) ?? 0,
          cacheCreation: (usage.cache_creation_input_tokens as number) ?? 0,
          cacheRead: (usage.cache_read_input_tokens as number) ?? 0,
          model: (message.model as string) ?? '',
        };
      }
    } catch {
      // skip malformed line
    }
  }

  return null;
}

export function getContextWindowSize(model: string): number {
  if (model.toLowerCase().includes('opus')) return 1_000_000;
  return 200_000;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'K';
  return n.toString();
}
