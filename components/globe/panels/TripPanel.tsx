'use client'

import { useRouter } from 'next/navigation'
import { Skeleton } from 'boneyard-js/react'
import PanelChrome from './PanelChrome'
import VisitSection from './VisitSection'
import { useGlobe } from '../GlobeContext'
import { formatDateRange } from '@/lib/formatDates'
import type { TripWithVisits } from '@/lib/types'

interface Props {
  trip: TripWithVisits
}

export default function TripPanel({ trip }: Props) {
  const router = useRouter()
  const { setLockedTrip } = useGlobe()

  const subtitle = `${formatDateRange(trip.startDate, trip.endDate)} · ${trip.visitCount} ${trip.visitCount === 1 ? 'visit' : 'visits'}`

  const handleViewArticle = () => {
    if (!trip.hasArticle) return
    router.push(`/trip/${encodeURIComponent(trip.slug.current)}`, { scroll: false })
  }

  const handleClose = () => {
    setLockedTrip(null)
    router.push('/globe', { scroll: false })
  }

  return (
    // TODO(F1): add `fixture` prop so bones can be (re)captured for the loading state.
    <Skeleton name="trip-panel" loading={false}>
      <PanelChrome title={trip.title} subtitle={subtitle} onClose={handleClose}>
        {/* Global "View trip article" button — per §7.2, the only article link
            in the trip panel. Per-visit sections deliberately omit it. */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-900">
          <button
            data-no-skeleton
            onClick={handleViewArticle}
            disabled={!trip.hasArticle}
            aria-disabled={!trip.hasArticle}
            title={trip.hasArticle ? 'View trip article' : 'No content available for this trip.'}
            className={`w-full text-[11px] tracking-widest uppercase py-2 border transition-colors ${
              trip.hasArticle
                ? 'border-black dark:border-white text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black cursor-pointer'
                : 'border-gray-200 dark:border-gray-800 text-gray-300 dark:text-gray-700 cursor-not-allowed'
            }`}
          >
            View trip article
          </button>
        </div>

        {/* Visit sections in ascending chronological order (§7.2).
            Query already orders visits by startDate asc. */}
        {trip.visits.map((visit) => (
          <VisitSection
            key={visit._id}
            visit={visit}
            showViewTripArticleLink={false}
            sticky
            secondaryLabel={visit.location.name}
          />
        ))}
      </PanelChrome>
    </Skeleton>
  )
}
