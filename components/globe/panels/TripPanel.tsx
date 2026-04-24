'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// Pulse handling lives inside VisitSection now (imperative replay so it
// preserves the section's local `expanded` state); TripPanel just forwards
// the nonce coming off `pinToScrollTo`.
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

  // Resolved pulse target. We forward the incoming nonce straight to the
  // matching VisitSection so it can replay its keyframe imperatively (no
  // remount → preserves the section's `expanded` state).
  const [pulse, setPulse] = useState<{ visitId: string; nonce: number } | null>(null)

  // C7: when a pin in this trip is clicked, scroll to its visit section
  // and pulse it. `pinToScrollTo` is `{id, nonce}` — the nonce changes on
  // every click (including repeat clicks on the same pin) so this effect
  // re-fires deterministically and the pulse always tracks the user action.
  useEffect(() => {
    if (!pinToScrollTo) return
    const visit = trip.visits.find((v) => v.location._id === pinToScrollTo.id)
    if (!visit) return
    const el = sectionRefs.current.get(visit._id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setPulse({ visitId: visit._id, nonce: pinToScrollTo.nonce })
    const timer = setTimeout(() => {
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
    <Skeleton name="trip-panel" loading={false} fixture={<TripPanelFixture />}>
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
            key={visit._id}
            visit={visit}
            showViewTripArticleLink={false}
            sticky
            secondaryLabel={visit.location.name}
            onRef={handleSectionRef}
            pulseNonce={pulse?.visitId === visit._id ? pulse.nonce : null}
            hovered={hoveredVisitId === visit._id}
          />
        ))}
      </PanelChrome>
    </Skeleton>
  )
}

export function TripPanelFixture() {
  return (
    <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 h-full flex flex-col">
      <div className="p-4 pb-2 border-b border-gray-100 dark:border-gray-900">
        <h2 className="text-sm tracking-widest uppercase font-light text-black dark:text-white">Trip title</h2>
        <span className="text-[10px] tracking-widest uppercase text-gray-400 dark:text-gray-500 block mt-0.5">March 2022 · 3 visits</span>
      </div>
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-900">
        <div className="w-full py-2 border border-black dark:border-white text-center text-[11px] uppercase tracking-widest">View trip article</div>
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="border-b border-gray-100 dark:border-gray-900">
          <div className="px-4 py-3">
            <p className="text-xs tracking-widest uppercase">March 2022</p>
            <p className="text-[10px] text-gray-400">Sample location</p>
          </div>
          <div className="px-4 py-2 text-[10px] uppercase text-gray-500">12 items</div>
        </div>
      ))}
    </div>
  )
}
