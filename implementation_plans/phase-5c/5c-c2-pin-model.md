# 5C-C2 — Per-location pins + new tooltip format + timeline sub-region signals

**Epic**: C. Globe & Panels · **Owner**: Dev C · **Can be run by agent?**: Yes · **Estimated size**: M

## Dependencies

### Hard
- **C1** — context shape (`pins`, `selectedPin`, `pinSubregionHighlight`, `addPauseReason`).

### Soft
- **B5** — timeline renders the visit-band highlight. Without B5, the signal is emitted but nothing draws.

### Blocks
- **B7** (pin-hover pause source)
- **C7** (pin cross-interactions during lock)

---

## Goal

Refactor `GlobePins` and `GlobeTooltip` to use the new per-location pin model (`PinWithVisits[]`). Update pin identity from `globe_group` to `locationDoc._id`. Format the tooltip per §6.1 ("Location · N visits" for multi-visit pins). Emit `pinSubregionHighlight` on pin hover (desktop) and click — the Timeline component (B5) renders the visit bands that flow from this signal.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §6.1 Pins
- §7.5 Pin click highlights timeline visit sub-regions
- §9.2 Pin interaction matrix (hover + click rows)

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §6.1, §7.5, §9.2
- [`../../components/globe/GlobePins.tsx`](../../components/globe/GlobePins.tsx) — current impl; diff target
- [`../../components/globe/GlobeTooltip.tsx`](../../components/globe/GlobeTooltip.tsx) — current impl
- [`../../components/globe/GlobePositionBridge.tsx`](../../components/globe/GlobePositionBridge.tsx) — key-by-id contract
- [`../../components/globe/GlobeContext.tsx`](../../components/globe/GlobeContext.tsx) (post-C1) — new context fields
- [README §4.3 invariants 1–3](./README.md#43-invariants-from-the-existing-code-preserve-these)

## Files to create

- None.

## Files to modify

- `components/globe/GlobePins.tsx` — iterate `pins`, use `location._id` as identity
- `components/globe/GlobeTooltip.tsx` — new "Location · N visits" format
- `components/globe/GlobePositionBridge.tsx` — key by `location._id`

## Files to delete

- None.

---

## Implementation guidance

### `GlobePins.tsx` — key refactor

Current:
```tsx
const pos = sphericalToCartesian(lat, lng, GLOBE_RADIUS)
const isSelected = selectedPin === group
// ... iterate pins with pin.group
```

New:
```tsx
// Pin component takes locationId (= locationDoc._id) as identity.
function Pin({
  locationId, lat, lng,
}: {
  locationId: string
  lat: number
  lng: number
}) {
  const {
    selectedPin, selectPin,
    hoveredPin, setHoveredPin,
    setPinSubregionHighlight,
    showHover,
    isDesktop,
    addPauseReason, removePauseReason,
  } = useGlobe()

  const isSelected = selectedPin === locationId
  const isHovered = hoveredPin === locationId

  // ... rest of existing logic unchanged (quaternion, useFrame back-face fade, etc.)

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (!showHover) return
    if (selectedPin === locationId) return
    setHoveredPin(locationId)
    // Emit sub-region highlight signal for the timeline (§9.2 desktop hover row).
    setPinSubregionHighlight(locationId)
    // Pause playback (§5.5 — desktop only).
    if (isDesktop) addPauseReason('pin-hover')
  }, [showHover, selectedPin, locationId, setHoveredPin, setPinSubregionHighlight, isDesktop, addPauseReason])

  const handlePointerOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (!showHover) return
    setHoveredPin((prev) => (prev === locationId ? null : prev))
    setPinSubregionHighlight((prev) => (prev === locationId ? null : prev))
    if (isDesktop) removePauseReason('pin-hover')
  }, [showHover, locationId, setHoveredPin, setPinSubregionHighlight, isDesktop, removePauseReason])

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    selectPin(locationId)
    setHoveredPin(null)
    // §7.5: pin click highlights timeline sub-regions. Emit even on mobile (tap).
    setPinSubregionHighlight(locationId)
  }, [locationId, selectPin, setHoveredPin, setPinSubregionHighlight])

  // ... rest of render unchanged
}

export default function GlobePins() {
  const { pins } = useGlobe()
  return (
    <>
      {pins.map((pin) => (
        <Pin
          key={pin.location._id}
          locationId={pin.location._id}
          lat={pin.coordinates.lat}
          lng={pin.coordinates.lng}
        />
      ))}
    </>
  )
}
```

### `GlobeTooltip.tsx` — new format

Current: shows `pin.group`. New: use `pin.location.name` and `pin.visits.length`.

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useGlobe } from './GlobeContext'

