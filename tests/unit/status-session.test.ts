import { describe, it, expect } from 'vitest';
import { formatStatusBar, formatPlanUsage } from '../../src/status';
import type { SessionStats } from '../../src/status';

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

const ZERO: SessionStats = { calls: 0, tokensSaved: 0, tokensIn: 0, context: null };

// 3_800_000 / 10_000_000 = 38% exactly
const ALL_TIME: SessionStats = {
  calls: 2207,
  tokensSaved: 3_800_000,
  tokensIn: 10_000_000,
  context: null,
};

// 1_200 / 3_000 = 40% exactly
const SESSION: SessionStats = {
  calls: 12,
  tokensSaved: 1_200,
  tokensIn: 3_000,
  context: null,
};

// ─────────────────────────────────────────────
// Session stats in status bar
// ─────────────────────────────────────────────

describe('formatStatusBar — session stats display', () => {
  describe('shows session as primary and all-time in parentheses', () => {
    it('renders session savings in the ⚡ section (primary)', () => {
      const plain = stripAnsi(formatStatusBar(ALL_TIME, null, null, SESSION));
      // Session tokensSaved=1200 → fmtTokens → '1K'
      expect(plain).toMatch(/⚡ -1K tok/);
    });

    it('renders session calls in the ⚡ section (primary)', () => {
      const plain = stripAnsi(formatStatusBar(ALL_TIME, null, null, SESSION));
      expect(plain).toContain('12 calls');
    });

    it('renders all-time savings in (all: ...) parentheses suffix', () => {
      const plain = stripAnsi(formatStatusBar(ALL_TIME, null, null, SESSION));
      expect(plain).toContain('(all:');
      expect(plain).toContain('3.8M');
    });

    it('renders all-time call count in (all: ...) suffix', () => {
      const plain = stripAnsi(formatStatusBar(ALL_TIME, null, null, SESSION));
      expect(plain).toContain('2207');
    });

    it('renders all-time compression % in (all: ...) suffix', () => {
      const plain = stripAnsi(formatStatusBar(ALL_TIME, null, null, SESSION));
      // ALL_TIME: 3_800_000 / 10_000_000 = 38%
      expect(plain).toMatch(/all:.*38%/);
    });

    it('session % is calculated from session tokensIn, not all-time', () => {
      const plain = stripAnsi(formatStatusBar(ALL_TIME, null, null, SESSION));
      // SESSION: 1_200 / 3_000 = 40%
      expect(plain).toMatch(/⚡.*40%/);
    });

    it('session section appears before (all: ...) in the output', () => {
      const plain = stripAnsi(formatStatusBar(ALL_TIME, null, null, SESSION));
      const sessionIdx = plain.indexOf('12 calls');
      const allIdx = plain.indexOf('(all:');
      expect(sessionIdx).toBeGreaterThan(-1);
      expect(allIdx).toBeGreaterThan(sessionIdx);
    });
  });

  describe('falls back to all-time only when sessionStats is absent', () => {
    it('does not show (all: ...) when sessionStats is not provided', () => {
      expect(stripAnsi(formatStatusBar(ALL_TIME))).not.toContain('(all:');
    });

    it('does not show (all: ...) when sessionStats is null', () => {
      expect(stripAnsi(formatStatusBar(ALL_TIME, null, null, null))).not.toContain('(all:');
    });

    it('shows all-time savings as primary when session stats are absent (backward compat)', () => {
      const plain = stripAnsi(formatStatusBar(ALL_TIME));
      expect(plain).toContain('3.8M');
      expect(plain).toContain('2207 calls');
    });
  });

  describe('omits (all: ...) suffix when all-time calls === 0', () => {
    it('no (all: ...) suffix when no compressions have occurred', () => {
      expect(stripAnsi(formatStatusBar(ZERO, null, null, ZERO))).not.toContain('(all:');
    });
  });
});

// ─────────────────────────────────────────────
// Compact plan usage bars (4-char width)
// ─────────────────────────────────────────────

describe('formatPlanUsage — compact 4-char bars', () => {
  describe('bar width reduced to 4 characters', () => {
    it('renders exactly 4 bar characters for the 5h bar', () => {
      const planUsage = {
        fiveHour: { utilization: 50, resetsAt: '' },
        sevenDay: { utilization: 50, resetsAt: '' },
      };
      const match = stripAnsi(formatPlanUsage(planUsage)).match(/5h \[([█░]+)/);
      expect(match?.[1]).toHaveLength(4);
    });

    it('renders exactly 4 bar characters for the 7d bar', () => {
      const planUsage = {
        fiveHour: { utilization: 50, resetsAt: '' },
        sevenDay: { utilization: 50, resetsAt: '' },
      };
      const match = stripAnsi(formatPlanUsage(planUsage)).match(/7d \[([█░]+)/);
      expect(match?.[1]).toHaveLength(4);
    });

    it('at 50% utilization, 2 of 4 blocks are filled', () => {
      const planUsage = {
        fiveHour: { utilization: 50, resetsAt: '' },
        sevenDay: { utilization: 0, resetsAt: '' },
      };
      const match = stripAnsi(formatPlanUsage(planUsage)).match(/5h \[([█░]+)/);
      expect((match?.[1] ?? '').split('').filter(c => c === '█').length).toBe(2);
    });

    it('at 0% utilization, 0 of 4 blocks are filled', () => {
      const planUsage = {
        fiveHour: { utilization: 0, resetsAt: '' },
        sevenDay: { utilization: 0, resetsAt: '' },
      };
      const match = stripAnsi(formatPlanUsage(planUsage)).match(/5h \[([█░]+)/);
      expect((match?.[1] ?? '').split('').every(c => c === '░')).toBe(true);
    });

    it('at 100% utilization, all 4 of 4 blocks are filled', () => {
      const planUsage = {
        fiveHour: { utilization: 100, resetsAt: '' },
        sevenDay: { utilization: 100, resetsAt: '' },
      };
      const match = stripAnsi(formatPlanUsage(planUsage)).match(/5h \[([█░]+)/);
      expect((match?.[1] ?? '').split('').every(c => c === '█')).toBe(true);
    });
  });

  describe('percentage and format unchanged', () => {
    it('still shows 5h and 7d labels with percentages', () => {
      const planUsage = {
        fiveHour: { utilization: 16, resetsAt: '' },
        sevenDay: { utilization: 19, resetsAt: '' },
      };
      const result = stripAnsi(formatPlanUsage(planUsage));
      expect(result).toContain('5h');
      expect(result).toContain('7d');
      expect(result).toContain('16%');
      expect(result).toContain('19%');
    });
  });
});
