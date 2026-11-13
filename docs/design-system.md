# The Commissioner — Design System (UI‑1)

Nasreen-level boring spec that everything else hangs off of: the palette, the type, and the
rules for using them. `app/globals.css` is the implementation; this document is the contract.

**Owner:** UI‑1 (`feat/ui-design-system`). Treat `app/globals.css` and `app/layout.tsx` as
generated-by-this-spec — later UI work consumes the tokens, it does not re-tint them.

---

## 1. Direction

Broadsheet newspaper meets Linear. A serious administrative tool that reads like a printed
record — warm paper, ink, one confident stamp of colour — not a sports-bro dashboard.

| Rule | Implementation |
| --- | --- |
| Never pure white | page is `--background` `#F4EDDE` (newsprint) |
| Never pure black | ink is `--foreground` `#1E1D19` |
| One accent | `--primary` terracotta `#AB502C` — the commissioner's ink stamp |
| Surfaces lift, never glow | card is 1 lightness step above the page + a hairline border |
| Tight corners | 8px ceiling on `--radius` (see §5) |
| Colour is an opinion, not a default | most of the screen is paper + ink |

Dark mode is "the night desk", not "OLED black": warm charcoal `#17130D`, paper-coloured text
`#ECE7DE`, and a lighter terracotta `#DE835B` so the accent survives on a dark ground.

---

## 2. Tokens

All values are authored in **oklch** in `app/globals.css` (`:root` and `.dark`). The hexes
below are what those oklch triplets resolve to in sRGB — use them for reference, never as the
source of truth in CSS.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--background` | `#F4EDDE` | `#17130D` | page ground |
| `--foreground` | `#1E1D19` | `#ECE7DE` | body text |
| `--card` | `#F8F3E9` | `#211C16` | panels, tables, list rows |
| `--card-foreground` | `#1E1D19` | `#ECE7DE` | text on card |
| `--popover` | `#FAF6EE` | `#26211A` | menus, tooltips, dropdowns |
| `--popover-foreground` | `#1E1D19` | `#ECE7DE` | text on popover |
| `--primary` | `#AB502C` | `#DE835B` | primary buttons, links, active nav |
| `--primary-foreground` | `#F9F5EC` | `#301408` | text on primary |
| `--primary-hover` | `#9D3F1A` | `#EE8F63` | hover/pressed fill for primary |
| `--secondary` | `#E7DFCF` | `#302A23` | secondary buttons, quiet chrome |
| `--secondary-foreground` | `#2B2923` | `#E9E4DA` | text on secondary |
| `--muted` | `#E8E2D4` | `#2C2720` | inset surfaces, table stripes, disabled fills |
| `--muted-foreground` | `#645A4F` | `#A8A094` | secondary/meta text |
| `--accent` | `#E5D9C5` | `#3A3126` | hover/selected row background (shadcn `accent` = surface, *not* brand) |
| `--accent-foreground` | `#2B2923` | `#ECE7DE` | text on accent |
| `--destructive` | `#A7182A` | `#E45D58` | delete, errors, losses |
| `--destructive-foreground` | `#F9F5EC` | `#ECE7DE` | text on destructive |
| `--success` | `#2B7444` | `#69B980` | wins, confirmed, healthy |
| `--success-foreground` | `#F9F5EC` | `#301408` | text on success |
| `--warning` | `#895709` | `#E1AD63` | pending, trade deadline approaching |
| `--warning-foreground` | `#F9F5EC` | `#301408` | text on warning |
| `--border` | `#D9D2C3` | `#3B342B` | hairlines, card outlines, dividers |
| `--input` | `#D1CABA` | `#433C33` | form control borders (a step darker than `--border`) |
| `--ring` | `#C06D4D` | `#C06D4D` | focus ring |

Every colour token is also a Tailwind colour because of the `@theme inline` block, so
`bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*`, `from-*` and `/opacity` modifiers work:
`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary/10`.

### Status colours are for status, not for buttons

`--primary` carries brand meaning. `--success` / `--warning` / `--destructive` are reserved for
state: result rows, badges, validation. A green "create league" button is a bug — it makes the
W/L legend meaningless.

### Tint pattern (badges, chips, callouts)

Use the token at low alpha over a surface, never a hard-coded pastel:

