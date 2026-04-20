import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { getContextWindowSize } from './context.js';

export type CompressEvent = {
  type: 'compress';
  tokensSaved: number;
  tokensIn: number;
  ts: number;
};

export type ContextEvent = {
  type: 'context';
  inputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  model: string;
  ts: number;
};

export type SessionEvent = CompressEvent | ContextEvent;

export interface SessionStats {
  calls: number;
  tokensSaved: number;
  tokensIn: number;
  context: {
    inputTokens: number;
    cacheCreation: number;
    cacheRead: number;
    model: string;
    windowSize: number;
  } | null;
}

export const DEFAULT_SESSION_DIR = join(homedir(), '.compressmcp');

export interface SessionMarker {
  sessionId: string;
  startTs: number;
  lastTranscriptSize: number;
}

const SESSION_MARKER_FILE = 'session-current.json';

export function readSessionMarker(baseDir?: string): SessionMarker | null {
  const dir = baseDir ?? DEFAULT_SESSION_DIR;
  const filePath = join(dir, SESSION_MARKER_FILE);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as SessionMarker;
  } catch {
    return null;
  }
}

export function writeSessionMarker(marker: SessionMarker, baseDir?: string): void {
  const dir = baseDir ?? DEFAULT_SESSION_DIR;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, SESSION_MARKER_FILE), JSON.stringify(marker), 'utf8');
}

export function resetSessionMarker(sessionId: string, startTs: number, lastTranscriptSize: number, baseDir?: string): void {
  writeSessionMarker({ sessionId, startTs, lastTranscriptSize }, baseDir);
}

export function filterSessionEvents(events: SessionEvent[], startTs: number): SessionEvent[] {
  return events.filter(e => e.ts >= startTs);
}

export function appendEvent(sessionId: string, event: SessionEvent, baseDir?: string): void {
  const dir = baseDir ?? DEFAULT_SESSION_DIR;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filePath = join(dir, `${sessionId}.jsonl`);
  appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');
}

export function aggregateSession(events: SessionEvent[]): SessionStats {
  let calls = 0;
  let tokensSaved = 0;
  let tokensIn = 0;
  let latestContext: ContextEvent | null = null;

  for (const event of events) {
    if (event.type === 'compress') {
      calls++;
      tokensSaved += event.tokensSaved;
      tokensIn += event.tokensIn;
    } else if (event.type === 'context') {
      if (!latestContext || event.ts > latestContext.ts) {
        latestContext = event;
      }
    }
  }

  return {
    calls,
    tokensSaved,
    tokensIn,
    context: latestContext
      ? {
          inputTokens: latestContext.inputTokens,
          cacheCreation: latestContext.cacheCreation,
          cacheRead: latestContext.cacheRead,
          model: latestContext.model,
          windowSize: getContextWindowSize(latestContext.model),
        }
      : null,
  };
}

export function readSession(sessionId: string, baseDir?: string): SessionEvent[] {
  const dir = baseDir ?? DEFAULT_SESSION_DIR;
  const filePath = join(dir, `${sessionId}.jsonl`);
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf8');
  const events: SessionEvent[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line) as SessionEvent); } catch { }
  }
  return events;
}

export function readLatestSession(baseDir?: string): SessionEvent[] {
  const dir = baseDir ?? DEFAULT_SESSION_DIR;
  if (!existsSync(dir)) return [];

  let files: string[];
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  } catch {
    return [];
  }

  if (files.length === 0) return [];

  const sorted = files
    .map(f => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const content = readFileSync(join(dir, sorted[0].name), 'utf8');
  const events: SessionEvent[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as SessionEvent);
    } catch {
      // skip malformed lines
    }
  }

  return events;
}
