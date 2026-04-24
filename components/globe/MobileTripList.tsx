'use client'

import { useRouter } from 'next/navigation'
import { Skeleton } from 'boneyard-js/react'
import { useGlobe } from './GlobeContext'
import { formatDateRange } from '@/lib/formatDates'

const ROW_TITLE_CLASS = 'text-sm tracking-wide font-light text-black dark:text-white'
const ROW_META_CLASS = 'text-[10px] tracking-widest uppercase text-gray-400 dark:text-gray-500 mt-1'
const ROW_PADDING_CLASS = 'px-5 py-4'
const LIST_CLASS = 'w-full divide-y divide-gray-100 dark:divide-gray-900'

function TripRow({ title, range }: { title: string; range: string }) {
  return (
    <>
      <p className={ROW_TITLE_CLASS}>{title}</p>
      <p className={ROW_META_CLASS}>{range}</p>
    </>
  )
}

export default function MobileTripList() {
  const router = useRouter()
  const { trips, setLockedTrip } = useGlobe()

  const handleSelect = (tripId: string, slug: string) => {
    setLockedTrip(tripId)
    router.push(`/globe?trip=${encodeURIComponent(slug)}`, { scroll: false })
    // Smooth-scroll back to the top so the globe and timeline come into
    // view alongside the newly opened trip panel below. Without this the
    // viewport stays parked on the tapped row. `scrollTo`'s smooth
    // behavior doesn't check `prefers-reduced-motion` on its own, so we
    // honor it explicitly.
    if (typeof window !== 'undefined') {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
    }
  }

  if (trips.length === 0) {
    return (
      <div className="px-5 py-8 text-xs tracking-widest uppercase text-gray-400 dark:text-gray-500">
        No trips yet
      </div>
    )
  }

  return (
    <Skeleton name="trip-list-default" loading={false} fixture={fixtureList()}>
      <ul aria-label="Trips" className={LIST_CLASS}>
        {trips.map((trip) => (
          <li key={trip._id}>
            <button
              onClick={() => handleSelect(trip._id, trip.slug.current)}
              className={`w-full text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer ${ROW_PADDING_CLASS}`}
            >
              <TripRow
                title={trip.title}
                range={formatDateRange(trip.startDate, trip.endDate)}
              />
            </button>
          </li>
        ))}
      </ul>
    </Skeleton>
  )
}

function fixtureList() {
  const samples = [
    { title: 'Berlin 2024', range: 'June 2024' },
    { title: 'NYC Day Trip', range: 'January 20, 2024' },
    { title: 'Seattle Q4 2023', range: 'October 2023' },
    { title: 'SF Q4 2023', range: 'October 2023' },
    { title: 'Round-the-World', range: 'July 2023' },
  ]
  return (
    <ul className={LIST_CLASS}>
      {samples.map((s) => (
        <li key={s.title} className={ROW_PADDING_CLASS}>
          <TripRow title={s.title} range={s.range} />
        </li>
      ))}
    </ul>
  )
}
