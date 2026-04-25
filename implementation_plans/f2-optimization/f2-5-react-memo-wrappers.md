# F2-5 — React.memo on hot-path children

**Epic**: F. Polish · **Can be run by agent?**: Yes (fully) · **Estimated size**: S

## Dependencies

### Hard
- **F2-3** — consumers migrated to narrow hooks, so parents pass stable props to their children.

### Soft
- **F2-1** — lower GC pressure makes the memo wins easier to measure. Not a blocker.

### Blocks
- None structurally. F2-7 (profiling) benchmarks the post-memo world.

---

## Goal

Wrap six components in `React.memo` so that when a parent re-renders for an unrelated reason, the child stops at the memo boundary instead of reconciling its subtree. This is the companion to F2-2/F2-3: narrower contexts reduce **how often** a parent re-renders; `React.memo` reduces **what happens** when it does.

React 19 is in use but **React Compiler is not enabled** (verified — no `babel-plugin-react-compiler` in `package.json` or Next config). Manual memos are required; they will not be redundant.

## Spec references

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §13.5.1 "Stable React references"
- [`../phase-5c/5c-f2-perf-pass.md`](../phase-5c/5c-f2-perf-pass.md) Fix 3
- Phase 5C F2 gotcha: "Over-memoization: wrapping everything in `useMemo`/`useCallback` can slow things down." We wrap **exactly** the six components below — no more, no less.

## Files to read first

- [`components/globe/GlobePins.tsx`](../../components/globe/GlobePins.tsx) — `Pin` component.
- [`components/globe/TripArcs.tsx`](../../components/globe/TripArcs.tsx) — `ArcLine` component.
- [`components/globe/Timeline.tsx`](../../components/globe/Timeline.tsx) — `TimelineSegment`, `TimelinePinBands`, `TimelineAxis`.
- [`components/globe/panels/VisitSection.tsx`](../../components/globe/panels/VisitSection.tsx).

Also verify that **parent-passed props** are stable references (callbacks wrapped in `useCallback`, derived data wrapped in `useMemo`). The memo is a shallow compare by default; an unstable prop defeats it.

## Files to create

- None.

## Files to modify

- `components/globe/GlobePins.tsx` — wrap `Pin` in `React.memo`.
- `components/globe/TripArcs.tsx` — wrap `ArcLine` in `React.memo`.
- `components/globe/Timeline.tsx` — wrap `TimelineSegment`, `TimelinePinBands`, `TimelineAxis` in `React.memo`.
- `components/globe/panels/VisitSection.tsx` — wrap the exported component in `React.memo`.

## Files to delete

- None.

---

## Implementation guidance

### Step 1 — audit prop stability per parent

Before wrapping anything, scan each parent for prop instability. For each target component:

| Target | Parent | Watch for |
|---|---|---|
| `Pin` | `GlobePins` (map over `pins`) | No inline callbacks — Pin destructures context internally; props are just `locationId, lat, lng`. All primitive. Safe. |
| `ArcLine` | `TripArcs` map over `arcs` | Arc data comes from `useMemo(..., [tripsWithVisits])`; the array identity is stable per data change. Children receive arc-specific props. Inspect each passed prop. |
| `TimelineSegment` | `Timeline` map | Receives segment data, zoom window, container width, placement, optional callbacks. Callbacks should be `useCallback`-ed; segment data should come from a `useMemo`. |
| `TimelinePinBands` | `Timeline` | Receives band data + pin highlight state. |
| `TimelineAxis` | `Timeline` | Receives zoom window + container width. Low churn. |
| `VisitSection` | `TripPanel` | Receives visit data, `onRef` callback (verify `useCallback`-ed — per audit, `TripPanel.tsx:28-31` does this correctly). |

If you find an unstable prop at a parent, **promote** it in the parent (wrap with `useCallback` / `useMemo`) before wrapping the child. Otherwise the `React.memo` is pure overhead.

### Step 2 — add the memo wrappers

Standard pattern:

```tsx
import { memo } from 'react'

function PinImpl({ locationId, lat, lng }: PinProps) { /* existing body */ }
export default memo(PinImpl)
```

Or as a renaming rewrap (less invasive):

```tsx
function Pin({ /* ... */ }) { /* body */ }
// existing file structure continues
// at bottom of file or near the other exports:
const MemoPin = memo(Pin)
// then use MemoPin inside the map
```

**Prefer the second pattern** when the component is internal to a file (like `Pin` inside `GlobePins.tsx`). When the component is directly `export default`ed, replace the `export default` with `export default memo(Foo)`.

**Do not** supply a custom comparator function by default. Shallow compare is the right level unless measurements show a parent is passing an unstable prop (in which case, fix the parent, not the comparator). The F2 spec's "Fix 3" suggests a custom comparator as an escape hatch — do not pre-use it.

