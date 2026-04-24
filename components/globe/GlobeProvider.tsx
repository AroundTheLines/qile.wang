'use client'

import { useState, useRef, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  GlobeDataContext,
  GlobePinContext,
  GlobeTripContext,
  GlobePlaybackContext,
  GlobeUIContext,
  GlobeRouteContext,
  type GlobeDataContextValue,
  type GlobePinContextValue,
  type GlobeTripContextValue,
  type GlobePlaybackContextValue,
  type GlobeUIContextValue,
  type GlobeRouteContextValue,
  type ScreenPosition,
  type ViewportTier,
} from './GlobeContext'
import type { PinWithVisits, TripSummary, TripWithVisits } from '@/lib/types'
import type { GlobeScreenCircle } from '@/lib/globe'

// External-store subscription for window width tier. Using
// useSyncExternalStore avoids the `setState in effect` pattern the lint rule
// flags: the current tier is derived synchronously from window.innerWidth,
// and React re-subscribes only on subscribe-function identity changes (stable
// via module-scope reference).
function subscribeViewportTier(callback: () => void): () => void {
  window.addEventListener('resize', callback)
  return () => window.removeEventListener('resize', callback)
}
function getViewportTier(): ViewportTier {
  const w = window.innerWidth
  if (w >= 1024) return 'desktop'
  if (w >= 768) return 'tablet'
  return 'mobile'
}
function getViewportTierServer(): ViewportTier {
  // SSR default matches the pre-F2 initial state so hydration is stable.
  return 'desktop'
}
function useViewportTier(): ViewportTier {
  return useSyncExternalStore(subscribeViewportTier, getViewportTier, getViewportTierServer)
}

// Same pattern for dark-mode preference: read synchronously from matchMedia,
// subscribe to changes without touching state in an effect. The
// MediaQueryList is cached at module scope and lazy-initialized on first
// client call so repeated getSnapshot/subscribe invocations reuse the same
// instance (SSR never reaches the getter — getServerSnapshot returns first).
let _darkMql: MediaQueryList | null = null
const getDarkMql = (): MediaQueryList =>
  (_darkMql ??= window.matchMedia('(prefers-color-scheme: dark)'))
function subscribeIsDark(callback: () => void): () => void {
  const mq = getDarkMql()
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}
function getIsDark(): boolean {
  return getDarkMql().matches
}
function getIsDarkServer(): boolean {
  return false
}
function useIsDark(): boolean {
  return useSyncExternalStore(subscribeIsDark, getIsDark, getIsDarkServer)
}

// Total delay before the connector re-draws. Covers both the initial
// panel-slide (300ms) and the pin-switch rotate-in-place (up to ~300ms)
// with a small buffer.
const PANEL_SETTLE_MS = 450
const IDLE_RESUME_MS = 1500
// Brief cursor transit (<150ms) over a pin/label should not pause playback
// per §5.5. Add-side debounce: the pause reason only fires if the hover
// sustains past this window.
const HOVER_PAUSE_DEBOUNCE_MS = 150

