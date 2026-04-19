import { describe, it, expect } from 'vitest';
import { compress, decompress } from '../../src/compress/terse.js';

function roundTrip(value: unknown): unknown {
  const result = compress(JSON.stringify(value));
  return decompress(result.compressed, result.dictionary);
}

describe('Lossless guarantee', () => {
  describe('All records preserved', () => {
    it('should preserve every item in a 500-item array', () => {
      const data = Array.from({ length: 500 }, (_, i) => ({ recordId: `id_${i}`, recordValue: i }));
      expect(roundTrip(data)).toEqual(data);
    });

    it('should preserve an error record at array index 0', () => {
      const data = [
        { transactionId: 'tx_0', status: 'ERROR', message: 'CONSTRAINT_VIOLATION' },
        ...Array.from({ length: 99 }, (_, i) => ({ transactionId: `tx_${i + 1}`, status: 'ok', message: null })),
      ];
      const result = compress(JSON.stringify(data));
      const restored = decompress(result.compressed, result.dictionary) as typeof data;
      expect(restored[0].status).toBe('ERROR');
      expect(restored[0].message).toBe('CONSTRAINT_VIOLATION');
    });

    it('should preserve an error record at array index 50', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({
        transactionId: `tx_${i}`,
        status: i === 50 ? 'ERROR' : 'ok',
        message: i === 50 ? 'FATAL_AT_INDEX_50' : null,
      }));
      const result = compress(JSON.stringify(data));
      const restored = decompress(result.compressed, result.dictionary) as typeof data;
      expect(restored[50].status).toBe('ERROR');
      expect(restored[50].message).toBe('FATAL_AT_INDEX_50');
    });

    it('should preserve an error record at the last index', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({
        transactionId: `tx_${i}`,
        status: i === 99 ? 'ERROR' : 'ok',
      }));
      const result = compress(JSON.stringify(data));
      const restored = decompress(result.compressed, result.dictionary) as typeof data;
      expect(restored[99].status).toBe('ERROR');
    });
  });

  describe('All field values preserved', () => {
    it('should preserve string values', () => {
      expect(roundTrip({ firstName: 'Alice', lastName: 'Smith' }))
        .toEqual({ firstName: 'Alice', lastName: 'Smith' });
    });

    it('should preserve integer values', () => {
      expect(roundTrip({ recordCount: 9007199254740991 }))
        .toEqual({ recordCount: 9007199254740991 });
    });

    it('should preserve float values without rounding', () => {
      expect(roundTrip({ priceAmount: 99.99, taxRate: 0.0825 }))
        .toEqual({ priceAmount: 99.99, taxRate: 0.0825 });
    });

    it('should preserve boolean true and false', () => {
      expect(roundTrip({ isActive: true, isDeleted: false }))
        .toEqual({ isActive: true, isDeleted: false });
    });

    it('should preserve null values', () => {
      expect(roundTrip({ deletedAt: null, parentId: null }))
        .toEqual({ deletedAt: null, parentId: null });
    });

    it('should preserve empty string values', () => {
      expect(roundTrip({ middleName: '', description: '' }))
        .toEqual({ middleName: '', description: '' });
    });

    it('should preserve nested objects', () => {
      const data = { userProfile: { firstName: 'Alice', addressCity: 'NYC' } };
      expect(roundTrip(data)).toEqual(data);
    });

    it('should preserve nested arrays', () => {
      const data = { userTags: ['admin', 'editor'], userScores: [10, 20, 30] };
      expect(roundTrip(data)).toEqual(data);
    });

    it('should preserve deeply nested structures (5+ levels)', () => {
      const data = { l1: { l2: { l3: { l4: { l5: { deepValue: 'found it' } } } } } };
      expect(roundTrip(data)).toEqual(data);
    });
  });

  describe('Data types round-trip', () => {
    it('should preserve field type: number stays number, not string', () => {
      const result = roundTrip({ recordCount: 42 }) as { recordCount: unknown };
      expect(typeof result.recordCount).toBe('number');
    });

    it('should preserve field type: boolean stays boolean, not string', () => {
      const result = roundTrip({ isActive: true }) as { isActive: unknown };
      expect(typeof result.isActive).toBe('boolean');
    });

    it('should preserve field type: null stays null, not undefined', () => {
      const result = roundTrip({ deletedAt: null }) as { deletedAt: unknown };
      expect(result.deletedAt).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty object {}', () => {
      expect(roundTrip({})).toEqual({});
    });

    it('should handle empty array []', () => {
      expect(roundTrip([])).toEqual([]);
    });

    it('should handle JSON with only short keys (nothing to abbreviate)', () => {
      const data = { id: 1, ok: true };
      expect(roundTrip(data)).toEqual(data);
    });

    it('should handle JSON where all keys are already 1-2 chars', () => {
      const data = { a: 1, b: 2, id: 3 };
      expect(roundTrip(data)).toEqual(data);
    });

    it('should handle keys with special characters', () => {
      const data = { 'created_at': '2026-01-01', 'user-name': 'alice' };
      expect(roundTrip(data)).toEqual(data);
    });

    it('should handle duplicate values across fields', () => {
      const data = { firstName: 'Alice', lastName: 'Alice', middleName: 'Alice' };
      expect(roundTrip(data)).toEqual(data);
    });
  });
});
