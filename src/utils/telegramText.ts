const DEFAULT_MAX = 3500;
const PRE_BLOCK_PATTERN = /<pre>[\s\S]*?<\/pre>/g;

function splitLongSegment(segment: string, max: number): string[] {
  if (segment.length <= max) {
    return [segment];
  }

  const chunks: string[] = [];
  let remaining = segment;

  while (remaining.length > max) {
    let splitAt = remaining.lastIndexOf("\n", max);

    if (splitAt <= 0) {
      splitAt = max;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);

    if (remaining.startsWith("\n")) {
      remaining = remaining.slice(1);
    }
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function splitNonPreText(text: string, max: number): string[] {
  if (text.length === 0) {
    return [];
  }

  if (!text.includes("\n")) {
    return splitLongSegment(text, max);
  }

  const lines = text.split("\n");
  const chunks: string[] = [];

  for (const line of lines) {
    if (line.length === 0) {
      continue;
    }

    if (line.length <= max) {
      chunks.push(line);
    } else {
      chunks.push(...splitLongSegment(line, max));
    }
  }

  return chunks;
}

function tokenizeTelegramText(text: string): string[] {
  const tokens: string[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(PRE_BLOCK_PATTERN)) {
    const index = match.index ?? 0;
    const matched = match[0];

    if (index > lastIndex) {
      tokens.push(text.slice(lastIndex, index));
    }

    tokens.push(matched);
    lastIndex = index + matched.length;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens;
}

export function splitForTelegram(text: string, max = DEFAULT_MAX): string[] {
  if (text.length === 0) {
    return [""];
  }

  const safeMax = Math.max(1, Math.trunc(max));
  const chunks: string[] = [];

  for (const token of tokenizeTelegramText(text)) {
    const isPreBlock = token.startsWith("<pre>") && token.endsWith("</pre>");

    if (isPreBlock) {
      if (token.length > safeMax) {
        console.error("splitForTelegram: <pre> block exceeds max length");
      }

      chunks.push(token);
      continue;
    }

    chunks.push(...splitNonPreText(token, safeMax));
  }

  return chunks;
}

export function shouldSendAsDocument(text: string, max = DEFAULT_MAX): boolean {
  return text.length > max;
}
