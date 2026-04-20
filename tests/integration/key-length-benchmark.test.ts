import { describe, it } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { countTokens } from '@anthropic-ai/tokenizer';

const BINARY = resolve(process.cwd(), 'dist/index.js');

if (!existsSync(BINARY)) {
  throw new Error(`dist/index.js not found — run "npm run build" before running integration tests`);
}

function runHook(jsonText: string): string {
  const hookInput = JSON.stringify({
    session_id: 'key-length-bench',
    hook_event_name: 'PostToolUse',
    tool_name: 'mcp__fetch__get',
    tool_input: {},
    tool_response: [{ type: 'text', text: jsonText }],
    cwd: '/tmp',
  });
  const result = spawnSync('node', [BINARY, '--hook'], {
    input: hookInput,
    encoding: 'utf8',
    timeout: 10_000,
  });
  const parsed = JSON.parse(result.stdout) as { hookSpecificOutput: { updatedMCPToolOutput: Array<{ text: string }> } };
  return parsed.hookSpecificOutput.updatedMCPToolOutput[0].text;
}

function parseHeader(text: string): { original: number; compressed: number; pct: number } {
  const match = text.split('\n')[0].match(/([\d,]+)→([\d,]+) tokens \(-(\d+)%\)/);
  if (!match) throw new Error(`Bad header: ${text.split('\n')[0]}`);
  return {
    original: parseInt(match[1].replace(/,/g, '')),
    compressed: parseInt(match[2].replace(/,/g, '')),
    pct: parseInt(match[3]),
  };
}

// Build a key string of exactly the given length using letters a–z cycling
function makeKey(length: number, index: number): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let key = '';
  let n = index;
  for (let i = 0; i < length; i++) {
    key += letters[n % 26];
    n = Math.floor(n / 26) || index + i + 1;
  }
  return key.slice(0, length).padEnd(length, 'z');
}

function makeDataset(keyLength: number, count = 100): unknown[] {
  const keys = Array.from({ length: 8 }, (_, i) => makeKey(keyLength, i));
  return Array.from({ length: count }, (_, row) => {
    const record: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      // Mix value types so the dataset is realistic
      if (i === 0) record[k] = `item_${row}`;
      else if (i === 1) record[k] = `category_${row % 5}`;
      else if (i === 2) record[k] = `status_${row % 3}`;
      else if (i === 3) record[k] = `label_${row % 10}`;
      else if (i === 4) record[k] = (row * 13.37) % 1000;
      else if (i === 5) record[k] = row % 50;
      else if (i === 6) record[k] = row % 2 === 0;
      else record[k] = `2026-01-${String(1 + (row % 28)).padStart(2, '0')}`;
    });
    return record;
  });
}

// ─── Key length benchmark ─────────────────────────────────────────────────────

describe('Key length benchmark — savings by key length', () => {
  it('should report token savings across key lengths 4, 5, 6, and 10', () => {
    const keyLengths = [4, 5, 6, 10];

    const results = keyLengths.map(keyLength => {
      const json = JSON.stringify(makeDataset(keyLength));
      const compressedText = runHook(json);

      // Estimated token counts (used by the hook internally: ceil(length / 4))
      const { original: estOriginal, compressed: estCompressed, pct: estPct } = parseHeader(compressedText);

      // Actual token counts via Anthropic tokenizer
      const compressedJson = compressedText.split('\n')[2] ?? '';
      const actOriginal = countTokens(json);
      const actCompressed = countTokens(compressedJson);
      const actPct = Math.round((1 - actCompressed / actOriginal) * 100);

      return { keyLength, estOriginal, estCompressed, estPct, actOriginal, actCompressed, actPct };
    });

    const pad  = (s: string, n: number) => s.padEnd(n);
    const lpad = (s: string, n: number) => s.padStart(n);

    const lines = [
      '',
      'Key Length Benchmark — Estimated vs Actual Token Counts',
      '─'.repeat(90),
      `${pad('Key length', 12)} ${lpad('Est.orig', 10)} ${lpad('Est.compr', 11)} ${lpad('Est.save', 9)} │ ${lpad('Act.orig', 10)} ${lpad('Act.compr', 11)} ${lpad('Act.save', 9)}`,
      '─'.repeat(90),
      ...results.map(r =>
        `${pad(`${r.keyLength} chars`, 12)} ${lpad(r.estOriginal.toLocaleString(), 10)} ${lpad(r.estCompressed.toLocaleString(), 11)} ${lpad('-' + r.estPct + '%', 9)} │ ${lpad(r.actOriginal.toLocaleString(), 10)} ${lpad(r.actCompressed.toLocaleString(), 11)} ${lpad('-' + r.actPct + '%', 9)}`
      ),
      '─'.repeat(90),
      '',
      'Est. = ceil(length/4) approximation used by the hook',
      'Act. = Anthropic tokenizer (claude tokenizer)',
      '',
    ];

    console.log(lines.join('\n'));
  });
});
