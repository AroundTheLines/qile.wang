'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useGlobe } from '../GlobeContext'
import GlobeDetailItem from '../GlobeDetailItem'
import { formatDateRange } from '@/lib/formatDates'
import type { VisitSummary, VisitInTrip } from '@/lib/types'

type VisitLike = VisitSummary | (VisitInTrip & { trip?: { _id: string; title: string; slug: { current: string } } })

interface Props {
  visit: VisitLike
  /** Show per-section "View trip article" link. Pin panels: true. Trip panels: false (global link at top). */
  showViewTripArticleLink: boolean
  /** Sticky header if this section lives in a scrollable list. */
  sticky?: boolean
  /** Header label variant: pin panels show trip title, trip panels show location name. */
  secondaryLabel?: string
  /**
   * Callback exposed for C7 auto-scroll pattern.
   *
   * NOTE: the ref is attached with an inline arrow (`el => onRef?.(el, visit._id)`),
   * so it fires on every render. Callers MUST wrap their handler in `useCallback`
   * (keyed on a stable identity) to avoid re-registering on each parent render.
   */
  onRef?: (el: HTMLElement | null, visitId: string) => void
  /**
   * Is this section receiving a cross-interaction pulse? (C7)
   *
   * Drives a 600ms keyframe animation that fades the accent tint up,
   * holds briefly, then fades it back down (spec §17.3).
   */
  pulsing?: boolean
  /**
   * Hover-driven accent tint (C7). Persists for the duration of a pin
   * hover when this section's visit matches the hovered pin and a trip
   * is locked. Held tint, no animation.
   */
  hovered?: boolean
}

export default function VisitSection({
  visit,
  showViewTripArticleLink,
  sticky,
  secondaryLabel,
  onRef,
  pulsing,
  hovered,
}: Props) {
  const router = useRouter()
  const { trips } = useGlobe()
  const [expanded, setExpanded] = useState(true)

  const tripRef = 'trip' in visit ? visit.trip : undefined
  const tripMeta = tripRef ? trips.find((t) => t._id === tripRef._id) : undefined
  const hasArticle = tripMeta?.hasArticle ?? false

  const dateLabel = formatDateRange(visit.startDate, visit.endDate)
  const resolvedSecondary = secondaryLabel ?? tripRef?.title ?? ''

  const handleViewArticle = () => {
    if (!hasArticle || !tripRef) return
    router.push(`/trip/${encodeURIComponent(tripRef.slug.current)}`, { scroll: false })
  }

  return (
    <section
      ref={(el) => onRef?.(el, visit._id)}
      data-pulsing={pulsing ? 'true' : undefined}
      className={`visit-section border-b border-gray-200 dark:border-gray-800 last:border-b-0 transition-colors duration-200 ${
        hovered ? 'bg-[rgba(37,99,235,0.10)]' : 'bg-transparent'
      }`}
    >
      <header
        className={`px-4 pt-3 pb-2 bg-white dark:bg-black ${sticky ? 'sticky top-0 z-10' : ''}`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs tracking-widest uppercase font-light text-black dark:text-white truncate">
              {dateLabel}
            </p>
            {resolvedSecondary && (
              <p className="text-[10px] tracking-wide text-gray-400 dark:text-gray-500 truncate">
                {resolvedSecondary}
              </p>
            )}
          </div>
          {showViewTripArticleLink && tripRef && (
            <button
              onClick={handleViewArticle}
              disabled={!hasArticle}
              aria-disabled={!hasArticle}
              title={hasArticle ? 'View trip article' : 'No content available for this trip.'}
              className={`text-[10px] tracking-widest uppercase shrink-0 px-2 py-1 border transition-colors ${
                hasArticle
                  ? 'border-black dark:border-white text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black cursor-pointer'
                  : 'border-gray-200 dark:border-gray-800 text-gray-300 dark:text-gray-700 cursor-not-allowed'
              }`}
            >
              View trip article
            </button>
          )}
        </div>
      </header>

      {visit.items.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full px-4 py-1.5 flex items-center justify-between text-left text-[10px] tracking-widest uppercase text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
            aria-expanded={expanded}
          >
            <span>
              {visit.items.length} {visit.items.length === 1 ? 'item' : 'items'}
            </span>
            <motion.span
              data-no-skeleton
              aria-hidden
              animate={{ rotate: expanded ? 0 : 180 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="inline-block"
            >
              ▴
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="items"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="pb-3">
                  {visit.items.map((item) => (
                    <GlobeDetailItem key={item._id} item={item} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </section>
  )
}
