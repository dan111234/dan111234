const ASIN_RE = /^[A-Z0-9]{10}$/;

// Path shapes Amazon uses for product pages, e.g. /Some-Title/dp/B0ABC12345/ref=...,
// /gp/product/B0ABC12345, /gp/aw/d/B0ABC12345 (mobile), /dp/product/B0ABC12345.
const PATH_PATTERNS = [
  /\/dp\/(?:product\/)?([A-Z0-9]{10})(?=[/?#]|$)/i,
  /\/gp\/product\/([A-Z0-9]{10})(?=[/?#]|$)/i,
  /\/gp\/aw\/d\/([A-Z0-9]{10})(?=[/?#]|$)/i,
];

export function isValidAsin(value: string): boolean {
  return ASIN_RE.test(value);
}

/** Returns the upper-cased ASIN from a product URL, or null if the URL has none. */
export function extractAsinFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  for (const re of PATH_PATTERNS) {
    const m = re.exec(parsed.pathname);
    if (m?.[1]) return m[1].toUpperCase();
  }
  const q = parsed.searchParams.get('asin') ?? parsed.searchParams.get('ASIN');
  if (q && isValidAsin(q.toUpperCase())) return q.toUpperCase();
  return null;
}
