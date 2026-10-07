// Visual palettes and token themes a kid can be given. Keys are stored in
// the database, so add new ones but never rename existing keys.

export const COLOURS = {
  marigold: { k: "#FFC566", deep: "#B86E00", soft: "#FFF1D6", dark: { k: "#F4B24A", deep: "#FFC566", soft: "#2E2616" } },
  seaglass: { k: "#86D6C8", deep: "#17806D", soft: "#DDF4EF", dark: { k: "#5EC2B0", deep: "#86D6C8", soft: "#15302C" } },
  coral:    { k: "#FFA69E", deep: "#B8392E", soft: "#FFE4E1", dark: { k: "#F08A80", deep: "#FFA69E", soft: "#33201E" } },
  sky:      { k: "#9CC9FF", deep: "#2A62B8", soft: "#E3F0FF", dark: { k: "#79B2F5", deep: "#9CC9FF", soft: "#182A40" } },
  lilac:    { k: "#C9B6F2", deep: "#6B45C2", soft: "#EFE8FC", dark: { k: "#B09AE6", deep: "#C9B6F2", soft: "#2A2140" } },
  lime:     { k: "#C6E57A", deep: "#5E8A00", soft: "#EFF8D9", dark: { k: "#AED45A", deep: "#C6E57A", soft: "#263315" } },
} as const;

export type ColourKey = keyof typeof COLOURS;
export const COLOUR_KEYS = Object.keys(COLOURS) as ColourKey[];

export const TOKENS = {
  star:    { emoji: "⭐", one: "star", many: "stars" },
  dino:    { emoji: "🦖", one: "dinosaur", many: "dinosaurs" },
  unicorn: { emoji: "🦄", one: "unicorn", many: "unicorns" },
  rocket:  { emoji: "🚀", one: "rocket", many: "rockets" },
  heart:   { emoji: "💖", one: "heart", many: "hearts" },
  gem:     { emoji: "💎", one: "gem", many: "gems" },
} as const;

export type TokenKey = keyof typeof TOKENS;
export const TOKEN_KEYS = Object.keys(TOKENS) as TokenKey[];

export function isColourKey(v: unknown): v is ColourKey {
  return typeof v === "string" && v in COLOURS;
}
export function isTokenKey(v: unknown): v is TokenKey {
  return typeof v === "string" && v in TOKENS;
}

export function tokenLabel(theme: string, n: number): string {
  const t = TOKENS[isTokenKey(theme) ? theme : "star"];
  return `${n} ${n === 1 ? t.one : t.many}`;
}

const ICONS: [RegExp, string][] = [
  [/get up|wake|out of bed/i, "☀️"], [/toilet|wee|loo/i, "🚽"], [/water|drink/i, "💧"],
  [/breakfast|eat/i, "🥣"], [/teeth/i, "🪥"], [/hair/i, "💇"], [/shoe/i, "👟"],
  [/book/i, "📚"], [/bag/i, "🎒"], [/dress|clothes|uniform/i, "👕"], [/coat|jacket/i, "🧥"],
  [/wash|face/i, "🧼"], [/bed/i, "🛏️"], [/lunch/i, "🥪"], [/sock/i, "🧦"], [/read/i, "📖"],
  [/tidy|toys/i, "🧸"], [/pet|dog|cat|feed/i, "🐾"], [/homework/i, "✏️"],
];

export function iconFor(task: string): string {
  return ICONS.find(([re]) => re.test(task))?.[1] ?? "⭐";
}

export const DEFAULT_TASKS = [
  "Get up", "Toilet", "Drink water", "Eat breakfast", "Brush teeth",
  "Brush hair", "Shoes ready", "School bag", "Book bag",
];
