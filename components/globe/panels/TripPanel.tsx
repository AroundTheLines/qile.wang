'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const PULSE_DURATION_MS = 600

export default function TripPanel({ trip }: Props) {
  const router = useRouter()
  const { setLockedTrip, pinToScrollTo, clearPinScroll, hoveredPin } = useGlobe()

  // Refs to each visit's section element, keyed by visit id, so the
  // scroll-to-visit effect can target the right node.
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  const handleSectionRef = useCallback((el: HTMLElement | null, visitId: string) => {
    if (el) sectionRefs.current.set(visitId, el)
    else sectionRefs.current.delete(visitId)
  }, [])

  // Track an incrementing nonce so the same visit can be re-pulsed on a
  // repeat click. The DOM key combines visit id + nonce, so React sees a
  // fresh element and the CSS animation replays from frame 0.
  const [pulse, setPulse] = useState<{ visitId: string; nonce: number } | null>(null)

  // C7: when a pin in this trip is clicked, scroll to its visit section
  // and pulse it. The signal is `pinToScrollTo` (an {id, nonce} object) set
  // by GlobePins. The nonce changes on every click, including repeat clicks
  // on the same pin, so this effect re-fires reliably and the pulse always
  // tracks the user's action.
  useEffect(() => {
    if (!pinToScrollTo) return
    const visit = trip.visits.find((v) => v.location._id === pinToScrollTo.id)
    if (!visit) return
    const el = sectionRefs.current.get(visit._id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setPulse({ visitId: visit._id, nonce: pinToScrollTo.nonce })
    const timer = setTimeout(() => {
      setPulse((cur) => (cur && cur.nonce === pinToScrollTo.nonce ? null : cur))
      clearPinScroll()
    }, PULSE_DURATION_MS)
    return () => clearTimeout(timer)
  }, [pinToScrollTo, trip.visits, clearPinScroll])

  // Pin-hover → tint the matching visit section (desktop §7.4).
  const hoveredVisitId = useMemo(() => {
    if (!hoveredPin) return null
    const visit = trip.visits.find((v) => v.location._id === hoveredPin)
    return visit?._id ?? null
  }, [hoveredPin, trip.visits])

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
            // Re-key on pulse nonce so a repeat click on the same visit
            // remounts the section's animated child element and replays
            // the CSS keyframe from the start.
            key={pulse?.visitId === visit._id ? `${visit._id}-${pulse.nonce}` : visit._id}
            visit={visit}
            showViewTripArticleLink={false}
            sticky
            secondaryLabel={visit.location.name}
            onRef={handleSectionRef}
            pulsing={pulse?.visitId === visit._id}
            hovered={hoveredVisitId === visit._id}
          />
        ))}
      </PanelChrome>
    </Skeleton>
  )
}
