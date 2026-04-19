# 5C-C1 — Refactor `GlobeProvider` + `GlobeContext` for new data model

**Epic**: C. Globe & Panels · **Owner**: Dev C · **Can be run by agent?**: Yes · **Estimated size**: L

## Dependencies

### Hard
- **A2** — imports new types (`PinWithVisits`, `TripSummary`, `VisitSummary`).

### Soft
- None.

### Blocks
- **All of Epic C** (C2–C7), **B4** (timeline integration), **D2** (URL state uses new fields), **E1** (mobile reads panels).

---

## Goal

Refactor the global state container for Phase 5C. The current provider tracks pin selection by `globe_group` string. Phase 5C needs per-location pins, trip hover/lock state, playback coordination hooks, pause-reason registry, URL-state handles, and mobile preview-trip state. This ticket lands the new state shape and derived values; feature tickets consume.

Because this is a **large cross-cutting refactor**, it's the tightest bottleneck. Many downstream tickets block on this. Keep scope tight.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §7 Panel behaviors (informs `panelVariant`)
- §8 Trip article integration (informs `activeTripSlug`)
- §9 Interaction matrix (informs all state fields)
- §5 Playback (informs pause-reasons + playback highlight fields)

## Files to read first

- [`../../components/globe/GlobeProvider.tsx`](../../components/globe/GlobeProvider.tsx) — current implementation; diff target
- [`../../components/globe/GlobeContext.tsx`](../../components/globe/GlobeContext.tsx) — current context value
- [`../../lib/types.ts`](../../lib/types.ts) (post-A2) — `PinWithVisits`, `TripSummary`, `VisitSummary`
- [`../../lib/globe.ts`](../../lib/globe.ts) (post-A2) — `GlobeScreenCircle` kept
- [README §4.3 Invariants](./README.md#43-invariants-from-the-existing-code-preserve-these) — `PANEL_SETTLE_MS`, `prev`-selection pattern
- [README §5 Cross-ticket contracts](./README.md#5-cross-ticket-contracts)

## Files to create

- None.

## Files to modify

- `components/globe/GlobeContext.tsx` — new value shape
- `components/globe/GlobeProvider.tsx` — implement new state + derivations

## Files to delete

- None.

---

## Implementation guidance

### Full new `GlobeContextValue` shape

```ts
// components/globe/GlobeContext.tsx
'use client'

import {
  createContext, useContext,
  type Dispatch, type MutableRefObject, type SetStateAction,
} from 'react'
import type { PinWithVisits, TripSummary, VisitSummary } from '@/lib/types'
import type { GlobeScreenCircle } from '@/lib/globe'

export interface ScreenPosition {
  x: number
  y: number
  visible: boolean
  behind: boolean
}

export type ViewportTier = 'desktop' | 'tablet' | 'mobile'

export interface GlobeContextValue {
  // --- Server-fed data ---
  trips: TripSummary[]
  pins: PinWithVisits[]
  fetchError: boolean

  // --- Pin selection ---
  /** Pin identity = locationDoc._id. Was globe_group string pre-5C. */
  selectedPin: string | null
  selectPin: (id: string | null) => void
  hoveredPin: string | null
  setHoveredPin: Dispatch<SetStateAction<string | null>>
  /** Pin id whose visit sub-regions should light up on the timeline. Set by C2. */
  pinSubregionHighlight: string | null
  setPinSubregionHighlight: Dispatch<SetStateAction<string | null>>

  // --- Trip selection (new in 5C) ---
  lockedTrip: string | null
  setLockedTrip: (id: string | null) => void
  hoveredTrip: string | null
  setHoveredTrip: Dispatch<SetStateAction<string | null>>
  /** Mobile-only preview state (E3). */
  previewTrip: string | null
  setPreviewTrip: (id: string | null) => void

  // --- Playback coordination (B6/B7) ---
  /** Trip ids currently lit by the playback sweep. Set by B6. */
  playbackHighlightedTripIds: string[]
  setPlaybackHighlightedTripIds: (ids: string[]) => void
  /** Active after 5s idle; gates the playback RAF loop. Computed. */
  playbackActive: boolean
  addPauseReason: (reason: string) => void
  removePauseReason: (reason: string) => void
  /** Computed: `pauseReasonsCount > 0 || lockedTrip !== null || isArticleOpen`. */
  isPaused: boolean

  // --- Layout state ---
  layoutState: 'default' | 'panel-open' | 'article-open'
  slideComplete: boolean
  selectedPinScreenY: number | null
  pinPositionRef: MutableRefObject<Record<string, ScreenPosition>>
  globeScreenRef: MutableRefObject<GlobeScreenCircle | null>
  frameSubscribersRef: MutableRefObject<Set<() => void>>

  // --- URL state ---
  activeArticleSlug: string | null   // /globe/<slug> item article
  activeTripSlug: string | null      // /trip/<slug> trip article (new)
  closeArticle: () => void

  // --- Viewport + theme ---
  tier: ViewportTier
  isDesktop: boolean
  isTablet: boolean
  isMobile: boolean
  showHover: boolean
  showConnectors: boolean
  isDark: boolean

  // --- Derived ---
  /** Which panel to render. Null = nothing. */
  panelVariant: 'pin' | 'trip' | null
}

export const GlobeContext = createContext<GlobeContextValue | null>(null)

export function useGlobe(): GlobeContextValue {
  const ctx = useContext(GlobeContext)
  if (!ctx) throw new Error('useGlobe must be used inside <GlobeProvider>')
  return ctx
}
```

### `GlobeProvider` implementation

Keep what works (entrance-target effect, PANEL_SETTLE_MS contract, deep-link pin resolution). Add new state.

```tsx
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { GlobeContext, type ScreenPosition, type ViewportTier } from './GlobeContext'
import type { PinWithVisits, TripSummary } from '@/lib/types'
import type { GlobeScreenCircle } from '@/lib/globe'

const PANEL_SETTLE_MS = 450
const IDLE_RESUME_MS = 5000

function useViewportTier(): ViewportTier { /* unchanged from existing */ }
function useIsDark(): boolean { /* unchanged */ }

export default function GlobeProvider({
  trips,
  pins,
  fetchError,
  children,
}: {
  trips: TripSummary[]
  pins: PinWithVisits[]
  fetchError: boolean
  children: React.ReactNode
}) {
  // --- Pin state ---
  const [selectedPin, setSelectedPin] = useState<string | null>(null)
  const [hoveredPin, setHoveredPin] = useState<string | null>(null)
  const [pinSubregionHighlight, setPinSubregionHighlight] = useState<string | null>(null)
  const [selectedPinScreenY, setSelectedPinScreenY] = useState<number | null>(null)

  // --- Trip state ---
  const [lockedTrip, setLockedTripState] = useState<string | null>(null)
  const [hoveredTrip, setHoveredTrip] = useState<string | null>(null)
  const [previewTrip, setPreviewTrip] = useState<string | null>(null)

  // --- Playback state ---
  const [playbackHighlightedTripIds, setPlaybackHighlightedTripIds] = useState<string[]>([])
  const pauseReasonsRef = useRef<Set<string>>(new Set())
  const [pauseReasonCount, setPauseReasonCount] = useState(0)

  // --- Misc ---
  const [slideComplete, setSlideComplete] = useState(false)
  const pinPositionRef = useRef<Record<string, ScreenPosition>>({})
  const globeScreenRef = useRef<GlobeScreenCircle | null>(null)
  const frameSubscribersRef = useRef<Set<() => void>>(new Set())
  const tier = useViewportTier()
  const isDark = useIsDark()

  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  // --- URL derivations ---
  const activeArticleSlug =
    pathname && pathname.startsWith('/globe/') && pathname !== '/globe'
      ? pathname.slice('/globe/'.length).split('/')[0] || null
      : null
  const activeTripSlug =
    pathname && pathname.startsWith('/trip/')
      ? pathname.slice('/trip/'.length).split('/')[0] || null
      : null

  // --- Pin selection with screen-y capture ---
  const selectPin = useCallback((id: string | null) => {
    if (id === null) {
      setSelectedPin(null)
      setSelectedPinScreenY(null)
      return
    }
    const pos = pinPositionRef.current[id]
    if (pos) setSelectedPinScreenY(pos.y)
    setSelectedPin(id)
  }, [])

  // --- Trip lock wrapper: also clears selectedPin so panelVariant flip is clean. ---
  const setLockedTrip = useCallback((id: string | null) => {
    setLockedTripState(id)
    if (id !== null) {
      // Opening a trip panel — clear pin selection (spec: pin panel and trip panel
      // don't coexist; they swap via cross-fade).
      setSelectedPin(null)
      setSelectedPinScreenY(null)
    }
  }, [])

  // --- Pause reasons ---
  const addPauseReason = useCallback((reason: string) => {
    if (!pauseReasonsRef.current.has(reason)) {
      pauseReasonsRef.current.add(reason)
      setPauseReasonCount(pauseReasonsRef.current.size)
    }
  }, [])
  const removePauseReason = useCallback((reason: string) => {
    if (pauseReasonsRef.current.has(reason)) {
      pauseReasonsRef.current.delete(reason)
      setPauseReasonCount(pauseReasonsRef.current.size)
    }
  }, [])

  const isPaused =
    pauseReasonCount > 0 ||
    lockedTrip !== null ||
    activeArticleSlug !== null ||
    activeTripSlug !== null

  // --- Playback active after 5s idle ---
  // Initial value: true so playback starts on mount (after trips arrive).
  // Transitions: if isPaused becomes true, immediately false. If isPaused becomes
  // false AND lockedTrip is null, start 5s timer to set true.
  const [playbackActive, setPlaybackActive] = useState(false)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isPaused) {
      if (resumeTimerRef.current) { clearTimeout(resumeTimerRef.current); resumeTimerRef.current = null }
      setPlaybackActive(false)
      return
    }
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = setTimeout(() => {
      setPlaybackActive(true)
      resumeTimerRef.current = null
    }, IDLE_RESUME_MS)
    return () => {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current)
        resumeTimerRef.current = null
      }
    }
  }, [isPaused])

  // --- Panel variant derivation ---
  const panelVariant: 'pin' | 'trip' | null =
    lockedTrip && !selectedPin ? 'trip' : selectedPin ? 'pin' : null

  // --- Layout state derivation ---
  const layoutState: 'default' | 'panel-open' | 'article-open' =
    activeArticleSlug || activeTripSlug
      ? 'article-open'
      : panelVariant
        ? 'panel-open'
        : 'default'

  // --- Panel-open slideComplete timer (preserved from Phase 5A/5B) ---
  useEffect(() => {
    if (!panelVariant) { setSlideComplete(false); return }
    setSlideComplete(false)
    const t = setTimeout(() => setSlideComplete(true), PANEL_SETTLE_MS)
    return () => clearTimeout(t)
  }, [panelVariant, selectedPin, lockedTrip])

  const closeArticle = useCallback(() => {
    if (activeArticleSlug) {
      router.push('/globe', { scroll: false })
    } else if (activeTripSlug) {
      // Return to /globe?trip=<slug> per §8.2
      // We don't know the slug from here — use lockedTrip lookup.
      // If lockedTrip resolves to a trip, push that; else back to /globe.
      const trip = trips.find((t) => t._id === lockedTrip)
      if (trip) router.push(`/globe?trip=${encodeURIComponent(trip.slug.current)}`, { scroll: false })
      else router.push('/globe', { scroll: false })
    }
  }, [activeArticleSlug, activeTripSlug, router, trips, lockedTrip])

  // --- Deep-link / article-open pin resolution (preserved pattern from Phase 5A/5B) ---
  useEffect(() => {
    if (!activeArticleSlug) return
    setSelectedPin((prev) => {
      const currentPin = prev ? pins.find((p) => p.location._id === prev) : null
      const keepCurrent =
        currentPin?.visits.some((v) => v.items.some((i) => i.slug.current === activeArticleSlug)) ?? false
      const match = keepCurrent
        ? currentPin
        : pins.find((p) => p.visits.some((v) => v.items.some((i) => i.slug.current === activeArticleSlug)))
      return match ? match.location._id : prev
    })
  }, [activeArticleSlug, pins])

  // --- Deep-link trip resolution: URL ?trip=<slug> or /trip/<slug> → lock trip ---
  useEffect(() => {
    const queryTripSlug = searchParams.get('trip')
    const slugFromUrl = queryTripSlug ?? activeTripSlug
    if (!slugFromUrl) {
      // Don't clear lockedTrip here — user might be navigating between states
      // where URL briefly lacks the param. D2 owns the full URL-state sync logic.
      return
    }
    setLockedTripState((prev) => {
      const target = trips.find((t) => t.slug.current === slugFromUrl)
      return target ? target._id : prev
    })
  }, [searchParams, activeTripSlug, trips])

  // --- Selected-pin screen-Y polling (preserved) ---
  useEffect(() => {
    if (!selectedPin || selectedPinScreenY != null) return
    let raf = 0
    const tick = () => {
      const pos = pinPositionRef.current[selectedPin]
      if (pos) { setSelectedPinScreenY(pos.y); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [selectedPin, selectedPinScreenY])

  // --- Article-close Y re-capture (preserved) ---
  const prevLayoutRef = useRef(layoutState)
  useEffect(() => {
    const prev = prevLayoutRef.current
    prevLayoutRef.current = layoutState
    if (prev !== 'article-open' || layoutState === 'article-open') return
    if (!selectedPin) return
    const t = setTimeout(() => {
      const pos = pinPositionRef.current[selectedPin]
      if (pos) setSelectedPinScreenY(pos.y)
    }, 450)
    return () => clearTimeout(t)
  }, [layoutState, selectedPin])

  const isDesktop = tier === 'desktop'
  const isTablet = tier === 'tablet'
  const isMobile = tier === 'mobile'

  return (
    <GlobeContext.Provider
      value={{
        trips, pins, fetchError,
        selectedPin, selectPin, hoveredPin, setHoveredPin,
        pinSubregionHighlight, setPinSubregionHighlight,
        lockedTrip, setLockedTrip, hoveredTrip, setHoveredTrip,
        previewTrip, setPreviewTrip,
        playbackHighlightedTripIds, setPlaybackHighlightedTripIds,
        playbackActive, addPauseReason, removePauseReason, isPaused,
        layoutState, slideComplete, selectedPinScreenY,
        pinPositionRef, globeScreenRef, frameSubscribersRef,
        activeArticleSlug, activeTripSlug, closeArticle,
        tier, isDesktop, isTablet, isMobile,
        showHover: !isMobile, showConnectors: isDesktop,
        isDark,
        panelVariant,
      }}
    >
      {children}
    </GlobeContext.Provider>
  )
}
```

### Downstream compile errors

This ticket causes compile errors in every file that referenced the old `selectedPin === group`, `pin.group`, `pin.items[]` shapes. Those are fixed in:
- `GlobeViewport.tsx` → by C3/C4 (panel dispatch)
- `GlobePins.tsx` → C2
- `GlobeDetailPanel.tsx` → C3
- `GlobeTooltip.tsx` → C2
- `GlobeClickConnector.tsx` → update callsite to new pin id (group → location._id). Trivial grep-and-replace. **Do this in C1.**
- `GlobeHoverConnector.tsx` → same

To keep this ticket mergeable, **fix the trivial grep-and-replace sites inline in C1**: `GlobeClickConnector.tsx`, `GlobeHoverConnector.tsx`, `GlobeTooltip.tsx` (just the identity type, not feature changes). Do not refactor panels or pin-render logic — those are C2/C3/C4's scope.

---

## Acceptance criteria

- [ ] `GlobeContext.tsx` exports the new `GlobeContextValue` shape in full.
- [ ] `GlobeProvider.tsx` implements every field, with correct derivations.
- [ ] `npm run build` passes for files touched in C1: `GlobeProvider.tsx`, `GlobeContext.tsx`, `GlobeClickConnector.tsx`, `GlobeHoverConnector.tsx`, `GlobeTooltip.tsx`, `app/globe/layout.tsx`.
- [ ] Compile errors in `GlobePins.tsx`, `GlobeDetailPanel.tsx`, `GlobeViewport.tsx` are expected and documented in PR description (fixed by C2/C3/C4).
- [ ] Provider passes `selectPin`, `setLockedTrip` callbacks that mutually clear each other (pin selection clears on trip lock).
- [ ] `panelVariant` derives correctly: `{ selectedPin: 'xxx', lockedTrip: null } → 'pin'`; `{ null, 'yyy' } → 'trip'`; `{ null, null } → null`.
- [ ] `activeTripSlug` derives from `/trip/<slug>` path; works on cold load.
- [ ] `closeArticle` routes correctly to `/globe?trip=<slug>` when closing a trip article with locked trip, else `/globe`.
- [ ] `isPaused` reflects all expected inputs.
- [ ] `playbackActive` becomes `true` 5s after `isPaused` becomes `false`.
- [ ] Pin screen-Y re-capture on article close still works (Phase 5B invariant).

## Non-goals

- **Do not implement the panels themselves** — C3/C4.
- **Do not implement pin hover/click** — C2.
- **Do not implement URL push/replace for ?trip param** — D2 owns the write side; this ticket only reads.
- **Do not implement playback controller** — B6 — just the state field.
- **Do not implement camera rotate-to-fit** — C5 — just the `lockedTrip` trigger state.
- **Do not fix C2/C3/C4 compile errors** — expected, they own their files.

## Gotchas

- **`selectedPin` semantic change**: was `globe_group` string, now `locationDoc._id`. The identity type changes. Don't forget this when fixing `GlobeClickConnector.tsx` — `pinPositionRef.current[selectedPin]` now keyed by `_id`. This requires `GlobePositionBridge.tsx` (C2) to key by `_id` too. Coordinate.
- **`setLockedTrip` clearing `selectedPin`**: this is a product call from spec §7.3.2 ("panel variant transitions ... only the inner content transitions"). Pin and trip panels don't coexist. If the user expected "clicking trip label while pin panel open keeps pin panel", they're wrong — spec says variant changes. Swap behavior is cross-fade content (C4).
- **Circular-ish effect**: the trip-deep-link effect sets `lockedTrip`. D2 also sets `lockedTrip` based on user clicks. Both write; URL is the source of truth. Take care that setting `lockedTrip` doesn't cause an unnecessary URL push — D2's logic has equality checks.
- **`PANEL_SETTLE_MS`**: preserved at 450ms. If the panel slide duration ever changes, bump this.
- **`prev`-selection pattern**: preserved verbatim in the `activeArticleSlug` effect. Do not simplify.
- **`useSearchParams` in Next.js 16**: hook returns a snapshot. Re-renders when query params change. Must be inside `<Suspense>` in some setups — if you get a runtime error about that, wrap `GlobeProvider`'s children in `<Suspense fallback={null}>`.
- **`removePauseReason` leakage**: if a component adds a reason in an effect without cleanup, the reason sticks indefinitely. Convention: always add/remove in paired `useEffect` returns or matching pointer-event handlers. F2 audits for this.

## Ambiguities requiring clarification before starting

1. **`setLockedTrip` clearing `selectedPin`**: decision to clear is based on spec §7.3.2 panel variant exclusivity. If a reviewer wants "pin panel stays during trip lock, swaps content only", change `setLockedTrip` to not touch `selectedPin`. Simpler state but spec-ambiguous.

   **Action**: clear both. Document in PR.

2. **`pinSubregionHighlight` vs `hoveredPin`**: semantically similar but not identical. `hoveredPin` drives the tooltip; `pinSubregionHighlight` drives the timeline bands. They overlap but may differ on touch devices (tap sets both briefly).

   Decision: keep separate for now. If B5 can derive bands from `hoveredPin` alone, `pinSubregionHighlight` is redundant and can be removed in a cleanup PR.

   **Action**: keep separate.

3. **`isPaused` includes `activeArticleSlug`**: spec §5.5 says article-open pauses. Implemented via the derivation. Alternative is a dedicated useEffect that adds/removes `'article-open'` reason. Same outcome; derivation is simpler.

4. **`playbackActive` default**: `false` on mount. Becomes `true` 5s after initial load (when no reasons + no lock). This matches "passive spin while loading, then playback starts" from §5.2. But effectively the user waits 5s to see playback start. Spec doesn't say whether to start immediately; 5s is the idle-resume convention.

   **Alternative**: bypass the 5s on initial load only (use a `isInitialLoad` flag). Playback starts as soon as trips arrive.

   **Default**: 5s delay always. Reviewer may prefer instant start.

## Handoff / outputs consumed by later tickets

- **Every field in `GlobeContextValue`** — every subsequent C/D/E ticket uses one or more.
- **`selectPin` identity type** = `locationDoc._id`: C2 must emit this; GlobePositionBridge must key by it.
- **`setLockedTrip` clearing `selectedPin` behavior**: panels (C3/C4) rely on this for variant switch cleanness.

## How to verify

1. `npm run build` — compiles through the files listed in "Files to modify." Some other files error — note in PR.
2. Use React DevTools to inspect `<GlobeProvider>`. Confirm all fields present with expected initial values:
   - `trips`, `pins`, `fetchError` — present from A3
   - `selectedPin`, `hoveredPin` — null
   - `lockedTrip`, `hoveredTrip` — null
   - `playbackActive` — becomes true 5s after page loads with fixtures
   - `panelVariant` — null
   - `layoutState` — 'default'
3. Manually set `selectedPin` via DevTools to a valid `locationDoc._id`. Observe `panelVariant` becomes `'pin'`, `layoutState` becomes `'panel-open'`. (Panel doesn't render yet — that's C3.)
4. Navigate to `/globe?trip=<slug>` of a seeded trip. `lockedTrip` picks up the id. `panelVariant` becomes `'trip'`.
5. Add `addPauseReason('test')` via DevTools. `isPaused` → true. `playbackActive` → false. `removePauseReason('test')`. Wait 5s. `playbackActive` → true.
