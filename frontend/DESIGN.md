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
5. **Restrained motion.** Motion explains a change (a page arriving, a
   number settling, a step done) and then stops; only a loading skeleton
   repeats. `prefers-reduced-motion` and Settings → Reduce motion disable
   all of it.
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

| Pair                                         | Ratio              |
| -------------------------------------------- | ------------------ |
| Dark `text` on `bg` / `surface`              | 16.7 / 15.5        |
| Dark `muted` on `bg` / `surface`             | 6.4 / 6.0          |
| Dark `accent` on `bg` / `surface`            | 7.3 / 6.8          |
| `accent-ink` on dark `accent`                | 7.3                |
| Light `text` on `bg` / `surface`             | 12.4 / 14.1        |
| Light `muted` on `bg` / `surface`            | 6.1 / 6.9          |
| Light `accent` on `bg` / `surface`           | 6.6 / 7.5          |
| `accent-ink` on light `accent`               | 8.1                |
| Light `danger` / `success` / `warning` on bg | 6.2 / 5.5 / 5.6    |
| `paper-ink` on dark / light `paper`          | 14.6 / 15.3        |
| `paper-muted` / `paper-accent` on `paper`    | 7.1+ / 7.8+        |
| Dark `text` / `muted` on `surface-2`         | 14.2 / 5.5         |
| Light `text` / `muted` on `surface-2`        | 13.0 / 6.4         |
| Dark `success` / `warning` / `danger` on bg  | 12.6 / 12.2 / 10.0 |
| `danger` on dark / light `surface`           | 9.3 / 7.0          |

Body text and labels never drop below 4.5:1 (most are above 6:1). Hairlines
are decorative and never the only signal of state. The axe e2e suite checks
Landing, Login, Register and every client cabinet page, claims included
(with the purchase and claim wizards' error summaries, the withdraw dialog,
the notifications panel and the user menu open) in both themes, at 1440px
and 390px.

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

A senior designer's motion: few, short, purposeful. **Transform and opacity
only**, 150–400ms, on shared tokens (CSS variables in `src/styles/index.css`,
`@theme`), no animation library.

| Token                  | Value                         | Use                                  |
| ---------------------- | ----------------------------- | ------------------------------------ |
| `--ease-institutional` | `cubic-bezier(.2,.7,.2,1)`    | Default: reveals, fades, slides      |
| `--ease-emphasized`    | `cubic-bezier(.3,0,0,1)`      | Chart bars, the bell, the shake      |
| `--ease-spring`        | `cubic-bezier(.34,1.4,.64,1)` | Dialogs, palette, popovers, toasts   |
| `--duration-fast`      | 150ms                         | Hover, press, focus ring, page exit  |
| `--duration-base`      | 240ms                         | Page enter, dialogs, theme crossfade |
| `--duration-slow`      | 400ms                         | Count-up, chart, scroll reveal       |

| Where                      | What                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Route change               | View Transitions: old page fades out, new one fades up 8px; header and sidebar stay. CSS fade where unsupported. Pathname changes only. |
| Theme change               | Whole-page crossfade (View Transitions)                                                                                                 |
| Lists, stat grids          | `stagger`: rows rise 6px, 40ms apart, at most 280ms of delay                                                                            |
| Key figures                | `CountUp` from zero, 400ms, tabular figures so nothing shifts                                                                           |
| Charts                     | `bar-in`: bars grow from the baseline, 20ms apart                                                                                       |
| Sidebar                    | One accent rule slides to the active item                                                                                               |
| Buttons                    | Press to 98%; the focus ring draws in (`focus-ring`)                                                                                    |
| Modal, palette, popovers   | Spring in (`dialog-in`, `animate-pop-in`); backdrop fades                                                                               |
| Toasts                     | Slide in from the right edge                                                                                                            |
| Skeletons                  | A faint band sweeps (400ms) then rests; the only repeating motion, while loading                                                        |
| Purchase and claim success | `SuccessCheck`: frame fades in, each stroke of the check grows                                                                          |
| Notifications              | The bell swings once when the unread count rises                                                                                        |
| Errors                     | Notices fade in; a failed sign-in shakes once                                                                                           |
| Landing                    | Scroll reveal, the factor diagram's polygon morph and price tween (kept)                                                                |

- Content is visible by default and nothing waits on JavaScript to appear;
  transforms don't move layout (the CLS e2e check stays under 0.1).
- Reduced motion (OS or Settings) ends every animation at its final frame and
  skips view transitions and count-ups.

## Components

`Button` · `Input` · `PhoneInput` · `PasswordField` · `Select` · `Card` ·
`Badge` · `Tabs` · `Table` · `Modal` · `Toast` · `Skeleton` · `EmptyState` ·
`FormErrorSummary` · `ErrorNotice` · `ReferenceChip` · `ErrorPage` ·
`ChoiceChips` · `ActorCombobox` · `SearchField` · `ErrorBadges` · `ReferenceLookup` · Settings dialog (`SettingsFields`) · `CommandPalette` ·
`Label` · `PageHeader` · `PolicyStatusBadge` · `ClaimStatusBadge` · `StepNav`
(both wizards) · `QuoteResult` (full or compact) · `Textarea` (with a live
count) · `Pagination` · `FileUploader` · `ExportButton` · `Modal`
(`size="wide"` for document previews) · `DateField` (with `FormDateField`
and `DateFilterField`) · `StaffPicker` · `BarChart` · `ProductIcon` ·
`CountUp` · `SuccessCheck`.

