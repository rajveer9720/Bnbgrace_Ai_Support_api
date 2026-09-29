const CHUNK_LENGTH = 1_200;
const CHUNK_OVERLAP = 150;

function decodeCodePoint(code: number): string {
  return Number.isInteger(code) &&
    code > 0 &&
    code <= 0x10ffff &&
    !(code >= 0xd800 && code <= 0xdfff)
    ? String.fromCodePoint(code)
    : '\uFFFD';
}

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_LENGTH, text.length);
    if (end < text.length) {
      const boundary = Math.max(
        text.lastIndexOf('\n', end),
        text.lastIndexOf('. ', end),
        text.lastIndexOf(' ', end),
      );
      if (boundary > start + CHUNK_LENGTH / 2) end = boundary + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

export function cleanHtml(html: string): string {
  return normalizeText(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(
        /<\/(p|div|li|h[1-6]|section|article|main|header|footer)>/gi,
        '\n',
      )
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#(\d+);/g, (_, code: string) => decodeCodePoint(Number(code)))
      .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
        decodeCodePoint(Number.parseInt(code, 16)),
      )
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'"),
  );
}

export function extractMetadata(html: string): string {
  const values = new Set<string>();
  const allowed = new Set([
    'description',
    'og:title',
    'og:description',
    'twitter:title',
    'twitter:description',
  ]);
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const attribute of match[0].matchAll(
      /([\w:-]+)\s*=\s*(["'])(.*?)\2/gi,
    )) {
      attributes.set(attribute[1].toLowerCase(), attribute[3]);
    }
    const key = (
      attributes.get('name') ??
      attributes.get('property') ??
      ''
    ).toLowerCase();
    const content = attributes.get('content');
    if (allowed.has(key) && content) values.add(cleanHtml(content));
  }
  return [...values].join('\n');
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
