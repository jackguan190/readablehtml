/**
 * Heuristic footnote / author-note extraction for a single page's text.
 *
 * We currently work from extracted plain text only — unpdf is configured for
 * `mergePages: false` which gives us per-page strings but no position / font
 * data. Two strategies, applied in order:
 *
 *   1. Divider-based: many academic PDFs put a horizontal rule (a run of
 *      `_______`, `———`, or `--------`) above their footnotes. If we see
 *      one, everything after it on that page is treated as note material:
 *      numbered notes become footnotes; otherwise the block is treated as
 *      an author note.
 *
 *   2. Trailing numbered: if no divider is found but the LAST chunk of the
 *      page contains at least two consecutive lines of the form `\d+\.\s+…`
 *      (numbered notes), we treat that trailing run as footnotes.
 *
 * Both heuristics are conservative — when in doubt we leave text in the main
 * body. False negatives (footnotes left in the body) are recoverable via the
 * "Restructure" button; false positives (body text moved to footnotes) are
 * confusing and hard to undo, so we tune toward the former.
 *
 * Seam for future layout-aware extraction:
 *   When/if we move to a per-text-item extractor (using
 *   `getDocumentProxy(buf).getPage(n).getTextContent()` from unpdf/pdfjs),
 *   we'll have y-coordinates and font sizes per item — at that point
 *   `extractFootnotes` should be reimplemented to consume that structured
 *   stream rather than re-parsing the flattened string. Public signature
 *   here is designed to stay stable across that change.
 */

export interface Footnote {
  number: string;
  text: string;
  page: number;
}

export interface FootnoteExtractionResult {
  /** Page text with detected footnote / author-note blocks removed. */
  mainText: string;
  footnotes: Footnote[];
  authorNote?: string;
  /**
   * Internal/debug label for which strategy fired:
   *   - "divider"                            → `_______` line above notes
   *   - "trailing-numbered"                  → ≥2 sequential numbered notes in page tail
   *   - "first-page-front-matter"            → page 1, title/author block before a known section heading
   *   - "first-page-publication-metadata"    → page 1, ≥2 metadata signals (©, e-mail, DOI, Springer, …)
   *   - "first-page-author-note"             → page 1, author-note pattern, no footnote(s)
   *   - "single-footnote-after-author-note"  → page 1, author note(s) + ≥1 numbered note
   *   - "none"                               → nothing detected, text stays in main body
   */
  detection:
    | "divider"
    | "trailing-numbered"
    | "first-page-front-matter"
    | "first-page-publication-metadata"
    | "first-page-author-note"
    | "single-footnote-after-author-note"
    | "none";
}

const DIVIDER_LINE_RE = /^[ \t]*[_—–\-]{3,}[ \t]*$/;
const NUMBERED_NOTE_RE = /^(\d{1,3})[.\)]\s+(.+)$/;
// Trailing-numbered heuristic kicks in only when the candidate region is at
// the page's tail (within the last `TRAIL_REGION_RATIO` of the page text).
const TRAIL_REGION_RATIO = 0.35;
const MIN_TRAIL_NOTES = 2;
const MAX_AUTHOR_NOTE_CHARS = 700;

function findDividerLineIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (DIVIDER_LINE_RE.test(l) && l.trim().length >= 3) return i;
  }
  return -1;
}

interface NumberedMatch {
  number: string;
  start: number;
  end: number;
}

/**
 * Locate `\d+. text` openers within a block, returning [{number, start, end}].
 * The `end` of each match is the start of the next match (or block length).
 */
function locateNumberedMatches(block: string): NumberedMatch[] {
  const out: NumberedMatch[] = [];
  const lines = block.split(/\n/);
  let cursor = 0;
  for (const line of lines) {
    const m = line.match(NUMBERED_NOTE_RE);
    if (m) {
      out.push({ number: m[1], start: cursor, end: cursor + line.length });
    }
    cursor += line.length + 1; // +1 for the newline
  }
  // backfill `end` so it ends at the next match's start (or block end)
  for (let i = 0; i < out.length; i++) {
    out[i].end = i + 1 < out.length ? out[i + 1].start : block.length;
  }
  return out;
}

