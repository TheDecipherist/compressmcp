import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface PlanUsageWindow {
  utilization: number;
  resetsAt: string;
}

export interface PlanUsage {
  fiveHour: PlanUsageWindow;
  sevenDay: PlanUsageWindow;
}

const CREDENTIALS_PATH = join(homedir(), '.claude', '.credentials.json');
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

export function readAccessToken(credentialsPath?: string): string | null {
  const path = credentialsPath ?? CREDENTIALS_PATH;
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const oauth = data?.claudeAiOauth as Record<string, unknown> | undefined;
    const token = oauth?.accessToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export async function fetchPlanUsage(credentialsPath?: string): Promise<PlanUsage | null> {
  const token = readAccessToken(credentialsPath);
  if (!token) return null;

  try {
    const res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    const five = data.five_hour as { utilization: number; resets_at: string } | null | undefined;
    const seven = data.seven_day as { utilization: number; resets_at: string } | null | undefined;

    if (!five || !seven) return null;

    return {
      fiveHour: { utilization: five.utilization, resetsAt: five.resets_at },
      sevenDay: { utilization: seven.utilization, resetsAt: seven.resets_at },
    };
  } catch {
    return null;
  }
}
