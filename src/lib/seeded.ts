// Deterministic randomness from a string, so a login always gets the same stars, rain, barcode and ID number.

/** 32-bit FNV-1a hash of a string. */
export function hash(seed: string): number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** A small seeded generator (mulberry32) returning floats in [0, 1). */
export function seeded(seed: string): () => number {
  let a = hash(seed) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
