import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const HOOK_MATCHER = 'mcp__.*';
const TRACK_MATCHER = '.*';

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
    PreToolUse?: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
  };
  mcpServers?: Record<string, { command: string; args: string[] }>;
  statusLine?: { type: string; command: string };
}

function loadSettings(): ClaudeSettings {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')) as ClaudeSettings;
  } catch {
    return {};
  }
}

function saveSettings(settings: ClaudeSettings): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

export function install(): void {
  const settings = loadSettings();
  if (!settings.hooks) settings.hooks = {};

  // PostToolUse hook — compression
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  const postExists = settings.hooks.PostToolUse.some(h => h.matcher === HOOK_MATCHER);
  if (!postExists) {
    settings.hooks.PostToolUse.push({
      matcher: HOOK_MATCHER,
      hooks: [{ type: 'command', command: 'compressmcp --hook' }],
    });
  }

  // PostToolUse hook — context tracker
  // Check for the command specifically: an existing .* entry (e.g. from another tool) won't
  // contain compressmcp --track, so we must not treat its presence as "already installed".
  const trackCommandExists = settings.hooks.PostToolUse.some(h =>
    h.hooks.some(hk => hk.command === 'compressmcp --track'),
  );
  if (!trackCommandExists) {
    const wildcardEntry = settings.hooks.PostToolUse.find(h => h.matcher === TRACK_MATCHER);
    if (wildcardEntry) {
      wildcardEntry.hooks.push({ type: 'command', command: 'compressmcp --track' });
    } else {
      settings.hooks.PostToolUse.push({
        matcher: TRACK_MATCHER,
        hooks: [{ type: 'command', command: 'compressmcp --track' }],
      });
    }
  }

  // PreToolUse hook
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  const preExists = settings.hooks.PreToolUse.some(h => h.matcher === 'Bash');
  if (!preExists) {
    settings.hooks.PreToolUse.push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'compressmcp --pre-hook' }],
    });
  }

  // MCP server
  if (!settings.mcpServers) settings.mcpServers = {};
  settings.mcpServers['compressmcp'] = {
    command: 'compressmcp',
    args: ['--server'],
  };

  // Status line
  settings.statusLine = { type: 'command', command: 'compressmcp --status' };

  saveSettings(settings);
  console.log('compressmcp installed successfully.');
  console.log(`  PostToolUse hook (compress): mcp__.* → compressmcp --hook`);
  console.log(`  PostToolUse hook (tracker):  .* → compressmcp --track`);
  console.log(`  PreToolUse hook:             Bash → compressmcp --pre-hook`);
  console.log(`  MCP server:                  compressmcp --server`);
  console.log(`  Status line:                 compressmcp --status`);
}

export function uninstall(): void {
  const settings = loadSettings();

  if (settings.hooks?.PostToolUse) {
    // Remove specific compressmcp commands from any entry that contains them;
    // never drop an entire entry that belongs to another tool.
    settings.hooks.PostToolUse = settings.hooks.PostToolUse
      .map(h => ({
        ...h,
        hooks: h.hooks.filter(
          hk => hk.command !== 'compressmcp --hook' && hk.command !== 'compressmcp --track',
        ),
      }))
      .filter(h => h.hooks.length > 0);
  }
  if (settings.hooks?.PreToolUse) {
    settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(h => h.matcher !== 'Bash');
  }
  if (settings.mcpServers?.['compressmcp']) {
    delete settings.mcpServers['compressmcp'];
  }
  if (settings.statusLine?.command === 'compressmcp --status') {
    delete settings.statusLine;
  }

  saveSettings(settings);
  console.log('compressmcp uninstalled.');
}

export function check(): void {
  const settings = loadSettings();
  const postHook = settings.hooks?.PostToolUse?.some(h =>
    h.hooks.some(hk => hk.command === 'compressmcp --hook'),
  );
  const trackHook = settings.hooks?.PostToolUse?.some(h =>
    h.hooks.some(hk => hk.command === 'compressmcp --track'),
  );
  const preHook = settings.hooks?.PreToolUse?.some(h => h.matcher === 'Bash');
  const server = !!settings.mcpServers?.['compressmcp'];
  const statusLine = settings.statusLine?.command === 'compressmcp --status';

  console.log('compressmcp status:');
  console.log(`  PostToolUse hook (compress): ${postHook ? '✓ installed' : '✗ not installed'}`);
  console.log(`  PostToolUse hook (tracker):  ${trackHook ? '✓ installed' : '✗ not installed'}`);
  console.log(`  PreToolUse hook:             ${preHook ? '✓ installed' : '✗ not installed'}`);
  console.log(`  MCP server:                  ${server ? '✓ registered' : '✗ not registered'}`);
  console.log(`  Status line:                 ${statusLine ? '✓ configured' : '✗ not configured'}`);

  if (!postHook || !trackHook || !preHook || !server || !statusLine) {
    console.log('\nRun: compressmcp install');
    process.exit(1);
  }
}
