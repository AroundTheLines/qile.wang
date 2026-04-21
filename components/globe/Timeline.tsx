'use client'

import { useRef, useState, useEffect, useMemo, useLayoutEffect } from 'react'
import { buildCompressedMap, type TripRange, type CompressedMap } from '@/lib/timelineCompression'
import TimelineSegment from './TimelineSegment'
import TimelineAxis from './TimelineAxis'

export interface TimelineProps {
  trips: (TripRange & { title?: string })[]
  className?: string
  now?: string
}

const TRACK_INSET_X = 16
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
  trips: (TripRange & { title?: string })[],
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

export default function Timeline({ trips, className, now }: TimelineProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [labelWidths, setLabelWidths] = useState<Record<string, LabelWidths>>({})
  const [activeId, setActiveId] = useState<string | null>(null)

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

  const innerWidth = Math.max(0, width - TRACK_INSET_X * 2)

  const packed = useMemo(() => {
    if (innerWidth === 0 || trips.length === 0) {
      return {
        items: [] as {
          trip: TripRange & { title?: string }
          short: string
          full: string
          anchorX: number
          labelX: number
          shortWidth: number
          fullWidth: number
          row: number
        }[],
        rowCount: 0,
      }
    }

    const items = trips
      .map((trip) => {
        const { short, full } = displayLabels[trip.id]
        const anchor = compressed.dateToX(trip.startDate) * innerWidth
        const measured = labelWidths[trip.id]
        const shortWidth = measured?.short ?? short.length * 7
        const fullWidth = measured?.full ?? full.length * 7
        return { trip, short, full, anchorX: anchor, shortWidth, fullWidth }
      })
      .sort((a, b) => a.anchorX - b.anchorX)

    const rowEnds: number[] = []
    const placed = items.map((item) => {
      let labelX = item.anchorX
      if (labelX + item.shortWidth > innerWidth) {
        labelX = Math.max(0, innerWidth - item.shortWidth)
      }
      let row = 0
      while (row < rowEnds.length && rowEnds[row] > labelX - LABEL_HORIZONTAL_GAP) row++
      rowEnds[row] = labelX + item.shortWidth
      return { ...item, labelX, row }
    })
    return { items: placed, rowCount: rowEnds.length }
  }, [trips, compressed, innerWidth, labelWidths, displayLabels])

  const labelsHeight = packed.rowCount * LABEL_ROW_HEIGHT
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

  return (
    <div
      ref={wrapperRef}
      className={`w-full relative overflow-hidden bg-black/5 dark:bg-white/5 ${className ?? ''}`}
      style={{ minHeight: Math.max(72, totalHeight) }}
      onClick={(e) => {
        // Tapping the timeline background dismisses any sticky-active label.
        if (e.target === e.currentTarget) setActiveId(null)
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
            containerWidth={innerWidth}
            leftOffset={TRACK_INSET_X}
          />
        </div>
      )}

      {/* Track */}
      <div
        className="absolute h-1.5"
        style={{ left: TRACK_INSET_X, right: TRACK_INSET_X, top: TRACK_Y }}
      >
        <div className="absolute inset-0 bg-black/10 dark:bg-white/10" />

        {width > 0 &&
          trips.map((trip) => (
            <TimelineSegment
              key={trip.id}
              trip={trip}
              compressed={compressed}
              containerWidth={innerWidth}
            />
          ))}
      </div>

      {/* Today marker */}
      <div
        data-no-skeleton
        className="absolute w-px bg-black/35 dark:bg-white/40 pointer-events-none"
        style={{
          left: TRACK_INSET_X + innerWidth,
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

      {/* Connector lines + labels */}
      {width > 0 &&
        packed.items.map((item) => {
          const labelTop = FIRST_LABEL_Y + item.row * LABEL_ROW_HEIGHT
          const connectorTop = TRACK_Y + 6
          const connectorHeight = labelTop - connectorTop
          const isActive = activeId === item.trip.id
          // When active, clamp so full label + padding stays inside innerWidth.
          const hoverLeft = Math.max(
            0,
            Math.min(item.labelX - HOVER_HPAD, innerWidth - item.fullWidth - HOVER_HPAD * 2),
          )
          const restingLeft = TRACK_INSET_X + item.labelX
          const leftPx = isActive ? TRACK_INSET_X + hoverLeft : restingLeft

          return (
            <div key={item.trip.id}>
              <div
                data-no-skeleton
                className="absolute w-px bg-black/15 dark:bg-white/15 pointer-events-none"
                style={{
                  left: TRACK_INSET_X + item.anchorX,
                  top: connectorTop,
                  height: Math.max(0, connectorHeight),
                }}
              />
              <div
                onMouseEnter={() => setActiveId(item.trip.id)}
                onMouseLeave={() =>
                  setActiveId((cur) => (cur === item.trip.id ? null : cur))
                }
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveId((cur) => (cur === item.trip.id ? null : item.trip.id))
                }}
                className={`absolute cursor-default rounded-sm ring-1 transition-[left,width,background-color,box-shadow] duration-150 ease-out ${
                  isActive
                    ? 'z-10 bg-white/95 dark:bg-black/95 shadow-sm ring-black/10 dark:ring-white/15'
                    : 'bg-transparent shadow-none ring-transparent'
                }`}
                style={{
                  left: leftPx,
                  top: labelTop,
                  height: LABEL_ROW_HEIGHT,
                  width:
                    (isActive ? item.fullWidth : item.shortWidth) +
                    (isActive ? HOVER_HPAD * 2 : 0),
                }}
              >
                <span
                  className="absolute top-0 text-[10px] leading-[14px] tracking-widest uppercase whitespace-nowrap transition-opacity duration-150 ease-out pointer-events-none text-black/80 dark:text-white/80"
                  style={{ left: isActive ? HOVER_HPAD : 0, opacity: isActive ? 0 : 1 }}
                >
                  {item.short}
                </span>
                <span
                  className="absolute top-0 text-[10px] leading-[14px] tracking-widest uppercase whitespace-nowrap transition-opacity duration-150 ease-out pointer-events-none text-black dark:text-white"
                  style={{ left: HOVER_HPAD, opacity: isActive ? 1 : 0 }}
                >
                  {item.full}
                </span>
              </div>
            </div>
          )
        })}
    </div>
  )
}
