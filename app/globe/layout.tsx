export const dynamic = 'force-dynamic'

import { client } from '@/lib/sanity'
import { allTripsQuery, allVisitsQuery } from '@/lib/queries'
import { aggregatePins } from '@/lib/globe'
import type { TripSummary, VisitSummary, PinWithVisits } from '@/lib/types'
import GlobeProvider from '@/components/globe/GlobeProvider'
import GlobeNavbar from '@/components/globe/GlobeNavbar'
import GlobeViewport from '@/components/globe/GlobeViewport'
import Timeline from '@/components/globe/Timeline'

export default async function GlobeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [tripsResult, visitsResult] = await Promise.allSettled([
    client.fetch<TripSummary[]>(allTripsQuery),
    client.fetch<VisitSummary[]>(allVisitsQuery),
  ])

  const trips: TripSummary[] =
    tripsResult.status === 'fulfilled' ? tripsResult.value : []
  const visits: VisitSummary[] =
    visitsResult.status === 'fulfilled' ? visitsResult.value : []
  const fetchError =
    tripsResult.status === 'rejected' || visitsResult.status === 'rejected'

  const pins: PinWithVisits[] = aggregatePins(visits)

  // Zero-visit trips come back with null startDate/endDate (spec §1.4). The
  // timeline needs valid ranges, so drop them here. Filter client-side so the
  // queries remain reusable for contexts that want zero-visit trips.
  const validTrips = trips.filter((t) => t.startDate && t.endDate)

  const timelineTrips = validTrips.map((t) => ({
    id: t.slug.current,
    title: t.title,
    startDate: t.startDate,
    endDate: t.endDate,
  }))

  return (
    <GlobeProvider trips={validTrips} pins={pins} fetchError={fetchError}>
      <GlobeNavbar />
      {/* TODO(E1): move timeline below globe on mobile. */}
      <Timeline trips={timelineTrips} />
      <GlobeViewport>{children}</GlobeViewport>
    </GlobeProvider>
  )
}
