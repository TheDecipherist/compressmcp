import type { CompressResult } from './terse.js';

export function formatOutput(result: CompressResult): string {
  const { compressed, dictionary, originalTokens, compressedTokens } = result;
  const reduction = Math.round((1 - compressedTokens / originalTokens) * 100);

  const header = `[compressmcp: ${originalTokens.toLocaleString()}→${compressedTokens.toLocaleString()} tokens (-${reduction}%) | lossless]`;
  const keys = `Keys: ${JSON.stringify(dictionary)}`;
  const data = JSON.stringify(compressed);

  return `${header}\n${keys}\n${data}`;
}
