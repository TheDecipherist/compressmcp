import { countTokens } from '@anthropic-ai/tokenizer';

const DEFAULT_MIN_TOKENS = 500;

export function isValidJson(text: string): boolean {
  if (!text || !text.trim()) return false;
  const trimmed = text.trim();
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return countTokens(text);
}

export function shouldCompress(text: string, minTokens = DEFAULT_MIN_TOKENS): boolean {
  if (!isValidJson(text)) return false;
  return estimateTokens(text) >= minTokens;
}
