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

---

## Implementation record (2026-04-23)

Shipped decisions from the E1 build. These supersede the "ambiguities" section above — treat this as the ground truth for what exists in code.

### Layout

- **Globe height**: tuned to `70vh` (not the original 45vh). Smaller values pushed the panel header off-screen before the user realized there was content below; 70vh leaves the panel's first line peeking, which reads as an affordance.
- **Globe region `touchAction: 'none'`** so R3F OrbitControls claim the gesture. Timeline region inherits `pan-y` default so native vertical scroll still works on the page.
- **Timeline sticky offset**: `top: NAVBAR_HEIGHT_PX` (72px). Without an explicit offset the sticky bar collided with the fixed navbar text at the top of the viewport.
- **Squeeze cue**: IntersectionObserver on the globe region drives a `padding-y: 8px → 2px` transition on the timeline wrapper when the globe scrolls out. Padding only — no font-size or transform. No rAF/throttle needed at this event rate.
- **MobileNavChrome**: non-sticky, rendered inline at the top of the panel or article. Back handler resets both `selectedPin` and `lockedTrip`, then `router.push('/globe', { scroll: false })`.
- **Mobile trip-list stub**: `MobileTripList.tsx` renders a visible "Trip list — E2" placeholder. Intentionally conspicuous so reviewers can see this is a stub handoff, not a bug.

### Timeline interaction on mobile

Everything below is mobile-only unless noted. Desktop behavior is unchanged.

- **Initial zoom window**: `{ start: 0.15, end: 0.85 }` on mobile (`window.innerWidth < 768`), `{ 0, 1 }` on desktop. Mobile opens pre-zoomed so the pan/pinch affordance is discoverable without tutorial text.
- **Track inset**: edge-to-edge (`MOBILE_TRACK_INSET_X = 0`). Earlier iterations tried a dynamic inset that popped in at the history endpoints; it caused horizontal and vertical reflow at the exact moment the user was trying to read their position. Replaced with pan overscroll (see below) which gives the same visual breathing room without reflow.
- **Tap rows**: `labelRowHeight = 18` on mobile (vs 14 desktop). Text stays at 10px; line-height set to the row height so the label sits vertically centered. 20–24 felt over-padded; 18 is the chosen tap target.
- **Label taps lock directly**: mobile-specific preview-then-lock UX is owned by E3. Until then, `handleLabelClick` behaves the same as desktop (single-tap locks). The earlier `if (ctx.isMobile) return` guard was removed for the E1 release.
- **Row packing is stable across pan/zoom**: the memoized `packed` result depends only on `innerWidth`, `trips`, `compressed`, `labelWidths`, `displayLabels`. Since `innerWidth` no longer varies with pan state, the timeline element's vertical height is constant during gestures. Any future reintroduction of dynamic track inset MUST use a separate stable width for packing — otherwise rows reshuffle mid-gesture.

### Pan overscroll (user-visible affordance, not just a numeric clamp)

- **Problem**: the user needs to feel "this is the end of the timeline." A gutter that pops in at the endpoint caused vertical reflow. A permanent gutter wasted horizontal space and hid the edge-to-edge aesthetic.
- **Solution**: the pan range itself is extended past `[0, 1]`. Panning reveals a short empty strip beyond the first/last history point, then hard-stops.
- **Shape of the clamp**: `clampZoom(start, end, overscroll)` allows `start ∈ [-ov, ...]` and `end ∈ [..., 1+ov]` where `ov = overscroll × span` (and collapses to 0 once `span ≥ 1`). Default `overscroll = 0` preserves desktop behavior. Only `dragPan` and `wheelPan` pass a non-zero overscroll; `wheelZoom` and `pinchZoom` still strict-clamp.
- **Magnitude**: `MOBILE_PAN_OVERSCROLL = 0.08`. Sized so the visible gutter is ~8% of the currently-visible span on each side. At typical mid-zoom this reads as ~20–30px of empty space.
- **Why overscroll scales with span**: fixed-pixel overscroll looked wrong at different zoom levels (huge gap when zoomed out, invisible when zoomed in). Scaling with span keeps the visual cue consistent across zoom states.
- **Background bar clipping**: the track's gray pill is clipped to the history range via `left: max(0, -start/span * 100%)` and `right: max(0, (end-1)/span * 100%)`. Without this clip the gray bar ran into the overscrolled region and the stop was ambiguous. Children of the track container (TimelineSegment, TimelinePinBands, TimelinePlayhead) project via `(x - start) / span * containerWidth` and don't assume the container represents the full history — they keep working unchanged.
- **No snap-back**: overscroll acts as a hard bound, not a rubber-band. The intent is "reveal empty space → hit wall," not "bounce back to the edge." Revisit if QA says the hard stop feels abrupt.

