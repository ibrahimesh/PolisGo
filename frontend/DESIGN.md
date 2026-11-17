# PolisGo — "Midnight Institutional" v2

A design language for an insurance platform that should feel like a serious
financial institution set by a careful editorial designer — not a template.
Calm, precise, legible. Big serif statements, a quiet sans-serif interface,
hairlines doing the structural work.

## What changed in v2 (and why)

| v1                                         | v2                                                   | Why                                                    |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------ |
| Tiny uppercase mono labels, "01 — Section" | Sentence-case labels, 14px medium; no eyebrows       | Read as decoration, not information; too small to read |
| JetBrains Mono for numbers and labels      | Inter Tight with tabular figures                     | One UI family; numbers still align                     |
| 12px text in places                        | 14px minimum, 16px body, enforced by the type scale  | Legibility; smaller sizes no longer exist              |
| Pure white cards, cool grey light theme    | Warm stone light theme, ivory data card              | No glare; owner feedback                               |
| Decorative wireframe line-art              | Removed                                              | Ornament without information                           |
| Header with inline settings only           | Sticky header, mobile menu, Ctrl/⌘+K command palette | Navigation that scales with the product                |

Kept on purpose: dark as default, the large Source Serif 4 headline with an
italic accent, the factor-axes diagram and its animations, hairline grids.

## Principles

1. **Information first.** Numbers, factors and statuses are the content.
2. **Asymmetric, editorial layout.** 12-column grid; headlines span wide,
   supporting text sits offset; never a centred symmetrical hero.
3. **Structure is visible.** 1px hairlines divide. No shadows except the
   modal and palette; no gradients, glows or blobs.
4. **One accent, used sparingly.** The primary action and key data only.
5. **Restrained motion.** Scroll reveal, hover and focus; nothing loops.
   `prefers-reduced-motion` disables all of it.
6. **Original.** No stock illustrations, emoji, icon-in-circle feature
   grids, uniform rounded cards, or resemblance to a real brand or emblem.
7. **Local by default.** EN / RU / AZ for every string; fonts render
   Cyrillic and Azerbaijani Latin (ə ş ç ğ ı ö ü); money is AZN.

## Colour

Tokens are CSS variables on `:root[data-theme]`, exposed to Tailwind as
`bg-bg`, `text-muted`, `border-line`, … Components never use raw hex.

| Token         | Dark                    | Light (warm stone) | Use                              |
| ------------- | ----------------------- | ------------------ | -------------------------------- |
| `bg`          | `#050816`               | `#D9D6CF`          | Page                             |
| `surface`     | `#0B1030`               | `#E6E3DC`          | Inputs, palette, menus           |
| `surface-2`   | `#121842`               | `#DEDBD3`          | Hover / active row               |
| `line`        | `rgba(255,255,255,.12)` | `rgba(0,0,0,.14)`  | Hairlines                        |
| `line-strong` | `rgba(255,255,255,.28)` | `rgba(0,0,0,.32)`  | Input borders                    |
| `text`        | `#E8EAF6`               | `#14161F`          | Body, headings                   |
| `muted`       | `#8A90B8`               | `#474A57`          | Secondary text, labels           |
| `accent`      | `#8B93FF`               | `#343A96`          | Primary action, key data, focus  |
| `accent-ink`  | `#050816`               | `#EEECE6`          | Text on an accent fill           |
| `paper`       | `#E9E7E1`               | `#EEECE6`          | Data card (quote result, tables) |
| `danger`      | `#FF9C9C`               | `#8E1B26`          | Errors                           |
| `success`     | `#7FE0B5`               | `#1F5B3A`          | Met rules, healthy status        |
| `warning`     | `#F2C46D`               | `#6B4A00`          | Caution                          |

Ink on the data card is the same in both themes: `paper-ink #14161F`,
`paper-muted #474A57`, `paper-accent #343A96`. **No pure white anywhere.**

### Contrast (WCAG 2.x, measured)

