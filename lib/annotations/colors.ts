export const HIGHLIGHT_COLOR_ORDER = [
  "yellow",
  "red",
  "green",
  "blue",
  "purple",
  "pink",
  "orange",
  "gray",
] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLOR_ORDER)[number];

export type HighlightStyle = "highlight" | "underline";

export interface HighlightColorPalette {
  swatch: string; // the round dot in the toolbar
  bg: string; // background fill for highlight style
  underline: string; // border-bottom color for underline style
  ring: string; // outline used when a mark is selected
}

export const HIGHLIGHT_COLORS: Record<HighlightColor, HighlightColorPalette> = {
  yellow: {
    swatch: "#fde047",
    bg: "rgba(253, 224, 71, 0.55)",
    underline: "#ca8a04",
    ring: "#facc15",
  },
  red: {
    swatch: "#fca5a5",
    bg: "rgba(252, 165, 165, 0.55)",
    underline: "#dc2626",
    ring: "#f87171",
  },
  green: {
    swatch: "#86efac",
    bg: "rgba(134, 239, 172, 0.55)",
    underline: "#16a34a",
    ring: "#4ade80",
  },
  blue: {
    swatch: "#93c5fd",
    bg: "rgba(147, 197, 253, 0.55)",
    underline: "#2563eb",
    ring: "#60a5fa",
  },
  purple: {
    swatch: "#c4b5fd",
    bg: "rgba(196, 181, 253, 0.55)",
    underline: "#7c3aed",
    ring: "#a78bfa",
  },
  pink: {
    swatch: "#f9a8d4",
    bg: "rgba(249, 168, 212, 0.55)",
    underline: "#db2777",
    ring: "#f472b6",
  },
  orange: {
    swatch: "#fdba74",
    bg: "rgba(253, 186, 116, 0.55)",
    underline: "#ea580c",
    ring: "#fb923c",
  },
  gray: {
    swatch: "#d4d4d8",
    bg: "rgba(212, 212, 216, 0.55)",
    underline: "#52525b",
    ring: "#a1a1aa",
  },
};

export function isHighlightColor(v: unknown): v is HighlightColor {
  return typeof v === "string" && v in HIGHLIGHT_COLORS;
}

export function paletteOrDefault(
  v: unknown,
): { color: HighlightColor; palette: HighlightColorPalette } {
  const color: HighlightColor = isHighlightColor(v) ? v : "yellow";
  return { color, palette: HIGHLIGHT_COLORS[color] };
}
