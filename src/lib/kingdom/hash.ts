export function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function stableFraction(value: string): number {
  return stableHash(value) / 0x1_0000_0000;
}

export function stableId(prefix: string, value: string): string {
  return `${prefix}-${stableDigest(value)}`;
}

export function stableDigest(value: string): string {
  const first = stableHash(value).toString(16).padStart(8, "0");
  const second = stableHash(`repo-magical-kingdom:${value}`).toString(16).padStart(8, "0");
  return `${first}${second}`;
}
