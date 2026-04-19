import { describe, it, expect } from 'vitest';
import { formatOutput } from '../../../src/compress/dictionary.js';
import { compress } from '../../../src/compress/terse.js';
import type { CompressResult } from '../../../src/compress/terse.js';

const sampleResult: CompressResult = {
  compressed: [{ a: 'tx_001', b: 'purchase', c: 99.99 }],
  dictionary: { a: 'transactionId', b: 'transactionType', c: 'amount' },
  originalTokens: 1000,
  compressedTokens: 80,
};

describe('Dictionary', () => {
  describe('build', () => {
    it('should create an entry for every abbreviated key', () => {
      expect(Object.keys(sampleResult.dictionary)).toHaveLength(3);
      expect(sampleResult.dictionary.a).toBe('transactionId');
    });

    it('should not create entries for keys below minKeyLength', () => {
      const result = compress(JSON.stringify({ id: 1, ok: true }));
      expect(result.dictionary).toEqual({});
    });

    it('should produce aliases in a consistent order (a, b, c...)', () => {
      const aliases = Object.keys(sampleResult.dictionary);
      expect(aliases[0]).toBe('a');
      expect(aliases[1]).toBe('b');
      expect(aliases[2]).toBe('c');
    });
  });

  describe('format', () => {
    it('should format as a human-readable inline header', () => {
      const output = formatOutput(sampleResult);
      expect(output).toContain('[compressmcp:');
    });

    it('should include the compressmcp stats line (N→M tokens, -X%)', () => {
      const output = formatOutput(sampleResult);
      expect(output).toContain('1,000→80 tokens');
      expect(output).toContain('-92%');
    });

    it('should include the Keys: mapping line', () => {
      const output = formatOutput(sampleResult);
      expect(output).toContain('Keys:');
      expect(output).toContain('transactionId');
    });

    it('should be followed by the compressed JSON', () => {
      const output = formatOutput(sampleResult);
      const lines = output.split('\n');
      expect(lines).toHaveLength(3);
      const lastLine = lines[2];
      expect(() => JSON.parse(lastLine)).not.toThrow();
    });
  });
});