function parseFootnotesFromBlock(block: string, page: number): Footnote[] {
  const matches = locateNumberedMatches(block);
  if (matches.length === 0) return [];

  // Validate: number sequence should be mostly increasing. Allow gaps (some PDFs
  // restart numbering per chapter) but reject obvious garbage.
  const nums = matches.map((m) => Number(m.number)).filter((n) => Number.isFinite(n));
  if (nums.length < matches.length) return [];

  return matches
    .map((m) => {
      const raw = block.slice(m.start, m.end).trim();
      const stripped = raw
        .replace(NUMBERED_NOTE_RE, "$2")
        .replace(/\s+/g, " ")
        .trim();
      if (stripped.length === 0) return null;
      return { number: m.number, text: stripped, page };
    })
    .filter((x): x is Footnote => x !== null);
}

function extractAuthorNote(block: string): string | undefined {
  const trimmed = block.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_AUTHOR_NOTE_CHARS) return undefined;
  return trimmed;
}

/**
 * Try divider-based extraction. Returns `null` if no divider is present.
 */
function tryDivider(
  text: string,
  page: number,
): FootnoteExtractionResult | null {
  const lines = text.split(/\n/);
  const dividerIdx = findDividerLineIndex(lines);
  if (dividerIdx < 0) return null;

  const before = lines.slice(0, dividerIdx).join("\n");
  const after = lines.slice(dividerIdx + 1).join("\n").trim();
  if (after.length === 0) {
    // divider with nothing after — leave text alone
    return null;
  }

  const footnotes = parseFootnotesFromBlock(after, page);
  if (footnotes.length > 0) {
    return {
      mainText: before,
      footnotes,
      detection: "divider",
    };
  }

  const authorNote = extractAuthorNote(after);
  if (authorNote) {
    return {
      mainText: before,
      footnotes: [],
      authorNote,
      detection: "divider",
    };
  }
  return null;
}

/**
 * Try the trailing-numbered heuristic. Looks for at least
 * MIN_TRAIL_NOTES consecutive numbered notes in the last TRAIL_REGION_RATIO
 * of the page text.
 */
function tryTrailingNumbered(
  text: string,
  page: number,
): FootnoteExtractionResult | null {
  const totalLen = text.length;
  if (totalLen === 0) return null;
  const cutoff = Math.floor(totalLen * (1 - TRAIL_REGION_RATIO));

  // Find numbered openers anywhere in the text.
  const matches = locateNumberedMatches(text);
  if (matches.length < MIN_TRAIL_NOTES) return null;

  // Filter to the tail region; require they form a sequential run.
  const tailMatches = matches.filter((m) => m.start >= cutoff);
  if (tailMatches.length < MIN_TRAIL_NOTES) return null;

  // Require contiguous increasing numbers (allow start at any value but +1 each).
  const tailNums = tailMatches.map((m) => Number(m.number));
  for (let i = 1; i < tailNums.length; i++) {
    if (tailNums[i] !== tailNums[i - 1] + 1) return null;
  }

  const firstStart = tailMatches[0].start;
  const before = text.slice(0, firstStart);
  const after = text.slice(firstStart);
  const footnotes = parseFootnotesFromBlock(after, page);
  if (footnotes.length < MIN_TRAIL_NOTES) return null;

  return {
    mainText: before.replace(/\s+$/, ""),
    footnotes,
    detection: "trailing-numbered",
  };
}

/**
 * Phrases that strongly indicate an academic-article author note, biographical
 * blurb, acknowledgement paragraph, or data-appendix pointer.
 * Tuned conservatively — these phrases rarely appear in body argument.
 */
const AUTHOR_NOTE_PATTERNS: RegExp[] = [
  /\bis\s+(?:an?\s+)?Professor\s+of\b/i,
  /\bis\s+(?:an?\s+)?Assistant\s+Professor\b/i,
  /\bis\s+(?:an?\s+)?Associate\s+Professor\b/i,
  /\bis\s+(?:an?\s+)?(?:Adjunct|Visiting|Emeritus|Distinguished)\s+Professor\b/i,
  /\bEarlier\s+drafts?\b/i,
  /\bThe\s+authors?\s+(?:is|are)\s+grateful\b/i,
  /\bThe\s+author\s+(?:is\s+grateful|wishes\s+to\s+thank|thanks)\b/i,
  /\bI\s+(?:thank|am\s+grateful|wish\s+to\s+thank|would\s+like\s+to\s+thank)\b/i,
  /\bWe\s+(?:thank|are\s+grateful|wish\s+to\s+thank|would\s+like\s+to\s+thank)\b/i,
  /\bThe\s+authors?\s+thank\b/i,
  /\bresearch\s+assistance\b/i,
  /\bdata\s+appendix\b/i,
  /\breplication\s+data\b/i,
  /\bavailable\s+at\s+http/i,
  /\banonymous\s+reviewers?\b/i,
  /\bAcknowledg(?:e?ments|e?ment)\b/i,
];

