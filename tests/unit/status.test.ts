import { describe, it, expect } from 'vitest';
import { formatBar, formatStatusBar, shortModelName } from '../../src/status';
import type { SessionStats } from '../../src/status';

// Strip ANSI escape codes for visible-character testing
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('formatBar', () => {
  describe('output length', () => {
    it('returns a string whose visible (non-ANSI) length equals totalWidth', () => {
      expect(stripAnsi(formatBar(3, 10)).replace('\x1b[0m', '')).toHaveLength(10);
    });

    it('returns a string of totalWidth=10 characters (plus ANSI codes)', () => {
      expect(stripAnsi(formatBar(5, 10))).toHaveLength(10);
    });

    it('returns a string of totalWidth=20 characters (plus ANSI codes)', () => {
      expect(stripAnsi(formatBar(10, 20))).toHaveLength(20);
    });
  });

  describe('filled vs unfilled characters', () => {
    it('uses █ for filled positions (0..filledCount-1)', () => {
      const bar = stripAnsi(formatBar(3, 5));
      expect(bar[0]).toBe('█');
      expect(bar[1]).toBe('█');
      expect(bar[2]).toBe('█');
    });

    it('uses ░ for unfilled positions', () => {
      const bar = stripAnsi(formatBar(2, 5));
      expect(bar[2]).toBe('░');
      expect(bar[3]).toBe('░');
      expect(bar[4]).toBe('░');
    });

    it('when filledCount=0 all positions are ░', () => {
      const bar = stripAnsi(formatBar(0, 10));
      expect([...bar].every(c => c === '░')).toBe(true);
    });

    it('when filledCount=totalWidth all positions are █', () => {
      const bar = stripAnsi(formatBar(10, 10));
      expect([...bar].every(c => c === '█')).toBe(true);
    });

    it('correctly mixes filled and unfilled blocks at a midpoint', () => {
      const bar = stripAnsi(formatBar(5, 10));
      expect(bar.slice(0, 5)).toBe('█████');
      expect(bar.slice(5)).toBe('░░░░░');
    });
  });

  describe('ANSI color by position (gradient)', () => {
    it('position 0–49% of totalWidth is colored green (\\x1b[32m)', () => {
      const raw = formatBar(10, 10);
      // First character (position 0, 0% of width) should be preceded by green
      expect(raw).toContain('\x1b[32m');
    });

    it('position 50–79% of totalWidth is colored yellow (\\x1b[33m)', () => {
      // 10 blocks, position 5 = 50% — yellow zone
      const raw = formatBar(10, 10);
      expect(raw).toContain('\x1b[33m');
    });

    it('position 80–100% of totalWidth is colored red (\\x1b[31m)', () => {
      const raw = formatBar(10, 10);
      expect(raw).toContain('\x1b[31m');
    });

    it('unfilled positions are colored dim gray (\\x1b[90m)', () => {
      const raw = formatBar(0, 10);
      expect(raw).toContain('\x1b[90m');
    });

    it('gradient is based on each block\'s own index, NOT the overall fill percentage', () => {
      // 2 filled blocks in a 10-wide bar — both in green zone (positions 0 and 1 = 0–10%)
      const raw = formatBar(2, 10);
      // Should have green but no yellow/red filled blocks
      expect(raw).toContain('\x1b[32m\u2588');
      expect(raw).not.toContain('\x1b[33m\u2588');
      expect(raw).not.toContain('\x1b[31m\u2588');
    });

    it('a filled block at a yellow-zone index is yellow even when overall fill is low', () => {
      // 6 filled of 10 — block at index 5 (50%) should be yellow
      const raw = formatBar(6, 10);
      expect(raw).toContain('\x1b[33m\u2588');
    });

    it('an unfilled block at any position is always dim gray regardless of zone', () => {
      // With 0 filled, all unfilled — every block is dim gray
      const raw = formatBar(0, 10);
      const blocks = raw.split('\x1b[90m\u2591');
      expect(blocks.length).toBeGreaterThan(5);
      expect(raw).not.toContain('\x1b[32m\u2588');
    });
  });

  describe('ANSI reset', () => {
    it('ends with ANSI reset sequence \\x1b[0m', () => {
      expect(formatBar(5, 10).endsWith('\x1b[0m')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('totalWidth=1, filledCount=0 produces a single dim-gray ░ with reset', () => {
      expect(formatBar(0, 1)).toBe('\x1b[90m\u2591\x1b[0m');
    });

    it('totalWidth=1, filledCount=1 produces a single green █ with reset', () => {
      // Position 0 of 1 = 0% of width, green zone
      expect(formatBar(1, 1)).toBe('\x1b[32m\u2588\x1b[0m');
    });
  });
});

describe('formatStatusBar', () => {
  const nullContextStats: SessionStats = {
    calls: 0,
    tokensSaved: 0,
    tokensIn: 0,
    context: null,
  };

  describe('null context (zero state)', () => {
    it('returns the exact zero-state string when context is null', () => {
      const result = formatStatusBar(nullContextStats);
      expect(result).toContain('0%');
      expect(result).toContain('0/200K');
      expect(result).toContain('unknown');
    });

    it('bar shows all-gray ░ blocks when context is null', () => {
      const result = formatStatusBar(nullContextStats);
      expect(result).toContain('\x1b[90m\u2591');
      expect(result).not.toContain('\x1b[32m\u2588');
    });

    it('percentage shows 0% when context is null', () => {
      expect(stripAnsi(formatStatusBar(nullContextStats))).toContain('0%');
    });

    it('token count shows 0 when context is null', () => {
      expect(stripAnsi(formatStatusBar(nullContextStats))).toContain('0/200K');
    });

    it('matches zero-state format: [bar  0% | 0/200K] unknown · ⚡ -0 tok · 0 calls', () => {
      const plain = stripAnsi(formatStatusBar(nullContextStats));
      expect(plain).toMatch(/\[░{10}\s+0% \| 0\/200K\] unknown/);
      expect(plain).toContain('⚡ -0 tok · 0 calls');
    });
  });

  describe('context present — fill calculation', () => {
    function statsWithTokens(inputTokens: number, windowSize: number): SessionStats {
      return {
        calls: 1,
        tokensSaved: 0,
        tokensIn: 0,
        context: {
          inputTokens,
          cacheCreation: 0,
          cacheRead: 0,
          model: 'claude-sonnet-4-6',
          windowSize,
        },
      };
    }

    it('fill = (inputTokens + cacheCreation + cacheRead) / windowSize', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 0, tokensIn: 0,
        context: { inputTokens: 50000, cacheCreation: 30000, cacheRead: 20000,
          model: 'claude-sonnet-4-6', windowSize: 200000 },
      };
      const plain = stripAnsi(formatStatusBar(stats));
      expect(plain).toContain('50%');
    });

    it('50% fill produces 5 filled blocks out of 10', () => {
      const stats = statsWithTokens(100000, 200000);
      const plain = stripAnsi(formatStatusBar(stats));
      expect(plain.match(/█/g)?.length).toBe(5);
    });

    it('80% fill produces 8 filled blocks out of 10', () => {
      const stats = statsWithTokens(160000, 200000);
      const plain = stripAnsi(formatStatusBar(stats));
      expect(plain.match(/█/g)?.length).toBe(8);
    });

    it('100% fill produces 10 filled blocks out of 10', () => {
      const stats = statsWithTokens(200000, 200000);
      const plain = stripAnsi(formatStatusBar(stats));
      expect(plain.match(/█/g)?.length).toBe(10);
    });

    it('percentage is capped at 100% even when tokens exceed windowSize', () => {
      const stats = statsWithTokens(400000, 200000);
      const plain = stripAnsi(formatStatusBar(stats));
      expect(plain).toContain('100%');
      expect(plain.match(/█/g)?.length).toBe(10);
    });

    it('includes cacheCreation tokens in the fill calculation', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 0, tokensIn: 0,
        context: { inputTokens: 0, cacheCreation: 100000, cacheRead: 0,
          model: 'claude-sonnet-4-6', windowSize: 200000 },
      };
      expect(stripAnsi(formatStatusBar(stats))).toContain('50%');
    });

    it('includes cacheRead tokens in the fill calculation', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 0, tokensIn: 0,
        context: { inputTokens: 0, cacheCreation: 0, cacheRead: 100000,
          model: 'claude-sonnet-4-6', windowSize: 200000 },
      };
      expect(stripAnsi(formatStatusBar(stats))).toContain('50%');
    });
  });

  describe('output format', () => {
    it('output matches format: [<bar> <pct>% | <used>/<total>] <model> · ⚡ -<saved> tok · <calls> calls', () => {
      const stats: SessionStats = {
        calls: 47, tokensSaved: 60000, tokensIn: 150000,
        context: { inputTokens: 45000, cacheCreation: 0, cacheRead: 0,
          model: 'claude-sonnet-4-6', windowSize: 200000 },
      };
      const plain = stripAnsi(formatStatusBar(stats));
      expect(plain).toMatch(/\[.+\d+%.*\|.*\].+sonnet/);
      expect(plain).toContain('47 calls');
    });

    it('bar width is always exactly 10 blocks', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 0, tokensIn: 0,
        context: { inputTokens: 50000, cacheCreation: 0, cacheRead: 0,
          model: 'claude-sonnet-4-6', windowSize: 200000 },
      };
      const plain = stripAnsi(formatStatusBar(stats));
      const blockMatch = plain.match(/\[([█░]+)/);
      expect(blockMatch?.[1]).toHaveLength(10);
    });
  });

  describe('token formatting (K/M suffix)', () => {
    it('formats tokens < 1000 without suffix', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 500, tokensIn: 0,
        context: null,
      };
      expect(stripAnsi(formatStatusBar(stats))).toContain('-500 tok');
    });

    it('formats tokens >= 1000 with K suffix (e.g. 200000 → 200K)', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 0, tokensIn: 0,
        context: { inputTokens: 0, cacheCreation: 0, cacheRead: 0,
          model: 'claude-sonnet-4-6', windowSize: 200000 },
      };
      expect(stripAnsi(formatStatusBar(stats))).toContain('/200K');
    });

    it('formats tokens >= 1000000 with M suffix', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 1_500_000, tokensIn: 0,
        context: null,
      };
      expect(stripAnsi(formatStatusBar(stats))).toContain('-1.5M tok');
    });

    it('tokensSaved is formatted with K/M suffix in the ⚡ section', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 60000, tokensIn: 0, context: null,
      };
      expect(stripAnsi(formatStatusBar(stats))).toContain('-60K tok');
    });

    it('calls count is rendered correctly in the · calls section', () => {
      const stats: SessionStats = {
        calls: 42, tokensSaved: 0, tokensIn: 0, context: null,
      };
      expect(stripAnsi(formatStatusBar(stats))).toContain('42 calls');
    });
  });

  describe('gradient coloring within formatStatusBar', () => {
    it('filled blocks in the green zone (0–49%) are green', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 0, tokensIn: 0,
        context: { inputTokens: 20000, cacheCreation: 0, cacheRead: 0,
          model: 'claude-sonnet-4-6', windowSize: 200000 },
      };
      // 10% fill — block at position 0 should be green
      expect(formatStatusBar(stats)).toContain('\x1b[32m\u2588');
    });

    it('filled blocks in the yellow zone (50–79%) are yellow', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 0, tokensIn: 0,
        context: { inputTokens: 130000, cacheCreation: 0, cacheRead: 0,
          model: 'claude-sonnet-4-6', windowSize: 200000 },
      };
      // 65% fill — 7 blocks, block 5 is in yellow zone
      expect(formatStatusBar(stats)).toContain('\x1b[33m\u2588');
    });

    it('filled blocks in the red zone (80–100%) are red', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 0, tokensIn: 0,
        context: { inputTokens: 190000, cacheCreation: 0, cacheRead: 0,
          model: 'claude-sonnet-4-6', windowSize: 200000 },
      };
      // 95% fill — 10 blocks, last 2 are in red zone (positions 8-9 = 80-90%)
      expect(formatStatusBar(stats)).toContain('\x1b[31m\u2588');
    });

    it('unfilled blocks are always dim gray regardless of zone', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 0, tokensIn: 0,
        context: { inputTokens: 10000, cacheCreation: 0, cacheRead: 0,
          model: 'claude-sonnet-4-6', windowSize: 200000 },
      };
      expect(formatStatusBar(stats)).toContain('\x1b[90m\u2591');
    });
  });

  describe('edge cases', () => {
    it('handles zero calls correctly', () => {
      const stats: SessionStats = { calls: 0, tokensSaved: 0, tokensIn: 0, context: null };
      expect(stripAnsi(formatStatusBar(stats))).toContain('0 calls');
    });

    it('handles zero tokensSaved correctly', () => {
      const stats: SessionStats = { calls: 0, tokensSaved: 0, tokensIn: 0, context: null };
      expect(stripAnsi(formatStatusBar(stats))).toContain('-0 tok');
    });

    it('handles windowSize of 0 without throwing (divide-by-zero guard)', () => {
      const stats: SessionStats = {
        calls: 0, tokensSaved: 0, tokensIn: 0,
        context: { inputTokens: 100, cacheCreation: 0, cacheRead: 0,
          model: 'claude-sonnet-4-6', windowSize: 0 },
      };
      expect(() => formatStatusBar(stats)).not.toThrow();
    });

    it('handles very large token counts gracefully', () => {
      const stats: SessionStats = {
        calls: 999, tokensSaved: 5_000_000, tokensIn: 10_000_000,
        context: { inputTokens: 900000, cacheCreation: 0, cacheRead: 0,
          model: 'claude-opus-4-7', windowSize: 1_000_000 },
      };
      expect(() => formatStatusBar(stats)).not.toThrow();
      expect(stripAnsi(formatStatusBar(stats))).toContain('5.0M');
    });

    it('handles partial fills where fractional blocks round to nearest integer', () => {
      // 33% fill — rounds to 3 filled blocks
      const stats: SessionStats = {
        calls: 0, tokensSaved: 0, tokensIn: 0,
        context: { inputTokens: 66000, cacheCreation: 0, cacheRead: 0,
          model: 'claude-sonnet-4-6', windowSize: 200000 },
      };
      const plain = stripAnsi(formatStatusBar(stats));
      expect(plain.match(/█/g)?.length).toBe(3);
    });
  });
});

