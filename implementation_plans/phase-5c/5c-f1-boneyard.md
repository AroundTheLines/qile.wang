# 5C-F1 — Boneyard skeleton registration + rebuild

**Epic**: F. Polish · **Owner**: Dev B (timeline targets) + Dev C (panel targets) pair · **Can be run by agent?**: Yes · **Estimated size**: S

## Dependencies

### Hard
- **B4** — Timeline component finalized.
- **C3** — PinPanel exists.
- **C4** — TripPanel exists.
- **E2** — MobileTripList exists.

### Soft
- None.

### Blocks
- **F2** (perf pass runs against a complete app).

---

## Goal

Wrap all Phase 5C skeletonized surfaces in `<Skeleton>` components with meaningful `fixture` content. Apply `data-no-skeleton` to transient chrome (playhead, today marker, close buttons, etc.). Run `npx boneyard-js build` to regenerate `.bones.json` files and the registry.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §13.6 Boneyard-js Integration
- §13.6.1 New boneyard targets
- §13.6.2 Exclusions via `data-no-skeleton`
- §13.6.3 Dark-mode bones
- §13.6.4 Build integration
- [`../../AGENTS.md`](../../AGENTS.md) — boneyard-js usage + `"use client"` note

## Files to read first

- [`../../AGENTS.md`](../../AGENTS.md) — boneyard-js section
- Current registry location: `./src/bones/registry` or `./bones/registry` — check the repo structure
- [`../../app/layout.tsx`](../../app/layout.tsx) — confirm `import './bones/registry'` exists

## Files to create / modify

Per target:

### 1. Timeline (`components/globe/Timeline.tsx`)

Already partially wrapped in prior tickets. Confirm the outer structure:

```tsx
'use client'

import { Skeleton } from 'boneyard-js/react'

export default function Timeline(...) {
  // ... existing logic ...

  return (
    <Skeleton
      name="timeline-strip"
      loading={false}
      fixture={<TimelineFixture />}
    >
      {/* real timeline content */}
    </Skeleton>
  )
}

/** Fixture: ~4 trips on a faux timeline for bone capture. Resembles real layout. */
function TimelineFixture() {
  return (
    <div className="w-full h-16 md:h-20 relative bg-black/5 dark:bg-white/5">
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-1.5 bg-black/10 dark:bg-white/10" />
      {[0.10, 0.25, 0.55, 0.82].map((x, i) => (
        <div key={i}>
          <div
            className="absolute inset-y-[25%] bg-black/20 dark:bg-white/[.18]"
            style={{ left: `calc(${x * 100}% - 2px)`, width: '24px' }}
          />
          <span
            className="absolute text-[10px] tracking-widest uppercase text-black/80 dark:text-white/80 whitespace-nowrap"
            style={{
              left: `calc(${x * 100}% - 30px)`,
              [i % 2 === 0 ? 'bottom' : 'top']: 'calc(50% + 14px)',
            }}
          >
            Sample trip
          </span>
        </div>
      ))}
      {/* Axis label — bottom */}
      <div className="absolute bottom-0 left-4 right-4 h-4">
        <span className="absolute text-[9px] uppercase text-black/40 dark:text-white/40" style={{ left: '10%' }}>2020</span>
        <span className="absolute text-[9px] uppercase text-black/40 dark:text-white/40" style={{ left: '45%' }}>2022</span>
        <span className="absolute text-[9px] uppercase text-black/40 dark:text-white/40" style={{ left: '85%' }}>2024</span>
      </div>
    </div>
  )
}
```

### 2. Trip panel (`components/globe/panels/TripPanel.tsx`)

```tsx
import { Skeleton } from 'boneyard-js/react'

export default function TripPanel({ trip }: Props) {
  return (
    <Skeleton name="trip-panel" loading={false} fixture={<TripPanelFixture />}>
      {/* real trip panel */}
    </Skeleton>
  )
}

function TripPanelFixture() {
  return (
    <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 pb-2 border-b border-gray-100 dark:border-gray-900">
        <h2 className="text-sm tracking-widest uppercase font-light text-black dark:text-white">TRIP TITLE</h2>
        <span className="text-[10px] tracking-widest uppercase text-gray-400 dark:text-gray-500 block mt-0.5">MARCH 2022 · 3 VISITS</span>
      </div>
      {/* Global button */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-900">
        <div className="w-full py-2 border border-black dark:border-white text-center text-[11px] uppercase tracking-widest">View trip article</div>
      </div>
      {/* Visit sections */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="border-b border-gray-100 dark:border-gray-900">
          <div className="px-4 py-3">
            <p className="text-xs tracking-widest uppercase">MARCH 2022</p>
            <p className="text-[10px] text-gray-400">Trip title</p>
          </div>
          <div className="px-4 py-2 text-[10px] uppercase text-gray-500">12 items</div>
        </div>
      ))}
    </div>
  )
}
```

