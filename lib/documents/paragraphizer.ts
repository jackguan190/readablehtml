/**
 * Sentence-aware paragraph splitter.
 *
 * Extracted PDFs frequently arrive as one giant block per page. This module
 * splits long blocks into readable chunks at sentence boundaries, targeting
 * 80–180 words per chunk while keeping abbreviations like "U.S." or "e.g."
 * intact.
 *
 * Pipeline:
 *   1. Pre-split the input on the existing `\n\n` paragraph breaks (keeps
 *      authorial intent where possible).
 *   2. For each block, mask known abbreviations with placeholders so their
 *      periods don't trigger spurious sentence splits.
 *   3. Split on `(?<=[.!?])\s+(?=[A-Z0-9"'])` — sentence terminator followed
 *      by whitespace and a capital letter or quoted opener.
 *   4. Restore abbreviations.
 *   5. Greedy-fill chunks: keep accumulating sentences while word count is
 *      below the floor, close the chunk once the floor is reached, and never
 *      exceed the ceiling.
 */

const TARGET_MIN_WORDS = 80;
const TARGET_MAX_WORDS = 180;

const ABBREVIATIONS = [
  // titles / honorifics
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "Prof.",
  "Sr.",
  "Jr.",
  "St.",
  "Mt.",
  // latin
  "e.g.",
  "i.e.",
  "et al.",
  "etc.",
  "viz.",
  "ca.",
  "cf.",
  "Cf.",
  "vs.",
  "Vs.",
  // bibliographic
  "p.",
  "pp.",
  "Pp.",
  "vol.",
  "Vol.",
  "ed.",
  "eds.",
  "Ed.",
  "Eds.",
  "ch.",
  "Ch.",
  "no.",
  "No.",
  "fig.",
  "Fig.",
  "Eq.",
  "approx.",
  // geographic / institutional
  "U.S.",
  "U.K.",
  "U.S.A.",
  "U.N.",
  "E.U.",
  "Inc.",
  "Co.",
  "Ltd.",
  "Corp.",
];

function countWords(s: string): number {
  return s
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]+$/u, "").replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter((w) => w.length > 0).length;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskAbbreviations(input: string): { masked: string; tokens: string[] } {
  let masked = input;
  const tokens: string[] = [];
  ABBREVIATIONS.forEach((abbr) => {
    const re = new RegExp(escapeRegex(abbr), "g");
    masked = masked.replace(re, () => {
      const i = tokens.length;
      tokens.push(abbr);
      return `ABBR${i}`;
    });
  });
  return { masked, tokens };
}

function unmaskAbbreviations(input: string, tokens: string[]): string {
  return input.replace(/ABBR(\d+)/g, (_, idx) => {
    const i = Number(idx);
    return tokens[i] ?? "";
  });
}

function splitIntoSentences(blockText: string): string[] {
  const { masked, tokens } = maskAbbreviations(blockText);
  // Split on sentence terminator + whitespace + uppercase / quote / digit.
  // Negative lookbehind avoids splitting after an abbreviation token (already
  // masked) or after a single uppercase letter (initials like "P. Smith").
  const raw = masked.split(/(?<=[.!?])(?:["'\)\]”’]+)?\s+(?=[A-Z0-9"'“‘])/);
  return raw
    .map((s) => unmaskAbbreviations(s, tokens).trim())
    .filter((s) => s.length > 0);
}

export interface ParagraphizeOptions {
  /** Floor for greedy-fill chunking. Defaults to 80. */
  minWords?: number;
  /** Ceiling for greedy-fill chunking. Defaults to 180. */
  maxWords?: number;
}

/**
 * Split a possibly-long text into reader-friendly paragraph strings.
 * Returns an array of paragraph texts, each ideally in [80, 180] words.
 *
 * Short inputs (single short paragraph) pass through unchanged.
 *
 * @example
 *   paragraphize("Lorem ipsum dolor sit amet. Consectetur adipiscing elit. ...")
 *     // returns ["Lorem ipsum dolor sit amet. Consectetur adipiscing elit. ...", ...]
 */
export function paragraphize(
  text: string,
  options: ParagraphizeOptions = {},
): string[] {
  if (!text || !text.trim()) return [];

  const minWords = options.minWords ?? TARGET_MIN_WORDS;
  const maxWords = options.maxWords ?? TARGET_MAX_WORDS;

  // 1. respect explicit author paragraph breaks first
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length > 0);

  const out: string[] = [];
  for (const block of blocks) {
    const wc = countWords(block);
    if (wc <= maxWords) {
      out.push(block);
      continue;
    }
    // 2. block is too long — sentence-split + greedy chunk
    const sentences = splitIntoSentences(block);
    if (sentences.length <= 1) {
      // can't usefully split — emit as one paragraph
      out.push(block);
      continue;
    }
    let current: string[] = [];
    let currentWords = 0;
    for (const sent of sentences) {
      const sw = countWords(sent);
      if (current.length === 0) {
        current.push(sent);
        currentWords = sw;
        continue;
      }
      if (currentWords + sw <= maxWords) {
        current.push(sent);
        currentWords += sw;
        if (currentWords >= minWords) {
          out.push(current.join(" "));
          current = [];
          currentWords = 0;
        }
      } else {
        // would exceed ceiling — close current, start new
        out.push(current.join(" "));
        current = [sent];
        currentWords = sw;
      }
    }
    if (current.length > 0) out.push(current.join(" "));
  }

  return out;
}

// Exported for tests / future ai-structuring callers that want sentence-level access.
export const __paragraphizerInternals__ = {
  splitIntoSentences,
  countWords,
  ABBREVIATIONS,
};
