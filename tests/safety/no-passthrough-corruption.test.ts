import { describe, it, expect } from 'vitest';
import { shouldCompress } from '../../src/compress/detect.js';

describe('Passthrough safety', () => {
  describe('Non-JSON passes through unchanged', () => {
    it('should not compress plain text', () => {
      expect(shouldCompress('hello world this is plain text')).toBe(false);
    });

    it('should not compress git log output', () => {
      const gitLog = 'abc1234 feat: add users\ndef5678 fix: typo\n' + 'xyz9012 chore: update deps\n'.repeat(100);
      expect(shouldCompress(gitLog)).toBe(false);
    });

    it('should not compress shell error messages', () => {
      const error = 'ERROR: push rejected\nremote: Permission denied\nexit code 128\n'.repeat(50);
      expect(shouldCompress(error)).toBe(false);
    });

    it('should not compress markdown', () => {
      const md = '# Title\n\n## Section\n\nSome **bold** text\n'.repeat(100);
      expect(shouldCompress(md)).toBe(false);
    });

    it('should not compress empty string', () => {
      expect(shouldCompress('')).toBe(false);
    });

    it('should not compress whitespace-only string', () => {
      expect(shouldCompress('   \n\t  ')).toBe(false);
    });
  });

  describe('Invalid JSON passes through unchanged', () => {
    it('should not compress truncated JSON', () => {
      const truncated = '{"transactionId":"tx_001","transactionType":"purchase","amount":' + 'x'.repeat(2500);
      expect(shouldCompress(truncated)).toBe(false);
    });

    it('should not compress JSON with trailing comma', () => {
      expect(shouldCompress('{"id":1,"name":"alice",}')).toBe(false);
    });

    it('should not compress JSON-like text (not valid JSON)', () => {
      expect(shouldCompress("{id: 1, name: 'alice'}")).toBe(false);
    });
  });

  describe('Below-threshold JSON passes through unchanged', () => {
    it('should not compress a small JSON object below 500 token threshold', () => {
      expect(shouldCompress('{"id":1,"name":"Alice"}', 500)).toBe(false);
    });

    it('should not compress a small JSON array below threshold', () => {
      expect(shouldCompress('[{"id":1},{"id":2}]', 500)).toBe(false);
    });
  });
});
