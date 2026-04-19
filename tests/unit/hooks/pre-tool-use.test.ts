import { describe, it, expect } from 'vitest';
import { processPreHook, detectHttpCommand, type PreHookInput } from '../../../src/hooks/pre-tool-use.js';

function makeBashInput(command: string): PreHookInput {
  return {
    session_id: 'test-session',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    cwd: '/tmp',
  };
}

describe('PreToolUse hook', () => {
  describe('curl/wget detection', () => {
    it('should detect a plain curl command', () => {
      expect(detectHttpCommand('curl https://api.example.com/data')).toBe('https://api.example.com/data');
    });

    it('should detect curl with flags (curl -X POST -H ...)', () => {
      const cmd = 'curl -X POST -H "Content-Type: application/json" https://api.example.com/data';
      expect(detectHttpCommand(cmd)).toBe('https://api.example.com/data');
    });

    it('should detect wget', () => {
      expect(detectHttpCommand('wget https://files.example.com/data.json')).toBe('https://files.example.com/data.json');
    });

    it('should NOT intercept unrelated Bash commands', () => {
      expect(detectHttpCommand('ls -la /tmp')).toBeNull();
    });

    it('should NOT intercept git commands', () => {
      expect(detectHttpCommand('git push origin main')).toBeNull();
    });

    it('should NOT intercept npm commands', () => {
      expect(detectHttpCommand('npm install tersejson')).toBeNull();
    });
  });

  describe('Redirect output', () => {
    it('should output decision: block when curl is detected', () => {
      const input = makeBashInput('curl https://api.example.com/data');
      const result = processPreHook(input);
      expect(result?.hookSpecificOutput.decision).toBe('block');
    });

    it('should include a reason instructing Claude to use mcp__compressmcp__fetch', () => {
      const input = makeBashInput('curl https://api.example.com/data');
      const result = processPreHook(input);
      expect(result?.hookSpecificOutput.reason).toContain('mcp__compressmcp__fetch');
    });

    it('should include the original URL in the redirect reason', () => {
      const input = makeBashInput('curl https://api.example.com/data');
      const result = processPreHook(input);
      expect(result?.hookSpecificOutput.reason).toContain('https://api.example.com/data');
    });

    it('should output nothing when command is not curl/wget', () => {
      const input = makeBashInput('grep -r "TODO" src/');
      const result = processPreHook(input);
      expect(result).toBeNull();
    });
  });
});
