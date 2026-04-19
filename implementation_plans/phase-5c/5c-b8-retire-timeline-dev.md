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
