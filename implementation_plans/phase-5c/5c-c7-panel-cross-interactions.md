# 5C-C7 — Panel cross-interactions: pin-click-within-locked-trip, panel cleanup

**Epic**: C. Globe & Panels · **Owner**: Dev C · **Can be run by agent?**: Yes · **Estimated size**: M

## Dependencies

### Hard
- **C3** — PinPanel exists
- **C4** — TripPanel exists with VisitSection `onRef`/`pulsing` props

### Soft
- **C6** — arcs light up when a pin is hovered while a trip is locked (arcs react to `hoveredTrip` state). Not strictly blocking.

### Blocks
- **F3** (verification).

---

## Goal

Wire the decision tree for "what happens when a pin is clicked while something is already locked or panel-open." Per spec §7.4 + §9.2:

- Pin click with **nothing locked**: pin panel opens (C3 handles). Timeline visit bands render (C2 emits signal).
- Pin click with trip A locked, pin in trip A: **panel auto-scrolls to that visit's section**, section background-tint pulses. Lock stays. No rotate.
- Pin click with trip A locked, pin **not** in trip A: lock releases, trip panel closes, pin panel opens for the new pin.

Also handle pin hover (desktop) during locked trip: visit section background-tints on hover.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §7.4 Panel highlight on pin-trip cross-interaction
- §9.2 Pin interaction matrix (click rows during lock)
- §17.3 Panel auto-scroll timing (300ms ease-out), background-tint pulse (600ms)

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §7.4, §9.2
- [`../../components/globe/GlobePins.tsx`](../../components/globe/GlobePins.tsx) (post-C2) — click handler
- [`../../components/globe/panels/TripPanel.tsx`](../../components/globe/panels/TripPanel.tsx) (post-C4)
- [`../../components/globe/panels/VisitSection.tsx`](../../components/globe/panels/VisitSection.tsx) (post-C3)
- [`../../components/globe/GlobeScene.tsx`](../../components/globe/GlobeScene.tsx) (post-C5) — pin-rotate guard

## Files to create

- None.

## Files to modify

- `components/globe/GlobePins.tsx` — click handler now consults `lockedTrip`
- `components/globe/panels/TripPanel.tsx` — wire `onRef` callbacks + scroll-to-visit effect + pulse state
- `components/globe/panels/VisitSection.tsx` — add `pulsing` visual
- `components/globe/GlobeScene.tsx` — in pin-rotate effect, add guard "don't rotate if pin is inside locked trip"

## Files to delete

- None.

---

## Implementation guidance

### Pin click with context-aware dispatch

Update `GlobePins.tsx` click handler:

```tsx
const { pins, selectedPin, lockedTrip, setLockedTrip, selectPin, setHoveredPin, setPinSubregionHighlight } = useGlobe()

const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
  e.stopPropagation()

  const pin = pins.find((p) => p.location._id === locationId)
  if (!pin) return

  if (lockedTrip) {
    if (pin.tripIds.includes(lockedTrip)) {
      // Pin is IN the locked trip — don't open pin panel, don't change selection.
      // Signal the TripPanel to scroll to this pin's visit in the locked trip.
      setPinToScrollTo(locationId)  // new context field; see below
      return
    } else {
      // Pin is OUTSIDE the locked trip — unlock trip, open pin panel.
      setLockedTrip(null)
      selectPin(locationId)
      setPinSubregionHighlight(locationId)
      return
    }
  }

  // No lock — standard pin selection.
  selectPin(locationId)
  setHoveredPin(null)
  setPinSubregionHighlight(locationId)
}, [pins, lockedTrip, locationId, selectPin, setLockedTrip, setHoveredPin, setPinSubregionHighlight, setPinToScrollTo])
```

`setPinToScrollTo` is a new context field. Value: `string | null` = the pin id to scroll to (inside the open trip panel).

### New context field

Add to `GlobeContext.tsx`:

