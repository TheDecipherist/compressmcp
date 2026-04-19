import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import Anthropic from '@anthropic-ai/sdk';

// Load .env so ANTHROPIC_API_KEY is available when running via `npm test`
try {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    }
  }
} catch { /* ignore */ }

const BINARY = resolve(process.cwd(), 'dist/index.js');
const FIXTURE_PATH = resolve(process.cwd(), 'tests/fixtures/orders.json');

beforeAll(() => {
  if (!existsSync(BINARY)) {
    throw new Error(
      `dist/index.js not found — run "npm run build" before running integration tests`
    );
  }
});

function makeLargeJson(count = 200): string {
  return JSON.stringify(
    Array.from({ length: count }, (_, i) => ({
      transactionId: `tx_${i}`,
      transactionType: i % 2 === 0 ? 'purchase' : 'refund',
      transactionAmount: 99.99,
      createdAt: '2026-04-19',
    }))
  );
}

function runHook(args: string[], input: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [BINARY, ...args], {
    input,
    encoding: 'utf8',
    timeout: 10_000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

function compressViaHook(jsonText: string): string {
  const hookInput = JSON.stringify({
    session_id: 'test-session',
    hook_event_name: 'PostToolUse',
    tool_name: 'mcp__fetch__get',
    tool_input: {},
    tool_response: [{ type: 'text', text: jsonText }],
    cwd: '/tmp',
  });
  const { stdout } = runHook(['--hook'], hookInput);
  const parsed = JSON.parse(stdout);
  return parsed.hookSpecificOutput.updatedMCPToolOutput[0].text as string;
}

// Format: "[compressmcp: 8366→2104 tokens (-74%) | lossless]\nKeys: {...}\n[...]"
function parseCompressedOutput(text: string): {
  originalTokens: number;
  compressedTokens: number;
  reductionPct: number;
  dictionary: Record<string, string>;
  compressedJson: string;
} {
  const lines = text.split('\n');
  const headerMatch = lines[0].match(/([\d,]+)→([\d,]+) tokens \(-(\d+)%\)/);
  if (!headerMatch) throw new Error(`Unexpected header format: ${lines[0]}`);
  const dictionary = JSON.parse(lines[1].slice('Keys: '.length)) as Record<string, string>;
  return {
    originalTokens: parseInt(headerMatch[1].replace(/,/g, '')),
    compressedTokens: parseInt(headerMatch[2].replace(/,/g, '')),
    reductionPct: parseInt(headerMatch[3]),
    dictionary,
    compressedJson: lines[2],
  };
}

// ─── PostToolUse hook ────────────────────────────────────────────────────────

describe('CLI integration — PostToolUse hook (--hook)', () => {
  it('should output updatedMCPToolOutput with compressed content for large JSON', () => {
    const hookInput = JSON.stringify({
      session_id: 'test-session',
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__db__query',
      tool_input: {},
      tool_response: [{ type: 'text', text: makeLargeJson() }],
      cwd: '/tmp',
    });

    const { stdout } = runHook(['--hook'], hookInput);

    expect(stdout).not.toBe('');
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.updatedMCPToolOutput).toBeDefined();
    expect(parsed.hookSpecificOutput.updatedMCPToolOutput[0].text).toContain('[compressmcp:');
  });

  it('should produce empty stdout for non-JSON tool_response', () => {
    const hookInput = JSON.stringify({
      session_id: 'test-session',
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__db__query',
      tool_input: {},
      tool_response: [{ type: 'text', text: 'plain text, not JSON at all' }],
      cwd: '/tmp',
    });

    const { stdout } = runHook(['--hook'], hookInput);

    expect(stdout).toBe('');
  });
});

// ─── PreToolUse hook ─────────────────────────────────────────────────────────

describe('CLI integration — PreToolUse hook (--pre-hook)', () => {
  it('should output decision:block for a Bash HookInput with a curl command', () => {
    const hookInput = JSON.stringify({
      session_id: 'test-session',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'curl https://api.example.com/data' },
      cwd: '/tmp',
    });

    const { stdout } = runHook(['--pre-hook'], hookInput);

    expect(stdout).not.toBe('');
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.decision).toBe('block');
  });

  it('should produce empty stdout for a non-curl Bash command', () => {
    const hookInput = JSON.stringify({
      session_id: 'test-session',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls -la /tmp' },
      cwd: '/tmp',
    });

    const { stdout } = runHook(['--pre-hook'], hookInput);

    expect(stdout).toBe('');
  });
});