describe('shortModelName', () => {
  describe('known model families', () => {
    it('returns "sonnet" for claude-sonnet-4-6', () => {
      expect(shortModelName('claude-sonnet-4-6')).toBe('sonnet');
    });

    it('returns "opus" for claude-opus-4-7', () => {
      expect(shortModelName('claude-opus-4-7')).toBe('opus');
    });

    it('returns "haiku" for claude-haiku-4-5', () => {
      expect(shortModelName('claude-haiku-4-5')).toBe('haiku');
    });

    it('returns "sonnet" for any string containing "sonnet" regardless of version', () => {
      expect(shortModelName('claude-sonnet-99')).toBe('sonnet');
    });
  });

  describe('unknown models', () => {
    it('returns "unknown" for an empty string', () => {
      expect(shortModelName('')).toBe('unknown');
    });

    it('returns "unknown" for an unrecognised model ID', () => {
      expect(shortModelName('gpt-4o')).toBe('unknown');
    });
  });
});

describe('formatStatusBar — model display', () => {
  it('shows short model name when context is present', () => {
    const stats: SessionStats = {
      calls: 0, tokensSaved: 0, tokensIn: 0,
      context: { inputTokens: 0, cacheCreation: 0, cacheRead: 0,
        model: 'claude-opus-4-7', windowSize: 1_000_000 },
    };
    expect(stripAnsi(formatStatusBar(stats))).toContain('opus');
  });

  it('shows "unknown" when context is null', () => {
    const stats: SessionStats = { calls: 0, tokensSaved: 0, tokensIn: 0, context: null };
    expect(stripAnsi(formatStatusBar(stats))).toContain('unknown');
  });

  it('output contains model name between bar and compression stats', () => {
    const stats: SessionStats = {
      calls: 3, tokensSaved: 1000, tokensIn: 5000,
      context: { inputTokens: 50000, cacheCreation: 0, cacheRead: 0,
        model: 'claude-haiku-4-5', windowSize: 200000 },
    };
    const plain = stripAnsi(formatStatusBar(stats));
    const barEnd = plain.indexOf(']');
    const statsStart = plain.indexOf('⚡');
    const modelPos = plain.indexOf('haiku');
    expect(modelPos).toBeGreaterThan(barEnd);
    expect(modelPos).toBeLessThan(statsStart);
  });
});

