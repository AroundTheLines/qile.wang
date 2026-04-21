'use client'

import { useState } from 'react'
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
  /** Callback exposed for C7 auto-scroll pattern. */
  onRef?: (el: HTMLElement | null, visitId: string) => void
  /** Is this section receiving a cross-interaction pulse? (C7) */
  pulsing?: boolean
}

export default function VisitSection({
  visit,
  showViewTripArticleLink,
  sticky,
  secondaryLabel,
  onRef,
  pulsing,
}: Props) {
  const router = useRouter()
  const { trips } = useGlobe()
  const [expanded, setExpanded] = useState(false)

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
      className={`border-b border-gray-100 dark:border-gray-900 last:border-b-0 transition-colors duration-[600ms] ${
        pulsing ? 'bg-[var(--accent)]/10' : 'bg-transparent'
      }`}
    >
      <header
        className={`px-4 py-3 bg-white dark:bg-black ${sticky ? 'sticky top-0 z-10' : ''}`}
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
            className="w-full px-4 py-2 flex items-center justify-between text-left text-[10px] tracking-widest uppercase text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer"
            aria-expanded={expanded}
          >
            <span>
              {visit.items.length} {visit.items.length === 1 ? 'item' : 'items'}
            </span>
            <span data-no-skeleton aria-hidden>{expanded ? '▴' : '▾'}</span>
          </button>
          {expanded && (
            <div>
              {visit.items.map((item) => (
                <GlobeDetailItem key={item._id} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