- **Header.** Logo (always to `/`), the sections, a compact search button
  (icon and the word "Search"; the icon alone below sm, with the same
  accessible name; the Ctrl/⌘+K shortcut only in its tooltip and in the
  palette's key hints) and the account area; nothing in it wraps, from
  390px up. The first
  three sections show from lg, the others join at xl and sit under a "More"
  disclosure in between; below lg everything is in the menu panel. No
  language or theme controls in any header.
- **Settings dialog.** Appearance (Light, Dark, System), Language (each
  named in its own language) and Reduce motion, as choice chips and a
  checkbox; opened from the user menu, the palette, the footer and the
  mobile menu, and shown inline on the profile page. Saved on the device.
- **ErrorNotice.** A `danger` hairline box: alert icon, the translated
  message, and a Reference chip ("Reference 8F05E497", the first 8
  characters of the trace id) with a copy button that confirms "Copied". The
  full id is the chip's tooltip and the copy button's description. Field
  validation shows no reference; a sign-in failure stays generic.
- **Error pages.** One layout for 404, 403, 500, session ended, offline,
  unreachable and maintenance: a 96px hairline document glyph with one accent
  element that settles once, a label, a serif headline with an italic
  accent, a plain sentence, the Reference chip when there is a trace id, and
  Back / Home / Reload. Inside the cabinet it uses the signed-in scale.
- **Product marks.** 24px line drawings (MTPL two vehicles, CASCO one with an
  impact mark) in a 40px `line-strong` square, accent stroke. Every sidebar
  item has its own icon within a role.

- A visible 2px accent focus ring on everything focusable.
- Every field has a visible label; errors are linked with `aria-describedby`,
  marked `aria-invalid`, and listed in a live summary on submit that moves
  focus to the first invalid field.
- Icon-only buttons carry an accessible name; where a control shows text
  (e.g. "Search") its accessible name starts with that text.
- Tabs, combobox/listbox (palette) and disclosure (mobile menu, FAQ) follow
  the WAI-ARIA patterns; modal and palette use native `<dialog>`.

## Signed-in area (client cabinet)

- **Shell.** A 16rem sidebar from `lg` up; below it a fixed bottom bar with
  at most five sections (`sections.ts` decides which). The active item has an
  accent rule (left edge in the sidebar, top edge in the bar) as well as a
  fill, so state never rests on colour alone. The header holds the palette,
  the reminders bell (Clients) and the user menu (which opens Settings).
- **Page scale.** `PageHeader`: a serif h1 at 40px (28px on phones) with an
  optional italic accent, a muted lead and the page's actions. Section titles
  are 28px. The 64–96px sizes stay on the landing page.
- **Figures.** Key numbers (stats, prices) use the serif with tabular figures,
  in a boxed grid drawn by 1px gaps over the line colour, so the hairlines
  hold at one, two or four columns.
- **Data card.** `Card variant="paper"` carries the facts of a policy or a
  payment: ivory in both themes. Status badges on it switch to paper ink
  (`onPaper`), because the theme's status colours lack contrast there.
- **Status.** Badge plus a word: Active → success, Unpaid → warning,
  Expired → neutral, Cancelled → danger. Claims: Submitted → neutral,
  Under review → warning, Approved and Paid out → success, Rejected →
  danger, Withdrawn → neutral. Unread reminders and claim updates get a warning dot
  and "Unread" for screen readers. The bell's count is an accent square
  (`accent-ink` on `accent`), hidden from AT, with the count in the name.
- **Choices** (product, vehicle) are bordered cards around real radios; the
  checked card gets an accent border and `surface-2`, focus shows on the card.
- **Disabled choices** stay in the list with their reason in plain text
  (`text`, not muted, so it passes contrast) tied to the radio by
  `aria-describedby`: a policy that can't take a claim says why.
- **Stepper.** Five numbered steps (`StepNav`, five at most) in a hairline row; done steps show a check
  and can be revisited, the current one is filled with the accent and
  underlined. Phones get "Step 2 of 5 · Vehicle" and a five-segment bar.
- **Popovers** (user menu, reminders) are disclosures, not menus: bordered
  `surface`, no shadow, Escape returns focus to the button. The reminders
  panel becomes a full-width sheet on phones.
- **Live premium.** The wizard reuses the calculator's result card and factor
  diagram in a compact variant (stacked, 64px price) sized for its column.
- **Claim timeline.** A vertical hairline with an 11px ring per step; the
  latest step is filled with the accent. Each step: the status in words, the
  time and who acted ("by you", "by the adjuster, Name"), and the adjuster's
  note as a quote with a 2px `line-strong` rule. A decision sits above the
  page in a bordered box (`success` or `danger` at 60%), never a coloured
  fill.
- **Uploader.** A dashed `line-strong` drop zone with a real "Choose files"
  button (the file input itself is hidden from the tab order and from AT).
  Dragging over turns the border accent. Each file is a row: a 48px
  thumbnail (or a file icon), name, size, a 4px accent progress bar with
  `role="progressbar"`, and its error in `danger` with the trace id.
  Rejected files are named with the reason; nothing is dropped silently.
- **Staff desks.** Same shell; each role's sidebar, bottom bar and palette
  list only its own sections. Queue views are bordered link chips (accent
  border on the current one, `aria-current="page"`) with a muted count. A
  claim waiting a week or more gets a `warning` badge with its age; the
  word, not the colour, carries it.
- **Decision panel.** A `surface` card beside the claim from `xl` (sticky),
  right under the facts on smaller screens. Outcomes are choice cards around
  real radios; the reason field turns required for a rejection. Every
  unavailable action is listed under "Not available now" with its reason in
  plain words. A concurrent change shows a `warning`-bordered notice with
  the kept note in a read-only field; nothing is lost silently.
- **Document preview.** The wide modal shows an image (`object-contain`,
  70dvh) or a PDF in a titled iframe; the blob URL is revoked on close.
- **DateField.** A normal text control showing DD.MM.YYYY in every language
  with a calendar button inside its right edge. The calendar is a bordered
  `surface` popover (not a modal): month and year selects, a Monday-first
  grid of 36px days, today ringed with `line-strong`, the chosen day filled
  with the accent, days outside min/max `muted` and struck through (the
  reason is written under the grid and under the field, never colour alone).
  It fits 390px (min(21rem, 100vw − 2rem)).
- **Charts (admin dashboard).** One series per chart, filled with the accent,
  2px rounded data ends, 1px `line` gridlines with `muted` 14px labels sized
  to fit, no legend (the title names the series and its unit), no dual axes.
  The chart is one tab stop; arrow keys and hover show a `surface` tooltip,
  and a "Show the numbers as a table" disclosure follows each chart. Short
  categorical breakdowns (claims by status, top agents) are text rows with a
  3px-high accent bar and the number written out.
- **Choice chips.** Period presets and queue views are bordered chips that
  wrap (real radios or links); the current one gets the accent border and
  `surface-2`. `ChoiceChips` is the radio version (Settings uses it); the
  old segmented control is gone, since chips wrap at 390px.
- **Search field with a clear button.** A text input in the `searchbox`
  role (`enterKeyHint="search"`), so the browser adds no second X beside the
  field's own clear button; Escape clears too. While a new result loads the
  previous rows dim (`aria-busy`) and the count line says "Searching…": a
  count is only ever shown for the filters on screen, as "N events match
  “text”".
- **Actor combobox** (audit log). Labelled "Actor", a person icon and a
  chevron like a select, so it never reads as a second search box. Typing
  narrows the server's staff list; each option shows the name with role and
  email underneath, the current choice has a check; arrows, Home/End, Enter,
  Escape and Alt+↓ follow the WAI-ARIA combobox pattern. When more than 50
  match, the list says how many and asks for more letters.
- **System section** (Admin). Two views as link chips (Overview, Errors),
  like the queue views. The overview opens with the Reference lookup (the
  reason to come here), then health as a boxed tile grid (state words in
  `success`/`danger`/`warning`, the detail in `muted`), unresolved and
  regressed counters that link into the list, two one-series charts
  (`BarChart`) and the most frequent groups. Error badges: the source in
  words (API, Browser), the status (New → warning, Resolved → success,
  Ignored → neutral) and **Regressed** (danger, with the alert icon). The list
  is a table from md and stacked rows below it (never a sideways scroll);
  bulk actions appear in a bordered bar once rows are chosen. The detail puts
  the facts on the ivory data card (relative times in `paper-muted`), triage
  in a `surface` card beside it, and each occurrence in a hairline box with
  its Reference chip; the one a lookup led to gets the accent border and
  "The one you looked up". Stack traces and fingerprints are the only text in
  the system's own monospace (`font-mono`, no web font: code is read
  character by character), in a focusable box that scrolls inside itself.
- **Empty and loading.** Every list has a real empty state (and a separate
  "nothing matches" state); skeletons mirror the loaded layout. Nothing is
  mocked.

## Certificate (PDF)

A4, one page, drawn in the app's own type: Source Serif 4 for the masthead,
title ("Certificate of _insurance._" with the italic accent) and the policy
number and premium; Inter Tight for everything else. Ivory `paper`
background, `paper-ink` text, `paper-muted` labels, `paper-accent` section
headings and the wordmark, hairline rules (ink at 14%). The layout: masthead,
title and product, policy number with status, a two-column grid (holder,
vehicle, period, payment), then coverage beside the frozen premium breakdown,
and a disclaimer that PolisGo is a portfolio project. Measured on the ivory:
ink 15.3, muted 7.5, accent 8.1.

## Voice

Plain, specific, calm. "Indicative estimate", not "Get your best price!".
Errors say what to fix and show a short reference (the trace id's first 8
characters) when the server sent one.