| Pair                                         | Ratio           |
| -------------------------------------------- | --------------- |
| Dark `text` on `bg` / `surface`              | 16.7 / 15.5     |
| Dark `muted` on `bg` / `surface`             | 6.4 / 6.0       |
| Dark `accent` on `bg` / `surface`            | 7.3 / 6.8       |
| `accent-ink` on dark `accent`                | 7.3             |
| Light `text` on `bg` / `surface`             | 12.4 / 14.1     |
| Light `muted` on `bg` / `surface`            | 6.1 / 6.9       |
| Light `accent` on `bg` / `surface`           | 6.6 / 7.5       |
| `accent-ink` on light `accent`               | 8.1             |
| Light `danger` / `success` / `warning` on bg | 6.2 / 5.5 / 5.6 |
| `paper-ink` on dark / light `paper`          | 14.6 / 15.3     |
| `paper-muted` / `paper-accent` on `paper`    | 7.1+ / 7.8+     |

Body text and labels never drop below 4.5:1 (most are above 6:1). Hairlines
are decorative and never the only signal of state. The axe e2e suite checks
Landing, Login and Register in both themes.

## Typography

| Role             | Family             | Notes                                         |
| ---------------- | ------------------ | --------------------------------------------- |
| Headlines, price | **Source Serif 4** | Optical sizing; italic for one-phrase accents |
| Everything else  | **Inter Tight**    | Labels 14px medium, sentence case             |

Numbers use tabular figures everywhere (`tabular` utility).

**The scale — the only sizes that exist** (Tailwind's defaults are cleared,
so nothing below 14px can be written):

| Token       | Size | Use                                   |
| ----------- | ---- | ------------------------------------- |
| `text-sm`   | 14   | Labels, captions, hints (minimum)     |
| `text-base` | 16   | Body, inputs, tables                  |
| `text-lg`   | 20   | Lead paragraphs, sub-headings         |
| `text-xl`   | 28   | Card and modal titles                 |
| `text-2xl`  | 40   | Section headings on small screens     |
| `text-3xl`  | 64   | Section headings, the price           |
| `text-4xl`  | 96   | Display headline, the price (desktop) |

Heading pattern: serif lead plus an italic accent in `accent` —
"Insurance, _priced in the open._"

## Space, radius, lines

- **8pt grid.** Spacing uses even Tailwind steps (2, 4, 6, 8, 12, 16, 24…).
  Controls are 36 / 48 / 56px tall.
- **Radius 2px** on every box. Full circles only for status dots.
- **1px hairlines** for structure; **1.5px strokes** for icons and the diagram.

## Layout

- 12-column grid inside `max-w-7xl`, 16 / 24 / 32px gutters by breakpoint.
- Sections separated by full-bleed hairlines.
- Asymmetric splits (5/7, 4/8, 3/9); never a centred hero.

## Signature visual

The **factor-axes diagram**: one axis per pricing factor, a dashed ring at
×1.00, the quote's factors plotted as a polygon that morphs as inputs change,
with the price easing to its new value. On phones the drawing keeps its axes
and polygon while the labels move to the breakdown table directly below (at
~55% scale they would fall under 14px).

## Motion

- 150–480ms, `cubic-bezier(.2,.7,.2,1)`.
- Scroll reveal (fade and 16px rise, once), hover colour, focus ring, polygon
  morph, price tween, toast entry.
- Content is visible by default; JS opts elements into the reveal only when
  motion is allowed, so no-JS, reduced-motion and tests see everything.

## Components

`Button` · `Input` · `PhoneInput` · `PasswordField` · `Select` · `Card` ·
`Badge` · `Tabs` · `Table` · `Modal` · `Toast` · `Skeleton` · `EmptyState` ·
`FormErrorSummary` · `ThemeToggle` · `LanguageSwitcher` · `CommandPalette` ·
`Label`.

- A visible 2px accent focus ring on everything focusable.
- Every field has a visible label; errors are linked with `aria-describedby`,
  marked `aria-invalid`, and listed in a live summary on submit that moves
  focus to the first invalid field.
- Icon-only buttons carry an accessible name; where a control shows text
  (e.g. "Ctrl K") that text is part of its name.
- Tabs, combobox/listbox (palette) and disclosure (mobile menu, FAQ) follow
  the WAI-ARIA patterns; modal and palette use native `<dialog>`.

## Voice

Plain, specific, calm. "Indicative estimate", not "Get your best price!".
Errors say what to fix and show the server `traceId` when there is one.
