import { describe, it, expect } from 'vitest';
import { isValidJson, estimateTokens, shouldCompress } from '../../../src/compress/detect.js';

describe('detect', () => {
  describe('isValidJson', () => {
    it('should return true for a valid JSON object', () => {
      expect(isValidJson('{"name":"alice","age":30}')).toBe(true);
    });

    it('should return true for a valid JSON array', () => {
      expect(isValidJson('[{"id":1},{"id":2}]')).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(isValidJson('git push origin main')).toBe(false);
    });

    it('should return false for truncated JSON', () => {
      expect(isValidJson('{"name":"alice","ag')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidJson('')).toBe(false);
    });

    it('should return false for a JSON number (not object/array)', () => {
      expect(isValidJson('42')).toBe(false);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate token count as roughly length/4', () => {
      const text = 'a'.repeat(400);
      expect(estimateTokens(text)).toBe(100);
    });

    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });
  });

  describe('shouldCompress', () => {
    it('should return true for valid JSON above threshold', () => {
      const bigJson = JSON.stringify({ data: 'x'.repeat(2500) });
      expect(shouldCompress(bigJson, 500)).toBe(true);
    });

    it('should return false for valid JSON below threshold', () => {
      expect(shouldCompress('{"id":1}', 500)).toBe(false);
    });

    it('should return false for invalid JSON regardless of size', () => {
      expect(shouldCompress('not json ' + 'x'.repeat(3000), 500)).toBe(false);
    });
  });
});