function looksLikeAuthorNote(paragraph: string): boolean {
  // Author notes are short. Very long paragraphs are almost certainly body.
  if (paragraph.length > 1500) return false;
  if (paragraph.length < 20) return false;
  return AUTHOR_NOTE_PATTERNS.some((re) => re.test(paragraph));
}

const NUMBERED_OPENER_RE = /^(\d{1,3})[.\)]\s+(.+)$/;

/** Debug logging gated to dev or explicit FOOTNOTE_DEBUG=1. */
const DEBUG =
  typeof process !== "undefined" &&
  (process.env.FOOTNOTE_DEBUG === "1" ||
    process.env.NODE_ENV !== "production");

function dbg(...args: unknown[]) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.log("[fn-debug]", ...args);
}

/**
 * Find the earliest position in `text` where ANY author-note pattern matches.
 * Returns -1 if none match.
 */
function findFirstAuthorAnchor(text: string): {
  index: number;
  matchedPattern: string;
} | null {
  let earliest: { index: number; matchedPattern: string } | null = null;
  for (const re of AUTHOR_NOTE_PATTERNS) {
    // Fresh exec each time — these patterns are non-sticky.
    const m = re.exec(text);
    if (m && (earliest === null || m.index < earliest.index)) {
      earliest = { index: m.index, matchedPattern: re.source };
    }
  }
  return earliest;
}

/**
 * Find the earliest numbered-opener (`1. …` / `1) …`) in `text` at-or-after
 * `from`, preceded by whitespace or start of text. Returns the index of the
 * digit.
 */
function findFirstNumberedAnchor(text: string, from: number): number {
  const re = /(?:^|[\s])(\d{1,3})[.\)]\s+/g;
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index < from) continue;
    // The digit position is after the leading whitespace (if any).
    const leading = m[0].length - m[0].trimStart().length;
    return m.index + leading;
  }
  return -1;
}

/**
 * Is the period at `periodIdx` an INITIAL like "D." / "J." / "T.S."
 * rather than a sentence terminator? Recognizes:
 *   - single capital letter + period at a word boundary ("D. Belo")
 *   - chained initials ("T.S. Eliot" — the dot after S is preceded by S preceded by .)
 */
function looksLikeInitial(text: string, periodIdx: number): boolean {
  if (periodIdx < 1) return false;
  const prevChar = text[periodIdx - 1];
  if (!/[A-Z]/.test(prevChar)) return false;
  if (periodIdx === 1) return true;
  const beforeUpper = text[periodIdx - 2];
  // Allow whitespace, start-of-text, or a preceding period (chained initial).
  return /[\s.]/.test(beforeUpper);
}

/**
 * Walk backwards from `anchorIdx` to find the start of the sentence (or line)
 * containing the anchor. We treat `. `, `! `, `? `, or `\n` as boundaries.
 * Single-capital initials ("D.", "J.", chained "T.S.") are NOT treated as
 * sentence terminators — otherwise a metadata anchor like "(B)" preceded by
 * "D. Belo (B)" would cut between "D." and " Belo", leaving "D." dangling
 * in the body. Returns 0 if no boundary is found.
 */
function backUpToSentenceStart(text: string, anchorIdx: number): number {
  for (let i = anchorIdx - 1; i > 0; i--) {
    const ch = text[i];
    if (ch === "\n") {
      // skip following whitespace
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      return Math.min(j, anchorIdx);
    }
    if ((ch === "." || ch === "!" || ch === "?") && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === " " || next === "\t" || next === "\n") {
        // Skip past initials — keep walking backward.
        if (ch === "." && looksLikeInitial(text, i)) continue;
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        return Math.min(j, anchorIdx);
      }
    }
  }
  return 0;
}

