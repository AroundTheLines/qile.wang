'use client'

import { useContext, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { CompressedMap } from '@/lib/timelineCompression'
import {
  createPlaybackController,
  type PlaybackController,
  type PlaybackState,
} from '@/lib/timelinePlayback'
import { GlobeContext } from './GlobeContext'

export interface PlaybackTripInput {
  id: string
  title?: string
  slug?: { current: string }
  startDate: string
  endDate: string
}

interface Props {
  compressed: CompressedMap
  zoomWindow: { start: number; end: number }
  containerWidth: number
  leftOffsetPx: number
  trackTopPx: number
  playheadTopPx: number
  playheadHeightPx: number
  trips: PlaybackTripInput[]
}

const PAUSE_REASON = 'playback-floating-label-hover'
const LABEL_EDGE_PAD = 4

function subMonthsISO(iso: string, months: number): string {
  const y = +iso.slice(0, 4)
  const m = +iso.slice(5, 7)
  const d = +iso.slice(8, 10)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCMonth(date.getUTCMonth() - months)
  return date.toISOString().slice(0, 10)
}

export default function TimelinePlayhead({
  compressed,
  zoomWindow,
  containerWidth,
  leftOffsetPx,
  trackTopPx,
  playheadTopPx,
  playheadHeightPx,
  trips,
}: Props) {
  const ctx = useContext(GlobeContext)
  const router = useRouter()
  const searchParams = useSearchParams()

  const playheadRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<PlaybackController | null>(null)
  const lastStateRef = useRef<PlaybackState | null>(null)
  const highlightedRef = useRef<string[]>([])
  // Stable ref for the context setter — avoids re-creating the controller
  // every render (GlobeProvider returns a fresh context object each render).
  const setHighlightedIdsRef = useRef<((ids: string[]) => void) | null>(null)
  setHighlightedIdsRef.current = ctx?.setPlaybackHighlightedTripIds ?? null

  // Refs that stay current so the stable RAF callback reads the latest.
  const zoomRef = useRef(zoomWindow)
  zoomRef.current = zoomWindow
  const widthRef = useRef(containerWidth)
  widthRef.current = containerWidth
  const leftOffsetRef = useRef(leftOffsetPx)
  leftOffsetRef.current = leftOffsetPx
  const tripsRef = useRef(trips)
  tripsRef.current = trips

  const playbackTrips = useMemo(
    () =>
      trips
        .filter((t) => t.startDate && t.endDate)
        .map((t) => ({
          id: t.id,
          xStart: compressed.dateToX(t.startDate),
          xEnd: compressed.dateToX(t.endDate),
        })),
    [trips, compressed],
  )

  const xPerSecond = useMemo(() => {
    // "5s per half-year of real time" projected through the compression map.
    const endX = compressed.dateToX(compressed.end)
    const sixMonthsAgo = subMonthsISO(compressed.end, 6)
    const earlierX = compressed.dateToX(sixMonthsAgo)
    const halfYearCompressedX = Math.max(0.01, endX - earlierX)
    return halfYearCompressedX / 5
  }, [compressed])

  const applyDom = (s: PlaybackState) => {
    const zoom = zoomRef.current
    const w = widthRef.current
    const leftOffset = leftOffsetRef.current
    const zoomSpan = zoom.end - zoom.start

    const projX = zoomSpan > 0 ? (s.playheadX - zoom.start) / zoomSpan : 0
    const ph = playheadRef.current
    if (ph) {
      const inRange = projX >= 0 && projX <= 1
      ph.style.opacity = inRange ? '1' : '0'
      if (inRange) ph.style.left = `${leftOffset + projX * w - 0.5}px`
    }

    const label = labelRef.current
    if (label) {
      const names = s.highlightedTripIds
        .map((id) => tripsRef.current.find((t) => t.id === id)?.title ?? '')
        .filter(Boolean)
      const text = names.join(' · ')
      const prevText = label.dataset.text ?? ''
      if (prevText !== text) {
        label.textContent = text
        label.dataset.text = text
      }
      const shouldShow =
        s.phase === 'sweeping' && text.length > 0 && projX >= 0 && projX <= 1
      label.style.opacity = shouldShow ? '1' : '0'
      if (shouldShow) {
        const labelWidth = label.getBoundingClientRect().width
        const anchor = leftOffset + projX * w
        let leftPx = anchor - labelWidth / 2
        const minLeft = leftOffset + LABEL_EDGE_PAD
        const maxLeft = leftOffset + w - labelWidth - LABEL_EDGE_PAD
        if (leftPx < minLeft) leftPx = minLeft
        if (leftPx > maxLeft) leftPx = maxLeft
        label.style.left = `${leftPx}px`
      }
    }
  }

  // Controller lifecycle — recreate only when trip ranges actually change.
  useEffect(() => {
    const c = createPlaybackController({
      trips: playbackTrips,
      xPerSecond,
      loopHoldMs: 5000,
    })
    controllerRef.current = c

    const unsub = c.subscribe((s) => {
      lastStateRef.current = s
      applyDom(s)
      const prev = highlightedRef.current
      const next = s.highlightedTripIds
      let changed = prev.length !== next.length
      if (!changed) {
        for (let i = 0; i < prev.length; i++) {
          if (prev[i] !== next[i]) {
            changed = true
            break
          }
        }
      }
      if (changed) {
        highlightedRef.current = next
        setHighlightedIdsRef.current?.(next)
      }
    })

    return () => {
      unsub()
      controllerRef.current = null
    }
  }, [playbackTrips])

  // Update speed in place on zoom/compression changes.
  useEffect(() => {
    controllerRef.current?.setXPerSecond(xPerSecond)
  }, [xPerSecond])

  // Seek the playhead to a locked trip's midpoint. Fires whenever
  // lockedTrip transitions to a non-null id (label click, URL deep-link,
  // or panel re-selection). Once the lock is released, the playhead is
  // left where we parked it so sweeping resumes from that trip — per
  // product: "resume from where the label was clicked."
  const lockedTrip = ctx?.lockedTrip ?? null
  useEffect(() => {
    if (!lockedTrip) return
    const c = controllerRef.current
    if (!c) return
    const t = playbackTrips.find((p) => p.id === lockedTrip)
    if (!t) return
    const midpoint = (t.xStart + t.xEnd) / 2
    c.seekTo(midpoint)
  }, [lockedTrip, playbackTrips])

  // Re-project the playhead/label to the latest zoom without requiring a tick.
  useEffect(() => {
    const s = lastStateRef.current
    if (s) applyDom(s)
  }, [zoomWindow, containerWidth, leftOffsetPx])

  // RAF loop gated by playbackActive (which already folds in isPaused +
  // the 5s idle-resume ramp from GlobeProvider). The `last` timestamp
  // resets to null on teardown so the first tick after resume sees dt=0
  // instead of the elapsed paused duration.
  const playbackActive = ctx?.playbackActive ?? true
  const lastFrameRef = useRef<number | null>(null)
  useEffect(() => {
    if (!playbackActive) {
      lastFrameRef.current = null
      return
    }
    let raf = 0
    const loop = (t: number) => {
      const prev = lastFrameRef.current
      lastFrameRef.current = t
      const dt = prev === null ? 0 : Math.min(0.1, (t - prev) / 1000)
      controllerRef.current?.tick(dt)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playbackActive])

  // Clear playback highlights when the component unmounts so other
  // subsystems (arcs, segments) return to neutral.
  useEffect(() => {
    return () => {
      setHighlightedIdsRef.current?.([])
    }
  }, [])

  const onLabelEnter = () => {
    ctx?.addPauseReason(PAUSE_REASON)
  }
  const onLabelLeave = () => {
    ctx?.removePauseReason(PAUSE_REASON)
  }
  const onLabelClick = () => {
    if (!ctx) return
    if (ctx.isMobile) return // E3 owns mobile preview behavior
    const ids = highlightedRef.current
    if (ids.length === 0) return
    const id = ids[0]
    const trip = tripsRef.current.find((t) => t.id === id)
    if (!trip) return
    ctx.removePauseReason(PAUSE_REASON)
    if (ctx.lockedTrip === id) {
      ctx.setLockedTrip(null)
      if (searchParams?.get('trip')) router.push('/globe', { scroll: false })
    } else {
      ctx.setLockedTrip(id)
      if (trip.slug) {
        const next = trip.slug.current
        if (searchParams?.get('trip') !== next) {
          router.push(`/globe?trip=${encodeURIComponent(next)}`, { scroll: false })
        }
      }
    }
  }

  // Sit in the same top row as the `today` marker label (above the year
  // axis). They only visually collide at the instant the loop resets past
  // the present edge, for a single frame.
  const labelTopPx = 0

  return (
    <>
      <div
        ref={playheadRef}
        data-no-skeleton
        aria-hidden
        className="absolute w-px bg-black/60 dark:bg-white/70 pointer-events-none"
        style={{
          top: playheadTopPx,
          height: playheadHeightPx,
          left: leftOffsetPx - 0.5,
          opacity: 0,
          transition: 'opacity 150ms linear',
        }}
      />
      <div
        ref={labelRef}
        data-no-skeleton
        onPointerEnter={onLabelEnter}
        onPointerLeave={onLabelLeave}
        onClick={onLabelClick}
        className="absolute px-1.5 py-0.5 bg-white/95 dark:bg-neutral-900/95 border border-black/10 dark:border-white/10 text-[9px] leading-none tracking-widest uppercase max-w-[240px] truncate shadow-sm cursor-pointer select-none"
        style={{
          top: labelTopPx,
          left: leftOffsetPx,
          opacity: 0,
          transition: 'opacity 200ms ease-out',
        }}
      />
    </>
  )
}