### Dev-server plumbing (not part of the spec, but shipped to unblock mobile testing)

- **`dev-lan.sh`**: env-symlink shim (same as `dev.sh`) plus `next dev -H 0.0.0.0 -p 3100`. Binds all interfaces so a phone on the same Wi-Fi can hit the host's LAN IP.
- **`next.config.ts > allowedDevOrigins`**: required by Next 15 — without it the HMR websocket upgrade from a LAN IP fails with "cannot parse response." Pattern list covers common RFC1918 ranges plus `*.local`.
- **Launch config**: `.claude/launch.json` has a "Next.js dev (LAN)" entry on port 3100 so LAN dev doesn't collide with standard dev on 3000.

### What's not covered by tests

- `clampZoom` overscroll paths ARE unit-tested (`lib/timelineZoom.test.ts`). `dragPan` / `wheelPan` overscroll paths are unit-tested.
- No Playwright / integration test covers the mobile layout itself or the overscroll gesture. Visual QA only. If flakiness appears post-ship, prioritize an integration test that simulates a drag past the endpoint and asserts the track background's `left` CSS value.
- `ctx.isMobile` is assumed stable within a session. A resize that crosses the 768px breakpoint will re-read it on next render (via `panOverscrollRef.current` assignment on each render), but the initial zoom window (set in `useState` initializer) won't adjust. Not a bug worth fixing for E1; note for future maintainers.

### Handoff reminders for downstream tickets

- **E2 (mobile trip list)**: replace `MobileTripList` body. Expected to consume the same `ctx.trips` used by the desktop sidebar — check `GlobeContext` for shape.
- **E3 (mobile preview-then-lock)**: `handleLabelClick` on mobile currently locks immediately (same as desktop). E3 will reintroduce a mobile branch; the place to gate it is `handleLabelClick` in `Timeline.tsx`. Preview state should live alongside the trip context, not inside Timeline.
- **Anything touching clampZoom**: if you change the signature again, update the optional `overscroll` param rather than removing it. Existing callers depend on the default.

---

## Addendum: post-ship tweaks (2026-04-24, PR [#55](https://github.com/AroundTheLines/qile.wang/pull/55))

Two changes to the mobile layout after real-device review reversed earlier decisions. If you're reading the code and looking for the sticky timeline or the squeeze cue described above, that's why they're gone.

### Timeline is no longer sticky on mobile

- **Before**: the mobile timeline wrapper was `sticky top: NAVBAR_HEIGHT_PX` with an IntersectionObserver-driven `py-2 → py-0.5` squeeze when the globe scrolled off.
- **After**: plain `static` block with constant `py-2`. Scrolls with the page.
- **Why**: on-device the sticky strip crowded the navbar and the squeeze animation drew the eye away from content the user was actively scrolling into. Removing the pin felt calmer. The squeeze cue signaled "timeline is pinned" — with no pin, the signal isn't needed.
- **Removed with it**: the `globeOffscreen` state, its `IntersectionObserver`, and the `NAVBAR_HEIGHT_PX` import in `GlobeViewport.tsx`. `NAVBAR_HEIGHT_PX` is still exported from `lib/globe` and used by `TimelineOverlay.tsx` for the **desktop** sticky overlay — leave that alone. The mobile/desktop split is: `MobileGlobeLayout` (non-sticky) vs. `TimelineOverlay` (sticky, `md:block fixed`).

### `min-h-screen` on the mobile content region

- Added to the inner flex child in `MobileGlobeLayout` (the one that wraps `MobileContentRegion` / article `children`).
- **Why**: `MobileTripList` now smooth-scrolls to the top on row tap (see E2 addendum). The list-to-panel swap shrinks the document height mid-animation, which causes the browser to clamp `scrollY` to the new max and the animation visibly stops short of the top. Keeping the content region ≥ 100vh means the document length doesn't change across the swap, so `scrollTo({ top: 0, behavior: 'smooth' })` can complete cleanly.
- **Trade-off**: up to ~70vh of empty `bg-white`/`bg-black` below the panel when the trip panel is shorter than 100vh. Bg matches the outer wrapper, so it reads as padding, not a gap.
- **Don't remove this** unless you also remove the smooth-scroll in `MobileTripList.handleSelect` — the two are coupled.