/**
 * Patterns that strongly indicate publication boilerplate / author affiliation
 * on the first page of an academic chapter — common in Springer, Wiley,
 * Routledge, etc. chapter PDFs. None individually are conclusive (a body
 * paragraph might legitimately mention "Springer" in a citation), so the
 * `tryFirstPagePublicationMetadata` strategy requires ≥2 distinct patterns
 * to match AND for the matches to cluster within a ~2000-char window.
 */
const METADATA_PATTERNS: RegExp[] = [
  /\bDepartment\s+of\b/i,
  /\bUniversity\b/,
  /\be-?mail\s*:/i,
  /©/,
  /\bThe\s+Author\(s\)/i,
  /\bexclusive\s+license\b/i,
  /\bSpringer\b/,
  /\bNature\s+Switzerland\b/i,
  /https?:\/\/(?:dx\.)?doi\.org\//i,
  /\bdoi\.org\b/i,
  /\(eds?\.\)/i,
  /\(B\)\s/,
];

/**
 * Maximum span between the first and last metadata signal. If signals are
 * scattered further than this across the page, they're more likely body
 * content (e.g. multiple citations sprinkled through an essay) than a
 * single boilerplate block.
 */
const METADATA_CLUSTER_MAX_SPAN = 2000;

/**
 * Page-1-only publication-metadata detection. Catches Springer / Wiley /
 * Routledge chapter front-matter that intermixes with the abstract on the
 * extracted text (affiliation, e-mail, DOI, copyright, editor list, etc.)
 * and would otherwise pollute the main body and AI summaries.
 *
 * Conservative tuning:
 *   - Requires ≥2 DISTINCT pattern matches.
 *   - Requires those matches to cluster within METADATA_CLUSTER_MAX_SPAN
 *     chars of each other.
 *   - Cuts at the sentence/line start before the earliest signal so we
 *     don't slice mid-sentence.
 *   - Bails if the resulting metadata block is shorter than 30 chars.
 *
 * mainText may be empty — for Springer chapter "page 1" content that is
 * almost entirely front-matter, returning empty mainText is correct.
 */
function tryFirstPagePublicationMetadata(
  text: string,
  page: number,
): FootnoteExtractionResult | null {
  if (page !== 1) return null;

  const positions: { index: number; pattern: string }[] = [];
  for (const re of METADATA_PATTERNS) {
    const m = re.exec(text);
    if (m) positions.push({ index: m.index, pattern: re.source });
  }

  if (positions.length < 2) {
    dbg(
      `metadata: only ${positions.length} signal(s) on page 1 — need ≥2`,
    );
    return null;
  }

  positions.sort((a, b) => a.index - b.index);
  const first = positions[0];
  const last = positions[positions.length - 1];

  if (last.index - first.index > METADATA_CLUSTER_MAX_SPAN) {
    dbg(
      `metadata: ${positions.length} signals span ${last.index - first.index}c (> ${METADATA_CLUSTER_MAX_SPAN}) — too scattered, bailing`,
    );
    return null;
  }

  const cutPoint = backUpToSentenceStart(text, first.index);
  const mainText = text.slice(0, cutPoint).replace(/\s+$/, "");
  const metadataBlock = text
    .slice(cutPoint)
    .replace(/\s+/g, " ")
    .trim();

  if (metadataBlock.length < 30) {
    dbg(
      `metadata: block only ${metadataBlock.length}c after cut — bailing`,
    );
    return null;
  }

  dbg(
    `metadata: SPLIT (${positions.length} signals, span=${last.index - first.index}c, main=${mainText.length}c, metadata=${metadataBlock.length}c, earliest pattern=${first.pattern})`,
  );

  return {
    mainText,
    footnotes: [],
    authorNote: metadataBlock,
    detection: "first-page-publication-metadata",
  };
}

/**
 * Page-1-only anchor-split strategy. Paragraph-AGNOSTIC — does not rely on
 * `\n\n` paragraph breaks (which some PDF extractors strip). Requires BOTH
 * an author-note phrase AND a numbered-footnote opener to exist on the page,
 * with the footnote anchor positioned after the author-note anchor. Splits
 * the text at the two anchors:
 *
 *   [ ... opening / body ... ] [ author note ] [ 1. footnote ... ]
 *                              ^ author anchor ^ footnote anchor
 *
 * Conservative — if either anchor is missing, returns null and leaves text
 * unchanged.
 */