### 3. Pin panel multi-visit (`components/globe/panels/PinPanel.tsx`)

```tsx
import { Skeleton } from 'boneyard-js/react'

export default function PinPanel({ pin }: Props) {
  return (
    <Skeleton name="pin-panel-multi" loading={false} fixture={<PinPanelFixture />}>
      {/* real pin panel */}
    </Skeleton>
  )
}

function PinPanelFixture() {
  return (
    <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 h-full flex flex-col">
      <div className="p-4 pb-2 border-b border-gray-100 dark:border-gray-900">
        <h2 className="text-sm tracking-widest uppercase font-light">LOCATION</h2>
        <span className="text-[10px] tracking-widest uppercase text-gray-400 block mt-0.5">2 VISITS</span>
      </div>
      {/* Two visit sections from different trips */}
      {[1, 2].map((i) => (
        <div key={i} className="border-b border-gray-100 dark:border-gray-900">
          <div className="px-4 py-3 flex items-baseline justify-between">
            <div>
              <p className="text-xs tracking-widest uppercase">JUNE 2024</p>
              <p className="text-[10px] text-gray-400">Trip name</p>
            </div>
            <div className="text-[10px] uppercase border border-black dark:border-white px-2 py-1">View trip article</div>
          </div>
          <div className="px-4 py-2 text-[10px] uppercase text-gray-500">8 items</div>
        </div>
      ))}
    </div>
  )
}
```

### 4. Mobile trip list (`components/globe/MobileTripList.tsx`)

Already wrapped in E2 with fixture. Confirm.

### 5. `data-no-skeleton` exclusions

Add to:
- **Playhead** — already in B6.
- **Today marker** — already in B2.
- **Floating playhead label** — already in B6.
- **Close X / back arrow buttons** — add in C3 `PanelChrome`, C4 `TripPanel`, E1 `MobileNavChrome`. Verify each.
- **Visit tick marks** — already in B5.
- **Pin subregion bands on timeline** — already in B5.
- **Chevron expand/collapse arrows in VisitSection** — add in C3's `VisitSection.tsx`:
  ```tsx
  <span data-no-skeleton aria-hidden>{expanded ? '▴' : '▾'}</span>
  ```

Audit via:

```bash
grep -rn "data-no-skeleton" components/globe
```

Confirm every transient chrome element from §13.6.2 is covered.

### 6. Build

```bash
# Start dev server if not running
npm run dev
# In another terminal:
npx boneyard-js build
```

Check output directory (likely `./src/bones/` or `./bones/` — verify via existing registry import location). The build creates `.bones.json` files and updates `registry.js`.

```bash
git status
# Expect:
#  modified/new: bones/<skeleton-name>.bones.json  (one per skeleton)
#  modified: bones/registry.js
```

Commit the generated files — they're the canonical bone data.

### 7. Verify dark mode bones

Per §13.6.3 the project's existing `boneyard.config.json` (or runtime config) handles dark mode. No per-skeleton dark work needed.

Test manually:
1. Throttle network to Slow 3G in Chrome devtools.
2. Add `.dark` class to `<html>`.
3. Hard reload `/globe`.
4. Skeletons should render with darker bone color per config.

---

## Acceptance criteria

- [ ] `Timeline`, `PinPanel`, `TripPanel`, `MobileTripList` are wrapped in `<Skeleton>` with sensible fixtures.
- [ ] Fixture rendering approximates real component layout (similar heights, section counts, spacing).
- [ ] `data-no-skeleton` applied to playhead, today marker, floating playhead label, close X / back arrows, visit tick marks, subregion bands, expand/collapse chevrons.
- [ ] `npx boneyard-js build` runs without errors.
- [ ] Generated `.bones.json` files committed:
  - `timeline-strip.bones.json`
  - `trip-panel.bones.json`
  - `pin-panel-multi.bones.json`
  - `trip-list-default.bones.json`
- [ ] `bones/registry.js` includes the four names.
- [ ] Slow-network test: cold load `/globe` → skeleton bones render for timeline, then transition to real content.
- [ ] Dark mode: bones adopt dark variant colors via existing config.
- [ ] No excluded elements (playhead, close X) have bones drawn over them.

## Non-goals

