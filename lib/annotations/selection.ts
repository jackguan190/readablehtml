export interface CapturedSingleParagraph {
  ok: true;
  paragraphId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  rect: DOMRect;
}

export interface CapturedMultiParagraph {
  ok: false;
  reason: "multi-paragraph";
  rect: DOMRect;
}

export type CapturedSelection =
  | CapturedSingleParagraph
  | CapturedMultiParagraph
  | null;

function findParagraphAncestor(
  node: Node,
  scope: HTMLElement,
): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== scope) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const el = cur as HTMLElement;
      if (el.dataset && el.dataset.paragraphId) return el;
    }
    cur = cur.parentNode;
  }
  return null;
}

/**
 * Walk the paragraph element's text nodes in document order, summing lengths
 * up to (but not including) the target node, then add the in-node offset.
 * This gives the offset relative to the paragraph's plain text content.
 *
 * Subtrees flagged with `data-skip-offset="true"` are excluded from the walk —
 * used for page-marker pills rendered inside the <p> that aren't part of the
 * paragraph's plain text.
 */
export function getOffsetInElement(
  element: HTMLElement,
  node: Node,
  offset: number,
): number {
  if (!element.contains(node) && node !== element) return -1;
  let total = 0;
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(n) {
        let p: Node | null = n.parentNode;
        while (p && p !== element) {
          if (p.nodeType === Node.ELEMENT_NODE) {
            const el = p as HTMLElement;
            if (el.dataset && el.dataset.skipOffset === "true") {
              return NodeFilter.FILTER_REJECT;
            }
          }
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  let n: Node | null = walker.nextNode();
  while (n) {
    if (n === node) return total + offset;
    total += (n.textContent ?? "").length;
    n = walker.nextNode();
  }
  // If the node is the paragraph element itself (rare), offset is a child index.
  return total;
}

export function captureSelection(scope: HTMLElement): CapturedSelection {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  if (!scope.contains(range.commonAncestorContainer)) return null;

  const text = range.toString().trim();
  if (text.length === 0) return null;

  const rect = range.getBoundingClientRect();
  // ignore selections that produce a zero-size rect (e.g. inside hidden nodes)
  if (rect.width === 0 && rect.height === 0) return null;

  const startPara = findParagraphAncestor(range.startContainer, scope);
  const endPara = findParagraphAncestor(range.endContainer, scope);

  if (!startPara || !endPara) return null;
  if (startPara !== endPara) {
    return { ok: false, reason: "multi-paragraph", rect };
  }

  const startOffset = getOffsetInElement(
    startPara,
    range.startContainer,
    range.startOffset,
  );
  const endOffset = getOffsetInElement(
    startPara,
    range.endContainer,
    range.endOffset,
  );
  if (startOffset < 0 || endOffset < 0) return null;

  return {
    ok: true,
    paragraphId: startPara.dataset.paragraphId as string,
    text,
    startOffset: Math.min(startOffset, endOffset),
    endOffset: Math.max(startOffset, endOffset),
    rect,
  };
}

export function clearNativeSelection(): void {
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    /* noop */
  }
}