function tryFirstPageAnchorSplit(
  text: string,
  page: number,
): FootnoteExtractionResult | null {
  if (page !== 1) return null;

  const authorAnchor = findFirstAuthorAnchor(text);
  if (!authorAnchor) {
    dbg("anchor-split: no author-note pattern matched");
    return null;
  }

  const footnoteAnchor = findFirstNumberedAnchor(text, authorAnchor.index);
  if (footnoteAnchor < 0) {
    dbg(
      `anchor-split: author anchor at ${authorAnchor.index} matched (${authorAnchor.matchedPattern}) but no numbered opener found after it`,
    );
    return null;
  }

  const authorStart = backUpToSentenceStart(text, authorAnchor.index);
  const mainText = text.slice(0, authorStart).replace(/\s+$/, "");
  const authorRaw = text
    .slice(authorStart, footnoteAnchor)
    .replace(/\s+/g, " ")
    .trim();
  const footnoteBlock = text.slice(footnoteAnchor);

  if (authorRaw.length < 10 || footnoteBlock.length < 20) {
    dbg(
      `anchor-split: split sizes too small (author=${authorRaw.length}, fn=${footnoteBlock.length}) — bailing`,
    );
    return null;
  }

  // Reuse the numbered-note parser for the footnote block.
  const footnotes = parseFootnotesFromBlock(footnoteBlock, page);
  if (footnotes.length === 0) {
    dbg("anchor-split: parser found 0 footnotes in block — bailing");
    return null;
  }

  dbg(
    `anchor-split: SPLIT (author=${authorRaw.length}c, footnotes=${footnotes.length}, main=${mainText.length}c, matched pattern=${authorAnchor.matchedPattern})`,
  );

  return {
    mainText,
    authorNote: authorRaw,
    footnotes,
    detection: "single-footnote-after-author-note",
  };
}

/**
 * Page-1-specific strategy. Walks paragraphs in order; once we hit a paragraph
 * that looks like an author note OR opens with a numbered footnote, we switch
 * into "notes" mode and treat every subsequent paragraph as note material
 * (additional author-note paragraphs, multi-paragraph footnote continuation,
 * or further numbered notes).
 *
 * Returns null when the page shows no notes-like content — leaves text alone.
 *
 * Conservative tuning:
 *   - First paragraph is always treated as body (the abstract / opening).
 *   - Switch is one-way: once in notes mode, we don't go back. (False positives
 *     here are rare because the patterns are specific to academic note prose.)
 *   - Long paragraphs (>1500 chars) never match author-note patterns.
 */
function tryFirstPageAuthorNote(
  text: string,
  page: number,
): FootnoteExtractionResult | null {
  if (page !== 1) return null;

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length < 2) return null;

  const mainParas: string[] = [paragraphs[0]];
  const authorNoteParts: string[] = [];
  const footnotes: Footnote[] = [];
  let mode: "body" | "notes" = "body";

  for (let i = 1; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const numberedMatch = p.match(NUMBERED_OPENER_RE);

    if (mode === "body") {
      if (numberedMatch) {
        // numbered opener — switch and capture
        mode = "notes";
        footnotes.push({
          number: numberedMatch[1],
          text: numberedMatch[2].trim(),
          page,
        });
      } else if (looksLikeAuthorNote(p)) {
        // author-note pattern — switch and capture
        mode = "notes";
        authorNoteParts.push(p);
      } else {
        // still body
        mainParas.push(p);
      }
    } else {
      // notes mode — every paragraph is note material
      if (numberedMatch) {
        footnotes.push({
          number: numberedMatch[1],
          text: numberedMatch[2].trim(),
          page,
        });
      } else if (footnotes.length === 0) {
        // pre-footnote — must be more author-note content
        authorNoteParts.push(p);
      } else {
        // post-footnote — treat as continuation of the most recent footnote
        footnotes[footnotes.length - 1].text =
          `${footnotes[footnotes.length - 1].text} ${p}`.trim();
      }
    }
  }

  if (mode === "body") return null;

  const authorNote =
    authorNoteParts.length > 0 ? authorNoteParts.join(" ") : undefined;
  const detection: FootnoteExtractionResult["detection"] =
    footnotes.length > 0
      ? "single-footnote-after-author-note"
      : "first-page-author-note";

  return {
    mainText: mainParas.join("\n\n"),
    footnotes,
    authorNote,
    detection,
  };
}