- **Not adding new skeleton targets beyond the four named in §13.6.1**. Trip article route has no new target (§13.6 doesn't name one).
- **Not overriding bone colors per-component** — use project defaults.
- **Not changing `boneyard.config.json`** — if it exists; leave alone.

## Gotchas

- **CLI requires dev server running**: `npx boneyard-js build` crawls your running app. If dev server isn't up, build fails.
- **`'use client'` in files using `<Skeleton>`**: `<Skeleton>` uses hooks (per AGENTS.md). Any component importing it needs `'use client'`. Most of our panels already are.
- **Fixture DOM shape matters**: boneyard captures bounding rects of text blocks, images, borders. If the fixture's shape differs drastically from real content (e.g., fixture has 3 rows, real has 10), bones will mismatch at runtime. Aim for similar counts + similar heights.
- **Duplicate skeleton names**: two components with the same `name` prop clobber each other's bones. Grep for each name before adding — confirm uniqueness.
- **Hot reload during capture**: the CLI runs against a live dev server. Editing files mid-build can cause inconsistent bones. Close all editor save-on-type during build.
- **`.bones.json` format change between versions**: `boneyard-js` v1.7.2 is pinned. Don't upgrade mid-phase.

## Ambiguities requiring clarification before starting

1. **Should loading states actually trigger skeletons?**: current design uses `loading={false}` for all because data is SSR'd. Bones show during SSR→hydration gap + React suspense transitions. For `/trip/[slug]` loading.tsx, an actual `loading={true}` is appropriate — confirm D1's loading.tsx uses it.

2. **Timeline fixture width**: fixture uses `w-full h-16 md:h-20` — matches real timeline. If production width differs (e.g., mobile squeeze), bones may be slightly off. Squeeze is small; acceptable.

3. **Pin panel single-visit vs multi-visit**: §13.6.1 only names `pin-panel-multi`. For single-visit pin panels, the skeleton name is the same (`pin-panel-multi`) or a different name? Spec doesn't differentiate.

   **Action**: use `pin-panel-multi` for both. Single-visit is a subset (fewer sections); bones showing a placeholder for second section is harmless.

## Handoff / outputs consumed by later tickets

- Bones files + registry.js — committed to the repo.

## How to verify

1. `npm run dev`
2. `npx boneyard-js build`
3. See console output: "Captured 4 skeletons at 3 breakpoints."
4. `git status` → new `.bones.json` files.
5. Chrome devtools → Network → Slow 3G → reload `/globe`. See timeline bones briefly before real timeline.
6. Resize to mobile → bones render for trip list stub.
7. Open a pin panel / trip panel quickly → shouldn't see bones in practice (panel is client-side computed, not fetched), but fixture still compiled.
8. `.dark` class → bones render with dark variant.

---

## Implementation record (shipped 2026-04-23)

What the ticket assumed vs. what actually existed in the repo at implementation time, plus the decisions made to reconcile the two. Future implementers: read this before re-running the build.

### Build URL

**The CLI cannot capture `pin-panel-multi` or `trip-panel` from `/globe` alone.** Those panels only mount when a pin is clicked or a trip is selected, and boneyard's crawler does not simulate clicks.

**Decision:** created [`app/bones-capture/page.tsx`](../../app/bones-capture/page.tsx) + [`app/bones-capture/BonesCaptureClient.tsx`](../../app/bones-capture/BonesCaptureClient.tsx) — a capture-only route that mounts `<Skeleton>` wrappers with their fixtures as standalone siblings. This mirrors the (since-retired in B8) `/timeline-dev` pattern.

> **Post-merge update (2026-04-24):** Timeline was refactored in the integration branch to read trips from `useGlobe()` instead of props, and `/timeline-dev` + its mocks were deleted (B8). The merge preserved the Skeleton wrapping and `TimelineFixture`; re-ran boneyard afterwards — `timeline-strip` bones shrank (~300 bone entries removed) because the refactored Timeline renders less measurement chrome, but all 4 skeletons still capture at the same breakpoint counts. If future refactors to Timeline, TripPanel, or PinPanel change DOM shape, re-run `npx boneyard-js build http://localhost:3000/bones-capture --force` and commit the updated `.bones.json` diff.

- **The build command must target this URL explicitly:** `npx boneyard-js build http://localhost:3000/bones-capture`. The CLI still auto-crawls `/globe` (which covers `timeline-strip` + `trip-list-default` at mobile width) but only `/bones-capture` can produce `pin-panel-multi` + `trip-panel`.
- **Production safety:** the page calls `notFound()` when `NODE_ENV === 'production'` and sets `robots: { index: false, follow: false }`. The CLI always runs against the dev server, so this doesn't affect capture.
- **Server/client split:** `page.tsx` is a server component (so it can export `metadata`), `BonesCaptureClient.tsx` holds the `<Skeleton>` JSX (hooks need `'use client'`).
- **Alternative considered, not taken:** adding `?pin=<id>` deeplink support to `GlobeProvider` to make `/globe` directly crawlable. More invasive and couples production URL shape to dev tooling.

### Output directory

Spec said "check the repo structure" — no `./bones/` or `./src/bones/` existed. The only hint was a commented `@/bones/registry` import in [`app/wardrobe/layout.tsx:7`](../../app/wardrobe/layout.tsx).

**Decision:** `./bones/` at repo root. Registered via [`boneyard.config.json`](../../boneyard.config.json) (`"out": "./bones"`) and imported in [`app/layout.tsx`](../../app/layout.tsx) as `import '@/bones/registry'`.

### `boneyard.config.json`

Spec §13.6.3 said dark-mode colors come from "the project's existing boneyard config." **It didn't exist.** Created with best-guess values:

```json
{
  "out": "./bones",
  "color": "rgba(0,0,0,0.08)",
  "darkColor": "rgba(255,255,255,0.08)",
  "animate": "pulse"
}
```

Colors chosen to match the site's black/white palette. These values are baked into `registry.js` via `configureBoneyard()` — **re-run `npx boneyard-js build` after any config change.**

### Registry import

Spec §13.6.4 said `import './bones/registry'` "must already be in the app entry from prior phases." **It wasn't.** Added to [`app/layout.tsx`](../../app/layout.tsx) (top-level root layout — covers all routes including `/(globe)`, `/wardrobe`, etc.).

The commented line in [`app/wardrobe/layout.tsx:7`](../../app/wardrobe/layout.tsx) can be removed — the root layout import supersedes it.

### Fixture exports

[`PinPanelFixture`](../../components/globe/panels/PinPanel.tsx) and [`TripPanelFixture`](../../components/globe/panels/TripPanel.tsx) are `export`ed from their respective panel files so the `/bones-capture` page can import them. Ambiguity #3 resolution was followed: both single- and multi-visit pin panels share `name="pin-panel-multi"`.

### Timeline wrapping scope

Only the main happy-path `return` in [`Timeline.tsx`](../../components/globe/Timeline.tsx) is wrapped in `<Skeleton>`. The `fetchError` (L694) and empty-trips (L711) branches return bare `<div>`s. Safe today because `loading={false}` on all paths — but **if a future change flips to `loading={true}`, those branches will render without bones.** Worth restructuring at that point, not now.

### Breakpoint coverage by skeleton

- `timeline-strip` — 6 breakpoints (375, 640, 768, 1024, 1280, 1536)
- `trip-panel` — 6 breakpoints
- `pin-panel-multi` — 6 breakpoints
- `trip-list-default` — **2 breakpoints only (375, 640).** Mobile list unmounts at `md` and up, so the CLI gets no DOM to snapshot at larger widths. This is correct, not a bug.

### Pin panel bone width caveat

`pin-panel-multi` is captured at `max-w-md` (448px) on `/bones-capture`. The real panel in `GlobeDetailPanel` uses a different container width (sidebar on desktop, full width on mobile). Bones scale responsively — `x`/`w` are stored as percentages — but fixed-px paddings and border radii may drift at widths far from ~448px. Acceptable for a skeleton loading state; flag if visual mismatch appears.

### Dev-server environment

The worktree did not have `.env.local` at implementation time — copied from the parent repo to get past Sanity config errors during the build. `.env*` is gitignored; not committed.

### Runtime bone rendering — not exhaustively verified

Confirmed during implementation: `data-boneyard` attribute is present in DOM (registry loaded), CLI reports `.bones.json` files well-formed, `/bones-capture` renders without errors in both light and dark mode.

**Not verified:** actual bone overlays rendering at runtime with `loading={true}`, or during the SSR→hydration gap on a cold slow-network load. That remains a manual verification step per §How to verify above.

### Commands reference (for re-runs)

```bash
# Start dev server
npm run dev

# Capture all 4 skeletons (CLI crawls /globe for timeline + trip list,
# uses /bones-capture for the two panels):
npx boneyard-js build http://localhost:3000/bones-capture

# --force if you want to bypass the incremental cache and recapture everything
npx boneyard-js build http://localhost:3000/bones-capture --force
```
