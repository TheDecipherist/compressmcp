import { describe, it, expect } from 'vitest';
import { appendEvent, aggregateSession, readLatestSession } from '../../src/session';
import type { SessionEvent } from '../../src/session';
import { mkdirSync, writeFileSync, existsSync, utimesSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

function tempDir(): string {
  const dir = join(tmpdir(), 'compressmcp-test-' + randomUUID());
  mkdirSync(dir, { recursive: true });
  return dir;
}

const COMPRESS: SessionEvent = { type: 'compress', tokensSaved: 100, tokensIn: 500, ts: 1000 };
const CONTEXT: SessionEvent = {
  type: 'context', inputTokens: 1000, cacheCreation: 500, cacheRead: 200,
  model: 'claude-sonnet-4-6', ts: 2000,
};

describe('appendEvent', () => {
  describe('appends a JSON line to ~/.compressmcp/{sessionId}.jsonl', () => {
    it('writes a compress event as a single JSON line to the session file', () => {
      const dir = tempDir();
      appendEvent('sess1', COMPRESS, dir);
      const lines = readFileSync(join(dir, 'sess1.jsonl'), 'utf8').trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject(COMPRESS);
    });

    it('writes a context event as a single JSON line to the session file', () => {
      const dir = tempDir();
      appendEvent('sess1', CONTEXT, dir);
      const content = readFileSync(join(dir, 'sess1.jsonl'), 'utf8');
      expect(JSON.parse(content.trim())).toMatchObject(CONTEXT);
    });

    it('appends successive events without overwriting previous lines', () => {
      const dir = tempDir();
      appendEvent('sess1', COMPRESS, dir);
      appendEvent('sess1', CONTEXT, dir);
      const lines = readFileSync(join(dir, 'sess1.jsonl'), 'utf8').trim().split('\n');
      expect(lines).toHaveLength(2);
    });

    it('uses the sessionId to construct the correct file path', () => {
      const dir = tempDir();
      appendEvent('my-session', COMPRESS, dir);
      expect(existsSync(join(dir, 'my-session.jsonl'))).toBe(true);
    });
  });

  describe('creates the directory if it does not exist', () => {
    it('creates ~/.compressmcp/ when the directory is absent', () => {
      const parent = join(tmpdir(), 'compressmcp-test-' + randomUUID());
      const dir = join(parent, 'compressmcp');
      appendEvent('sess1', COMPRESS, dir);
      expect(existsSync(dir)).toBe(true);
    });

    it('does not throw when the directory already exists', () => {
      const dir = tempDir();
      expect(() => appendEvent('sess1', COMPRESS, dir)).not.toThrow();
      expect(() => appendEvent('sess1', COMPRESS, dir)).not.toThrow();
    });
  });

  describe('creates the file if it does not exist', () => {
    it('creates the .jsonl file when it is absent', () => {
      const dir = tempDir();
      appendEvent('newfile', COMPRESS, dir);
      expect(existsSync(join(dir, 'newfile.jsonl'))).toBe(true);
    });

    it('does not truncate an existing file when appending', () => {
      const dir = tempDir();
      appendEvent('sess1', COMPRESS, dir);
      appendEvent('sess1', COMPRESS, dir);
      const content = readFileSync(join(dir, 'sess1.jsonl'), 'utf8');
      expect(content.trim().split('\n')).toHaveLength(2);
    });
  });
});

describe('aggregateSession', () => {
  describe('counts compress events → calls', () => {
    it('returns calls equal to the number of compress events', () => {
      const events: SessionEvent[] = [COMPRESS, COMPRESS, COMPRESS];
      expect(aggregateSession(events).calls).toBe(3);
    });

    it('does not count context events toward calls', () => {
      const events: SessionEvent[] = [COMPRESS, CONTEXT, COMPRESS];
      expect(aggregateSession(events).calls).toBe(2);
    });
  });

  describe('sums tokensSaved across compress events', () => {
    it('returns the sum of tokensSaved from all compress events', () => {
      const events: SessionEvent[] = [
        { type: 'compress', tokensSaved: 100, tokensIn: 500, ts: 1 },
        { type: 'compress', tokensSaved: 200, tokensIn: 800, ts: 2 },
      ];
      expect(aggregateSession(events).tokensSaved).toBe(300);
    });

    it('returns 0 for tokensSaved when there are no compress events', () => {
      expect(aggregateSession([CONTEXT]).tokensSaved).toBe(0);
    });
  });

  describe('sums tokensIn across compress events', () => {
    it('returns the sum of tokensIn from all compress events', () => {
      const events: SessionEvent[] = [
        { type: 'compress', tokensSaved: 50, tokensIn: 400, ts: 1 },
        { type: 'compress', tokensSaved: 50, tokensIn: 600, ts: 2 },
      ];
      expect(aggregateSession(events).tokensIn).toBe(1000);
    });

    it('returns 0 for tokensIn when there are no compress events', () => {
      expect(aggregateSession([CONTEXT]).tokensIn).toBe(0);
    });
  });

  describe('picks the latest context event (highest ts) → context field', () => {
    it('selects the context event with the highest ts value', () => {
      const older: SessionEvent = {
        type: 'context', inputTokens: 500, cacheCreation: 0, cacheRead: 0,
        model: 'claude-haiku-4-5', ts: 100,
      };
      const newer: SessionEvent = {
        type: 'context', inputTokens: 1000, cacheCreation: 0, cacheRead: 0,
        model: 'claude-sonnet-4-6', ts: 999,
      };
      expect(aggregateSession([older, newer]).context?.model).toBe('claude-sonnet-4-6');
    });

    it('returns null/undefined for context when there are no context events', () => {
      expect(aggregateSession([COMPRESS]).context).toBeNull();
    });

    it('handles a single context event correctly', () => {
      const result = aggregateSession([CONTEXT]);
      expect(result.context?.inputTokens).toBe(1000);
    });
  });

  describe('returns zeroed SessionStats when events array is empty', () => {
    it('returns calls = 0 for an empty events array', () => {
      expect(aggregateSession([]).calls).toBe(0);
    });

    it('returns tokensSaved = 0 for an empty events array', () => {
      expect(aggregateSession([]).tokensSaved).toBe(0);
    });

    it('returns tokensIn = 0 for an empty events array', () => {
      expect(aggregateSession([]).tokensIn).toBe(0);
    });

    it('returns a falsy context for an empty events array', () => {
      expect(aggregateSession([]).context).toBeFalsy();
    });
  });
});

describe('readLatestSession', () => {
  describe('reads the most recently modified .jsonl file from ~/.compressmcp/', () => {
    it('returns events from the most recently modified .jsonl file when multiple files exist', () => {
      const dir = tempDir();
      writeFileSync(join(dir, 'old.jsonl'), JSON.stringify(COMPRESS) + '\n');
      writeFileSync(join(dir, 'new.jsonl'), JSON.stringify(CONTEXT) + '\n');
      const past = new Date(Date.now() - 10000);
      utimesSync(join(dir, 'old.jsonl'), past, past);

      const events = readLatestSession(dir);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('context');
    });

    it('returns events from the only .jsonl file when exactly one exists', () => {
      const dir = tempDir();
      writeFileSync(join(dir, 'session.jsonl'), JSON.stringify(COMPRESS) + '\n');
      const events = readLatestSession(dir);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('compress');
    });
  });

  describe('returns [] if the directory does not exist or is empty', () => {
    it('returns an empty array when ~/.compressmcp/ does not exist', () => {
      const dir = join(tmpdir(), 'compressmcp-nonexistent-' + randomUUID());
      expect(readLatestSession(dir)).toEqual([]);
    });

    it('returns an empty array when ~/.compressmcp/ exists but contains no .jsonl files', () => {
      const dir = tempDir();
      writeFileSync(join(dir, 'other.txt'), 'nope');
      expect(readLatestSession(dir)).toEqual([]);
    });
  });

  describe('parses each JSONL line, skips malformed lines', () => {
    it('parses valid JSON lines into Event objects', () => {
      const dir = tempDir();
      writeFileSync(join(dir, 's.jsonl'),
        JSON.stringify(COMPRESS) + '\n' + JSON.stringify(CONTEXT) + '\n');
      expect(readLatestSession(dir)).toHaveLength(2);
    });

    it('skips lines that are not valid JSON without throwing', () => {
      const dir = tempDir();
      writeFileSync(join(dir, 's.jsonl'), 'not-json\n' + JSON.stringify(COMPRESS) + '\n');
      expect(() => readLatestSession(dir)).not.toThrow();
    });

    it('skips blank lines without throwing', () => {
      const dir = tempDir();
      writeFileSync(join(dir, 's.jsonl'), '\n\n' + JSON.stringify(COMPRESS) + '\n\n');
      expect(() => readLatestSession(dir)).not.toThrow();
    });

    it('returns only the successfully parsed events when the file contains a mix of valid and malformed lines', () => {
      const dir = tempDir();
      writeFileSync(join(dir, 's.jsonl'),
        JSON.stringify(COMPRESS) + '\nbad-json\n' + JSON.stringify(CONTEXT) + '\n');
      const events = readLatestSession(dir);
      expect(events).toHaveLength(2);
    });
  });
});