export function extractFootnotes(
  pageText: string,
  page: number,
): FootnoteExtractionResult {
  if (!pageText || !pageText.trim()) {
    return { mainText: pageText, footnotes: [], detection: "none" };
  }

  if (page === 1) {
    const newlineCount = (pageText.match(/\n/g) ?? []).length;
    const paragraphSegments = pageText
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0).length;
    const authorAnchor = findFirstAuthorAnchor(pageText);
    dbg(
      `page 1 input: len=${pageText.length} newlines=${newlineCount} paragraphSegments=${paragraphSegments} authorAnchor=${authorAnchor ? `idx=${authorAnchor.index} pattern=${authorAnchor.matchedPattern}` : "none"}`,
    );
    dbg(`page 1 head (first 2000 chars): ${pageText.slice(0, 2000)}`);
  }

  // Order: most-reliable to least-reliable.
  //   1. divider                     — explicit horizontal rule before notes (any page)
  //   2. trailing-numbered           — ≥2 sequential numbered notes in page tail (any page)
  //   3. first-page publication-metadata — page 1 only; ≥2 clustered metadata signals (©, e-mail, DOI, Springer, etc.)
  //   4. first-page anchor-split     — paragraph-agnostic; needs BOTH author-note phrase AND numbered opener (page 1 only)
  //   5. first-page author-note      — paragraph-aware; broader but needs blank lines (page 1 only)
  const fromDivider = tryDivider(pageText, page);
  if (fromDivider) {
    dbg(`page ${page}: detection=${fromDivider.detection}`);
    return fromDivider;
  }

  const fromTrailing = tryTrailingNumbered(pageText, page);
  if (fromTrailing) {
    dbg(`page ${page}: detection=${fromTrailing.detection}`);
    return fromTrailing;
  }

  const fromMetadata = tryFirstPagePublicationMetadata(pageText, page);
  if (fromMetadata) {
    dbg(`page ${page}: detection=${fromMetadata.detection}`);
    return fromMetadata;
  }

  const fromAnchorSplit = tryFirstPageAnchorSplit(pageText, page);
  if (fromAnchorSplit) {
    dbg(`page ${page}: detection=${fromAnchorSplit.detection}`);
    return fromAnchorSplit;
  }

  const fromFirstPage = tryFirstPageAuthorNote(pageText, page);
  if (fromFirstPage) {
    dbg(`page ${page}: detection=${fromFirstPage.detection}`);
    return fromFirstPage;
  }

  dbg(`page ${page}: detection=none`);
  return { mainText: pageText, footnotes: [], detection: "none" };
}

const FRONT_MATTER_MAX_OFFSET = 800; // search the first 800 chars of page text
const FRONT_MATTER_MAX_CHARS = 600; // total length cap on the stripped block
const FRONT_MATTER_MIN_WORDS = 3; // need at least chapter + title + something
const FRONT_MATTER_MIN_CAP_RATIO = 0.35; // ≥35% words start with capital

const KNOWN_SECTION_NAMES_PATTERN =
  "Introduction|Conclusion|Conclusions|Abstract|Background|Methods|Methodology|Results|Findings|Discussion|References|Bibliography|Acknowledgments|Acknowledgements|Appendix|Summary|Notes|Overview|Preface|Foreword|Epilogue";

// Lowercase words that, when they follow a section-name candidate, signal
// the candidate is just a word in a phrase ("Introduction to Logic"), not
// a real section heading.
const FRONT_MATTER_BLOCKERS_PATTERN =
  "to|of|by|for|in|on|at|from|with|and|or|the|a|an|as|via|using|toward|towards|that|this|these|those";

/**
 * Locate the first plausible section-heading word in `text`.
 *
 * The lookbehind requires preceding context that suggests we just left a
 * front-matter token (a capital word, a sentence end, a newline, a digit
 * like "13", or the very start of the text). The lookahead rejects matches
 * where the word is just a noun phrase ("Introduction to Logic" — "to" is
 * a blocker). The capital-letter capture ensures whatever follows looks
 * like real prose (a sentence start).
 */
const FRONT_MATTER_HEADING_RE = new RegExp(
  `(?<=(?:^|[.!?]\\s+|\\n\\s*|[A-Z][a-zA-Z]+\\s+|\\d+\\s+))(${KNOWN_SECTION_NAMES_PATTERN})\\s+(?!(?:${FRONT_MATTER_BLOCKERS_PATTERN})\\b)([A-Z])`,
);