```tsx
<span className="rounded-md bg-success/12 px-2 py-0.5 text-xs font-medium text-success">Won 3</span>
```

Measured worst case in the tint set (text on its own 15 % wash): destructive 5.33:1,
success 4.54:1, warning 4.86:1, all ≥ AA.

### Do not

- Do not use raw palette classes (`bg-zinc-50`, `text-black`, `bg-blue-500`, `dark:bg-*`) —
  they bypass the theme and are what the pre‑UI‑1 scaffold pages are full of. They are on the
  migration list for UI‑2/UI‑3.
- Do not hard-code hexes in components. Need a new value? Add a token to `globals.css` and
  this table in the same PR.
- Do not redefine `:root` / `.dark` from a route-level stylesheet.

---

## 3. Typography

| Role | Family | Loaded as | Utility |
| --- | --- | --- | --- |
| UI / body | **Geist** | `next/font/google` → `--font-geist-sans` | `font-sans` (applied on `<html>`) |
| Display / headings | **Playfair Display** (variable 400–900) | `next/font/google` → `--font-playfair-display` | `font-serif` |
| Numerals, IDs, mono | **Geist Mono** | `next/font/google` → `--font-geist-mono` | `font-mono` |

Both `--font-sans` and `--font-serif` carry generic fallbacks in the `@theme inline` block, so
a failed font load degrades to `ui-sans-serif` / `Georgia` instead of Times-by-accident.

`app/globals.css` `@layer base` sets `h1`–`h4` in the serif with `-0.011em` tracking and
`text-wrap: balance`. Utilities beat base-layer rules in Tailwind v4, so a component that wants
sans headings just adds `font-sans` — no `!important`, no specificity fight.

Playfair ships real 400–900 weights: `font-semibold` / `font-bold` on a heading resolve to
actual weight rather than a synthesised blob. (This is why Playfair was chosen over
Instrument Serif, which is 400-only and fakes bold badly.)

Body copy sizes: `text-sm` for dense tables, `text-base` for prose, `text-2xl`/`text-3xl` for
page titles, `text-4xl`+ only on marketing/empty states. `tracking-tight` on anything ≥ `text-2xl`.

Tabular figures are automatic inside `<table>` and on `[data-numeric="true"]`; elsewhere use the
`tabular-nums` utility on standings, scores and records so columns of digits align.

---

## 4. Elevation & borders

Shadow is a last resort. Order of preference for separating a surface:

1. `border border-border` — the default.
2. `bg-card` against `bg-background` — a 1-step lightness lift.
3. `shadow-xs` / `shadow-sm` — floating things only (popovers, sticky bars, modals).

