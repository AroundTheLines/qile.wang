'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { GlobeContext, type ScreenPosition, type ViewportTier } from './GlobeContext'
import type { PinWithVisits, TripSummary, TripWithVisits } from '@/lib/types'
import type { GlobeScreenCircle } from '@/lib/globe'

function useViewportTier(): ViewportTier {
  const [tier, setTier] = useState<ViewportTier>('desktop')
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth
      if (w >= 1024) setTier('desktop')
      else if (w >= 768) setTier('tablet')
      else setTier('mobile')
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])
  return tier
}

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDark(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isDark
}

// Total delay before the connector re-draws. Covers both the initial
// panel-slide (300ms) and the pin-switch rotate-in-place (up to ~300ms)
// with a small buffer.
const PANEL_SETTLE_MS = 450
const IDLE_RESUME_MS = 5000

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
  // pin selection.
  const setLockedTrip = useCallback((id: string | null) => {
    setLockedTripState(id)
    if (id !== null) {
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

  // --- Playback active: true on first mount (instant start per product call),
  // false while paused, flips back to true IDLE_RESUME_MS after unpause.
  const [playbackActive, setPlaybackActive] = useState(true)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isPaused) {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current)
        resumeTimerRef.current = null
      }
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

  // --- Clear the pin-subregion highlight when the pin panel closes.
  // C2 keeps the highlight set on hover-out if the pin is selected so
  // the timeline bands stay lit while the panel is open; this effect is
  // the other half of that contract — once selectedPin goes null (panel
  // closed, trip locked, etc.) the bands should disappear.
  useEffect(() => {
    if (selectedPin === null) setPinSubregionHighlight(null)
  }, [selectedPin, setPinSubregionHighlight])

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
    if (!panelVariant) {
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
  useEffect(() => {
    if (!activeArticleSlug) return
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

  // --- Deep-link trip resolution: URL ?trip=<slug> or /trip/<slug> → lock trip.
  // Read-only; D2 owns the write side.
  useEffect(() => {
    const queryTripSlug = searchParams.get('trip')
    const slugFromUrl = queryTripSlug ?? activeTripSlug
    if (!slugFromUrl) return
    setLockedTripState((prev) => {
      const target = trips.find((t) => t.slug.current === slugFromUrl)
      return target ? target._id : prev
    })
  }, [searchParams, activeTripSlug, trips])

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

  return (
    <GlobeContext.Provider
      value={{
        trips,
        pins,
        tripsWithVisits,
        fetchError,
        selectedPin,
        selectPin,
        hoveredPin,
        setHoveredPin,
        pinSubregionHighlight,
        setPinSubregionHighlight,
        lockedTrip,
        setLockedTrip,
        hoveredTrip,
        setHoveredTrip,
        previewTrip,
        setPreviewTrip,
        playbackHighlightedTripIds,
        setPlaybackHighlightedTripIds,
        playbackActive,
        addPauseReason,
        removePauseReason,
        isPaused,
        layoutState,
        slideComplete,
        selectedPinScreenY,
        pinPositionRef,
        globeScreenRef,
        frameSubscribersRef,
        activeArticleSlug,
        activeTripSlug,
        closeArticle,
        tier,
        isDesktop,
        isTablet,
        isMobile,
        showHover: !isMobile,
        showConnectors: isDesktop,
        isDark,
        panelVariant,
      }}
    >
      {children}
    </GlobeContext.Provider>
  )
}
