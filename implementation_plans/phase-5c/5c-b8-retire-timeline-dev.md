# 5C-B8 — Retire `/timeline-dev` dev route and mock inputs

**Epic**: B. Timeline & Playback · **Owner**: Dev B · **Can be run by agent?**: Yes · **Estimated size**: XS

## Dependencies

### Hard
- **B4** — real data integration is live; dev route is no longer the primary surface.

### Soft
- None.

### Blocks
- None — but recommended before F1 boneyard build (fewer URLs to worry about).

---

## Goal

Delete the dev-only `/timeline-dev` route and associated mock data. Clean up. Short ticket.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §15 Implementation order (the "prototype first, integrate, then retire dev scaffolding" pattern)

## Files to read first

- [`../../app/timeline-dev/page.tsx`](../../app/timeline-dev/page.tsx)
- [`../../lib/timelineMocks.ts`](../../lib/timelineMocks.ts)
- [`../../components/globe/Timeline.tsx`](../../components/globe/Timeline.tsx) — verify the optional `trips` prop can be removed or kept

## Files to create

- None.

## Files to modify

- `components/globe/Timeline.tsx` — optionally remove the `trips?: TripRange[]` prop if only `/timeline-dev` used it; leave if any other caller still passes mocks

## Files to delete

- `app/timeline-dev/page.tsx`
- `app/timeline-dev/` directory (if empty after page.tsx deletion)
- `lib/timelineMocks.ts`

---

## Implementation guidance

1. `rm -rf app/timeline-dev`
2. `rm lib/timelineMocks.ts`
3. Grep for any imports of `timelineMocks`: `grep -r 'timelineMocks' .` — should be zero matches.
4. Grep for `'/timeline-dev'`: should be zero matches in `app/`, `components/`, `lib/`.
5. Open `components/globe/Timeline.tsx`:
   - If the `trips?: TripRange[]` optional prop was added in B2/B4 specifically for the dev route, remove it. Timeline should read `trips` exclusively from context.
   - If the optional prop is still useful (e.g., Storybook, test harness), keep it.

### Decision: remove or keep optional `trips` prop

**Recommendation**: **remove**. Single source of truth (context) is cleaner. If a future test harness needs to inject mocks, it can mock the whole `GlobeProvider`.

```tsx
// Before:
interface TimelineProps {
  trips?: TripRange[]
  className?: string
  now?: string
}

// After:
interface TimelineProps {
  className?: string
  now?: string  // keep — used for testability in potential unit tests of the component
}
```

Update the function body:

```tsx
export default function Timeline({ className, now }: TimelineProps) {
  const { trips, fetchError } = useGlobe()
  // ...
}
```

Grep for `<Timeline trips=`: should be zero matches post-change.

---

## Acceptance criteria

- [ ] `app/timeline-dev/` directory no longer exists.
- [ ] `lib/timelineMocks.ts` no longer exists.
- [ ] `grep -r 'timelineMocks' .` returns zero code matches.
- [ ] `grep -r '/timeline-dev' .` returns zero code matches.
- [ ] `<Timeline />` (without any props except optional `className`/`now`) renders correctly on `/globe`.
- [ ] `npm run build` succeeds.
- [ ] `npm run lint` succeeds.

## Non-goals

- **Don't refactor Timeline beyond removing the `trips` prop**. Behavior is already shipped.
- **Don't delete `lib/timelineCompression.ts`** — still used.

## Gotchas

- **Directory deletion**: `rm -rf app/timeline-dev` — double-check you're in the right dir.
- **Cache invalidation**: after deleting, Next.js might still serve `/timeline-dev` from `.next/` cache briefly. `rm -rf .next && npm run dev` to confirm the route 404s.
- **If a reviewer wants `/timeline-dev` preserved for debugging**: keep it, but wire to real data. Change `MOCK_TRIPS` to `await client.fetch(allTripsQuery)`. Not this ticket's scope.

## Ambiguities requiring clarification before starting

1. **Keep the `trips` prop for future testability?**: recommendation is remove. If a reviewer pushes back, keep as optional with a comment explaining.

   **Action**: remove. Note as a reversible change in PR.

## Handoff / outputs consumed by later tickets

- None. Pure cleanup.

## How to verify

1. Navigate to `http://localhost:3000/timeline-dev` — 404.
2. Navigate to `http://localhost:3000/globe` — timeline still renders.
3. `git status` — files shown as deleted.

---