```ts
/** Pin whose visit section should be scrolled to in the open trip panel.
 *  Consumed by TripPanel; cleared by TripPanel after scroll completes. */
pinToScrollTo: string | null
setPinToScrollTo: (id: string | null) => void
```

Implement in `GlobeProvider.tsx`:

```tsx
const [pinToScrollTo, setPinToScrollTo] = useState<string | null>(null)
// ... include in context value
```

### TripPanel: scroll-to-visit + pulse

Extend `TripPanel.tsx`:

```tsx
'use client'

import { useRef, useEffect, useState } from 'react'
// ... other imports

export default function TripPanel({ trip }: Props) {
  const { setLockedTrip, pinToScrollTo, setPinToScrollTo } = useGlobe()
  // Refs to each visit section for scroll
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [pulsingVisitId, setPulsingVisitId] = useState<string | null>(null)

  const handleSectionRef = (el: HTMLElement | null, visitId: string) => {
    if (el) sectionRefs.current.set(visitId, el)
    else sectionRefs.current.delete(visitId)
  }

  // When pinToScrollTo becomes a pin in this trip: scroll to that visit, pulse it.
  useEffect(() => {
    if (!pinToScrollTo) return
    // Find the visit in this trip at this pin.
    const visit = trip.visits.find((v) => v.location._id === pinToScrollTo)
    if (!visit) return
    const el = sectionRefs.current.get(visit._id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    // Pulse for 600ms
    setPulsingVisitId(visit._id)
    const timer = setTimeout(() => {
      setPulsingVisitId(null)
      setPinToScrollTo(null)  // clear the signal
    }, 600)
    return () => clearTimeout(timer)
  }, [pinToScrollTo, trip.visits, setPinToScrollTo])

  return (
    <Skeleton name="trip-panel" loading={false} fixture={null}>
      <PanelChrome ...>
        {/* Global "View trip article" button — unchanged */}
        {/* Visit sections — pass onRef + pulsing */}
        {trip.visits.map((visit) => (
          <VisitSection
            key={visit._id}
            visit={{ ...visit, trip: { _id: trip._id, title: trip.title, slug: trip.slug } }}
            showViewTripArticleLink={false}
            sticky
            onRef={handleSectionRef}
            pulsing={pulsingVisitId === visit._id}
          />
        ))}
      </PanelChrome>
    </Skeleton>
  )
}
```

### VisitSection: pulse visual

Update `VisitSection.tsx` (from C3) to react to `pulsing` prop:

```tsx
// In C3, already has:
// className={`... transition-colors duration-[600ms] ${pulsing ? 'bg-[var(--accent)]/10' : 'bg-transparent'}`}

// That already pulses via Tailwind transition. On prop change false → true → false,
// the element flashes accent-tint. CSS handles it.
```

The `duration-[600ms]` + `transition-colors` gives a smooth fade in + out when the `pulsing` boolean flips true → false (600ms). Verify the fade-up-hold-fade-down effect spec §17.3 wants:

Spec says "600ms ease-in-out (fade up, hold briefly, fade down)." A single Tailwind transition does fade-up on true→then-fade-down on false. If spec wants explicit hold, use keyframe animation:

```tsx
// In VisitSection.tsx
{pulsing && (
  <style jsx>{`
    @keyframes visit-pulse {
      0% { background-color: transparent; }
      30% { background-color: rgba(37, 99, 235, 0.12); }
      70% { background-color: rgba(37, 99, 235, 0.12); }
      100% { background-color: transparent; }
    }
  `}</style>
)}
// Apply: animation: visit-pulse 600ms ease-in-out
```

Simpler — just Tailwind transition twice: the prop flips true (fade up 600ms), then setTimeout flips back false (fade down 600ms). Total visible duration 1.2s. Not exactly spec but close enough.

**Action**: use the keyframe animation approach — cleaner and spec-accurate.

### Pin hover while locked (§7.4)

> **Hover**: section receives the same background tint, held for the duration of the hover, no scroll.

