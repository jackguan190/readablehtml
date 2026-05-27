/**
 * Cross-page repeated-line detection. Identifies running headers/footers
 * (e.g. "13 MIDDLE POWER FOREIGN POLICY IN AN ERA OF GRAY ZONE ... 279")
 * by counting near-identical lines that appear on multiple pages.
 *
 * Pipeline placement: runs in `extraction.ts` AFTER `normalizePdfText` and
 * BEFORE footnote extraction / paragraphize / structuring. So all downstream
 * consumers (heuristic structurer, AI structurer, paragraphizer, footnote
 * detector) see header-stripped text and never have to defend against them.
 *
 * Conservative tuning:
 *   - Requires ≥3 total pages — repetition isn't meaningful on tiny PDFs.
 *   - Only top-3 / bottom-3 lines of each page are candidates (running
 *     elements are physically at page edges).
 *   - Lines are normalized by collapsing digits to `#` and stripping
 *     punctuation/casing so "Title ... 279" and "Title ... 280" count as
 *     the same running header.
 *   - A normalized line is treated as a running header only when it appears
 *     on ≥ max(2, ceil(pageCount × 0.30)) pages.
 *   - We remove the ORIGINAL line (not just the normalized form) from each
 *     page where it occurs — by matching the raw line text.
 *
 * Text is not deleted permanently — the stripped lines are returned in
 * `removedHeaders` so a future "restore" path could recover them.
 */

export interface RunningHeaderResult {
  /** Per-page text with detected headers/footers stripped. Same order as input. */
  pages: { page: number; text: string }[];
  /** The set of original line strings classified as running headers/footers. */
  removedHeaders: string[];
}

const MIN_LINE_LEN = 5;
const MAX_LINE_LEN = 150;
const EDGE_LINES = 3; // top-3 + bottom-3 are header/footer candidates
const REPEAT_RATIO = 0.3; // ≥30% of pages
const MIN_PAGES_TO_RUN = 3;

function normalize(line: string): string {
  return line
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s#]/g, "")
    .toLowerCase()
    .trim();
}

function edgeCandidateIndices(lineCount: number): number[] {
  const out: Set<number> = new Set();
  for (let i = 0; i < Math.min(EDGE_LINES, lineCount); i++) out.add(i);
  for (
    let i = Math.max(0, lineCount - EDGE_LINES);
    i < lineCount;
    i++
  )
    out.add(i);
  return Array.from(out);
}

export function stripRunningHeaders(
  pages: { page: number; text: string }[],
): RunningHeaderResult {
  if (pages.length < MIN_PAGES_TO_RUN) {
    return { pages, removedHeaders: [] };
  }

  // Count occurrences of normalized candidate lines and remember the
  // original strings that produced each normalized form.
  const counts = new Map<
    string,
    { count: number; originals: Set<string> }
  >();

  const perPageLines = pages.map((p) => p.text.split("\n"));

  perPageLines.forEach((lines) => {
    for (const i of edgeCandidateIndices(lines.length)) {
      const raw = lines[i] ?? "";
      const trimmed = raw.trim();
      if (trimmed.length < MIN_LINE_LEN || trimmed.length > MAX_LINE_LEN) {
        continue;
      }
      const norm = normalize(trimmed);
      if (norm.length === 0) continue;
      const entry = counts.get(norm) ?? {
        count: 0,
        originals: new Set<string>(),
      };
      entry.count++;
      entry.originals.add(trimmed);
      counts.set(norm, entry);
    }
  });

  const threshold = Math.max(2, Math.ceil(pages.length * REPEAT_RATIO));
  const removedSet = new Set<string>();
  for (const entry of counts.values()) {
    if (entry.count >= threshold) {
      entry.originals.forEach((o) => removedSet.add(o));
    }
  }

  if (removedSet.size === 0) {
    return { pages, removedHeaders: [] };
  }

  const cleanedPages = pages.map((p, idx) => {
    const lines = perPageLines[idx];
    const kept = lines.filter((line) => !removedSet.has(line.trim()));
    return { page: p.page, text: kept.join("\n") };
  });

  return {
    pages: cleanedPages,
    removedHeaders: Array.from(removedSet),
  };
}