export interface FrontMatterResult {
  /** Page text with the front-matter block removed (heading + body remain). */
  mainText: string;
  /** Concatenated front-matter text — chapter number + title + author + any preceding lines. */
  frontMatter: string;
}

/**
 * Strip the title-page block from the START of page-1 text. Handles both
 * shapes unpdf can produce:
 *
 *   (A) line-by-line:
 *     "CHAPTER 13"
 *     "Middle Power Foreign Policy in an Era of Gray Zone Conflict…"
 *     "Dani Belo"
 *     "Introduction"
 *     "A defining characteristic of contemporary international relations…"
 *
 *   (B) collapsed-into-one-line (the actual Belo extraction):
 *     "CHAPTER 13 Middle Power Foreign Policy … Canada Dani Belo Introduction A defining…"
 *
 * Both produce the same result:
 *   mainText  = "Introduction\n\nA defining characteristic …"
 *   frontMatter = "CHAPTER 13 Middle Power … Dani Belo"
 *
 * Conservative — bails when:
 *   - no known section heading is found within the first 800 chars of text
 *   - the section name is followed by a lowercase preposition/article
 *     ("Introduction to Logic" → bail)
 *   - the pre-heading block exceeds 600 chars (probably body, not front matter)
 *   - the pre-heading block ends in sentence-prose punctuation
 *     (`lowercase + .|!|?`) — body text, not a title
 *   - the pre-heading block has fewer than 3 words
 *   - fewer than 35% of pre-heading words start with a capital letter
 *     (titles are mostly capitalized; body prose is mostly lowercase)
 *
 * Returns null when no front-matter is detected; caller leaves text alone.
 * Page 1 only — caller enforces that.
 */
export function stripFrontMatter(text: string): FrontMatterResult | null {
  if (!text || text.length < 20) return null;

  const m = FRONT_MATTER_HEADING_RE.exec(text);
  if (!m) {
    dbg("front-matter: no known section name found in pre-heading window");
    return null;
  }

  const headingStart = m.index;
  const headingName = m[1];
  const proseFirstChar = m[2];

  if (headingStart === 0) {
    // Heading is at the very start — nothing to strip.
    return null;
  }
  if (headingStart > FRONT_MATTER_MAX_OFFSET) {
    dbg(
      `front-matter: heading "${headingName}" at offset ${headingStart} — beyond ${FRONT_MATTER_MAX_OFFSET}, bailing`,
    );
    return null;
  }

  const frontMatterRaw = text.slice(0, headingStart).trim();
  if (frontMatterRaw.length === 0) return null;
  if (frontMatterRaw.length > FRONT_MATTER_MAX_CHARS) {
    dbg(
      `front-matter: block ${frontMatterRaw.length}c > ${FRONT_MATTER_MAX_CHARS} — bailing (looks like body)`,
    );
    return null;
  }
  if (/[a-z][.!?]\s*$/.test(frontMatterRaw)) {
    dbg("front-matter: block ends in sentence-prose punctuation — bailing");
    return null;
  }

  const words = frontMatterRaw
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length < FRONT_MATTER_MIN_WORDS) return null;
  const capCount = words.filter((w) => /^[A-Z]/.test(w)).length;
  const capRatio = capCount / words.length;
  if (capRatio < FRONT_MATTER_MIN_CAP_RATIO) {
    dbg(
      `front-matter: cap-ratio ${(capRatio * 100).toFixed(0)}% < ${FRONT_MATTER_MIN_CAP_RATIO * 100}% — looks like prose, bailing`,
    );
    return null;
  }

  // Reconstruct: heading + remainder (preserving the prose continuation).
  // m[0] is `"<heading><whitespace><proseFirstChar>"` — we want to put back
  // the heading on its own line, then the prose starting with proseFirstChar.
  const afterMatchEnd = headingStart + m[0].length;
  const remainder = text.slice(afterMatchEnd);
  const mainText = `${headingName}\n\n${proseFirstChar}${remainder}`;

  dbg(
    `front-matter: STRIPPED ${frontMatterRaw.length}c (${words.length} words, ${(capRatio * 100).toFixed(0)}% caps) — heading "${headingName}" at offset ${headingStart}`,
  );

  return {
    mainText,
    frontMatter: frontMatterRaw.replace(/\s+/g, " ").trim(),
  };
}