Additional behavior beyond click. Wire via `hoveredPin`:

```tsx
// In TripPanel.tsx — also respond to hoveredPin
const { hoveredPin } = useGlobe()
const hoveredVisitId = useMemo(() => {
  if (!hoveredPin) return null
  const visit = trip.visits.find((v) => v.location._id === hoveredPin)
  return visit?._id ?? null
}, [hoveredPin, trip.visits])

// Pass to VisitSection:
<VisitSection
  ...
  pulsing={pulsingVisitId === visit._id}
  hovered={hoveredVisitId === visit._id}  // new prop
/>
```

Update `VisitSection.tsx` (from C3) — `hovered` prop + combined styling:

```tsx
interface Props {
  visit: VisitSummary
  showViewTripArticleLink: boolean
  sticky?: boolean
  onRef?: (el: HTMLElement | null, visitId: string) => void
  pulsing?: boolean
  hovered?: boolean  // new
}

// Styling:
className={`... ${pulsing ? 'pulse-active' : ''} ${hovered ? 'bg-[var(--accent)]/10' : ''}`}
```

When both `pulsing` and `hovered` are true (pin hovered + just clicked), styles override — that's fine; visually they're the same tint.

### GlobeScene pin-rotate guard

Per C5's spec, the pin-rotate effect needs a guard: don't rotate if the clicked pin belongs to the locked trip.

```tsx
// In GlobeScene.tsx existing pin-rotate effect
useEffect(() => {
  const prev = prevSelectedPin.current
  prevSelectedPin.current = selectedPin

  if (!selectedPin || prev === selectedPin) return
  if (!entranceDone.current) return
  // NEW: skip if this pin is in the locked trip (handled by C7 scroll instead).
  const pin = pins.find((p) => p.location._id === selectedPin)
  if (lockedTrip && pin?.tripIds.includes(lockedTrip)) return

  // ... rest of rotate logic
}, [selectedPin, pins, lockedTrip])
```

Actually: in the C7 flow, clicking a pin-in-locked-trip doesn't change `selectedPin` at all (our handler above just sets `pinToScrollTo`). So this effect wouldn't fire. The guard is defensive — safe to add.

---

## Acceptance criteria

- [ ] Click a pin with nothing locked: pin panel opens, timeline sub-region bands appear.
- [ ] Lock Japan Spring '22. Click Tokyo pin: no pin panel opens. Trip panel scrolls to Tokyo visit section. Section background tints accent for ~600ms, then fades.
- [ ] Lock Japan Spring '22. Click Kyoto pin: scrolls to Kyoto section, pulses.
- [ ] Lock Japan Spring '22. Click Berlin pin (not in trip): trip unlocks, pin panel opens for Berlin. Pin panel shows Berlin '22 + Berlin '24 sections.
- [ ] Lock Japan Spring '22. Hover Tokyo pin (desktop): Tokyo visit section background tints, held until hover ends. No scroll.
- [ ] Hover ends: tint clears.
- [ ] Pulse animation is visibly "fade up, hold, fade down" totaling ~600ms. Not a jarring instant flash.
- [ ] Scroll animation uses smooth behavior (native `scrollIntoView` with `behavior: 'smooth'` — matches the ~300ms ease-out tuning).
- [ ] Camera does not rotate when clicking a pin inside the locked trip.
- [ ] Pin-rotate guard in GlobeScene prevents duplicate rotation even if a race condition leaks through.

## Non-goals

- **No animation curve customization for scroll**: `scrollIntoView` with `behavior: 'smooth'` uses browser-native timing (usually ~300–500ms depending on distance). Matches §17.3 "300ms ease-out" loosely — if precise control needed, implement manual scroll. Out of scope.
- **No expansion state preservation** across pin clicks: spec §7.3.2 resets on variant switch, but same variant (trip panel staying trip panel) — state persists. That's fine; just note it.

## Gotchas

