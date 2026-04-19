import { compress as terseCompress, expand as terseExpand, type TersePayload, type CompressOptions } from 'tersejson';

export interface CompressResult {
  compressed: unknown;
  dictionary: Record<string, string>;
  originalTokens: number;
  compressedTokens: number;
}

export function compress(jsonText: string, options?: CompressOptions): CompressResult {
  const parsed = JSON.parse(jsonText);
  const originalTokens = Math.ceil(jsonText.length / 4);

  // TerseJSON requires an array — wrap plain objects, unwrap after
  const isArray = Array.isArray(parsed);
  const dataToCompress = isArray ? parsed : [parsed];

  const payload = terseCompress(dataToCompress, {
    minKeyLength: 3,
    nestedHandling: 'deep',
    ...options,
  }) as TersePayload;

  const compressedData = isArray ? payload.d : (payload.d as unknown[])[0];
  const compressedJson = JSON.stringify(compressedData);
  const compressedTokens = Math.ceil(compressedJson.length / 4);

  return {
    compressed: compressedData,
    dictionary: payload.k,
    originalTokens,
    compressedTokens,
  };
}

export function decompress(compressedData: unknown, dictionary: Record<string, string>): unknown {
  const isArray = Array.isArray(compressedData);
  const dataToExpand = isArray ? compressedData : [compressedData];

  const payload: TersePayload = {
    __terse__: true,
    v: 1,
    k: dictionary,
    d: dataToExpand,
  };

  const expanded = terseExpand(payload) as unknown[];
  return isArray ? expanded : expanded[0];
}
