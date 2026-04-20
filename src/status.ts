import type { SessionStats } from './session.js';
import { fmtTokens } from './context.js';
import type { PlanUsage } from './usage.js';

export type { SessionStats };

export function shortModelName(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  return 'unknown';
}

export function formatBar(filledCount: number, totalWidth: number): string {
  let result = '';
  for (let i = 0; i < totalWidth; i++) {
    const pos = i / totalWidth;
    if (i < filledCount) {
      if (pos < 0.5) result += '\x1b[32m\u2588';      // green filled
      else if (pos < 0.8) result += '\x1b[33m\u2588'; // yellow filled
      else result += '\x1b[31m\u2588';                 // red filled
    } else {
      result += '\x1b[90m\u2591';                      // dim gray unfilled
    }
  }
  result += '\x1b[0m';
  return result;
}

export function formatStatusBar(stats: SessionStats, planUsage?: PlanUsage | null, branch?: string | null): string {
  const BAR_WIDTH = 10;

  let filledCount = 0;
  let pct = 0;
  let usedStr = '0';
  let windowStr = '200K';
  let model = 'unknown';

  if (stats.context) {
    const { inputTokens, cacheCreation, cacheRead, windowSize, model: m } = stats.context;
    const total = inputTokens + cacheCreation + cacheRead;
    pct = windowSize > 0 ? Math.min(100, Math.round((total / windowSize) * 100)) : 0;
    filledCount = Math.round((pct / 100) * BAR_WIDTH);
    usedStr = fmtTokens(total);
    windowStr = fmtTokens(windowSize);
    model = shortModelName(m);
  }

  const bar = formatBar(filledCount, BAR_WIDTH);
  const pctStr = pct.toString().padStart(3);
  const savedStr = fmtTokens(stats.tokensSaved);
  let out = `[${bar}${pctStr}% | ${usedStr}/${windowStr}] ${model} · \u26a1 -${savedStr} tok \u00b7 ${stats.calls} calls`;

  if (planUsage) {
    out += ` | ${formatPlanUsage(planUsage)}`;
  }

  if (branch) {
    out += ` | ${branch}`;
  }

  return out;
}

export function formatPlanUsage(planUsage: PlanUsage): string {
  const fivePct = Math.round(Math.min(100, planUsage.fiveHour.utilization));
  const sevenPct = Math.round(Math.min(100, planUsage.sevenDay.utilization));
  const fiveFilled = Math.round((fivePct / 100) * 10);
  const sevenFilled = Math.round((sevenPct / 100) * 10);
  return `5h [${formatBar(fiveFilled, 10)}${fivePct.toString().padStart(3)}%] 7d [${formatBar(sevenFilled, 10)}${sevenPct.toString().padStart(3)}%]`;
}