- **`scrollIntoView` vs custom scroll**: native scroll behavior can jump instantly on some browsers if `scroll-behavior: auto`. Ensure the scrollable container has `scroll-behavior: smooth` via CSS or use `element.scrollTo({ top, behavior: 'smooth' })` against the parent.

- **Auto-scroll vs user scroll**: spec §7.4 "The auto-scroll takes priority over the user's current scroll position." User may have scrolled to a specific visit; click on another pin forcefully scrolls. Acceptable per spec. Don't fight it.

- **Pulse without scroll**: if the user clicks the same pin twice (already scrolled to that section), `scrollIntoView` is a no-op but the pulse still fires. Good — user sees feedback that their click was registered.

- **`pinToScrollTo` timing with `setLockedTrip(null)` transitions**: if the user clicks a pin OUTSIDE the locked trip, we call `setLockedTrip(null)` + `selectPin(locationId)` + `setPinSubregionHighlight(locationId)`. `pinToScrollTo` is not set in this path, so no scroll logic interferes. Good.

- **React batching**: all state setters in the click handler may batch. Works in React 18+. Just verify visually — if TripPanel unmounts (via `lockedTrip → null`) before `setPinToScrollTo` could fire, no issue (the new PinPanel renders).

- **Race: pin hover over trip panel at the same time**: hovering a pin while trip panel is open should only tint if pin's visit is in the locked trip. The `hoveredVisitId` useMemo finds the visit — returns null if pin's not in trip — so tint only applies for valid cross-interactions.

## Ambiguities requiring clarification before starting

1. **Pulse duration precise timing**: spec says "brief background-tint pulse" and §17.3 gives 600ms. Implementation uses 600ms total. Fine.

2. **What if `pinToScrollTo` is set but trip panel is not mounted?** E.g., mid-transition. The `useEffect` in TripPanel only runs when TripPanel is mounted, which is when `panelVariant === 'trip'` and `lockedTrip !== null`. If the variant is swapped, TripPanel unmounts and the effect tears down. `pinToScrollTo` stays set but no consumer — it'll be cleared next time any consumer mounts. To be defensive, add a provider-level cleanup: clear `pinToScrollTo` when `lockedTrip` changes:

   ```tsx
   useEffect(() => {
     if (lockedTrip === null) setPinToScrollTo(null)
   }, [lockedTrip])
   ```

   **Action**: add cleanup effect in GlobeProvider.

3. **Item-expansion state on pulse**: does pulsing a section expand its items? Spec doesn't say. Default: no auto-expand. User's existing expansion state preserved.

   **Action**: no auto-expand.

4. **`VisitSection.hovered` prop conflicting with sticky-header hover**: if the user hovers the section's sticky header (not the pin), the whole section shouldn't tint. Hover state comes only from pin hover — `hoveredPin` → `hoveredVisitId` → prop. No mouse-hover-on-section-itself logic. Good.

## Handoff / outputs consumed by later tickets

- `pinToScrollTo` context field — added here; consumed only by TripPanel.
- Pin-rotate guard — added in GlobeScene here; reinforces C5's behavior.
- No F-series dependencies.

## How to verify

1. `/globe` — click Japan Spring '22 label. Trip panel opens with Tokyo / Kyoto / Osaka sections.
2. Click Tokyo pin on the globe — trip panel scrolls to Tokyo section. Section tints accent for ~600ms, then fades.
3. Click Kyoto pin — scrolls to Kyoto section with pulse.
4. Click Osaka pin — scrolls with pulse.
5. Click Berlin pin — trip unlocks. Berlin pin panel opens. URL goes to `/globe` then updates as `selectedPin` flows.
6. Re-lock Japan Spring '22. Hover Tokyo pin (desktop, don't click) — Tokyo section tints. Move cursor away — tint clears.
7. Check React DevTools: `pinToScrollTo` is set briefly on pin click, then cleared after 600ms.
8. Click any pin inside locked trip twice in quick succession — both pulse animations fire (second overrides first — mid-600ms pulse gets reset).
