# 5C-E1 — Mobile layout: globe + sticky timeline + scrollable content region

**Epic**: E. Mobile reframing · **Owner**: Dev A + Dev C pair · **Can be run by agent?**: Partial — visual calibration needs real device · **Estimated size**: L

## Dependencies

### Hard
- **C4** — trip panel exists (rendered inline on mobile).
- **B4** — timeline integrated with real data.

### Soft
- **C7** — cross-interactions still work in mobile inline panel rendering.

### Blocks
- **E2** (default trip list fits inside content region)
- **E3** (preview label extends a timeline that's placed correctly)
- **F1** (boneyard targets include mobile trip list)

---

## Goal

Remove the Phase 5A mobile sidecar panel. Restructure the `<768px` viewport as: globe → timeline → scrollable content region. Timeline is sticky to the top of the viewport after globe scrolls off. Content region holds the default trip list, pin panel, trip panel, or article sliver inline.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §3 Mobile Layout
- §10.1 Below-globe content region
- §10.2 Navigation chrome
- §10.4 Timeline squeeze on scroll
- §13.6.1 Skeleton target: `trip-list-default`

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §3, §10
- [`../../components/globe/GlobeViewport.tsx`](../../components/globe/GlobeViewport.tsx) — current mobile branch; big rewrite
- [`../../app/globe/page.tsx`](../../app/globe/page.tsx) — default content surface (currently empty)
- [`../../components/globe/Timeline.tsx`](../../components/globe/Timeline.tsx) — used inline

## Files to create

- `components/globe/MobileContentRegion.tsx` — dispatcher for the below-timeline content
- `components/globe/MobileTripList.tsx` — stub here; E2 implements
- `components/globe/MobileNavChrome.tsx` — the back arrow / X at the top of the content region

## Files to modify

- `components/globe/GlobeViewport.tsx` — mobile branch: remove sidecar, new vertical layout
- `app/globe/layout.tsx` — if mobile layout requires restructuring, update here (likely minimal)
- `components/globe/Timeline.tsx` — add "squeeze on scroll" behavior for mobile

## Files to delete

- None (sidecar pattern is removed in GlobeViewport, not a separate file).

---

## Implementation guidance

### Desktop vs mobile branching

`GlobeViewport.tsx` already branches on `isMobile`. Current mobile renders:
- Full-screen globe with translate/scale when panel opens
- Sidecar panel that slides in from right with scrim

**New mobile structure**:

```tsx
if (isMobile) {
  return <MobileGlobeLayout>{children}</MobileGlobeLayout>
}
// Desktop branch unchanged
```

### `MobileGlobeLayout` (inside GlobeViewport.tsx or a separate file)

```tsx
function MobileGlobeLayout({ children }: { children: React.ReactNode }) {
  const { layoutState } = useGlobe()
  const globeRegionRef = useRef<HTMLDivElement>(null)
  const [globeOffscreen, setGlobeOffscreen] = useState(false)

  useEffect(() => {
    const el = globeRegionRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setGlobeOffscreen(!entry.isIntersecting),
      { threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const isArticle = layoutState === 'article-open'

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black">
      {/* Globe region — not sticky, scrolls with page. Height: 45vh per spec visual. */}
      <div
        ref={globeRegionRef}
        className="relative w-full flex-shrink-0"
        style={{ height: '45vh' }}
      >
        <GlobeCanvas />
        <GlobeTooltip />
      </div>

      {/* Timeline — sticky once globe scrolls off. */}
      <div
        className={`sticky top-0 z-10 w-full bg-white dark:bg-black border-b border-black/5 dark:border-white/5 transition-[height,padding] duration-300 ${
          globeOffscreen ? 'py-1' : 'py-2'
        }`}
      >
        <Timeline />
      </div>

      {/* Content region — scrollable by page scroll (no separate overflow). */}
      <div className="flex-1 w-full">
        {isArticle ? (
          <div className="w-full border-t border-gray-100 dark:border-gray-900">
            {/* Article content renders inline on mobile — globe stays above */}
            <MobileNavChrome mode="close" />
            {children}
          </div>
        ) : (
          <MobileContentRegion />
        )}
      </div>
    </div>
  )
}
```

### `MobileContentRegion.tsx`

Dispatches between default trip list, pin panel, or trip panel inline:

```tsx
'use client'

import { useGlobe } from './GlobeContext'
import MobileTripList from './MobileTripList'
import MobileNavChrome from './MobileNavChrome'
import PinPanel from './panels/PinPanel'
import TripPanel from './panels/TripPanel'

export default function MobileContentRegion() {
  const { panelVariant, pins, selectedPin, lockedTrip, tripsWithVisits } = useGlobe()

  if (!panelVariant) {
    return <MobileTripList />
  }

  return (
    <div className="w-full border-t border-gray-100 dark:border-gray-900">
      <MobileNavChrome mode="back" />
      {panelVariant === 'pin' && selectedPin && (() => {
        const pin = pins.find((p) => p.location._id === selectedPin)
        return pin ? <PinPanel pin={pin} /> : null
      })()}
      {panelVariant === 'trip' && lockedTrip && (() => {
        const trip = tripsWithVisits.find((t) => t._id === lockedTrip)
        return trip ? <TripPanel trip={trip} /> : null
      })()}
    </div>
  )
}
```

### `MobileNavChrome.tsx`

```tsx
'use client'

import { useGlobe } from './GlobeContext'
import { useRouter } from 'next/navigation'

interface Props {
  mode: 'back' | 'close'
}

export default function MobileNavChrome({ mode }: Props) {
  const { selectPin, setLockedTrip, closeArticle, layoutState } = useGlobe()
  const router = useRouter()

  const onClick = () => {
    if (layoutState === 'article-open') {
      closeArticle()
    } else {
      selectPin(null)
      setLockedTrip(null)
      router.push('/globe', { scroll: false })
    }
  }

  const symbol = mode === 'close' ? '×' : '←'
  const label = mode === 'close' ? 'Close' : 'Back'

  return (
    <button
      onClick={onClick}
      className="sticky top-[var(--timeline-height,80px)] z-10 flex items-center gap-2 px-4 py-3 w-full text-left text-xs tracking-widest uppercase bg-white dark:bg-black border-b border-gray-100 dark:border-gray-900 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
      data-no-skeleton
    >
      <span aria-hidden>{symbol}</span>
      {label}
    </button>
  )
}
```

### `Timeline.tsx` — squeeze on scroll

Mobile-only: the wrapping div's padding/height can shrink when globe scrolls off. The `MobileGlobeLayout` above wraps Timeline in a div that handles the squeeze via Tailwind transition — no changes needed inside Timeline itself.

If Timeline's own height is rigid (`h-16 md:h-20`), override via wrapper or add a mobile prop:

```tsx
// In Timeline.tsx
interface TimelineProps {
  className?: string
  now?: string
  squeezed?: boolean  // new — mobile sticky + scrolled-past-globe
}
```

Simpler: CSS transition on the wrapper height. Keep Timeline itself size-agnostic (use `h-full` inside the component). Wrapper dictates height.

### `MobileTripList.tsx` (stub)

```tsx
'use client'

export default function MobileTripList() {
  return (
    <div data-testid="mobile-trip-list-stub" className="p-4 text-xs tracking-widest uppercase text-gray-400">
      Trip list — E2
    </div>
  )
}
```

### `GlobeCanvas` props on mobile

Mobile's canvas didn't have a `dragDistanceRef` pattern — actually, it did (existing GlobeViewport passed it). Preserve:

```tsx
// Outer MobileGlobeLayout wrapper
const dragDistance = useRef(0)
const lastPointerPos = useRef<{ x: number; y: number } | null>(null)

const handlePointerDown = (e: React.PointerEvent) => {
  lastPointerPos.current = { x: e.clientX, y: e.clientY }
  dragDistance.current = 0
}
const handlePointerMove = (e: React.PointerEvent) => {
  if (!lastPointerPos.current) return
  const dx = e.clientX - lastPointerPos.current.x
  const dy = e.clientY - lastPointerPos.current.y
  dragDistance.current += Math.hypot(dx, dy)
  lastPointerPos.current = { x: e.clientX, y: e.clientY }
}

// Add to globe wrapper
<div
  ref={globeRegionRef}
  onPointerDown={handlePointerDown}
  onPointerMove={handlePointerMove}
  style={{ height: '45vh', touchAction: 'none' }}
>
  <GlobeCanvas dragDistanceRef={dragDistance} />
</div>
```

### Article sliver on mobile

Spec §10.1 (4): "Article sliver replaces the content region with the article body. The globe still renders above (it does not take over the full viewport). Timeline still renders between the globe and the article."

So on mobile:
- Globe at top (45vh).
- Timeline sticky.
- Content region = article body (replaces default/panel).
- Back/close chrome at top of content region.

In `MobileGlobeLayout` above, the `isArticle` branch renders the children (the article content from `/globe/[slug]` or `/trip/[slug]`) inside the content region. Already wired.

Note: no sidecar, no scrim, no translate/scale of the globe. The globe is just visible in its 45vh region.

---

## Acceptance criteria

- [ ] Viewport < 768px: renders globe (top 45vh), timeline (below), content region (below).
- [ ] Globe is not sticky — scrolls out of view normally when user scrolls down.
- [ ] Timeline sticks to top of viewport once globe scrolls off (IntersectionObserver fires).
- [ ] Timeline wrapper shrinks height slightly (padding change) when globe is off-screen.
- [ ] Default state: content region shows MobileTripList stub.
- [ ] Tapping a pin: content region shows PinPanel inline. Back-arrow MobileNavChrome at top.
- [ ] Locking a trip: content region shows TripPanel inline. Back-arrow at top.
- [ ] Tapping an item inside a panel: content region shows article body. Close-X MobileNavChrome at top. Globe still visible above.
- [ ] Scrim and sidecar slide-in from Phase 5A are GONE.
- [ ] `touchAction: 'none'` on globe region for gesture capture; `touchAction: 'pan-y'` on timeline for vertical scroll pass-through (from B3/B5).
- [ ] Desktop (≥ 768px) layout unchanged.

## Non-goals

- **MobileTripList real content** — E2.
- **Mobile preview label on timeline** — E3.
- **Landscape optimization** — §13 defers.
- **Pinch-to-zoom the content region** — not in spec.

## Gotchas

- **Existing mobile code in `GlobeViewport.tsx`**: substantial block (lines 69–191 in current impl). Full rewrite for mobile. Keep desktop intact.
- **Globe height in vh vs px**: `45vh` works for most phones. Landscape is cramped (spec §10.5 accepts). Test on actual device.
- **Sticky header stacking with multiple sticky elements** (timeline + MobileNavChrome): the `top` offset on the second sticky must equal the first sticky's height. Using `top-[var(--timeline-height)]` with a CSS var set from JS. If too fragile, make MobileNavChrome non-sticky (always-on-top positioning).

  Simplification: skip sticky on MobileNavChrome. It scrolls with panel content. The timeline alone is sticky.

- **IntersectionObserver threshold**: `threshold: 0` fires when any part of the globe region leaves the viewport. For the squeeze to feel right, you might want it to fire when globe is mostly off — use `threshold: 0.3` (squeeze when 70% of globe is below viewport edge). Tune.

- **Canvas inside a flex parent with `flex-shrink-0`**: R3F's Canvas fills its container. `height: 45vh` + `flex-shrink-0` keeps the canvas stable. Verify no R3F resize warnings.

- **Globe canvas re-renders on mount from desktop → mobile resize**: viewport resize crossing 768 triggers a layout switch. R3F canvas remounts. Briefly blank. Acceptable.

- **Content region height**: using `flex-1` so it fills remaining space. Page scroll is the outer vertical scroll (not inside the content region). This matches spec §10 — "scrollable content region below" means the page scrolls; the region just lays out vertically.

## Ambiguities requiring clarification before starting

1. **Globe height on mobile**: `45vh` is a starting point. Spec shows a schematic but no explicit percentage. 50vh feels roomier; 40vh gives more content space. Tune per device testing.

   **Action**: 45vh as default. Document as tunable.

2. **Squeeze visual effect**: spec §10.4 "slightly shrinks vertically — a subtle cue." My implementation shrinks padding. Could also shrink font sizes or add scale transform. Minimal change is best.

   **Action**: padding shrink. Subtle transition.

3. **MobileNavChrome sticky or not**: sticky is nicer but fragile. Non-sticky simpler. Default: non-sticky.

4. **Page scroll vs inner-container scroll**: using page scroll. All content is part of a vertical flow. If a reviewer wants the panels to have independent scroll (e.g., scrolling a pin panel while timeline stays pinned), that requires more work. Default is page scroll — simpler and spec-compatible.

5. **Scrim behavior preserved?**: Phase 5A mobile scrim is gone. Spec §10.1 "sidecar panel is removed." Confirmed. Watch for edge cases where users expected the scrim-tap-to-dismiss pattern — replaced by MobileNavChrome's back arrow.

## Handoff / outputs consumed by later tickets

- `MobileContentRegion` — E2 fills in `MobileTripList`.
- `MobileNavChrome` — reused for any mobile state back/close button.
- Mobile globe layout — E3 places preview label on the timeline component that lives inside this layout.

## How to verify

1. Chrome devtools → device mode → iPhone 14 Pro. Open `/globe`.
2. See globe top half, timeline below, trip-list stub at bottom.
3. Scroll down — globe scrolls out, timeline sticks to top with a subtle squeeze.
4. Tap a pin on the globe — content region below swaps to pin panel inline. Back arrow visible at top.
5. Tap back arrow — returns to trip-list stub state.
6. Tap trip label on timeline — content region swaps to trip panel.
7. Tap an item in the panel — content region swaps to article body. Close X at top.
8. Tap close X — returns to trip panel (if trip locked) or trip list (if nothing locked).
9. Resize to 800px wide → desktop layout (unchanged behavior).
10. Real device (iPhone): all the above. Confirm globe gestures still work (rotate, pinch).
