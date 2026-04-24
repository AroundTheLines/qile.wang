'use client'

import { useRouter } from 'next/navigation'
import { Skeleton } from 'boneyard-js/react'
import { useGlobe } from './GlobeContext'
import { formatDateRange } from '@/lib/formatDates'

export default function MobileTripList() {
  const router = useRouter()
  const { trips, setLockedTrip } = useGlobe()

  const handleSelect = (tripId: string, slug: string) => {
    setLockedTrip(tripId)
    router.push(`/globe?trip=${encodeURIComponent(slug)}`, { scroll: false })
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
      <ul className="w-full divide-y divide-gray-100 dark:divide-gray-900">
        {trips.map((trip) => (
          <li key={trip._id}>
            <button
              onClick={() => handleSelect(trip._id, trip.slug.current)}
              className="w-full px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer"
            >
              <p className="text-sm tracking-wide font-light text-black dark:text-white">
                {trip.title}
              </p>
              <p className="text-[10px] tracking-widest uppercase text-gray-400 dark:text-gray-500 mt-1">
                {formatDateRange(trip.startDate, trip.endDate)}
              </p>
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
    <ul className="w-full divide-y divide-gray-100 dark:divide-gray-900">
      {samples.map((s) => (
        <li key={s.title} className="px-5 py-4">
          <p className="text-sm tracking-wide font-light text-black dark:text-white">{s.title}</p>
          <p className="text-[10px] tracking-widest uppercase text-gray-400 dark:text-gray-500 mt-1">{s.range}</p>
        </li>
      ))}
    </ul>
  )
}
