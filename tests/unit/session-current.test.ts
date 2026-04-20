import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import {
  readSessionMarker,
  writeSessionMarker,
  resetSessionMarker,
  filterSessionEvents,
} from '../../src/session';
import type { SessionMarker, SessionEvent } from '../../src/session';
import { shouldResetForClear } from '../../src/tracker';

function tempDir(): string {
  const dir = join(tmpdir(), 'compressmcp-test-' + randomUUID());
  mkdirSync(dir, { recursive: true });
  return dir;
}

const MARKER: SessionMarker = {
  sessionId: 'abc123',
  startTs: 1000000,
  lastTranscriptSize: 50000,
};

// ─────────────────────────────────────────────
// readSessionMarker
// ─────────────────────────────────────────────

describe('readSessionMarker', () => {
  describe('returns the stored marker when the file exists', () => {
    it('reads sessionId from session-current.json', () => {
      const dir = tempDir();
      writeFileSync(join(dir, 'session-current.json'), JSON.stringify(MARKER));
      expect(readSessionMarker(dir)?.sessionId).toBe('abc123');
    });

    it('reads startTs from session-current.json', () => {
      const dir = tempDir();
      writeFileSync(join(dir, 'session-current.json'), JSON.stringify(MARKER));
      expect(readSessionMarker(dir)?.startTs).toBe(1000000);
    });

    it('reads lastTranscriptSize from session-current.json', () => {
      const dir = tempDir();
      writeFileSync(join(dir, 'session-current.json'), JSON.stringify(MARKER));
      expect(readSessionMarker(dir)?.lastTranscriptSize).toBe(50000);
    });
  });

  describe('returns null when the file is absent or corrupt', () => {
    it('returns null when session-current.json does not exist', () => {
      expect(readSessionMarker(tempDir())).toBeNull();
    });

    it('returns null when session-current.json contains invalid JSON', () => {
      const dir = tempDir();
      writeFileSync(join(dir, 'session-current.json'), 'not-json');
      expect(readSessionMarker(dir)).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────
// writeSessionMarker
// ─────────────────────────────────────────────

describe('writeSessionMarker', () => {
  describe('writes marker to session-current.json', () => {
    it('creates session-current.json with correct content', () => {
      const dir = tempDir();
      writeSessionMarker(MARKER, dir);
      expect(existsSync(join(dir, 'session-current.json'))).toBe(true);
    });

    it('round-trips — readSessionMarker returns what writeSessionMarker wrote', () => {
      const dir = tempDir();
      writeSessionMarker(MARKER, dir);
      expect(readSessionMarker(dir)).toMatchObject(MARKER);
    });

    it('overwrites an existing marker file', () => {
      const dir = tempDir();
      writeSessionMarker(MARKER, dir);
      writeSessionMarker({ ...MARKER, startTs: 9999999 }, dir);
      expect(readSessionMarker(dir)?.startTs).toBe(9999999);
    });
  });
});

// ─────────────────────────────────────────────
// resetSessionMarker
// ─────────────────────────────────────────────

describe('resetSessionMarker', () => {
  describe('writes a new marker with the given sessionId and startTs', () => {
    it('sets sessionId to the provided value', () => {
      const dir = tempDir();
      resetSessionMarker('new-session', 5000, 12345, dir);
      expect(readSessionMarker(dir)?.sessionId).toBe('new-session');
    });

    it('sets startTs to the provided value', () => {
      const dir = tempDir();
      resetSessionMarker('s', 5000, 0, dir);
      expect(readSessionMarker(dir)?.startTs).toBe(5000);
    });

    it('sets lastTranscriptSize to the provided value', () => {
      const dir = tempDir();
      resetSessionMarker('s', 0, 77000, dir);
      expect(readSessionMarker(dir)?.lastTranscriptSize).toBe(77000);
    });

    it('overwrites an existing marker', () => {
      const dir = tempDir();
      writeSessionMarker(MARKER, dir);
      resetSessionMarker('fresh', 999, 0, dir);
      const result = readSessionMarker(dir);
      expect(result?.sessionId).toBe('fresh');
      expect(result?.startTs).toBe(999);
    });
  });
});

// ─────────────────────────────────────────────
// /clear detection in tracker — transcript shrink heuristic
// ─────────────────────────────────────────────

describe('detectClear (transcript shrink heuristic)', () => {
  describe('detects /clear when transcript shrinks to < 30% of previous size', () => {
    it('returns true when newSize < lastSize * 0.3', () => {
      expect(shouldResetForClear(5000, 20000)).toBe(true);
    });

    it('returns false when newSize >= lastSize * 0.3', () => {
      expect(shouldResetForClear(7000, 20000)).toBe(false);
    });

    it('returns false when lastSize is 0 (no prior transcript size)', () => {
      expect(shouldResetForClear(0, 0)).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// Event filtering by startTs
// ─────────────────────────────────────────────

describe('filterSessionEvents', () => {
  const events: SessionEvent[] = [
    { type: 'compress', tokensSaved: 100, tokensIn: 500, ts: 1000 },
    { type: 'compress', tokensSaved: 200, tokensIn: 800, ts: 2000 },
    { type: 'compress', tokensSaved: 300, tokensIn: 900, ts: 3000 },
    { type: 'context', inputTokens: 1000, cacheCreation: 0, cacheRead: 0, model: 'm', ts: 2500 },
  ];

  describe('returns only events with ts >= startTs', () => {
    it('returns all events when startTs = 0', () => {
      expect(filterSessionEvents(events, 0)).toHaveLength(4);
    });

    it('returns only events at or after startTs', () => {
      // ts=2000, ts=2500, ts=3000 → 3 events
      expect(filterSessionEvents(events, 2000)).toHaveLength(3);
    });

    it('returns empty array when startTs is after all events', () => {
      expect(filterSessionEvents(events, 9999)).toHaveLength(0);
    });

    it('includes events with ts exactly equal to startTs', () => {
      const result = filterSessionEvents(events, 3000);
      expect(result).toHaveLength(1);
      expect((result[0] as { tokensSaved: number }).tokensSaved).toBe(300);
    });
  });
});
