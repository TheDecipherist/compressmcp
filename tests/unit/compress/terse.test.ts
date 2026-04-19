import { describe, it, expect } from 'vitest';
import { compress, decompress } from '../../../src/compress/terse.js';

const sampleRecord = { firstName: 'Alice', lastName: 'Smith', emailAddress: 'alice@example.com', createdAt: '2026-01-01' };
const sampleArray = Array.from({ length: 100 }, (_, i) => ({
  transactionId: `tx_${i}`,
  transactionType: i % 2 === 0 ? 'purchase' : 'refund',
  transactionAmount: 99.99,
  status: i === 50 ? 'ERROR' : 'ok',
  createdAt: '2026-04-19',
}));

describe('TerseJSON compression', () => {
  describe('compress', () => {
    it('should shorten keys longer than minKeyLength', () => {
      const result = compress(JSON.stringify(sampleRecord));
      const keys = Object.keys(result.compressed as object);
      expect(keys.some(k => k.length < 'firstName'.length)).toBe(true);
    });

    it('should not shorten keys at or below minKeyLength', () => {
      const result = compress(JSON.stringify({ id: 1, ok: true }));
      expect(result.dictionary).toEqual({});
    });

    it('should assign unique aliases to each distinct key', () => {
      const result = compress(JSON.stringify(sampleArray));
      const aliases = Object.keys(result.dictionary);
      const unique = new Set(aliases);
      expect(unique.size).toBe(aliases.length);
    });

    it('should use the same alias for the same key across all records', () => {
      const result = compress(JSON.stringify(sampleArray));
      const firstItem = (result.compressed as object[])[0];
      const lastItem = (result.compressed as object[])[sampleArray.length - 1];
      expect(Object.keys(firstItem)).toEqual(Object.keys(lastItem));
    });

    it('should preserve all values exactly as-is', () => {
      const result = compress(JSON.stringify(sampleRecord));
      const values = Object.values(result.compressed as object);
      expect(values).toContain('Alice');
      expect(values).toContain('alice@example.com');
    });

    it('should reduce total character count for long field names', () => {
      const original = JSON.stringify(sampleArray);
      const result = compress(original);
      const compressedStr = JSON.stringify(result.compressed);
      expect(compressedStr.length).toBeLessThan(original.length);
    });
  });

  describe('decompress', () => {
    it('should restore original keys from aliases using dictionary', () => {
      const result = compress(JSON.stringify(sampleRecord));
      const restored = decompress(result.compressed, result.dictionary) as typeof sampleRecord;
      expect(restored.firstName).toBe('Alice');
      expect(restored.emailAddress).toBe('alice@example.com');
    });

    it('should produce output structurally identical to input', () => {
      const result = compress(JSON.stringify(sampleRecord));
      const restored = decompress(result.compressed, result.dictionary);
      expect(restored).toEqual(sampleRecord);
    });

    it('should pass through unknown aliases unchanged (no dictionary entry)', () => {
      const result = decompress({ z: 'value' }, {}) as Record<string, unknown>;
      expect(result.z).toBe('value');
    });
  });

  describe('compress → decompress round-trip', () => {
    it('should equal original for a flat object', () => {
      const original = sampleRecord;
      const result = compress(JSON.stringify(original));
      expect(decompress(result.compressed, result.dictionary)).toEqual(original);
    });

    it('should equal original for an array of objects', () => {
      const result = compress(JSON.stringify(sampleArray));
      expect(decompress(result.compressed, result.dictionary)).toEqual(sampleArray);
    });

    it('should equal original for deeply nested JSON', () => {
      const nested = { level1: { level2: { level3: { data: [1, 2, 3], message: 'deep value' } } } };
      const result = compress(JSON.stringify(nested));
      expect(decompress(result.compressed, result.dictionary)).toEqual(nested);
    });

    it('should equal original for mixed types', () => {
      const mixed = { count: 42, ratio: 3.14159, active: true, tag: null, items: [1, 'two', false] };
      const result = compress(JSON.stringify(mixed));
      expect(decompress(result.compressed, result.dictionary)).toEqual(mixed);
    });
  });
});