const ZERO_STATS: SessionStats = { calls: 0, tokensSaved: 0, tokensIn: 0, context: null };

describe('formatStatusBar — compression percentage', () => {
  describe('percentage shown between tok and calls', () => {
    it('shows rounded percentage between savings and call count when tokensIn > 0', () => {
      const stats: SessionStats = { calls: 10, tokensSaved: 500, tokensIn: 1000, context: null };
      const plain = stripAnsi(formatStatusBar(stats));
      // 500/1000 = 50%
      expect(plain).toContain('50%');
      expect(plain).toContain('10 calls');
      expect(plain).toContain('-500 tok');
    });

    it('percentage appears after "tok" and before "calls" in the output', () => {
      const stats: SessionStats = { calls: 5, tokensSaved: 300, tokensIn: 1000, context: null };
      const plain = stripAnsi(formatStatusBar(stats));
      const tokIdx = plain.indexOf('tok');
      const pctIdx = plain.indexOf('30%');
      const callsIdx = plain.indexOf('calls');
      expect(pctIdx).toBeGreaterThan(tokIdx);
      expect(pctIdx).toBeLessThan(callsIdx);
    });

    it('rounds to nearest integer (e.g. 66.7% → 67%)', () => {
      // 2/3 = 66.666...% → 67%
      const stats: SessionStats = { calls: 1, tokensSaved: 2, tokensIn: 3, context: null };
      const plain = stripAnsi(formatStatusBar(stats));
      expect(plain).toContain('67%');
      expect(plain).not.toContain('66%');
    });
  });

  describe('omit when no data', () => {
    it('omits percentage section when tokensIn is 0', () => {
      const plain = stripAnsi(formatStatusBar(ZERO_STATS));
      // Should not contain a lone "%" that isn't the context bar percentage
      // The context bar uses "%" too, so check the compression section specifically
      // Pattern: "tok · <N> calls" with no extra "%" between tok and calls
      expect(plain).toMatch(/tok · \d+ calls/);
    });

    it('output without tokensIn is identical to previous format (no regression)', () => {
      const withZero = stripAnsi(formatStatusBar(ZERO_STATS));
      // Verify no stray percentage injected between tok and calls
      expect(withZero).not.toMatch(/tok · \d+% · \d+ calls/);
      expect(withZero).toMatch(/tok · 0 calls/);
    });
  });
});

