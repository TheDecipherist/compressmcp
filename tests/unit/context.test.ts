import { describe, it, expect } from 'vitest';
import { parseTranscriptUsage, getContextWindowSize, fmtTokens } from '../../src/context';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

function tempFile(content: string): string {
  const dir = join(tmpdir(), 'compressmcp-ctx-' + randomUUID());
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'transcript.jsonl');
  writeFileSync(path, content, 'utf8');
  return path;
}

function assistantLine(inputTokens: number, cacheCreation: number, cacheRead: number, model: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: {
      model,
      usage: {
        input_tokens: inputTokens,
        cache_creation_input_tokens: cacheCreation,
        cache_read_input_tokens: cacheRead,
        output_tokens: 100,
      },
    },
  });
}

describe('parseTranscriptUsage', () => {
  describe('reads last 40KB of a JSONL transcript file', () => {
    it('reads only the last 40KB when file is larger', () => {
      // Fill > 40KB with junk lines, then a valid assistant line at the end
      const junk = '{"type":"user","message":{}}\n'.repeat(2000);
      const last = assistantLine(9999, 0, 0, 'claude-sonnet-4-6');
      const path = tempFile(junk + last + '\n');
      const result = parseTranscriptUsage(path);
      // Should find the last assistant line regardless of file size
      expect(result).not.toBeNull();
      expect(result?.inputTokens).toBe(9999);
    });

    it('reads the full file when file is smaller than 40KB', () => {
      const path = tempFile(assistantLine(42, 0, 0, 'claude-sonnet-4-6') + '\n');
      const result = parseTranscriptUsage(path);
      expect(result?.inputTokens).toBe(42);
    });
  });

  describe('scans backwards through last 20 lines for first assistant message with usage', () => {
    it('finds the most recent assistant message with usage when within last 20 lines', () => {
      const lines = [
        assistantLine(100, 0, 0, 'claude-haiku-4-5'),
        assistantLine(999, 0, 0, 'claude-sonnet-4-6'),
      ].join('\n') + '\n';
      const result = parseTranscriptUsage(tempFile(lines));
      expect(result?.inputTokens).toBe(999);
    });

    it('does not find assistant messages beyond the last 20 lines', () => {
      // 25 junk lines, then a real assistant line 21+ lines from end — should be missed
      const junk = Array(25).fill('{"type":"user","message":{}}\n').join('');
      const hidden = assistantLine(7777, 0, 0, 'claude-sonnet-4-6') + '\n';
      const path = tempFile(hidden + junk);
      const result = parseTranscriptUsage(path);
      expect(result).toBeNull();
    });
  });

  describe('extracts token fields from usage object', () => {
    it('extracts inputTokens from usage.input_tokens', () => {
      const path = tempFile(assistantLine(1234, 0, 0, 'claude-sonnet-4-6') + '\n');
      expect(parseTranscriptUsage(path)?.inputTokens).toBe(1234);
    });

    it('extracts cacheCreation from usage.cache_creation_input_tokens', () => {
      const path = tempFile(assistantLine(0, 500, 0, 'claude-sonnet-4-6') + '\n');
      expect(parseTranscriptUsage(path)?.cacheCreation).toBe(500);
    });

    it('extracts cacheRead from usage.cache_read_input_tokens', () => {
      const path = tempFile(assistantLine(0, 0, 300, 'claude-sonnet-4-6') + '\n');
      expect(parseTranscriptUsage(path)?.cacheRead).toBe(300);
    });

    it('extracts model from message.model', () => {
      const path = tempFile(assistantLine(0, 0, 0, 'claude-opus-4-7') + '\n');
      expect(parseTranscriptUsage(path)?.model).toBe('claude-opus-4-7');
    });
  });

  describe('null return cases', () => {
    it('returns null if the file does not exist', () => {
      expect(parseTranscriptUsage('/nonexistent/path/transcript.jsonl')).toBeNull();
    });

    it('returns null if no assistant message with usage is found', () => {
      const path = tempFile('{"type":"user","message":{}}\n');
      expect(parseTranscriptUsage(path)).toBeNull();
    });
  });

  describe('malformed JSON handling', () => {
    it('skips malformed JSON lines and continues scanning', () => {
      const lines = 'not-json\n' + assistantLine(77, 0, 0, 'claude-sonnet-4-6') + '\n';
      expect(() => parseTranscriptUsage(tempFile(lines))).not.toThrow();
    });

    it('still returns valid usage when only some lines are malformed', () => {
      const lines = 'bad\n' + assistantLine(55, 10, 5, 'claude-haiku-4-5') + '\n';
      const result = parseTranscriptUsage(tempFile(lines));
      expect(result?.inputTokens).toBe(55);
    });
  });
});

describe('getContextWindowSize', () => {
  describe("'opus' in model name", () => {
    it("returns 1_000_000 when model name contains 'opus'", () => {
      expect(getContextWindowSize('claude-opus-4-7')).toBe(1_000_000);
    });

    it("returns 1_000_000 for 'claude-opus-4' style model name", () => {
      expect(getContextWindowSize('claude-opus-4')).toBe(1_000_000);
    });
  });

  describe("'sonnet' in model name", () => {
    it("returns 200_000 when model name contains 'sonnet'", () => {
      expect(getContextWindowSize('claude-sonnet-4-6')).toBe(200_000);
    });

    it("returns 200_000 for 'claude-sonnet-3-5' style model name", () => {
      expect(getContextWindowSize('claude-sonnet-3-5')).toBe(200_000);
    });
  });

  describe("'haiku' in model name", () => {
    it("returns 200_000 when model name contains 'haiku'", () => {
      expect(getContextWindowSize('claude-haiku-4-5')).toBe(200_000);
    });

    it("returns 200_000 for 'claude-haiku-3' style model name", () => {
      expect(getContextWindowSize('claude-haiku-3')).toBe(200_000);
    });
  });

  describe('unknown model', () => {
    it('returns 200_000 as the default for an unrecognised model name', () => {
      expect(getContextWindowSize('gpt-4')).toBe(200_000);
    });

    it('returns 200_000 for an empty string model name', () => {
      expect(getContextWindowSize('')).toBe(200_000);
    });
  });
});

describe('fmtTokens', () => {
  describe('>= 1_000_000 tokens', () => {
    it("formats exactly 1_000_000 as '1.0M'", () => {
      expect(fmtTokens(1_000_000)).toBe('1.0M');
    });

    it("formats 1_500_000 as '1.5M'", () => {
      expect(fmtTokens(1_500_000)).toBe('1.5M');
    });

    it("formats 2_340_000 as '2.3M'", () => {
      expect(fmtTokens(2_340_000)).toBe('2.3M');
    });
  });

  describe('>= 1_000 and < 1_000_000 tokens', () => {
    it("formats exactly 1_000 as '1K'", () => {
      expect(fmtTokens(1_000)).toBe('1K');
    });

    it("formats 45_000 as '45K'", () => {
      expect(fmtTokens(45_000)).toBe('45K');
    });

    it("formats 200_000 as '200K'", () => {
      expect(fmtTokens(200_000)).toBe('200K');
    });
  });

  describe('< 1_000 tokens', () => {
    it('formats 0 as the raw string "0"', () => {
      expect(fmtTokens(0)).toBe('0');
    });

    it('formats 500 as the raw string "500"', () => {
      expect(fmtTokens(500)).toBe('500');
    });

    it('formats 999 as the raw string "999"', () => {
      expect(fmtTokens(999)).toBe('999');
    });
  });
});
