# PolisGo — "Midnight Institutional"

A design language for an insurance platform that should feel like a serious
financial institution, not a growth-hacking startup. Calm, precise, legible.
Think a well-set annual report on a dark desk, not a neon dashboard.

## Principles

1. **Information first.** Numbers, factors and statuses are the content. Decoration
   never competes with data.
2. **Structure is visible.** Layout is built on a grid with 1px hairline dividers.
   Lines do the work that shadows and gradients do elsewhere.
3. **Quiet confidence.** Generous whitespace, few colours, one accent. Motion is
   short, functional and disappears under `prefers-reduced-motion`.
4. **Original.** No stock illustrations, no "AI look" gradients or glows, no
   resemblance to any real insurer's, bank's or state brand or emblem.
5. **Local by default.** Every string is translated (EN / RU / AZ), every font
   renders Cyrillic and Azerbaijani Latin (ə ş ç ğ ı ö ü), money is AZN.

## Colour

All colours are CSS variables on `:root[data-theme]` and exposed to Tailwind as
`bg-bg`, `text-muted`, `border-line`, etc. Components never use raw hex values.

| Token          | Dark                    | Light                | Use                               |
| -------------- | ----------------------- | -------------------- | --------------------------------- |
| `bg`           | `#050816`               | `#CBCEDB`            | Page background                   |
| `surface`      | `#0B1030`               | `#FFFFFF`            | Panels, inputs, header            |
| `surface-2`    | `#121842`               | `#F1F2F7`            | Hover / pressed surface           |
| `line`         | `rgba(255,255,255,.12)` | `rgba(11,16,48,.16)` | Hairline dividers, borders        |
| `line-strong`  | `rgba(255,255,255,.28)` | `rgba(11,16,48,.36)` | Input borders, focused structure  |
| `text`         | `#E8EAF6`               | `#0B1030`            | Body and headings                 |
| `muted`        | `#8A90B8`               | `#454B73`            | Secondary text, labels            |
| `accent`       | `#8B93FF`               | `#3840B8`            | Links, primary action, focus ring |
| `accent-ink`   | `#050816`               | `#FFFFFF`            | Text on accent fills              |
| `paper`        | `#FFFFFF`               | `#FFFFFF`            | Data cards ("white on navy")      |
| `paper-ink`    | `#0B1030`               | `#0B1030`            | Text on paper                     |
| `paper-muted`  | `#454B73`               | `#454B73`            | Secondary text on paper           |
| `paper-accent` | `#3840B8`               | `#3840B8`            | Accent on paper                   |
| `danger`       | `#FF9C9C`               | `#A3122A`            | Errors                            |
| `success`      | `#7FE0B5`               | `#0B5A3D`            | Positive states                   |
| `warning`      | `#F2C46D`               | `#6A4500`            | Caution                           |

The light accent is the dark accent darkened to clear WCAG AA on both the
dusty blue-grey background and white cards.

### Contrast (WCAG 2.x, measured)

| Pair                          | Ratio  |
| ----------------------------- | ------ |
| Dark `text` on `bg`           | 16.7:1 |
| Dark `muted` on `bg`          | 6.4:1  |
| Dark `muted` on `surface`     | 6.0:1  |
| Dark `accent` on `bg`         | 7.3:1  |
| `accent-ink` on dark `accent` | 7.3:1  |
| Light `text` on `bg`          | 11.8:1 |
| Light `muted` on `bg`         | 5.3:1  |
| Light `muted` on white        | 8.4:1  |
| Light `danger` on `bg`        | 5.0:1  |
| Light `success` on `bg`       | 5.3:1  |
| Light `warning` on `bg`       | 5.4:1  |
| Dark `danger` on `bg`         | 10.0:1 |
| Light `accent` on `bg`        | 5.2:1  |
| White on light `accent`       | 8.1:1  |
| `paper-ink` on `paper`        | 18.6:1 |

Body text and labels never drop below 4.5:1. Hairlines are decorative and are
never the only signal of state.

## Theme

- **Default is dark.** The user can pick Dark, Light or System; System follows
  `prefers-color-scheme` live.
- The choice is persisted in `localStorage` (`polisgo.theme`) and applied by an
  inline script in `index.html` before first paint, so there is no flash.
- `color-scheme` is set per theme so native controls (date pickers, scrollbars)
  match.

## Typography

| Role     | Family                        | Notes                                              |
| -------- | ----------------------------- | -------------------------------------------------- |
| Headings | **Source Serif 4** (variable) | Optical sizing on. Italic for single-word accents. |
| UI/body  | **Inter Tight** (variable)    | Tight grotesk; tracking `-0.01em` on large sizes.  |
| Labels   | **JetBrains Mono** (variable) | Small, uppercase, letter-spacing `.08em`.          |

All three are self-hosted via `@fontsource-variable` and ship `cyrillic`,
`cyrillic-ext` and `latin-ext` subsets (latin-ext covers `ə` U+0259, `ğ`, `ş`,
`ı`). Numbers in data use `tabular-nums`.

Scale (rem): 0.6875 label · 0.875 small · 1 body · 1.25 lead · 2 h3 · 2.75 h2 ·
clamp(2.75, 6vw, 5) display.

Heading accent pattern: one or two words in italic serif, coloured `accent`:
"Insurance, _priced in the open._"

## Layout

- **3-column grid** on desktop (`lg:grid-cols-3`), collapsing to one column.
  Columns are separated by 1px hairlines (`divide-x divide-line` or borders),
  never by gutters with shadows.
- Sections are framed by full-width hairlines top and bottom. Max content width
  `80rem` with the frame lines running edge to edge.
- Whitespace is generous: section padding `py-20`+ on desktop.
- Every block can carry a small mono label (`<Label>`) above it: index number +
  name, e.g. `01 — CALCULATOR`.

## Surfaces

- `surface` panels sit on `bg` with a hairline border, radius `2px` (near-square:
  institutional, not bubbly).
- **Paper cards** (white, navy ink) present data in both themes — the premium
  result, breakdown tables. They are the brightest thing on a dark page, so the
  eye goes to the number.
- No drop shadows except a single soft one on modals.

## Line-art

Thin (1px, `vector-effect: non-scaling-stroke`) wireframe drawings in `line` or
`accent` at low opacity: coordinate grids, axes, radial plots. The calculator's
"factor diagram" plots each pricing factor on its own axis around a neutral
ring at ×1.00. No pictorial illustrations.

## Motion

- Durations 120–240ms, `cubic-bezier(.2,.7,.2,1)`.
- Used only for state changes: price tween, polygon morph, toast entry, modal.
- `prefers-reduced-motion: reduce` disables transitions and tweens globally.

## Components

`Button` · `Input` · `Select` · `Card` (surface | paper) · `Badge` · `Tabs` ·
`Table` · `Modal` · `Toast` · `Skeleton` · `EmptyState` · `ThemeToggle` ·
`LanguageSwitcher` · `Label`.

Rules:

- Visible focus ring on everything focusable: 2px `accent` outline, 2px offset.
- Form fields always have a visible `<label>`; errors are linked with
  `aria-describedby` and announced (`role="alert"`).
- Icon-only buttons carry an `aria-label`.
- Tabs follow the WAI-ARIA tabs pattern (arrow keys, roving tabindex).
- Modal uses the native `<dialog>` for focus trapping and `Esc`.
- Toasts live in a polite `aria-live` region.

## Voice

Plain, specific, calm. "Indicative estimate" rather than "Get your best price!".
Error messages say what happened and what to do, and show the server
`traceId` as a reference when one exists.
