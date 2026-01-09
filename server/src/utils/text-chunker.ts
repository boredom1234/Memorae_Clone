/**
 * Smart text chunking utility for Telegram messages.
 * Telegram has a 4096 character limit per message.
 * This utility splits long text at natural boundaries (paragraphs, sentences, words).
 */

const TELEGRAM_MAX_LENGTH = 4096;
const SAFE_MAX_LENGTH = 4000; // Leave 96 chars buffer for safety

/**
 * Splits text into chunks that respect the Telegram character limit.
 * Tries to split at natural boundaries: paragraphs > sentences > words.
 *
 * @param text The text to chunk
 * @param maxLength Maximum length per chunk (default: 4000)
 * @returns Array of text chunks
 */
export function chunkText(
  text: string,
  maxLength: number = SAFE_MAX_LENGTH
): string[] {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining.trim());
      break;
    }

    // Find the best split point within the limit
    let splitIndex = findBestSplitPoint(remaining, maxLength);

    if (splitIndex <= 0) {
      // No good split point found, force split at maxLength
      splitIndex = maxLength;
    }

    const chunk = remaining.substring(0, splitIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}

/**
 * Finds the best point to split text, preferring natural boundaries.
 * Priority: double newline (paragraph) > single newline > period/sentence > space (word)
 */
function findBestSplitPoint(text: string, maxLength: number): number {
  const searchRegion = text.substring(0, maxLength);

  // 1. Try to find paragraph break (double newline)
  const paragraphMatch = searchRegion.lastIndexOf("\n\n");
  if (paragraphMatch > maxLength * 0.5) {
    return paragraphMatch + 2; // Include the newlines
  }

  // 2. Try to find section break (markdown headers)
  const headerMatch = searchRegion.lastIndexOf("\n#");
  if (headerMatch > maxLength * 0.5) {
    return headerMatch + 1; // Before the header
  }

  // 3. Try to find single newline
  const newlineMatch = searchRegion.lastIndexOf("\n");
  if (newlineMatch > maxLength * 0.5) {
    return newlineMatch + 1;
  }

  // 4. Try to find sentence end (. ! ?)
  for (let i = maxLength - 1; i > maxLength * 0.5; i--) {
    const char = text[i];
    if (char === "." || char === "!" || char === "?") {
      // Check if next char is whitespace or end
      const nextChar = text[i + 1];
      if (!nextChar || /\s/.test(nextChar)) {
        return i + 1;
      }
    }
  }

  // 5. Try to find word boundary (space)
  const spaceMatch = searchRegion.lastIndexOf(" ");
  if (spaceMatch > maxLength * 0.3) {
    return spaceMatch + 1;
  }

  // 6. No good split point, force split
  return maxLength;
}

/**
 * Check if text needs chunking
 */
export function needsChunking(text: string): boolean {
  return Boolean(text && text.length > SAFE_MAX_LENGTH);
}

export { TELEGRAM_MAX_LENGTH, SAFE_MAX_LENGTH };
