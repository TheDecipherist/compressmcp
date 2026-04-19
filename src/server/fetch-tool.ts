import { shouldCompress } from '../compress/detect.js';
import { compress } from '../compress/terse.js';
import { formatOutput } from '../compress/dictionary.js';

export interface FetchOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FetchResult {
  content: string;
  statusCode: number;
  compressed: boolean;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export async function fetchAndCompress(
  options: FetchOptions,
  fetcher: Fetcher = fetch
): Promise<FetchResult> {
  const { url, method = 'GET', headers = {}, body } = options;

  let response: Response;
  try {
    response = await fetcher(url, {
      method,
      headers,
      body: body ?? undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: `Network error: ${message}`, statusCode: 0, compressed: false };
  }

  const text = await response.text();

  if (!response.ok) {
    return { content: text, statusCode: response.status, compressed: false };
  }

  if (shouldCompress(text)) {
    const result = compress(text);
    return {
      content: formatOutput(result),
      statusCode: response.status,
      compressed: true,
    };
  }

  return { content: text, statusCode: response.status, compressed: false };
}
