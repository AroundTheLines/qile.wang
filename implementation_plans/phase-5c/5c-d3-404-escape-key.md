# 5C-D3 — 404 fallback UI + escape-key layered dismiss

**Epic**: D. Routing & URL state · **Owner**: Dev A · **Can be run by agent?**: Yes · **Estimated size**: S

## Dependencies

### Hard
- **D2** — URL state is wired so escape can modify state cleanly.

### Soft
- None.

### Blocks
- **F2** (perf pass assumes complete keyboard + routing UX).

---

## Goal

1. Invalid trip URLs (`/trip/<slug>` or `/globe?trip=<slug>` where `<slug>` doesn't exist) show a brief "Trip not found" message and redirect to `/globe` after ~1.5s.
2. Escape key dismisses state in layered order: sliver → panel → nothing.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §8.5 Invalid URL fallback
- §12.8 Escape key behavior

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §8.5, §12.8
- [`../../app/trip/[slug]/not-found.tsx`](../../app/trip/%5Bslug%5D/not-found.tsx) (stub from D1)
- [`../../app/globe/page.tsx`](../../app/globe/page.tsx) — handles `?trip=<invalid>` case

## Files to create

- `components/globe/TripNotFoundRedirect.tsx` — message + 1.5s redirect
- `components/globe/EscapeKeyHandler.tsx` — optional; or inline in Provider

## Files to modify

- `app/trip/[slug]/not-found.tsx` — render the redirect component
- `app/globe/page.tsx` (or wherever appropriate) — detect invalid `?trip=<slug>` and redirect
- `components/globe/GlobeProvider.tsx` — escape key listener

## Files to delete

- None.

---

## Implementation guidance

### `TripNotFoundRedirect.tsx`

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function TripNotFoundRedirect() {
  const router = useRouter()

  useEffect(() => {
    const t = setTimeout(() => {
      // replace() so the invalid URL doesn't pollute history.
      router.replace('/globe')
    }, 1500)
    return () => clearTimeout(t)
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm tracking-widest uppercase text-gray-400 dark:text-gray-500">
        Trip not found
      </p>
    </div>
  )
}
```

### `app/trip/[slug]/not-found.tsx`

```tsx
import TripNotFoundRedirect from '@/components/globe/TripNotFoundRedirect'

export default function TripNotFound() {
  return <TripNotFoundRedirect />
}
```

### Invalid `?trip=<slug>` on `/globe`

Next.js won't 404 a query param — `/globe?trip=does-not-exist` is a valid URL to the `/globe` route. Handle at the provider level.

Option 1: provider detects invalid slug, redirects via `router.replace('/globe')`.

```tsx
// In GlobeProvider.tsx, after URL-read effects:
useEffect(() => {
  const slug = searchParams.get('trip')
  if (!slug) return
  const exists = trips.some((t) => t.slug.current === slug)
  if (!exists) {
    // Show message briefly, then redirect.
    // But we also need to clear lockedTrip so panel doesn't render incorrectly.
    // Simplest: redirect after 1.5s without showing a message on /globe.
    const t = setTimeout(() => {
      router.replace('/globe')
    }, 1500)
    return () => clearTimeout(t)
  }
}, [searchParams, trips, router])
```

BUT: spec §8.5 says "Show a brief 404 message." On `/globe?trip=invalid`, the page renders as normal `/globe` (globe + timeline), just with no locked trip. Showing "Trip not found" requires a dedicated UI state.

**Simpler interpretation**: on `/trip/<invalid>` the 404 page shows the message. On `/globe?trip=<invalid>` the page silently redirects without a message (user's on a valid `/globe` URL with an invalid query — low-impact).

Spec ambiguity (§8.5 lists "either" case). Reading strictly: "If the user loads `/trip/<slug>` **or** `/globe?trip=<slug>` where `<slug>` does not exist." Both cases. But also: "The 404 message should be simple text chrome — no elaborate illustrations needed."

**Decision**:
- `/trip/<invalid>` → dedicated 404 page (via `notFound()` in page.tsx + `not-found.tsx`).
- `/globe?trip=<invalid>` → toast-style inline "Trip not found" at top of viewport for 1.5s, then URL replaces to `/globe`.

Actually simpler: just make the `/globe?trip=<invalid>` case redirect silently. Invalid query params aren't visible user intent — the user typically wouldn't type that by hand; it'd come from a stale link. A quick silent redirect is fine.

**Action**: `/trip/<invalid>` shows message; `/globe?trip=<invalid>` silently redirects. Document in PR.

Adjust the provider effect:

```tsx
useEffect(() => {
  const slug = searchParams.get('trip')
  if (!slug) return
  const exists = trips.some((t) => t.slug.current === slug)
  if (!exists && trips.length > 0) {
    // Only redirect if trips have hydrated — avoid false positives during load.
    router.replace('/globe')
  }
}, [searchParams, trips, router])
```

No timeout — immediate replace. User never sees the invalid state. (If reviewer wants the 1.5s + message for consistency, add back.)

### Escape key (§12.8)

Layered dismiss:

```tsx
// In GlobeProvider.tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    // Layer 1: sliver open
    if (activeArticleSlug || activeTripSlug) {
      closeArticle()
      return
    }
    // Layer 2: panel open (pin or trip)
    if (selectedPin) {
      selectPin(null)
      return
    }
    if (lockedTrip) {
      setLockedTrip(null)
      router.push('/globe', { scroll: false })
      return
    }
    // Layer 3: nothing — no-op
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [
  activeArticleSlug, activeTripSlug,
  selectedPin, lockedTrip,
  closeArticle, selectPin, setLockedTrip,
  router,
])
```

### Accessibility consideration (though deferred per §13)

Escape handler improves keyboard users' experience. Not screen-reader focused, but keyboard-focused. Minimal win — keep.

---

## Acceptance criteria

- [ ] Navigate to `/trip/does-not-exist` → renders "Trip not found" for ~1.5s → redirects to `/globe` via `replace` (back button does not go back to `/trip/does-not-exist`).
- [ ] Navigate to `/globe?trip=does-not-exist` → silently redirects to `/globe` (immediately, no message).
- [ ] Browser history after the 404 redirect: previous entry is wherever user came from, not the invalid URL.
- [ ] Escape with sliver open → sliver closes; trip stays locked (returns to `/globe?trip=<slug>`).
- [ ] Escape with pin panel open → panel closes; `selectedPin` null.
- [ ] Escape with trip panel open → panel closes; `lockedTrip` null; URL → `/globe`.
- [ ] Escape with nothing open → no-op (no error in console, no navigation).
- [ ] Works on desktop + mobile (though mobile keyboard unusual — focus on desktop).
- [ ] Escape during a 404 redirect countdown: still works (escape listener independent of redirect).

## Non-goals

- **Full keyboard navigation** — §13 defers.
- **Toast/modal 404 on `/globe?trip=<invalid>`** — silent redirect is simpler.
- **Animated 404 page** — "simple text chrome" per spec.

## Gotchas

- **`trips.length > 0` guard in the query-slug check**: prevents false positives when the client hydrates before trips arrive (SSR-then-hydrate). On SSR the server already has trips, so this may not matter, but the guard is cheap.
- **`router.replace` vs `router.push`** for 404: use replace. Push would let the back button return to the invalid URL.
- **`closeArticle`**: C1 defines this. For trip articles, it routes to `/globe?trip=<slug>`. For item articles, `/globe`. Correct.
- **Escape key swallow**: `e.preventDefault()` is not called. If any other component listens to Escape (none currently), they'd fire too. Add preventDefault if issues arise.
- **Focus management**: don't restore focus after dismiss. Minor accessibility loss but §13 defers.

## Ambiguities requiring clarification before starting

1. **Show "Trip not found" on `/globe?trip=<invalid>`?**: spec §8.5 implies yes. But rendering that briefly on the full `/globe` page requires mounting a dedicated overlay/toast. I'm choosing silent redirect as less intrusive. If reviewer wants the message, add a transient toast component.

   **Action**: silent redirect. Document. Easy to add toast later.

2. **Escape timing during rapid presses**: each escape pops one layer. User rapid-pressing 3x while on `/trip/A` sliver → sliver closes → panel closes → nothing (or continues popping if browser back is triggered). Our handler stops after each layer; no default browser behavior. Good.

3. **Escape-out-of-preview on mobile (E3)**: mobile preview label expand is its own state. Escape doesn't apply on mobile typically. If keyboard user does, add `previewTrip` to the layered dismiss above:
   ```tsx
   if (previewTrip) { setPreviewTrip(null); return }
   ```
   Place between Layer 1 and Layer 2.

   **Action**: include preview in layered dismiss.

4. **Triggering redirect during Sanity data still loading**: if trips are still loading server-side, the client sees `trips.length === 0` briefly. Guard prevents false redirect. Good.

## Handoff / outputs consumed by later tickets

- Nothing new. Escape handler and 404 finalize the URL/routing story.

## How to verify

1. Navigate to `/trip/does-not-exist`. Message renders, then page replaces to `/globe`. Browser back goes to previous external page, not invalid URL.
2. Navigate to `/globe?trip=does-not-exist`. Page loads, URL quickly becomes `/globe`. No message.
3. On `/globe?trip=berlin-2022`: press Escape. Trip deselects; URL → `/globe`.
4. Open item article (via a pin panel → item click). Press Escape. Sliver closes, returns to pin panel state.
5. Open trip article. Press Escape. Sliver closes, returns to trip panel state.
6. From default `/globe` state, press Escape. No change, no error.
7. Mobile preview label expanded (E3 tested). Press Escape. Preview collapses.