### Step 3 — display names

`memo` preserves the wrapped component's display name in React DevTools in most cases, but if a component is anonymous (`memo(function() { ... })`), explicitly set `.displayName` so the Profiler shows useful names:

```tsx
const MemoPin = memo(Pin)
MemoPin.displayName = 'Pin'
```

Only do this if the DevTools view is unclear. Not required for the first pass.

### Step 4 — verify no regression in visual behavior

Each of the 6 components is visual and interactive. After wrapping:
- `Pin`: still fades at silhouette, still responds to hover/click.
- `ArcLine`: still pulses on active trip lock, still greys out when another trip is locked.
- `TimelineSegment`: still labels render, still respond to hover.
- `TimelinePinBands`: still appear on pin sub-region highlight.
- `TimelineAxis`: ticks still render.
- `VisitSection`: still scrollable, scroll-pulse still fires on `pinToScrollTo`.

### Step 5 — measurement

Open React DevTools → Profiler. Record 5 s of playback sweep. Before F2-5: each playback highlight change commits all 50 pins, all arcs, all timeline segments. After: commits are limited to the ones whose props actually changed.

Drop a screenshot of the before/after Profiler panel into the PR description.

---

## Acceptance criteria

- [ ] `Pin`, `ArcLine`, `TimelineSegment`, `TimelinePinBands`, `TimelineAxis`, `VisitSection` are all wrapped in `React.memo`.
- [ ] All `Pin`/`ArcLine`/`TimelineSegment` parents verified to pass stable props. Any newly-unstable prop promoted to `useCallback`/`useMemo`.
- [ ] No custom `arePropsEqual` comparator used (unless justified by a measurement).
- [ ] React DevTools Profiler shows reduced commit count during a 5 s playback-sweep trace vs. pre-F2-5.
- [ ] Visual behavior unchanged across all six components.
- [ ] `npm run build` green.
- [ ] `npm test` green (including F2-4 isolation tests).
- [ ] `npm run lint` green.

## Non-goals

- Do **not** memo additional components beyond these six. Over-memoization has a real cost (closure allocation, compare cost per render).
- Do not add `useMemo` to data pipelines that already work (e.g., the arc `useMemo` in TripArcs already exists).
- Do not refactor any render logic.
- Do not add `useCallback` to inline event handlers inside `<button onClick={...}>` JSX — these are one-per-render allocations that the memo on a peer component doesn't care about. Only stabilize callbacks that are **passed as props** into a memoed child.

## Gotchas

- **`memo` + context**: `memo` does not block a re-render triggered by a context change the component subscribes to. `Pin` subscribes to `useGlobePin`, `useGlobeTrip`, etc. — if `selectedPin` changes, `Pin` re-renders even if its props didn't. This is correct; `memo`'s job is only to block parent-driven re-renders. The F2-2/F2-3 context split is what reduces the context-change-driven re-renders; memo handles the remaining fan-out from parent commits.
- **Shallow compare on arrays/objects**: `{ pins: [...] }` where `pins` is re-created every render defeats `memo` on a child receiving `pins`. If a parent must pass an array prop, ensure it comes from `useMemo`.
- **Functional children**: if a parent passes `children` to a memoed child, `children` is a React element and thus a fresh object every render. `memo` shallow-compares elements by reference. If a memoed component takes `children`, it will always re-render. None of our six targets take `children` props, so this is a non-issue — but double-check before accepting the memo.
- **`React.memo(Component, areEqual)` swallows thrown errors** in a dev-mode double-render if `areEqual` has side effects. Keep comparators pure (we're using default shallow anyway).
- **Forwarded refs**: if any of the six uses `forwardRef`, wrap with `memo(forwardRef(...))`. Verify each file.

## Ambiguities requiring clarification

- **Should `Pin` also be split into subcomponents** (e.g., separate the dot from the ring) to further narrow re-renders? Considered; rejected for this ticket. Adds structural churn without measurable benefit once `Pin` itself is memoed. Revisit only if F2-7 profiling flags `Pin` re-renders as the remaining bottleneck.

## Handoff / outputs consumed by later tickets

- **F2-7** uses the Profiler numbers pre/post this ticket as part of the before/after report.

## How to verify

1. `npm run build && npm start` → open `/globe`.
2. React DevTools → Profiler → record 5 s playback sweep (10 trips / 15 visits / 9 pins seeded).
3. Inspect the commit list: each commit should include only `Timeline` + direct highlighted-trip descendants. Pins outside the highlighted trip should **not** appear in the commit list for highlight changes.
4. Hover a pin: only `Pin` (hovered) + tooltip commit. Timeline, arcs, map should not commit.
5. Visual sweep: all 6 behaviors intact (see Step 4 above).
6. Screenshot Profiler before/after for the PR body.
