'use client'

import { useRef, useState, useEffect, useMemo, useLayoutEffect, useCallback, useContext } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { buildCompressedMap, type TripRange, type CompressedMap } from '@/lib/timelineCompression'
import { dragPan, pinchZoom, wheelPan, wheelZoom, type ZoomWindow } from '@/lib/timelineZoom'
import TimelineSegment from './TimelineSegment'
import TimelineAxis from './TimelineAxis'
import TimelinePinBands from './TimelinePinBands'
import TimelinePlayhead from './TimelinePlayhead'
import { GlobeContext } from './GlobeContext'

type TimelineTrip = TripRange & {
  title?: string
  slug?: { current: string }
}

export interface TimelineProps {
  /** Override used by /timeline-dev with mocks. In production, omit and Timeline reads from context. */
  trips?: TimelineTrip[]
  className?: string
  now?: string
}

const TRACK_INSET_X = 16
// Mobile renders the track edge-to-edge; breathing room at the history
// endpoints is provided by pan overscroll (see PAN_OVERSCROLL) rather
// than a fixed CSS inset, so the empty space is itself pannable content.
const MOBILE_TRACK_INSET_X = 0
// Max fraction of the current span the window is allowed to pan past each
// history endpoint on mobile — produces a "you've reached the end" gutter
// without a hard snap.
const MOBILE_PAN_OVERSCROLL = 0.08
const LABEL_ROW_HEIGHT = 14
const LABEL_HORIZONTAL_GAP = 8
const HOVER_HPAD = 4
const TODAY_LABEL_Y = 2
const YEAR_AXIS_Y = 16
const YEAR_AXIS_HEIGHT = 12
const TRACK_Y = YEAR_AXIS_Y + YEAR_AXIS_HEIGHT + 4
const TRACK_TO_LABELS = 10
const FIRST_LABEL_Y = TRACK_Y + TRACK_TO_LABELS
const BOTTOM_PADDING = 8

export const DRAG_THRESHOLD_PX = 5
const WHEEL_ZOOM_MULTIPLIER = 0.001
// Floor on the min zoom span (fraction of compressed x). Compression's
// activeBoost makes real-day math misleading in active-dense regions — at
// 1/totalDays the view can land on an empty gap with zero trips visible.
const MIN_ZOOM_SPAN_FLOOR = 0.2

