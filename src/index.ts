#!/usr/bin/env node
import { main as runPostHook } from './hooks/post-tool-use.js';
import { main as runPreHook } from './hooks/pre-tool-use.js';
import { runServer } from './server/index.js';
import { install, uninstall, check } from './install.js';

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case '--hook':
    await runPostHook();
    break;
  case '--pre-hook':
    await runPreHook();
    break;
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
    console.log('  compressmcp --server   — run as MCP server (stdio transport)');
    break;
}