Dividers are `border-border`; form control outlines are `border-input` (slightly stronger, so a
disabled-looking input doesn't read as a disabled control).

---

## 5. Radius

`--radius: 0.5rem` (8px) — the brief's ceiling, with room under it:

| Utility | Value | Use |
| --- | --- | --- |
| `rounded-sm` | 4px | tags, inline code |
| `rounded-md` | 6px | inputs, small buttons |
| `rounded-lg` | 8px | buttons, badges, controls |
| `rounded-xl` | 10px | cards, sheets |

`rounded-xl` is deliberately capped at `--radius + 2px` (Tailwind's default +4px puts you at
12px and the bubbles start).

---

## 6. Interaction states

- **Focus:** never remove a ring. `focus-visible:ring-3 focus-visible:ring-ring/50` is already
  in the Button recipe; anything new that takes input gets the same treatment.
- **Hover:** darken the *fill* with a real token (`hover:bg-primary-hover`), do not fade it with
  alpha. `hover:bg-primary/80` composited over newsprint renders `#BD8571`, which measured
  **2.86:1** against the cream label — an AA failure. That is why `--primary-hover` exists and
  why `components/ui/button.tsx` was switched to it.
- **Pressed:** the base Button uses `active:translate-y-px`. Keep it; it reads as a stamp.
- **Disabled:** `disabled:opacity-50` + `aria-disabled`; never rely on colour alone.

---

## 7. Accessibility

WCAG 2.x ratios computed from the shipped oklch values (converted to sRGB, then relative
luminance) — not eyeballed:

| Pair | Light | Dark |
| --- | --- | --- |
| `foreground` on `background` | 14.47 | 15.02 |
| `foreground` on `card` | 15.25 | 13.73 |
| `muted-foreground` on `background` | 5.78 | 7.15 |
| `muted-foreground` on `card` | 6.09 | 6.54 |
| `muted-foreground` on `muted` | 5.22 | 5.73 |
| `primary` on `background` (link text) | 4.60 | 6.61 |
| `primary-foreground` on `primary` | 4.93 | 6.10 |
| `primary-foreground` on `primary-hover` | 6.11 | 7.11 |
| `secondary-foreground` on `secondary` | 10.98 | 11.19 |
| `accent-foreground` on `accent` | 10.43 | 10.35 |
| `destructive` on `card` | 6.76 | 4.83 |
| `success` on `card` | 5.15 | 7.13 |
| `warning` on `card` | 5.53 | 8.34 |

Every text pair clears **AA (4.5:1)** in both modes. `--ring` is 3.25:1 on light background,
which clears the 3:1 threshold for non-text UI components. Re-run the check after touching a
value; don't hand-wave it.

---

## 8. Build wiring (why `next.config.ts` changed)

Tailwind v4 was a dependency but nothing was compiling it: `@import "tailwindcss"`, `@theme`,
`@custom-variant` and every `@apply` were reaching the browser **verbatim**, so the site shipped
zero utility CSS (confirmed: the built chunk had 0 `oklch` occurrences and no `.flex{}`; the
running dev server's stylesheet was 8 KB of `@font-face` and nothing else).

The fix is the official Turbopack loader registered in `next.config.ts`:

```ts
turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } }
```

`@tailwindcss/turbopack@4.3.3` was already in `devDependencies`; it had simply never been wired
up. After the change the production chunk is 41 KB of real CSS with `@layer base` and the
utilities resolved, and the 5 "Unknown at rule: @theme / @apply" build warnings are gone.

Consequence for the rest of the team: **the app starts looking styled the moment this merges.**
Scaffold pages that were silently falling back to browser defaults now honour their existing
`bg-zinc-50` / `bg-blue-500` classes, which is exactly the look we are replacing — migrate them
to tokens rather than "fixing" the theme.

Verify without a dev server (this repo's workflow forbids `npm run dev`):

```bash
npx next build
grep -c oklch .next/static/chunks/*.css        # > 0 (theme vars survived minification)
grep -o '\.bg-background{[^}]*}' .next/static/chunks/*.css
```

---

## 9. Dark mode

Tokens are complete for both modes, switched by a `.dark` class on `<html>`
(`@custom-variant dark (&:is(.dark *))`). Nothing ships a toggle yet — UI‑2/UI‑3 own when it
appears. Write `dark:` variants against tokens (`dark:bg-input/30`), never against raw palette
colours, and the toggle becomes free.

---

## 10. Migration map (input for UI‑2 / UI‑3)

Hard-coded colour classes still in the app at the time of writing, by owner:

| File | Now | Should be |
| --- | --- | --- |
| `src/components/app-nav.tsx` | `border-zinc-200 bg-white dark:bg-zinc-900`, `text-black` | `border-border bg-card/80 backdrop-blur`, `text-foreground` |
| `src/components/app-shell.tsx` | (already tokenised in UI‑2's branch) | — |
| `app/page.tsx` | `bg-zinc-50 dark:bg-black`, `bg-blue-500`, `bg-green-500` | `bg-background`, `Button` variants |
| `app/login/page.tsx`, `app/signup/page.tsx` | `bg-white shadow-lg`, `border-zinc-300`, `bg-blue-500` | `bg-card border border-border shadow-xs`, `border-input`, `Button` |
| `app/invite/[token]/*` | `bg-zinc-200`, `border-green-200 bg-green-50` | `bg-secondary`, `bg-success/12 border-success/30` |
| `app/dashboard/page.tsx`, `app/leagues/**` | `text-black dark:text-zinc-50`, `border-zinc-300 bg-white` | `text-foreground`, `border-border bg-card` |

Also open, deliberately out of UI‑1 scope: a `Card` primitive in `components/ui/` (the tokens
are ready for it), a theme toggle, and a visual snapshot test.
