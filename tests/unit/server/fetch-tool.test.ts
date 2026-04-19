import { describe, it, expect, vi } from 'vitest';
import { fetchAndCompress, type Fetcher } from '../../../src/server/fetch-tool.js';

function makeLargeJsonBody(count = 200): string {
  return JSON.stringify(
    Array.from({ length: count }, (_, i) => ({
      transactionId: `tx_${i}`,
      transactionType: i % 2 === 0 ? 'purchase' : 'refund',
      transactionAmount: 99.99,
      createdAt: '2026-04-19',
    }))
  );
}

function mockFetcher(body: string, status = 200): Fetcher {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response);
}

describe('compressmcp__fetch MCP tool', () => {
  describe('HTTP request', () => {
    it('should make a GET request to the given URL', async () => {
      const fetcher = mockFetcher('{"ok":true}');
      await fetchAndCompress({ url: 'https://api.example.com/data' }, fetcher as Fetcher);
      expect(fetcher).toHaveBeenCalledWith('https://api.example.com/data', expect.objectContaining({ method: 'GET' }));
    });

    it('should make a POST request with body when method is POST', async () => {
      const fetcher = mockFetcher('{"ok":true}');
      await fetchAndCompress({ url: 'https://api.example.com/data', method: 'POST', body: '{"query":"test"}' }, fetcher as Fetcher);
      expect(fetcher).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({ method: 'POST', body: '{"query":"test"}' })
      );
    });

    it('should include custom headers when provided', async () => {
      const fetcher = mockFetcher('{"ok":true}');
      await fetchAndCompress(
        { url: 'https://api.example.com/data', headers: { Authorization: 'Bearer token123' } },
        fetcher as Fetcher
      );
      expect(fetcher).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({ headers: { Authorization: 'Bearer token123' } })
      );
    });
  });

  describe('Response compression', () => {
    it('should compress a JSON response with TerseJSON', async () => {
      const fetcher = mockFetcher(makeLargeJsonBody());
      const result = await fetchAndCompress({ url: 'https://api.example.com/data' }, fetcher as Fetcher);
      expect(result.compressed).toBe(true);
      expect(result.content).toContain('[compressmcp:');
    });

    it('should include the dictionary in the response', async () => {
      const fetcher = mockFetcher(makeLargeJsonBody());
      const result = await fetchAndCompress({ url: 'https://api.example.com/data' }, fetcher as Fetcher);
      expect(result.content).toContain('Keys:');
    });

    it('should pass through a non-JSON response unchanged', async () => {
      const html = '<html><body>Not JSON</body></html>';
      const fetcher = mockFetcher(html);
      const result = await fetchAndCompress({ url: 'https://example.com' }, fetcher as Fetcher);
      expect(result.compressed).toBe(false);
      expect(result.content).toBe(html);
    });

    it('should pass through a plain text response unchanged', async () => {
      const text = 'plain text response here nothing to compress';
      const fetcher = mockFetcher(text);
      const result = await fetchAndCompress({ url: 'https://example.com' }, fetcher as Fetcher);
      expect(result.compressed).toBe(false);
      expect(result.content).toBe(text);
    });
  });

  describe('Error handling', () => {
    it('should return HTTP 404 response without compression', async () => {
      const fetcher = mockFetcher('Not Found', 404);
      const result = await fetchAndCompress({ url: 'https://api.example.com/missing' }, fetcher as Fetcher);
      expect(result.statusCode).toBe(404);
      expect(result.compressed).toBe(false);
    });

    it('should return HTTP 500 response without compression', async () => {
      const fetcher = mockFetcher('Internal Server Error', 500);
      const result = await fetchAndCompress({ url: 'https://api.example.com/broken' }, fetcher as Fetcher);
      expect(result.statusCode).toBe(500);
      expect(result.compressed).toBe(false);
    });

    it('should return network error message if host is unreachable', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as Fetcher;
      const result = await fetchAndCompress({ url: 'https://unreachable.invalid' }, fetcher);
      expect(result.statusCode).toBe(0);
      expect(result.content).toContain('Network error');
    });
  });
});
