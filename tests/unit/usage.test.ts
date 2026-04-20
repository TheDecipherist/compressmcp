import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPlanUsage, readAccessToken } from '../../src/usage';
import { formatPlanUsage, formatStatusBar } from '../../src/status';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

function tempCredentials(data: unknown): string {
  const dir = join(tmpdir(), 'compressmcp-creds-' + randomUUID());
  mkdirSync(dir, { recursive: true });
  const path = join(dir, '.credentials.json');
  writeFileSync(path, JSON.stringify(data), 'utf8');
  return path;
}

describe('fetchPlanUsage', () => {
  describe('credentials missing', () => {
    it('returns null when credentials file does not exist', async () => {
      const result = await fetchPlanUsage('/nonexistent/path/.credentials.json');
      expect(result).toBeNull();
    });

    it('returns null when claudeAiOauth field is absent', async () => {
      const path = tempCredentials({ other: 'field' });
      const result = await fetchPlanUsage(path);
      expect(result).toBeNull();
    });

    it('returns null when accessToken is empty string', async () => {
      const path = tempCredentials({ claudeAiOauth: { accessToken: '' } });
      const result = await fetchPlanUsage(path);
      expect(result).toBeNull();
    });
  });

  describe('fetch errors', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns null when API returns non-2xx status', async () => {
      const path = tempCredentials({ claudeAiOauth: { accessToken: 'tok' } });
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response);
      expect(await fetchPlanUsage(path)).toBeNull();
    });

    it('returns null when network fetch throws', async () => {
      const path = tempCredentials({ claudeAiOauth: { accessToken: 'tok' } });
      vi.mocked(fetch).mockRejectedValue(new Error('network error'));
      expect(await fetchPlanUsage(path)).toBeNull();
    });

    it('returns null when response body is invalid JSON', async () => {
      const path = tempCredentials({ claudeAiOauth: { accessToken: 'tok' } });
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('bad json')),
      } as unknown as Response);
      expect(await fetchPlanUsage(path)).toBeNull();
    });
  });

  describe('successful response', () => {
    beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
    afterEach(() => vi.unstubAllGlobals());

    const mockResponse = {
      five_hour: { utilization: 37.0, resets_at: '2026-04-19T05:00:00Z' },
      seven_day: { utilization: 26.0, resets_at: '2026-04-26T14:00:00Z' },
    };

    function setupFetch(): string {
      const path = tempCredentials({ claudeAiOauth: { accessToken: 'test-token' } });
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as unknown as Response);
      return path;
    }

    it('returns fiveHour.utilization from five_hour.utilization', async () => {
      const result = await fetchPlanUsage(setupFetch());
      expect(result?.fiveHour.utilization).toBe(37.0);
    });

    it('returns sevenDay.utilization from seven_day.utilization', async () => {
      const result = await fetchPlanUsage(setupFetch());
      expect(result?.sevenDay.utilization).toBe(26.0);
    });

    it('returns fiveHour.resetsAt from five_hour.resets_at', async () => {
      const result = await fetchPlanUsage(setupFetch());
      expect(result?.fiveHour.resetsAt).toBe('2026-04-19T05:00:00Z');
    });

    it('returns sevenDay.resetsAt from seven_day.resets_at', async () => {
      const result = await fetchPlanUsage(setupFetch());
      expect(result?.sevenDay.resetsAt).toBe('2026-04-26T14:00:00Z');
    });

    it('sends Authorization: Bearer <token> header', async () => {
      const path = setupFetch();
      await fetchPlanUsage(path);
      const [, opts] = vi.mocked(fetch).mock.calls[0];
      expect((opts as RequestInit).headers).toMatchObject({
        Authorization: 'Bearer test-token',
      });
    });

    it('sends anthropic-beta: oauth-2025-04-20 header', async () => {
      const path = setupFetch();
      await fetchPlanUsage(path);
      const [, opts] = vi.mocked(fetch).mock.calls[0];
      expect((opts as RequestInit).headers).toMatchObject({
        'anthropic-beta': 'oauth-2025-04-20',
      });
    });
  });

  describe('null fields in response', () => {
    beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
    afterEach(() => vi.unstubAllGlobals());

    it('returns null when five_hour is null in response', async () => {
      const path = tempCredentials({ claudeAiOauth: { accessToken: 'tok' } });
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ five_hour: null, seven_day: { utilization: 10, resets_at: '' } }),
      } as unknown as Response);
      expect(await fetchPlanUsage(path)).toBeNull();
    });

    it('handles missing seven_day field gracefully', async () => {
      const path = tempCredentials({ claudeAiOauth: { accessToken: 'tok' } });
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ five_hour: { utilization: 10, resets_at: '' } }),
      } as unknown as Response);
      expect(await fetchPlanUsage(path)).toBeNull();
    });
  });
});

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('formatPlanUsage', () => {
  const usage = {
    fiveHour: { utilization: 37.0, resetsAt: '2026-04-19T05:00:00Z' },
    sevenDay: { utilization: 26.0, resetsAt: '2026-04-26T14:00:00Z' },
  };

  describe('null input', () => {
    it('returns empty string when planUsage is null', () => {
      const stats = { calls: 0, tokensSaved: 0, tokensIn: 0, context: null };
      const result = formatStatusBar(stats, null);
      expect(result).not.toContain('5h');
    });
  });

  describe('output format', () => {
    it('output matches: "5h [<bar> <pct>%] 7d [<bar> <pct>%]"', () => {
      const plain = stripAnsi(formatPlanUsage(usage));
      expect(plain).toMatch(/^5h \[.+\s+\d+%\] 7d \[.+\s+\d+%\]$/);
    });

    it('bars are exactly 4 characters wide', () => {
      const plain = stripAnsi(formatPlanUsage(usage));
      const fiveMatch = plain.match(/5h \[([█░]+)/);
      const sevenMatch = plain.match(/7d \[([█░]+)/);
      expect(fiveMatch?.[1]).toHaveLength(4);
      expect(sevenMatch?.[1]).toHaveLength(4);
    });

    it('percentage is rounded to nearest integer', () => {
      const u = { fiveHour: { utilization: 37.6, resetsAt: '' }, sevenDay: { utilization: 26.4, resetsAt: '' } };
      const plain = stripAnsi(formatPlanUsage(u));
      expect(plain).toContain('38%');
      expect(plain).toContain('26%');
    });
  });

  describe('gradient coloring', () => {
    it('blocks at 0-49% position are green', () => {
      // 25% utilization — 1 block filled, position 0 = 0% of bar (green zone)
      const u = { fiveHour: { utilization: 25, resetsAt: '' }, sevenDay: { utilization: 0, resetsAt: '' } };
      expect(formatPlanUsage(u)).toContain('\x1b[32m\u2588');
    });

    it('blocks at 50-79% position are yellow', () => {
      // 75% utilization — 3 blocks filled; position 2 = 50% of bar (yellow zone)
      const u = { fiveHour: { utilization: 75, resetsAt: '' }, sevenDay: { utilization: 0, resetsAt: '' } };
      expect(formatPlanUsage(u)).toContain('\x1b[33m\u2588');
    });

    it('with 4-char bars the highest position (75%) is in yellow zone, not red', () => {
      // With BAR_WIDTH=4, position 3 = 75% → yellow; no position reaches 80% (red)
      const u = { fiveHour: { utilization: 100, resetsAt: '' }, sevenDay: { utilization: 0, resetsAt: '' } };
      expect(formatPlanUsage(u)).not.toContain('\x1b[31m\u2588');
    });

    it('unfilled blocks are dim gray', () => {
      const u = { fiveHour: { utilization: 0, resetsAt: '' }, sevenDay: { utilization: 0, resetsAt: '' } };
      expect(formatPlanUsage(u)).toContain('\x1b[90m\u2591');
    });
  });

  describe('edge cases', () => {
    it('0% utilization produces all-gray bar', () => {
      const u = { fiveHour: { utilization: 0, resetsAt: '' }, sevenDay: { utilization: 0, resetsAt: '' } };
      const raw = formatPlanUsage(u);
      expect(raw).not.toContain('\x1b[32m\u2588');
      expect(raw).not.toContain('\x1b[33m\u2588');
    });

    it('100% utilization fills all 8 blocks (4 per bar × 2 bars)', () => {
      const u = { fiveHour: { utilization: 100, resetsAt: '' }, sevenDay: { utilization: 100, resetsAt: '' } };
      const plain = stripAnsi(formatPlanUsage(u));
      expect([...plain.matchAll(/█/g)].length).toBe(8); // 4 per bar × 2 bars
    });

    it('utilization > 100 is capped at 100', () => {
      const u = { fiveHour: { utilization: 150, resetsAt: '' }, sevenDay: { utilization: 200, resetsAt: '' } };
      const plain = stripAnsi(formatPlanUsage(u));
      expect(plain).toContain('100%');
      expect(plain).not.toContain('150%');
    });
  });
});
