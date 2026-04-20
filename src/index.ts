#!/usr/bin/env node
import { execSync } from 'child_process';
import { main as runPostHook } from './hooks/post-tool-use.js';
import { main as runPreHook } from './hooks/pre-tool-use.js';
import { runServer } from './server/index.js';
import { install, uninstall, check } from './install.js';
import { main as runTracker } from './tracker.js';
import { readLatestSession, readSession, aggregateSession } from './session.js';
import { formatStatusBar } from './status.js';
import { fetchPlanUsage } from './usage.js';

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case '--hook':
    await runPostHook();
    break;
  case '--pre-hook':
    await runPreHook();
    break;
  case '--track':
    await runTracker();
    break;
  case '--status': {
    // Read live JSON that Claude Code sends to statusLine commands
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');

    let live: Record<string, unknown> = {};
    try { live = JSON.parse(raw) as Record<string, unknown>; } catch { /* no stdin */ }

    // Get compression stats from session JSONL
    const sessionId = live.session_id as string | undefined;
    const sessionEvents = sessionId ? readSession(sessionId) : [];
    const events = sessionEvents.length > 0 ? sessionEvents : readLatestSession();
    const compression = aggregateSession(events);

    // Build SessionStats: use live context window data if available
    const ctxWin = live.context_window as Record<string, unknown> | undefined;
    const usage = ctxWin?.current_usage as Record<string, unknown> | null | undefined;
    const modelData = live.model as Record<string, unknown> | undefined;

    const liveStats = {
      calls: compression.calls,
      tokensSaved: compression.tokensSaved,
      tokensIn: compression.tokensIn,
      context: usage
        ? {
            inputTokens: (usage.input_tokens as number) ?? 0,
            cacheCreation: (usage.cache_creation_input_tokens as number) ?? 0,
            cacheRead: (usage.cache_read_input_tokens as number) ?? 0,
            model: (modelData?.id as string) ?? '',
            windowSize: (ctxWin?.context_window_size as number) ?? 200_000,
          }
        : compression.context,
    };

    // Build PlanUsage: prefer live rate_limits, fall back to API fetch
    const rateLimits = live.rate_limits as Record<string, unknown> | undefined;
    const fiveHour = rateLimits?.five_hour as Record<string, unknown> | undefined;
    const sevenDay = rateLimits?.seven_day as Record<string, unknown> | undefined;
    const planUsage =
      fiveHour && sevenDay
        ? {
            fiveHour: { utilization: (fiveHour.used_percentage as number) ?? 0, resetsAt: '' },
            sevenDay: { utilization: (sevenDay.used_percentage as number) ?? 0, resetsAt: '' },
          }
        : await fetchPlanUsage();

    let branch: string | null = null;
    try {
      branch = execSync('git branch --show-current', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    } catch { /* not a git repo or git unavailable */ }

    process.stdout.write(formatStatusBar(liveStats, planUsage, branch));
    break;
  }
  case '--server':
    await runServer();
    break;
  case 'install':
    install();
    break;
  case 'uninstall':
    uninstall();
    break;
  case 'check':
    check();
    break;
  default:
    console.log('compressmcp — lossless JSON compression for Claude Code');
    console.log('');
    console.log('Usage:');
    console.log('  compressmcp install    — add hooks and MCP server to ~/.claude/settings.json');
    console.log('  compressmcp uninstall  — remove all hooks and MCP server');
    console.log('  compressmcp check      — show installation status');
    console.log('  compressmcp --hook     — run as PostToolUse hook (stdin → stdout)');
    console.log('  compressmcp --pre-hook — run as PreToolUse hook (stdin → stdout)');
    console.log('  compressmcp --track    — run as PostToolUse tracker hook (stdin → silent)');
    console.log('  compressmcp --status   — print status bar string to stdout');
    console.log('  compressmcp --server   — run as MCP server (stdio transport)');
    break;
}