describe('formatStatusBar — git branch display', () => {
  const planUsage = {
    fiveHour: { utilization: 10, resetsAt: '' },
    sevenDay: { utilization: 20, resetsAt: '' },
  };

  describe('branch appended at far right', () => {
    it('appends " | <branch>" at the end when branch is provided', () => {
      const plain = stripAnsi(formatStatusBar(ZERO_STATS, null, 'feat/my-branch'));
      expect(plain).toMatch(/\| feat\/my-branch$/);
    });

    it('branch appears after plan usage when planUsage is present', () => {
      const plain = stripAnsi(formatStatusBar(ZERO_STATS, planUsage, 'main'));
      const planIdx = plain.indexOf('7d [');
      const branchIdx = plain.lastIndexOf('| main');
      expect(branchIdx).toBeGreaterThan(planIdx);
      expect(plain).toMatch(/\| main$/);
    });

    it('branch appears at the end even when planUsage is null', () => {
      const plain = stripAnsi(formatStatusBar(ZERO_STATS, null, 'fix/bug-123'));
      expect(plain).toMatch(/\| fix\/bug-123$/);
      expect(plain).not.toContain('5h');
    });
  });

  describe('omit when branch unavailable', () => {
    it('does not append branch section when branch is null', () => {
      const plain = stripAnsi(formatStatusBar(ZERO_STATS, null, null));
      expect(plain).not.toMatch(/\| [a-z]/);
    });

    it('does not append branch section when branch is an empty string', () => {
      const plain = stripAnsi(formatStatusBar(ZERO_STATS, null, ''));
      // empty string is falsy — branch section should be omitted
      const withoutBranch = stripAnsi(formatStatusBar(ZERO_STATS, null));
      expect(plain).toBe(withoutBranch);
    });

    it('output without branch is identical to current behaviour (no regression)', () => {
      const withUndefined = stripAnsi(formatStatusBar(ZERO_STATS, planUsage));
      const withNull = stripAnsi(formatStatusBar(ZERO_STATS, planUsage, null));
      expect(withNull).toBe(withUndefined);
    });
  });
});
