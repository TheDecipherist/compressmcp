import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const HOOK_MATCHER = 'mcp__.*';

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
    PreToolUse?: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
  };
  mcpServers?: Record<string, { command: string; args: string[] }>;
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

  // PostToolUse hook
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  const postExists = settings.hooks.PostToolUse.some(h => h.matcher === HOOK_MATCHER);
  if (!postExists) {
    settings.hooks.PostToolUse.push({
      matcher: HOOK_MATCHER,
      hooks: [{ type: 'command', command: 'compressmcp --hook' }],
    });
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

  saveSettings(settings);
  console.log('compressmcp installed successfully.');
  console.log(`  PostToolUse hook: mcp__.* → compressmcp --hook`);
  console.log(`  PreToolUse hook:  Bash → compressmcp --pre-hook`);
  console.log(`  MCP server:       compressmcp --server`);
}

export function uninstall(): void {
  const settings = loadSettings();

  if (settings.hooks?.PostToolUse) {
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(h => h.matcher !== HOOK_MATCHER);
  }
  if (settings.hooks?.PreToolUse) {
    settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(h => h.matcher !== 'Bash');
  }
  if (settings.mcpServers?.['compressmcp']) {
    delete settings.mcpServers['compressmcp'];
  }

  saveSettings(settings);
  console.log('compressmcp uninstalled.');
}

export function check(): void {
  const settings = loadSettings();
  const postHook = settings.hooks?.PostToolUse?.some(h => h.matcher === HOOK_MATCHER);
  const preHook = settings.hooks?.PreToolUse?.some(h => h.matcher === 'Bash');
  const server = !!settings.mcpServers?.['compressmcp'];

  console.log('compressmcp status:');
  console.log(`  PostToolUse hook: ${postHook ? '✓ installed' : '✗ not installed'}`);
  console.log(`  PreToolUse hook:  ${preHook ? '✓ installed' : '✗ not installed'}`);
  console.log(`  MCP server:       ${server ? '✓ registered' : '✗ not registered'}`);

  if (!postHook || !preHook || !server) {
    console.log('\nRun: compressmcp install');
    process.exit(1);
  }
}