function shortLabelToken(full: string): string {
  const first = full.split(/\s+/)[0] ?? full
  return first.replace(/[^\p{L}\p{N}'–-]+$/u, '')
}

interface LabelWidths {
  short: number
  full: number
}

interface DisplayLabel {
  short: string
  full: string
}

/**
 * When two trips share the same short form (e.g. "Berlin '22" + "Berlin '24"
 * both shorten to "Berlin"), fall back to the full title for those — otherwise
 * the compact row becomes ambiguous and hover is the only disambiguator.
 */
function computeDisplayLabels(
  trips: TimelineTrip[],
): Record<string, DisplayLabel> {
  const fullById: Record<string, string> = {}
  const shortById: Record<string, string> = {}
  const shortCounts = new Map<string, number>()
  for (const t of trips) {
    const full = t.title ?? t.id
    const short = shortLabelToken(full)
    fullById[t.id] = full
    shortById[t.id] = short
    shortCounts.set(short, (shortCounts.get(short) ?? 0) + 1)
  }
  const out: Record<string, DisplayLabel> = {}
  for (const t of trips) {
    const full = fullById[t.id]
    const tok = shortById[t.id]
    const ambiguous = (shortCounts.get(tok) ?? 0) > 1
    out[t.id] = { full, short: ambiguous ? full : tok }
  }
  return out
}

type GestureState =
  | { kind: 'pan'; startClientX: number; startZoom: ZoomWindow }
  | {
      kind: 'pinch'
      startDist: number
      startSpan: number
      startCenter: number
      centerXFrac: number
    }
  | null

export default function Timeline({ trips: tripsProp, className, now }: TimelineProps) {
  const ctx = useContext(GlobeContext)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Depend on the trips array identity, not `ctx` — the provider rebuilds its
  // context value object every render, so `[ctx]` would recompute unnecessarily.
  const ctxTripsSource = ctx?.trips
  const ctxTrips = useMemo<TimelineTrip[] | null>(() => {
    if (!ctxTripsSource) return null
    // Filter zero-visit trips (null startDate/endDate per §1.4) and adapt to
    // TripRange shape. Using _id as the timeline identity to match context's
    // lockedTrip/hoveredTrip fields (C1 resolver writes _id, not slug).
    return ctxTripsSource
      .filter((t) => t.startDate && t.endDate)
      .map((t) => ({
        id: t._id,
        title: t.title,
        startDate: t.startDate,
        endDate: t.endDate,
        slug: t.slug,
      }))
  }, [ctxTripsSource])

  const trips: TimelineTrip[] = tripsProp ?? ctxTrips ?? []

  const wrapperRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [labelWidths, setLabelWidths] = useState<Record<string, LabelWidths>>({})
  // Fallback active id when there is no provider (e.g. /timeline-dev).
  const [localActiveId, setLocalActiveId] = useState<string | null>(null)
  const activeId = ctx ? (ctx.hoveredTrip ?? ctx.lockedTrip) : localActiveId
  // Mobile opens slightly zoomed-in so the edge fades (below) read as "more
  // to reveal by zooming/panning" rather than a solid wall. Desktop keeps
  // full-history because there's plenty of horizontal room to show it all.
  const [zoomWindow, setZoomWindow] = useState<ZoomWindow>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return { start: 0.15, end: 0.85 }
    }
    return { start: 0, end: 1 }
  })
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gestureRef = useRef<GestureState>(null)
  const panMovedRef = useRef(false)
  const rectRef = useRef<DOMRect | null>(null)
  const windowListenersRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const pendingZoomRef = useRef<ZoomWindow | null>(null)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const obs = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const compressed = useMemo<CompressedMap>(
    () => buildCompressedMap(trips, { now }),
    [trips, now],
  )

  const minZoomSpan = useMemo(() => {
    const totalMs = Date.parse(compressed.end) - Date.parse(compressed.start)
    const totalDays = Math.max(1, Math.round(totalMs / 86400000))
    return Math.min(1, Math.max(MIN_ZOOM_SPAN_FLOOR, 30 / totalDays))
  }, [compressed.start, compressed.end])

  // Refs mirroring state/memo values so the stable window listeners can read
  // the latest without being re-bound on every render.
  const minZoomSpanRef = useRef(minZoomSpan)
  minZoomSpanRef.current = minZoomSpan
  const zoomWindowRef = useRef(zoomWindow)
  zoomWindowRef.current = zoomWindow
  const panOverscrollRef = useRef(0)
  panOverscrollRef.current = ctx?.isMobile ? MOBILE_PAN_OVERSCROLL : 0

  // Latest intended zoom window — prefers an in-flight rAF update over React
  // state. Used by gesture starts so a pointerdown/wheel mid-flight picks up
  // the staged window rather than the pre-rAF state.
  const currentZoom = () => pendingZoomRef.current ?? zoomWindowRef.current

  // Coalesce high-frequency gesture updates (pointermove, wheel) onto a single
  // rAF. Without this, each event triggers a full re-projection of every label
  // and segment. Fine at 9 trips, matters at realistic dataset sizes.
  //
  // When the tab is hidden, rAF is throttled or paused entirely — queued
  // updates would flush in a batch on re-focus. Commit synchronously in that
  // case so state stays consistent even if a gesture somehow runs in the
  // background (e.g. programmatic driver from a future playback ticket).
  const scheduleZoom = useCallback((next: ZoomWindow) => {
    if (typeof document !== 'undefined' && document.hidden) {
      pendingZoomRef.current = null
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      setZoomWindow(next)
      return
    }
    pendingZoomRef.current = next
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const z = pendingZoomRef.current
      pendingZoomRef.current = null
      if (z) setZoomWindow(z)
    })
  }, [])

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  // Native wheel listener — React's passive SyntheticEvent can't reliably
  // preventDefault, which would let the page scroll while the timeline zooms.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) return
      const cur = currentZoom()

      // Trackpad two-finger horizontal swipe → pan. Browsers report this as a
      // wheel event with deltaX dominant and no ctrlKey (pinch is ctrlKey+deltaY).
      // shift+wheel on a mouse also surfaces as deltaX on some browsers.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) {
        scheduleZoom(wheelPan(cur, e.deltaX, rect.width, panOverscrollRef.current))
        return
      }

      const cursorXFrac = (e.clientX - rect.left) / rect.width
      const next = wheelZoom(cur, e.deltaY, cursorXFrac, minZoomSpanRef.current, WHEEL_ZOOM_MULTIPLIER)
      if (next) scheduleZoom(next)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [scheduleZoom])

  // Pan/pinch use window-level move/up listeners so the drag keeps tracking
  // when the cursor leaves the timeline. React's delegated onPointerMove is
  // unreliable once a pointer leaves the element's hit area, even with
  // setPointerCapture.
  const moveImplRef = useRef<(e: PointerEvent) => void>(() => {})
  const upImplRef = useRef<(e: PointerEvent) => void>(() => {})

  moveImplRef.current = (e: PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const gesture = gestureRef.current
    const rect = rectRef.current
    if (!gesture || !rect || rect.width === 0) return

    if (gesture.kind === 'pan') {
      const dx = e.clientX - gesture.startClientX
      if (!panMovedRef.current && Math.abs(dx) < DRAG_THRESHOLD_PX) return
      panMovedRef.current = true
      scheduleZoom(dragPan(gesture.startZoom, dx, rect.width, panOverscrollRef.current))
    } else if (gesture.kind === 'pinch') {
      // Only the two oldest pointers drive the pinch. A 3rd finger is ignored
      // until one of the original two releases — matches typical map UX.
      // Iterate the Map directly instead of Array.from().slice to avoid two
      // allocations per pointermove frame.
      const iter = pointersRef.current.values()
      const a = iter.next().value
      const b = iter.next().value
      if (!a || !b) return
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      scheduleZoom(
        pinchZoom(
          gesture.startCenter,
          gesture.centerXFrac,
          gesture.startSpan,
          gesture.startDist,
          dist,
          minZoomSpanRef.current,
        ),
      )
    }
  }

  const stableMove = useCallback((e: PointerEvent) => moveImplRef.current(e), [])
  const stableUp = useCallback((e: PointerEvent) => upImplRef.current(e), [])

  const detachWindowListeners = useCallback(() => {
    if (!windowListenersRef.current) return
    window.removeEventListener('pointermove', stableMove)
    window.removeEventListener('pointerup', stableUp)
    window.removeEventListener('pointercancel', stableUp)
    windowListenersRef.current = false
  }, [stableMove, stableUp])

  upImplRef.current = (e: PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size === 0) {
      gestureRef.current = null
      rectRef.current = null
      detachWindowListeners()
    } else if (pointersRef.current.size === 1) {
      // Dropped from pinch → pan: re-seed pan from the remaining pointer.
      const remaining = pointersRef.current.values().next().value!
      gestureRef.current = {
        kind: 'pan',
        startClientX: remaining.x,
        startZoom: currentZoom(),
      }
      panMovedRef.current = false
    }
  }

  const attachWindowListeners = useCallback(() => {
    if (windowListenersRef.current) return
    window.addEventListener('pointermove', stableMove)
    window.addEventListener('pointerup', stableUp)
    window.addEventListener('pointercancel', stableUp)
    windowListenersRef.current = true
  }, [stableMove, stableUp])

  useEffect(() => detachWindowListeners, [detachWindowListeners])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    panMovedRef.current = false
    rectRef.current = e.currentTarget.getBoundingClientRect()
    // Read the latest intended window (including any in-flight rAF update)
    // so gesture start doesn't capture a stale zoomWindow.
    const startZoom = currentZoom()

    const size = pointersRef.current.size
    if (size === 1) {
      gestureRef.current = {
        kind: 'pan',
        startClientX: e.clientX,
        startZoom,
      }
    } else if (size === 2) {
      const iter = pointersRef.current.values()
      const a = iter.next().value!
      const b = iter.next().value!
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const rect = rectRef.current
      const span = startZoom.end - startZoom.start
      const centerXFrac = rect.width > 0 ? ((a.x + b.x) / 2 - rect.left) / rect.width : 0.5
      gestureRef.current = {
        kind: 'pinch',
        startDist: dist,
        startSpan: span,
        startCenter: startZoom.start + centerXFrac * span,
        centerXFrac,
      }
    }
    attachWindowListeners()
  }

  const playbackHighlightSet = useMemo(
    () => new Set(ctx?.playbackHighlightedTripIds ?? []),
    [ctx?.playbackHighlightedTripIds],
  )

  const displayLabels = useMemo(() => computeDisplayLabels(trips), [trips])

  // Stable dep: re-measure only when the id→label content actually changes,
  // not when the parent passes a fresh trips array reference.
  const measureKey = useMemo(
    () =>
      trips.map((t) => `${t.id}\u0001${displayLabels[t.id].short}\u0001${displayLabels[t.id].full}`).join('\u0002'),
    [trips, displayLabels],
  )

  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const next: Record<string, LabelWidths> = {}
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const id = child.dataset.tripId
      const kind = child.dataset.kind as 'short' | 'full' | undefined
      if (!id || !kind) continue
      const w = Math.ceil(child.getBoundingClientRect().width)
      const existing = next[id] ?? { short: 0, full: 0 }
      existing[kind] = w
      next[id] = existing
    }
    setLabelWidths((prev) => {
      const keys = Object.keys(next)
      if (
        keys.length === Object.keys(prev).length &&
        keys.every(
          (k) => prev[k] && prev[k].short === next[k].short && prev[k].full === next[k].full,
        )
      ) {
        return prev
      }
      return next
    })
  }, [measureKey])

  const trackInsetX = ctx?.isMobile ? MOBILE_TRACK_INSET_X : TRACK_INSET_X

  // Tap targets on mobile need room to hit reliably; desktop keeps the
  // compact 14px row since hover is pointer-precise. Text stays 10px and
  // line-height matches the row so it remains vertically centered.
  const labelRowHeight = ctx?.isMobile ? 18 : LABEL_ROW_HEIGHT
  const innerWidth = Math.max(0, width - trackInsetX * 2)

  // Row assignment is computed against the full-history view, not the current
  // zoom window. This keeps each label's row (and the wrapper's total height)
  // stable during pan/zoom — otherwise labels shuffle vertically as others
  // cull in and out of the visible window, which reads as jitter.
  const packed = useMemo(() => {
    if (innerWidth === 0 || trips.length === 0) {
      return {
        items: [] as {
          trip: TripRange & { title?: string }
          short: string
          full: string
          rawX: number
          shortWidth: number
          fullWidth: number
          row: number
        }[],
        rowCount: 0,
      }
    }

    const baseItems = trips
      .map((trip) => {
        const { short, full } = displayLabels[trip.id]
        const rawX = compressed.dateToX(trip.startDate)
        const measured = labelWidths[trip.id]
        const shortWidth = measured?.short ?? short.length * 7
        const fullWidth = measured?.full ?? full.length * 7
        return { trip, short, full, rawX, shortWidth, fullWidth }
      })
      .sort((a, b) => a.rawX - b.rawX)

    const rowEnds: number[] = []
    const placed = baseItems.map((item) => {
      // Use the full-history anchor to pack. Clamp x to the right edge so the
      // last label doesn't overflow the 100% case.
      let labelX = item.rawX * innerWidth
      if (labelX + item.shortWidth > innerWidth) {
        labelX = Math.max(0, innerWidth - item.shortWidth)
      }
      let row = 0
      while (row < rowEnds.length && rowEnds[row] > labelX - LABEL_HORIZONTAL_GAP) row++
      rowEnds[row] = labelX + item.shortWidth
      return { ...item, row }
    })
    return { items: placed, rowCount: rowEnds.length }
  }, [trips, compressed, innerWidth, labelWidths, displayLabels])

  const labelsHeight = packed.rowCount * labelRowHeight
  const totalHeight = FIRST_LABEL_Y + labelsHeight + BOTTOM_PADDING

  const measurementLayer = useMemo(
    () => (
      <div
        ref={measureRef}
        aria-hidden
        className="absolute invisible pointer-events-none"
        style={{ left: -9999, top: -9999 }}
      >
        {trips.flatMap((trip) => {
          const { short, full } = displayLabels[trip.id]
          return [
            <span
              key={`${trip.id}-short`}
              data-trip-id={trip.id}
              data-kind="short"
              className="inline-block text-[10px] tracking-widest uppercase whitespace-nowrap"
            >
              {short}
            </span>,
            <span
              key={`${trip.id}-full`}
              data-trip-id={trip.id}
              data-kind="full"
              className="inline-block text-[10px] tracking-widest uppercase whitespace-nowrap"
            >
              {full}
            </span>,
          ]
        })}
      </div>
    ),
    [trips, displayLabels],
  )

  const isDesktopHover = ctx?.isDesktop ?? true

  const handleLabelEnter = useCallback(
    (trip: TimelineTrip) => {
      if (!ctx) {
        setLocalActiveId(trip.id)
        return
      }
      if (!isDesktopHover) return
      ctx.setHoveredTrip(trip.id)
      ctx.addPauseReason('label-hover')
    },
    [ctx, isDesktopHover],
  )

  const handleLabelLeave = useCallback(
    (trip: TimelineTrip) => {
      if (!ctx) {
        setLocalActiveId((cur) => (cur === trip.id ? null : cur))
        return
      }
      // Always release the hover-bound state on leave, even if the viewport
      // flipped to mobile mid-hover — otherwise the pause reason leaks.
      ctx.setHoveredTrip((cur) => (cur === trip.id ? null : cur))
      ctx.removePauseReason('label-hover')
    },
    [ctx],
  )

  const handleLabelClick = useCallback(
    (trip: TimelineTrip) => {
      if (!ctx) {
        setLocalActiveId((cur) => (cur === trip.id ? null : trip.id))
        return
      }
      // E3 will introduce a preview-then-lock flow on mobile. Until it
      // ships, mirror desktop so the mobile timeline isn't dead on tap.
      if (ctx.lockedTrip === trip.id) {
        ctx.setLockedTrip(null)
        // Also clear hover pause — guard against pointerLeave not firing.
        ctx.removePauseReason('label-hover')
        if (searchParams?.get('trip')) {
          router.push('/globe', { scroll: false })
        }
      } else {
        ctx.setLockedTrip(trip.id)
        if (trip.slug) {
          const next = trip.slug.current
          if (searchParams?.get('trip') !== next) {
            router.push(`/globe?trip=${encodeURIComponent(next)}`, { scroll: false })
          }
        }
      }
    },
    [ctx, router, searchParams],
  )

  const handleBackgroundClick = useCallback(() => {
    if (panMovedRef.current) return
    if (!ctx) {
      setLocalActiveId(null)
      return
    }
    if (ctx.lockedTrip) {
      ctx.setLockedTrip(null)
      if (searchParams?.get('trip')) {
        router.push('/globe', { scroll: false })
      }
    }
  }, [ctx, router, searchParams])

  if (ctx?.fetchError) {
    return (
      <div
        ref={wrapperRef}
        className={`w-full h-16 md:h-20 flex items-center justify-center gap-2 text-xs tracking-widest uppercase text-black/50 dark:text-white/50 ${className ?? ''}`}
      >
        <span>Could not load timeline.</span>
        <button
          onClick={() => window.location.reload()}
          className="underline hover:text-black dark:hover:text-white transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    )
  }

  if (trips.length === 0) {
    return (
      <div
        ref={wrapperRef}
        className={`w-full h-16 md:h-20 flex items-center justify-center text-xs tracking-widest uppercase text-black/30 dark:text-white/30 ${className ?? ''}`}
      >
        Nothing yet
      </div>
    )
  }

  const zoomSpan = zoomWindow.end - zoomWindow.start
  const todayProj = (1 - zoomWindow.start) / zoomSpan
  const todayVisible = todayProj >= -0.01 && todayProj <= 1.01

  const renderTodayMarker = () => {
    if (!todayVisible) return null
    return (
      <div
        data-no-skeleton
        className="absolute w-px bg-black/35 dark:bg-white/40 pointer-events-none"
        style={{
          left: trackInsetX + todayProj * innerWidth,
          top: YEAR_AXIS_Y,
          height: TRACK_Y + 6 - YEAR_AXIS_Y,
        }}
      >
        <span
          className="absolute -translate-x-1/2 text-[9px] tracking-widest uppercase text-black/35 dark:text-white/40"
          style={{ top: TODAY_LABEL_Y - YEAR_AXIS_Y }}
        >
          today
        </span>
      </div>
    )
  }

  const renderLabels = () => {
    if (width === 0) return null
    return packed.items.map((item) => {
      const projX = (item.rawX - zoomWindow.start) / zoomSpan
      // Cull labels clearly outside the visible window. Row assignment is
      // stable (full-history packed) so culling doesn't reshuffle rows.
      if (projX < -0.05 || projX > 1.05) return null

      const anchorX = projX * innerWidth
      let labelX = anchorX
      if (labelX + item.shortWidth > innerWidth) {
        labelX = Math.max(0, innerWidth - item.shortWidth)
      }
      if (labelX < 0) labelX = 0

      const labelTop = FIRST_LABEL_Y + item.row * labelRowHeight
      const connectorTop = TRACK_Y + 6
      const connectorHeight = labelTop - connectorTop
      const isActive = activeId === item.trip.id
      const hoverLeft = Math.max(
        0,
        Math.min(labelX - HOVER_HPAD, innerWidth - item.fullWidth - HOVER_HPAD * 2),
      )
      const restingLeft = trackInsetX + labelX
      const leftPx = isActive ? trackInsetX + hoverLeft : restingLeft

      return (
        <div key={item.trip.id}>
          <div
            data-no-skeleton
            className="absolute w-px bg-black/15 dark:bg-white/15 pointer-events-none"
            style={{
              // Shift the 1px line left by half a pixel so its visual center
              // sits on anchorX — otherwise the line's center is at
              // anchorX + 0.5, one half-pixel right of the dot's center.
              left: trackInsetX + anchorX - 0.5,
              top: connectorTop,
              height: Math.max(0, connectorHeight),
            }}
          />
          <div
            onMouseEnter={() => handleLabelEnter(item.trip)}
            onMouseLeave={() => handleLabelLeave(item.trip)}
            onPointerDown={(e) => {
              // Don't let the wrapper start a pan gesture under a label —
              // pointerdown bubbling to the wrapper would arm the drag path.
              // The wrapper still handles clicks that start on the background.
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (panMovedRef.current) return
              handleLabelClick(item.trip)
            }}
            className={`absolute cursor-default rounded-sm ring-1 transition-[left,width,background-color,box-shadow] duration-150 ease-out ${
              isActive
                ? 'z-10 bg-white/95 dark:bg-black/95 shadow-sm ring-black/10 dark:ring-white/15'
                : 'bg-transparent shadow-none ring-transparent'
            }`}
            style={{
              left: leftPx,
              top: labelTop,
              height: labelRowHeight,
              width:
                (isActive ? item.fullWidth : item.shortWidth) +
                (isActive ? HOVER_HPAD * 2 : 0),
            }}
          >
            <span
              className="absolute top-0 text-[10px] tracking-widest uppercase whitespace-nowrap transition-opacity duration-150 ease-out pointer-events-none text-black/80 dark:text-white/80"
              style={{ left: isActive ? HOVER_HPAD : 0, opacity: isActive ? 0 : 1, lineHeight: `${labelRowHeight}px` }}
            >
              {item.short}
            </span>
            <span
              className="absolute top-0 text-[10px] tracking-widest uppercase whitespace-nowrap transition-opacity duration-150 ease-out pointer-events-none text-black dark:text-white"
              style={{ left: HOVER_HPAD, opacity: isActive ? 1 : 0, lineHeight: `${labelRowHeight}px` }}
            >
              {item.full}
            </span>
          </div>
        </div>
      )
    })
  }

  return (
    <div
      ref={wrapperRef}
      className={`w-full relative overflow-hidden bg-black/5 dark:bg-white/5 select-none ${className ?? ''}`}
      style={{ minHeight: Math.max(72, totalHeight), touchAction: 'pan-y' }}
      onPointerDown={handlePointerDown}
      onClick={(e) => {
        // Tapping the timeline background (not a label/segment) dismisses any
        // locked trip. Drag-vs-click is gated inside handleBackgroundClick.
        if (e.target === e.currentTarget) handleBackgroundClick()
      }}
    >
      {measurementLayer}

      {/* Year axis (above track) */}
      {width > 0 && (
        <div
          className="absolute left-0 right-0"
          style={{ top: YEAR_AXIS_Y, height: YEAR_AXIS_HEIGHT }}
        >
          <TimelineAxis
            compressed={compressed}
            zoomWindow={zoomWindow}
            containerWidth={innerWidth}
            leftOffset={trackInsetX}
          />
        </div>
      )}

      {/* Track */}
      <div
        className="absolute h-1.5"
        style={{ left: trackInsetX, right: trackInsetX, top: TRACK_Y }}
      >
        {/* Background bar is clipped to the history range so that panning
            into overscroll (zoomWindow.start < 0 or end > 1) reveals the
            element's background instead of a trailing line. */}
        <div
          className="absolute top-0 bottom-0 bg-black/10 dark:bg-white/10"
          style={{
            left: `${Math.max(0, (-zoomWindow.start / zoomSpan) * 100)}%`,
            right: `${Math.max(0, ((zoomWindow.end - 1) / zoomSpan) * 100)}%`,
          }}
        />

        {width > 0 &&
          trips.map((trip) => (
            <TimelineSegment
              key={trip.id}
              trip={trip}
              compressed={compressed}
              zoomWindow={zoomWindow}
              containerWidth={innerWidth}
              isActive={activeId === trip.id}
              isPlaybackHighlighted={playbackHighlightSet.has(trip.id)}
            />
          ))}

        {width > 0 && (
          <TimelinePinBands
            compressed={compressed}
            zoomWindow={zoomWindow}
            containerWidth={innerWidth}
          />
        )}
      </div>

      {renderTodayMarker()}
      {renderLabels()}

      {width > 0 && ctx && (
        <TimelinePlayhead
          compressed={compressed}
          zoomWindow={zoomWindow}
          containerWidth={innerWidth}
          leftOffsetPx={trackInsetX}
          trackTopPx={TRACK_Y}
          playheadTopPx={YEAR_AXIS_Y}
          playheadHeightPx={Math.max(0, TRACK_Y + 8 - YEAR_AXIS_Y)}
          trips={trips}
        />
      )}
    </div>
  )
}