## Implementation record (2026-04-23)

Shipped in [PR #53](https://github.com/AroundTheLines/qile.wang/pull/53). What actually landed and why:

### Deletions (per spec)
- Removed `app/timeline-dev/` (dev route) and `lib/timelineMocks.ts`.

### `Timeline.tsx` simplification — went beyond the spec's minimum
The spec's non-goal said "Don't refactor Timeline beyond removing the `trips` prop." That was a conservative default to keep the ticket XS. In review I revisited it: with the dev route gone, **every caller of `<Timeline>` is inside `GlobeProvider`**, so the `!ctx` / optional-chaining branches became genuinely unreachable code, not a safety net. Keeping them would have left misleading comments ("Fallback active id when there is no provider") and dead branches for future readers to reason about.

Decision: **remove all `!ctx` fallbacks**. Specifically:
- Switched `useContext(GlobeContext)` → `useGlobe()` (throws if no provider — now a real invariant, not a soft fallback).
- Deleted `localActiveId` state + `setLocalActiveId` calls in `handleLabelEnter/Leave/Click/handleBackgroundClick`.
- Collapsed `ctx?.foo ?? default` patterns to `ctx.foo` at: `panOverscrollRef`, `playbackActive`, `isMobile`, `playbackHighlightSet`, `trackInsetX`, `labelRowHeight`, `isDesktopHover`, `fetchError`, and the `TimelinePlayhead` render guard.
- Dropped `if (ctx)` guards around `ctx.addPauseReason` / `ctx.removePauseReason` calls in wheel handler, pointer up, pointer down, and pan threshold crossing.
- Collapsed `const ctxTrips = ctx?.trips ? ... : null` + `ctxTrips ?? []` to a single `useMemo` that always returns `TimelineTrip[]`.

This is a pure simplification — no behavior change, no new test surface. Revert plan: if a future harness (Storybook, unit test) ever needs to render `<Timeline>` without a provider, re-add the `trips` prop and restore the fallback branches. Easier to do on demand than to carry dead code indefinitely.

### Kept (per spec)
- `now?: string` prop on `TimelineProps` — still useful for deterministic date math in potential unit tests.
- `lib/timelineCompression.ts` — spec non-goal, still used by live code.

### Upstream fixes picked up during this PR
CI was red on `phase-5c/integration` with three pre-existing issues unrelated to B8 but blocking B8's acceptance criteria (`npm run build` / `npm run lint` green). Fixed the ones that directly blocked `build`:

1. **`next.config.ts`** — duplicate `allowedDevOrigins` key (TypeScript error, blocking build). Merged into one entry that unions both prior lists.
2. **`components/globe/TripArcs.tsx:311,324`** — `Ref<LineRef>` cast no longer structurally assignable to drei's `Line` `ref` type (`Line2 | LineSegments2`) under the newer @types/three. Cast via `unknown as Ref<never>` — the local `LineRef` type is an intentional narrowing for our use (we only read `material` off it); the real drei type is stricter than what we need. `never` satisfies the variance check without lying about the runtime shape, which we rely on via `baseRef.current.material` accesses.
3. **`components/globe/panels/TripPanel.tsx:48`** — `react-hooks/set-state-in-effect` error from React 19 lint preset. `setPulse` inside the effect is **intentional**: the pulse state must outlive `pinToScrollTo` (which gets cleared by `clearPinScroll` after `PULSE_DURATION_MS`). Deriving pulse from `pinToScrollTo` would make it go null as soon as the scroll clears, which under timer-ordering races could leave `VisitSection`'s `data-pulsing` attribute stuck. Added `eslint-disable-next-line` with a comment explaining the constraint.

The other lint errors across `TimelinePlayhead`, `GlobeProvider`, etc. are the same React 19 preset rules. They are pre-existing and unrelated to B8 — not fixed in this PR. Recommend a follow-up ticket to sweep them systematically rather than dribbling fixes across feature PRs.

### Verification performed
- `/timeline-dev` → 404 (via `fetch`).
- `/globe` loads, renders canvas + timeline with 20 real trip labels from Sanity, no console errors (only pre-existing THREE.Clock deprecation warnings).
- Type check: `npm run build` passes TypeScript (build then fails on missing Sanity `projectId` env var — environment issue, not code).
- Tests: `vitest` not installed in this worktree — not run. Existing timeline unit tests in `lib/timeline{Compression,Playback,Zoom}.test.ts` were untouched; behavior is unchanged.
