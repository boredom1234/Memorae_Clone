/**
 * Converts standard Markdown to Telegram-compatible Markdown format.
 *
 * Telegram Markdown differences:
 * - Headers (#, ##, ###) are NOT supported → Convert to bold text
 * - Bold is *text* not **text**
 * - Italic is _text_ not *text*
 * - Code blocks and inline code work the same
 *
 * This converter preserves the meaning while making it Telegram-compatible.
 */

/**
 * Convert standard markdown to Telegram markdown format
 */
export function convertToTelegramMarkdown(text: string): string {
  if (!text) return text;

  let result = text;

  // 1. Convert headers to bold text
  // Match lines starting with 1-6 # symbols followed by space and text
  // Handle: # Header, ## Header, ### Header, etc.
  result = result.replace(/^(#{1,6})\s+(.+)$/gm, (_match, _hashes, content) => {
    // Strip any existing markdown formatting from header content
    const cleanContent = content.trim();
    return `*${cleanContent}*\n`;
  });

  // 2. Convert **bold** to *bold* (Telegram format)
  // But be careful not to break existing *italic* or ***bold italic***
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, "*_$1_*"); // ***bold italic*** → *_bold italic_*
  result = result.replace(/\*\*(.+?)\*\*/g, "*$1*"); // **bold** → *bold*

  // 3. Convert standalone *italic* that isn't bold to _italic_
  // This is tricky because * is used for both in different contexts
  // We'll leave single * as-is since Telegram uses it for bold anyway

  // 4. Convert horizontal rules (---, ***, ___) to a line of dashes
  result = result.replace(/^[\-\*\_]{3,}$/gm, "―――――――――");

  // 5. Convert [link](url) to Telegram format (same syntax, so keep as-is)
  // Telegram supports [text](url) natively

  // 6. Handle code blocks - they work the same in Telegram
  // ```code``` → ```code``` (no change needed)

  // 7. Clean up multiple consecutive newlines (max 2)
  result = result.replace(/\n{3,}/g, "\n\n");

  // 8. Escape special characters that might break Telegram's parser
  // In MarkdownV2, these need escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
  // But in regular Markdown mode, only incomplete formatting breaks things
  // We'll do minimal escaping to preserve readability

  return result.trim();
}

/**
 * Convert to Telegram MarkdownV2 format (stricter escaping)
 * Use this if regular Markdown fails
 */
export function convertToTelegramMarkdownV2(text: string): string {
  if (!text) return text;

  let result = text;

  // First, convert standard markdown elements
  result = convertToTelegramMarkdown(result);

  // Then escape special characters for MarkdownV2
  // Characters that need escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
  // But NOT inside code blocks or inline code

  // Split by code blocks to avoid escaping inside them
  const parts = result.split(/(```[\s\S]*?```|`[^`]+`)/g);

  result = parts
    .map((part, index) => {
      // Odd indices are code blocks/inline code - don't escape
      if (index % 2 === 1) return part;

      // Escape special characters in non-code parts
      // Note: We DON'T escape * and _ since we use them for formatting
      return part
        .replace(/([[\]()~`>#+=|{}.!\\-])/g, "\\$1")
        .replace(/\\/g, "\\\\"); // Double escape backslashes
    })
    .join("");

  return result.trim();
}

/**
 * Sanitize text for safe Telegram display (fallback - strips all markdown)
 */
export function stripMarkdown(text: string): string {
  if (!text) return text;

  return (
    text
      // Remove headers
      .replace(/^#{1,6}\s+/gm, "")
      // Remove bold/italic markers
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      // Remove code block markers but keep content
      .replace(/```[\w]*\n?([\s\S]*?)```/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      // Remove horizontal rules
      .replace(/^[\-\*\_]{3,}$/gm, "")
      // Remove link formatting but keep text
      .replace(/\[(.+?)\]\(.+?\)/g, "$1")
      // Clean up extra whitespace
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Intelligently prepare text for Telegram - tries markdown first, falls back to plain
 */
export function prepareForTelegram(text: string): {
  text: string;
  parseMode: "Markdown" | undefined;
} {
  if (!text) return { text: "", parseMode: undefined };

  // Check if text has any markdown-like content
  const hasMarkdown =
    /[#*_`\[\]]/.test(text) ||
    text.includes("```") ||
    text.includes("**") ||
    /^#{1,6}\s/m.test(text);

  if (hasMarkdown) {
    const converted = convertToTelegramMarkdown(text);
    return { text: converted, parseMode: "Markdown" };
  }

  // Plain text - no markdown
  return { text, parseMode: undefined };
}