export default function GlobeProvider({
  trips,
  pins,
  tripsWithVisits,
  fetchError,
  children,
}: {
  trips: TripSummary[]
  pins: PinWithVisits[]
  tripsWithVisits: TripWithVisits[]
  fetchError: boolean
  children: React.ReactNode
}) {
  // --- Pin state ---
  const [selectedPin, setSelectedPin] = useState<string | null>(null)
  const [hoveredPin, setHoveredPin] = useState<string | null>(null)
  const [pinSubregionHighlight, setPinSubregionHighlight] = useState<string | null>(null)
  const [pinToScrollTo, setPinToScrollTo] = useState<{ id: string; nonce: number } | null>(null)
  // Monotonic nonce counter. Lives in a ref so `clearPinScroll()` resetting
  // state to null doesn't reset the next nonce back to 1 — otherwise two
  // rapid clicks on the same pin (separated by a clear) would both land on
  // nonce 1 and downstream pulse effects keyed on `[pulseNonce]` would
  // skip the replay.
  const pinScrollNonceRef = useRef(0)
  const requestPinScroll = useCallback((id: string) => {
    pinScrollNonceRef.current += 1
    setPinToScrollTo({ id, nonce: pinScrollNonceRef.current })
  }, [])
  const clearPinScroll = useCallback(() => {
    setPinToScrollTo(null)
  }, [])
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

  // Serialize a pin id to a URL-safe param. Prefer the location slug (if
  // the dataset has one) so URLs read naturally; fall back to the _id so
  // every pin has a stable linkable identifier.
  const pinParamForId = useCallback(
    (id: string): string => {
      const pin = pins.find((p) => p.location._id === id)
      return pin?.location.slug?.current ?? id
    },
    [pins],
  )

  // --- Pin selection with screen-y capture ---
  // Also mirrors the selection into the URL (`?pin=<slug>`) so the state is
  // shareable / bookmarkable. D2 owns the broader URL-state contract; this
  // is the minimal write-side for pins.
  const selectPin = useCallback(
    (id: string | null) => {
      if (id === null) {
        setSelectedPin(null)
        setSelectedPinScreenY(null)
        // C2 contract: the pin sub-region highlight stays lit while the
        // panel is open (hover-out doesn't clear it); the other half of
        // that contract — clearing on panel-close — lives here so the
        // transition is part of the setter rather than an effect reacting
        // to `selectedPin === null`.
        setPinSubregionHighlight(null)
      } else {
        const pos = pinPositionRef.current[id]
        if (pos) setSelectedPinScreenY(pos.y)
        setSelectedPin(id)
      }

      // Only mutate URL on the base /globe path — article routes own their
      // own URL and shouldn't have ?pin= injected underneath them.
      if (pathname !== '/globe') return
      const next = new URLSearchParams(searchParams.toString())
      if (id === null) next.delete('pin')
      else next.set('pin', pinParamForId(id))
      const query = next.toString()
      router.replace(query ? `/globe?${query}` : '/globe', { scroll: false })
    },
    [pathname, searchParams, router, pinParamForId],
  )

  // --- Trip lock wrapper: also clears pin selection so panelVariant flips
  // cleanly. Pin panel and trip panel share the same screen region — per
  // spec §7.3.2, locking a trip swaps variants rather than stacking panels.
  // Trip panels don't use selectedPinScreenY (their Y is a fixed anchor in
  // GlobeViewport), so clearing it here keeps state tidy for the next
  // pin selection. Also clears `pinToScrollTo` on unlock so a stranded
  // scroll signal from a just-closed trip panel doesn't leak into the next
  // one.
  const setLockedTrip = useCallback((id: string | null) => {
    setLockedTripState(id)
    if (id !== null) {
      setSelectedPin(null)
      setSelectedPinScreenY(null)
      setPinSubregionHighlight(null)
    } else {
      setPinToScrollTo(null)
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

  // --- Playback active: true on first mount (instant start per product call),
  // false while paused, flips back to true IDLE_RESUME_MS after unpause.
  // This is a genuine state machine with a timer-driven transition — the
  // IDLE_RESUME_MS delay can't be expressed as a render-time derivation, so
  // the effect-plus-setState pattern is canonical. The react-hooks rule's
  // "cascading render" warning doesn't apply: the transition is async
  // (timeout-gated), not synchronous on every render.
  const [playbackActive, setPlaybackActive] = useState(true)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isPaused) {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current)
        resumeTimerRef.current = null
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- timer-driven state machine
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

  // --- Effect-driven pin-hover pause (desktop).
  // C2 wired this inline inside GlobePins for the interim; B7 moves it to
  // an effect so the single shared `pin-hover` reason can't leak when
  // pointer-over on pin B fires before pointer-out on pin A (Set-semantic
  // race). Debounced by HOVER_PAUSE_DEBOUNCE_MS so brief transit across
  // a pin doesn't flicker playback.
  useEffect(() => {
    if (tier !== 'desktop') return
    if (!hoveredPin) return
    const timer = setTimeout(() => addPauseReason('pin-hover'), HOVER_PAUSE_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      removePauseReason('pin-hover')
    }
  }, [hoveredPin, tier, addPauseReason, removePauseReason])

  // Pin sub-region highlight clears inside `selectPin` (above) when the
  // pin goes null, and inside `setLockedTrip` when a trip locks. No
  // effect-based clear is needed — the invariant is enforced at the
  // setter boundary.
  //
  // Likewise, `pinToScrollTo` is cleared inside `setLockedTrip(null)` so
  // a stranded signal from a just-closed trip panel doesn't leak into the
  // next lock cycle.

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

  // --- Panel-open slideComplete timer (preserved from Phase 5A/5B).
  // Timer-gated transition: flip to true after PANEL_SETTLE_MS so the
  // connector logic downstream knows the panel has finished animating in.
  // Like playbackActive above, this is a canonical async state machine
  // and the set-state-in-effect rule overfits.
  useEffect(() => {
    if (!panelVariant) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- timer-driven panel-settle state
      setSlideComplete(false)
      return
    }
    setSlideComplete(false)
    const t = setTimeout(() => setSlideComplete(true), PANEL_SETTLE_MS)
    return () => clearTimeout(t)
  }, [panelVariant, selectedPin, lockedTrip])

  const closeArticle = useCallback(() => {
    if (activeArticleSlug) {
      router.push('/globe', { scroll: false })
    } else if (activeTripSlug) {
      // Return to /globe?trip=<slug> per §8.2, using the locked trip to
      // resolve the slug (the URL at this point is /trip/<slug>, but we
      // prefer the state's lockedTrip to stay consistent with the panel).
      const trip = trips.find((t) => t._id === lockedTrip)
      // Fall back to activeTripSlug (from the URL) if lockedTrip hasn't
      // resolved yet — happens on cold-load /trip/<slug> + immediate
      // Escape before the deep-link effect populates lockedTrip.
      const slug = trip?.slug.current ?? activeTripSlug
      router.push(`/globe?trip=${encodeURIComponent(slug)}`, { scroll: false })
    }
  }, [activeArticleSlug, activeTripSlug, router, trips, lockedTrip])

  // --- Deep-link / article-open pin resolution. The `prev`-selection
  // pattern is load-bearing: items are cross-listed across pins, and we
  // prefer the current selection when it still matches so the user's pin
  // choice isn't silently overwritten mid-navigation.
  //
  // This is a canonical external-source → React-state sync (URL pathname
  // is the external source). The rule flags the setState, but the
  // cascade-render concern doesn't apply: the setState only fires when
  // activeArticleSlug or pins change, not on every render.
  useEffect(() => {
    if (!activeArticleSlug) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL → state sync
    setSelectedPin((prev) => {
      const currentPin = prev ? pins.find((p) => p.location._id === prev) : null
      const keepCurrent =
        currentPin?.visits.some((v) =>
          v.items.some((i) => i.slug.current === activeArticleSlug),
        ) ?? false
      const match = keepCurrent
        ? currentPin
        : pins.find((p) =>
            p.visits.some((v) =>
              v.items.some((i) => i.slug.current === activeArticleSlug),
            ),
          )
      return match ? match.location._id : prev
    })
  }, [activeArticleSlug, pins])

  // --- Deep-link trip resolution: URL ?trip=<slug> or /trip/<slug> ↔ lockedTrip.
  // Clears the lock when the URL no longer encodes a trip so back-nav from
  // `/globe?trip=<slug>` → `/globe` settles correctly (otherwise the write-side
  // effect sees stale state and re-pushes `?trip=`, trapping history).
  useEffect(() => {
    const queryTripSlug = searchParams.get('trip')
    const slugFromUrl = queryTripSlug ?? activeTripSlug
    if (!slugFromUrl) {
      // On base /globe with no ?trip=, unlock. Article routes (/globe/<slug>)
      // keep the current lock untouched — they don't own trip state.
      //
      // Route through the wrapper (not the raw setter) so the null-case
      // cleanup — clearing `pinToScrollTo` so a stranded scroll signal
      // doesn't leak into the next lock — stays consistent regardless of
      // which code path drives the unlock. If `lockedTrip` is already null
      // this collapses to a no-op (React bails on identical state).
      if (pathname === '/globe') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- URL → state sync
        setLockedTrip(null)
      }
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL → state sync
    setLockedTripState((prev) => {
      const target = trips.find((t) => t.slug.current === slugFromUrl)
      return target ? target._id : prev
    })
  }, [searchParams, activeTripSlug, pathname, trips, setLockedTrip])

  // --- Write-side URL sync for lockedTrip. Callers (Timeline label click,
  // TripPanel close) already push the URL themselves; this effect is the
  // safety net for any code path that flips `lockedTrip` without touching
  // the URL.
  //
  // Only reacts to actual `lockedTrip` changes — not to incidental pathname /
  // searchParams updates. Triggering on URL changes would re-push `?trip=`
  // during back-nav (when the URL has already dropped `?trip=` but the
  // read-side hasn't yet flushed lockedTrip to null in the same commit),
  // trapping history.
  //
  // Only runs on the base /globe pathname — /trip/<slug> and /globe/<slug>
  // own their own URLs and must not have ?trip= injected beneath them.
  const prevLockedTripRef = useRef(lockedTrip)
  useEffect(() => {
    const prev = prevLockedTripRef.current
    prevLockedTripRef.current = lockedTrip
    if (prev === lockedTrip) return
    if (pathname !== '/globe') return
    const currentTripQuery = searchParams.get('trip')
    const currentPinQuery = searchParams.get('pin')
    const lockedTripSlug = lockedTrip
      ? (trips.find((t) => t._id === lockedTrip)?.slug.current ?? null)
      : null
    // Strip `?pin=` whenever a trip is locked — they're mutually exclusive in
    // state (`setLockedTrip` clears `selectedPin`). This also covers the
    // deep-link case `/globe?pin=X&trip=Y` where the slug matches but the
    // stale `?pin=` would otherwise linger in the URL.
    if (lockedTripSlug && (lockedTripSlug !== currentTripQuery || currentPinQuery)) {
      const next = new URLSearchParams(searchParams.toString())
      next.set('trip', lockedTripSlug)
      next.delete('pin')
      router.push(`/globe?${next.toString()}`, { scroll: false })
    } else if (!lockedTripSlug && currentTripQuery) {
      const next = new URLSearchParams(searchParams.toString())
      next.delete('trip')
      const query = next.toString()
      router.push(query ? `/globe?${query}` : '/globe', { scroll: false })
    }
  }, [lockedTrip, pathname, searchParams, router, trips])

  // --- Invalid ?trip=<slug> on /globe → silently replace to /globe.
  // /trip/<invalid> is handled by the route's not-found.tsx. Here we guard
  // against trips.length === 0 so we don't redirect while data is hydrating.
  useEffect(() => {
    if (pathname !== '/globe') return
    const slug = searchParams.get('trip')
    if (!slug) return
    if (trips.length === 0) return
    const exists = trips.some((t) => t.slug.current === slug)
    if (!exists) router.replace('/globe', { scroll: false })
  }, [pathname, searchParams, trips, router])

  // --- Escape key: layered dismiss (sliver → preview → panel → nothing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (activeArticleSlug || activeTripSlug) {
        closeArticle()
        return
      }
      if (previewTrip) {
        setPreviewTrip(null)
        return
      }
      if (selectedPin) {
        selectPin(null)
        return
      }
      if (lockedTrip) {
        setLockedTrip(null)
        router.push('/globe', { scroll: false })
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    activeArticleSlug,
    activeTripSlug,
    previewTrip,
    selectedPin,
    lockedTrip,
    closeArticle,
    selectPin,
    setLockedTrip,
    router,
  ])

  // --- Deep-link pin resolution: URL ?pin=<slug-or-id> → select pin.
  // Matches on either `location.slug.current` or `location._id` so the
  // write side can fall back to _id when a location has no slug. Only runs
  // on the base /globe path — article routes own their own selection logic.
  useEffect(() => {
    if (pathname !== '/globe') return
    const queryPin = searchParams.get('pin')
    if (!queryPin) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL → state sync
    setSelectedPin((prev) => {
      const target = pins.find(
        (p) => p.location.slug?.current === queryPin || p.location._id === queryPin,
      )
      return target ? target.location._id : prev
    })
  }, [searchParams, pathname, pins])

  // --- Selected-pin screen-Y polling (preserved). Deep-link case where
  // selectedPin was set by the article effect before the pin projected.
  useEffect(() => {
    if (!selectedPin || selectedPinScreenY != null) return
    let raf = 0
    const tick = () => {
      const pos = pinPositionRef.current[selectedPin]
      if (pos) {
        setSelectedPinScreenY(pos.y)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [selectedPin, selectedPinScreenY])

  // --- Article-close Y re-capture (preserved). The pin may have moved on
  // screen during zoom-in/out; re-read its Y once the zoom-out settles.
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
  const showHover = !isMobile
  const showConnectors = isDesktop

  // --- Memoized context values, one per split context. Refs are included in
  // the object but omitted from dep arrays: their .current mutates but the
  // ref object identity is stable for the component's lifetime.
  const dataValue = useMemo<GlobeDataContextValue>(
    () => ({
      trips,
      pins,
      tripsWithVisits,
      fetchError,
      pinPositionRef,
      globeScreenRef,
      frameSubscribersRef,
    }),
    [trips, pins, tripsWithVisits, fetchError],
  )

  const pinValue = useMemo<GlobePinContextValue>(
    () => ({
      selectedPin,
      selectPin,
      hoveredPin,
      setHoveredPin,
      pinSubregionHighlight,
      setPinSubregionHighlight,
      pinToScrollTo,
      requestPinScroll,
      clearPinScroll,
      selectedPinScreenY,
    }),
    [
      selectedPin,
      selectPin,
      hoveredPin,
      pinSubregionHighlight,
      pinToScrollTo,
      requestPinScroll,
      clearPinScroll,
      selectedPinScreenY,
    ],
  )

  const tripValue = useMemo<GlobeTripContextValue>(
    () => ({
      lockedTrip,
      setLockedTrip,
      hoveredTrip,
      setHoveredTrip,
      previewTrip,
      setPreviewTrip,
    }),
    [lockedTrip, setLockedTrip, hoveredTrip, previewTrip],
  )

  const playbackValue = useMemo<GlobePlaybackContextValue>(
    () => ({
      playbackHighlightedTripIds,
      setPlaybackHighlightedTripIds,
      playbackActive,
      addPauseReason,
      removePauseReason,
      isPaused,
    }),
    [
      playbackHighlightedTripIds,
      playbackActive,
      addPauseReason,
      removePauseReason,
      isPaused,
    ],
  )

  const uiValue = useMemo<GlobeUIContextValue>(
    () => ({
      tier,
      isDesktop,
      isTablet,
      isMobile,
      showHover,
      showConnectors,
      isDark,
      layoutState,
      slideComplete,
      panelVariant,
    }),
    [
      tier,
      isDesktop,
      isTablet,
      isMobile,
      showHover,
      showConnectors,
      isDark,
      layoutState,
      slideComplete,
      panelVariant,
    ],
  )

  const routeValue = useMemo<GlobeRouteContextValue>(
    () => ({
      activeArticleSlug,
      activeTripSlug,
      closeArticle,
    }),
    [activeArticleSlug, activeTripSlug, closeArticle],
  )

  return (
    <GlobeDataContext.Provider value={dataValue}>
      <GlobeUIContext.Provider value={uiValue}>
        <GlobeRouteContext.Provider value={routeValue}>
          <GlobeTripContext.Provider value={tripValue}>
            <GlobePinContext.Provider value={pinValue}>
              <GlobePlaybackContext.Provider value={playbackValue}>
                {children}
              </GlobePlaybackContext.Provider>
            </GlobePinContext.Provider>
          </GlobeTripContext.Provider>
        </GlobeRouteContext.Provider>
      </GlobeUIContext.Provider>
    </GlobeDataContext.Provider>
  )
}
