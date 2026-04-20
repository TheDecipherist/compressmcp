import { describe, it, expect } from 'vitest';
import { processHook, type HookInput } from '../../../src/hooks/post-tool-use.js';

function makeLargeJson(count = 200): string {
  return JSON.stringify(
    Array.from({ length: count }, (_, i) => ({
      transactionId: `tx_${i}`,
      transactionType: i % 2 === 0 ? 'purchase' : 'refund',
      transactionAmount: 99.99,
      createdAt: '2026-04-19',
    }))
  );
}

function makeHookInput(toolName: string, text: string): HookInput {
  return {
    session_id: 'test-session',
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    tool_input: {},
    tool_response: [{ type: 'text', text }],
    cwd: '/tmp',
  };
}

describe('PostToolUse hook', () => {
  describe('Hook protocol', () => {
    it('should read a valid HookInput from stdin', () => {
      const input = makeHookInput('mcp__db__query', makeLargeJson());
      const result = processHook(input);
      expect(result).not.toBeNull();
    });

    it('should write updatedMCPToolOutput to stdout when JSON is compressed', () => {
      const input = makeHookInput('mcp__db__query', makeLargeJson());
      const result = processHook(input);
      expect(result?.hookSpecificOutput.updatedMCPToolOutput).toBeDefined();
    });

    it('should write nothing to stdout when content is passed through', () => {
      const input = makeHookInput('mcp__db__query', 'plain text no JSON here');
      const result = processHook(input);
      expect(result).toBeNull();
    });

    it('should handle a tool response with multiple content blocks', () => {
      const input: HookInput = {
        session_id: 'test-session',
        hook_event_name: 'PostToolUse',
        tool_name: 'mcp__db__query',
        tool_input: {},
        tool_response: [
          { type: 'text', text: 'some small text' },
          { type: 'text', text: makeLargeJson() },
        ],
        cwd: '/tmp',
      };
      const result = processHook(input);
      expect(result?.hookSpecificOutput.updatedMCPToolOutput).toHaveLength(2);
      expect(result?.hookSpecificOutput.updatedMCPToolOutput?.[0].text).toBe('some small text');
      expect(result?.hookSpecificOutput.updatedMCPToolOutput?.[1].text).toContain('[compressmcp:');
    });

    it('should only compress text blocks, pass image blocks unchanged', () => {
      const input: HookInput = {
        session_id: 'test-session',
        hook_event_name: 'PostToolUse',
        tool_name: 'mcp__db__query',
        tool_input: {},
        tool_response: [
          { type: 'image' },
          { type: 'text', text: makeLargeJson() },
        ],
        cwd: '/tmp',
      };
      const result = processHook(input);
      expect(result?.hookSpecificOutput.updatedMCPToolOutput?.[0].type).toBe('image');
      expect(result?.hookSpecificOutput.updatedMCPToolOutput?.[1].text).toContain('[compressmcp:');
    });
  });

  describe('Tool matching', () => {
    it('should process mcp__ prefixed tool results', () => {
      const input = makeHookInput('mcp__github__search', makeLargeJson());
      const result = processHook(input);
      expect(result).not.toBeNull();
    });

    it('should process any mcp__ tool regardless of server name', () => {
      for (const toolName of ['mcp__supabase__query', 'mcp__mongo__find', 'mcp__slack__messages']) {
        const result = processHook(makeHookInput(toolName, makeLargeJson()));
        expect(result).not.toBeNull();
      }
    });
  });

  describe('Output format', () => {
    it('should include the stats header in the output', () => {
      const result = processHook(makeHookInput('mcp__db__query', makeLargeJson()));
      const text = result?.hookSpecificOutput.updatedMCPToolOutput?.[0].text ?? '';
      expect(text).toContain('[compressmcp:');
    });

    it('should include the Keys dictionary in the output', () => {
      const result = processHook(makeHookInput('mcp__db__query', makeLargeJson()));
      const text = result?.hookSpecificOutput.updatedMCPToolOutput?.[0].text ?? '';
      expect(text).toContain('Keys:');
    });

    it('should include the compressed JSON after the dictionary', () => {
      const result = processHook(makeHookInput('mcp__db__query', makeLargeJson()));
      const text = result?.hookSpecificOutput.updatedMCPToolOutput?.[0].text ?? '';
      const lines = text.split('\n');
      expect(lines).toHaveLength(3);
      expect(() => JSON.parse(lines[2])).not.toThrow();
    });

    it('should report accurate token reduction percentage', () => {
      const result = processHook(makeHookInput('mcp__db__query', makeLargeJson(200)));
      const text = result?.hookSpecificOutput.updatedMCPToolOutput?.[0].text ?? '';
      const match = text.match(/-(\d+)%/);
      expect(match).not.toBeNull();
      // Real Anthropic tokenizer: short values reduce savings vs ceil(length/4) estimate.
      // makeLargeJson has 4 long keys but very short values — real savings ~13%.
      expect(parseInt(match![1])).toBeGreaterThan(5);
    });
  });
});