export default function GlobeTooltip() {
  const { hoveredPin, pins, pinPositionRef, frameSubscribersRef, showHover } = useGlobe()
  const divRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const read = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])

  const pin = hoveredPin ? pins.find((p) => p.location._id === hoveredPin) : null

  // Subscribe to frame ticks — position tooltip near pin
  useEffect(() => {
    if (!hoveredPin || !showHover) return
    const subscribers = frameSubscribersRef.current
    const update = () => {
      const pos = pinPositionRef.current[hoveredPin]
      if (!pos || !divRef.current) return
      divRef.current.style.left = `${pos.x + 20}px`
      divRef.current.style.top = `${pos.y - 40}px`
      divRef.current.style.opacity = pos.visible && !pos.behind ? '1' : '0'
    }
    subscribers.add(update)
    return () => { subscribers.delete(update) }
  }, [hoveredPin, showHover, frameSubscribersRef, pinPositionRef])

  if (!pin || !showHover) return null

  const label =
    pin.visits.length === 1
      ? pin.location.name
      : `${pin.location.name} · ${pin.visits.length} visits`

  return (
    <div
      ref={divRef}
      className="absolute pointer-events-none bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 px-2 py-1 text-[10px] tracking-widest uppercase text-black dark:text-white shadow-sm z-20"
      style={{ transition: 'opacity 150ms' }}
    >
      {label}
    </div>
  )
}
```

### `GlobePositionBridge.tsx` — key by id

Currently writes `positions[pin.group]`. Change to `positions[pin.location._id]`.

```tsx
// GlobePositionBridge.tsx (inside useFrame)
for (const pin of pins) {
  const [x, y, z] = sphericalToCartesian(pin.coordinates.lat, pin.coordinates.lng, GLOBE_RADIUS)
  pinWorld.set(x, y, z)
  ndc.copy(pinWorld).project(camera)
  cameraToPin.copy(pinWorld).sub(camPos)
  pinNormal.copy(pinWorld).normalize()
  const behind = cameraToPin.dot(pinNormal) > 0
  positions[pin.location._id] = {  // ← was pin.group
    x: (ndc.x * 0.5 + 0.5) * size.width,
    y: (-ndc.y * 0.5 + 0.5) * size.height,
    visible: ndc.z < 1,
    behind,
  }
}
```

---

## Acceptance criteria

- [ ] `/globe` renders pins for each seeded location (verify count matches `*[_type == "locationDoc"]`).
- [ ] Hovering a pin (desktop): tooltip shows `{location.name}` for single-visit pins, `{location.name} · N visits` for multi-visit.
- [ ] Berlin fixture (2 visits across 2 trips): tooltip reads "Berlin, Germany · 2 visits".
- [ ] Hovering a pin also causes timeline bands to appear at each visit's date range (requires B5).
- [ ] Hover end clears tooltip and sub-region bands.
- [ ] Clicking a pin: `selectedPin = location._id`; panel would open (C3).
- [ ] `GlobeClickConnector` (unchanged in C2 but verified) still connects pin to panel position by reading `pinPositionRef.current[selectedPin]` — works because the key is now `location._id` which matches `selectedPin`.
- [ ] Tooltip position follows the pin during globe rotation (frame-subscriber pattern intact).
- [ ] Back-face fade on pins still works (invariant preserved).

## Non-goals

- **No panel rendering** — C3.
- **No timeline band rendering** — B5.
- **No camera changes** — C5.
- **No pin-click-while-trip-locked behavior** — C7.

## Gotchas

- **`setPinSubregionHighlight` on click**: spec §7.5 says clicking a pin (no lock) highlights visit sub-regions on the timeline. Emit the signal on click too, not just hover. Clear on panel close (C3 responsibility via `selectPin(null)` → C2 can handle via useEffect on `selectedPin` — but simpler: pin component clears on its own pointerleave + panel's close button clears `selectedPin`).

  Actually — `pinSubregionHighlight` needs to stay set while pin panel is open (otherwise the timeline bands disappear). So **do not clear `pinSubregionHighlight` on pointerOut if the pin is selected**. Guard: `if (hoveredPin === locationId && selectedPin !== locationId) setPinSubregionHighlight(null)`.

  Clear path: when `selectedPin` clears (via panel close), use an effect in C1 or here to also clear `pinSubregionHighlight`. Add to C1 as a handoff — see below.

- **Pause reason `'pin-hover'` leakage**: if a pin hover causes pause, then the user clicks before pointerOut fires (browser race), the pause reason sticks. Guard: on click, also removePauseReason. Actually the cleanest solution is B7's effect-driven approach (`hoveredPin` change → add/remove pause). If B7 has landed, skip the `addPauseReason` call here.

- **`showHover` gate**: hover-related interactions only run on devices where `showHover` is true (desktop + tablet per existing provider, `!isMobile`). Mobile pins use click only.

- **Pin identity everywhere**: grep for `pin.group` after this ticket. Only the removed `groupPins` had it; any remaining reference is a bug.

- **`GlobeTooltip` positioning**: copied from existing — the frame subscription keeps it glued to the pin. Don't restructure.

## Ambiguities requiring clarification before starting

1. **Clear `pinSubregionHighlight` on what event?**
   - On pointerOut if not selected.
   - On panel close (via `selectedPin → null`).

   Proposal: the Pin component clears on pointerOut only if `!isSelected`. An effect in the provider watches `selectedPin === null` and clears `pinSubregionHighlight`.

   **Action**: add to C1's provider as a passive effect:
   ```tsx
   useEffect(() => {
     if (selectedPin === null) setPinSubregionHighlight(null)
   }, [selectedPin, setPinSubregionHighlight])
   ```
   This is a 3-line change that belongs in C1 but can be dropped in here as a note for the C1 agent. If C1 has already merged without it, add the effect to `GlobePins.tsx` or `GlobeProvider.tsx` via a follow-up commit.

2. **Should `hoveredPin` on mobile be set at all?**
   - Spec §9.2 mobile row says tooltip shows briefly during tap gesture. `showHover` is false on mobile. So `hoveredPin` may not update. Tooltip doesn't render. Acceptable.

   **Action**: rely on `showHover` gate. No mobile-specific hover.

3. **Tooltip delay**: spec doesn't mention one. Currently shows immediately on hover. OK for now.

## Handoff / outputs consumed by later tickets

- `pinPositionRef` is now keyed by `location._id`. Consumers (connectors, C7 auto-scroll) use `pin.location._id`.
- `pinSubregionHighlight` — set here; consumed by B5's `TimelinePinBands`.
- Pin click sets `selectedPin = location._id` — consumed by C3 panel rendering.

## Shipped implementation notes

These are things the agent actually decided during implementation that the plan text above does not cover. Downstream tickets should read this section before touching anything `pin*`-adjacent.

### Tooltip visibility is driven per-frame, not per-render

`GlobeTooltip` writes `opacity` and `translate` inline in its RAF loop, not via React state. Two gates combine each frame:

- **`visibleRef`** — mirrors the post-delay "intent" (did the user dwell long enough to earn a tooltip?). Flipped by a 120 ms `setTimeout` in the `hoveredPin` effect.
- **`onScreen`** — `pos.visible && !pos.behind`, computed each frame from `pinPositionRef`.

Both must be true to paint. This is load-bearing for the rotate-while-hovering case: without the per-frame `onScreen` read the tooltip would stay visible anchored to a pin that has rotated to the back hemisphere. Do **not** refactor `GlobeTooltip` to use a single `shown` React state — you'll either need a per-frame `setState` (re-render storm) or accept the stale-anchor regression.

### `pin-hover` pause-reason wiring is C2's problem temporarily

C2 inlines `addPauseReason('pin-hover')` / `removePauseReason('pin-hover')` in `GlobePins.tsx`'s pointerOver/pointerOut/click handlers (including a belt-and-suspenders remove in click to cover the pointerOut-vs-click race). **B7 will rip these out** and replace with the effect-driven provider pattern (`useEffect(() => { if (hoveredPin && isDesktop) ... }, [hoveredPin, isDesktop, ...])`). The B7 spec now contains a `⚠️ Replace the C2 inline wiring` block with a grep-verification step. When B7 lands, expect this area of `GlobePins.tsx` to shrink substantially.

### `pinSubregionHighlight` clear-on-close lives in the provider

Per the C2 gotchas, the highlight must persist while the pin panel is open and clear when it closes. Two cooperating pieces:

1. `GlobePins.tsx` pointerOut guard: `if (selectedPin !== locationId) setPinSubregionHighlight(prev => ...)`. Keeps the highlight lit during hover-out if the pin is selected.
2. `GlobeProvider.tsx` effect: `useEffect(() => { if (selectedPin === null) setPinSubregionHighlight(null) }, [selectedPin, setPinSubregionHighlight])`. Fires when any close path clears `selectedPin` — the panel's X button (C3), trip-lock swap (C1's `setLockedTrip` wrapper), escape (D3), etc.

C3 should **not** clear `pinSubregionHighlight` itself; calling `selectPin(null)` is sufficient.

### `GlobeDetailPanel.tsx` is a placeholder until C3

C1 left `GlobeDetailPanel` referencing the removed `GlobePin` type with `pin.group` / `pin.items`. C2 kept it compiling by:

- Accepting `PinWithVisits` instead of `GlobePin`.
- Flattening `pin.visits.flatMap(v => v.items.map(...))` into the existing flat-list item loop, with `locationLabel = pin.location.name` and `year = visit.startDate.slice(0, 4)`.
- Showing `pin.location.name` and an item count in the header.

This is **not** the per-visit section layout the spec calls for (§7.1). C3 owns the real rebuild. Replace this file wholesale in C3; no need to preserve the flattening — it's throwaway glue.

### `lib/sanity.ts` now exports two clients

C2 discovered that Phase-5C doc types (`locationDoc`, `trip`, `visit`) deny anonymous reads even when the dataset's `aclMode` is `public` — without a token, `client.fetch(allVisitsQuery)` from a server component silently returns `[]`. To fix, `lib/sanity.ts` now has:

- **`client`** — token-less, safe for client bundles. Used by `urlFor` and any browser-reachable import.
- **`readClient`** — server-only, forwards `SANITY_API_TOKEN`. Used by server-rendered routes that need real data.

**INVARIANT**: never import `readClient` from a `'use client'` file. `SANITY_API_TOKEN` has no `NEXT_PUBLIC_` prefix so Next.js won't bundle it, but importing `readClient` into browser code still pulls in the client construction graph unnecessarily and risks future token leaks if someone accidentally adds a `NEXT_PUBLIC_` env.

Currently only `app/globe/layout.tsx` uses `readClient`. Other routes (`app/[slug]`, `app/feed`, `app/wardrobe/**`) still use the public `client`. They work today because `content` docs have different permissions — but **future tickets that tighten `content`'s permission rules will need to migrate those imports too**. When you do, grep for `import { client } from '@/lib/sanity'` in any server component (`app/**/page.tsx`, `app/**/layout.tsx`) and swap to `readClient`.

### `/globe/<slug>` no longer redirects non-globe items

The old `app/globe/[slug]/page.tsx` redirected items that didn't have `globe_group` to `/<slug>`. That field is gone. **C2 removed the guard entirely** — any item URL under `/globe/` now renders with the sliver. This was an intentional product decision (see C2 PR review). If a future ticket wants the guard back, it needs a visit-count lookup: `count(*[_type=="visit" && references($itemId)])` in the same fetch, redirect on zero.

### `GlobePins.tsx` no longer exposes a `group` prop

The `Pin` component's identity prop is named `locationId` (was `group`). Any future ticket that adds more interactions to pins should key off `locationId` and match it against `selectedPin` / `hoveredPin` — both of which are now `locationDoc._id` strings throughout the codebase.

## How to verify

1. `/globe` — pins render at seeded locations.
2. Hover Berlin pin — tooltip "Berlin, Germany · 2 visits".
3. Hover Marrakech pin (single visit) — tooltip "Marrakech, Morocco".
4. Hover a pin + look at timeline (if B5 merged) — bands appear in trips containing visits at that pin.
5. Click a pin — `selectedPin` updates in DevTools; `pinSubregionHighlight` stays set (unchanged on click).
6. Pin panel closes (via C3 close X): both `selectedPin` and `pinSubregionHighlight` become null.
7. Drag globe — tooltip follows the hovered pin during rotation.
8. Back-face pin fade still works (rotate globe so pin goes behind — tooltip hides).