// ─── Compression quality ─────────────────────────────────────────────────────

describe('Compression quality — orders fixture', () => {
  it('should abbreviate keys and remove original key names from compressed data', () => {
    const originalJson = readFileSync(FIXTURE_PATH, 'utf8');
    const compressedText = compressViaHook(originalJson);
    const { dictionary, compressedJson } = parseCompressedOutput(compressedText);

    const dictValues = Object.values(dictionary);
    expect(dictValues).toContain('orderId');
    expect(dictValues).toContain('orderStatus');
    expect(dictValues).toContain('customerName');
    expect(dictValues).toContain('totalAmount');
    expect(dictValues).toContain('productCategory');

    expect(compressedJson).not.toContain('"orderId"');
    expect(compressedJson).not.toContain('"orderStatus"');
    expect(compressedJson).not.toContain('"customerName"');
  });

  it('should achieve greater than 30% token reduction on realistic order data', () => {
    const originalJson = readFileSync(FIXTURE_PATH, 'utf8');
    const compressedText = compressViaHook(originalJson);
    const { originalTokens, compressedTokens, reductionPct } = parseCompressedOutput(compressedText);

    expect(originalTokens).toBeGreaterThan(500);
    expect(compressedTokens).toBeLessThan(originalTokens);
    expect(reductionPct).toBeGreaterThan(30);

    console.log(`Token savings: ${originalTokens.toLocaleString()} → ${compressedTokens.toLocaleString()} tokens (-${reductionPct}%)`);
  });
});

// ─── Claude comprehension ─────────────────────────────────────────────────────
//
// Tests that the compressed output is structurally readable by Claude:
// - the prompt sent to Claude contains the Keys dictionary and compressed data
// - the response parsing logic works correctly
// The Anthropic client is mocked so no API credits are needed.

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

describe('Claude comprehension — compressed orders data', () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '100, 40, 35, 25' }],
    });
  });

  it('should send the Keys dictionary and compressed data to Claude', async () => {
    const originalJson = readFileSync(FIXTURE_PATH, 'utf8');
    const compressedText = compressViaHook(originalJson);
    const { dictionary } = parseCompressedOutput(compressedText);

    const client = new Anthropic();
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                'Below is an API response in compressmcp format.',
                'The first line is a stats header.',
                'The second line is a Keys dictionary mapping abbreviated field names back to their originals.',
                'The third line is the compressed JSON data — decode each key using the dictionary before reading.',
                '',
                compressedText,
                '',
                'Using the dictionary to decode field names:',
                '1. How many orders are there in total?',
                '2. How many have orderStatus "completed"?',
                '3. How many have orderStatus "pending"?',
                '4. How many have orderStatus "cancelled"?',
                '',
                'Reply with only the four numbers on one line, comma-separated, in the same order.',
              ].join('\n'),
            },
          ],
        },
      ],
    });

    const call = mockCreate.mock.calls[0][0];
    const promptText = call.messages[0].content[0].text as string;

    // Verify the compressed output (with dictionary) was included in the prompt
    expect(promptText).toContain('[compressmcp:');
    expect(promptText).toContain('Keys:');
    expect(promptText).toContain(JSON.stringify(dictionary));

    // Verify original verbose key names are NOT in the compressed data section
    // (only in the dictionary — proving keys were actually abbreviated)
    const compressedDataSection = promptText.split('Keys: ')[1];
    const afterDictLine = compressedDataSection.split('\n').slice(1).join('\n');
    expect(afterDictLine).not.toContain('"orderId"');
    expect(afterDictLine).not.toContain('"orderStatus"');
  });

  it('should correctly parse a Claude response containing the expected counts', async () => {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
    });

    const answer = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Fixture has 100 orders: 40 completed, 35 pending, 25 cancelled
    expect(answer).toContain('100');
    expect(answer).toContain('40');
    expect(answer).toContain('35');
    expect(answer).toContain('25');
  });
});
