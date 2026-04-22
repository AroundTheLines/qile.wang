export const dynamic = 'force-dynamic'

import { readClient as client } from '@/lib/sanity'
import { allTripsQuery, allVisitsQuery, allTripsWithVisitsQuery } from '@/lib/queries'
import { aggregatePins, NAVBAR_HEIGHT_PX } from '@/lib/globe'
import type { TripSummary, TripWithVisits, VisitSummary } from '@/lib/types'
import GlobeProvider from '@/components/globe/GlobeProvider'
import GlobeNavbar from '@/components/globe/GlobeNavbar'
import GlobeViewport from '@/components/globe/GlobeViewport'
import Timeline from '@/components/globe/Timeline'

export default async function GlobeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Use allSettled so one query failing (e.g. the heavier tripsWithVisits
  // projection) doesn't blank the timeline + pins too. `fetchError` stays
  // true whenever any query fails so downstream UI can still surface a
  // degraded-state banner.
  const [tripsResult, visitsResult, tripsWithVisitsResult] = await Promise.allSettled([
    client.fetch<TripSummary[]>(allTripsQuery),
    client.fetch<VisitSummary[]>(allVisitsQuery),
    client.fetch<TripWithVisits[]>(allTripsWithVisitsQuery),
  ])
  const trips: TripSummary[] = tripsResult.status === 'fulfilled' ? tripsResult.value : []
  const visits: VisitSummary[] = visitsResult.status === 'fulfilled' ? visitsResult.value : []
  const tripsWithVisits: TripWithVisits[] =
    tripsWithVisitsResult.status === 'fulfilled' ? tripsWithVisitsResult.value : []
  const fetchError =
    tripsResult.status === 'rejected' ||
    visitsResult.status === 'rejected' ||
    tripsWithVisitsResult.status === 'rejected'
  const pins = aggregatePins(visits)

  return (
    <GlobeProvider
      trips={trips}
      pins={pins}
      tripsWithVisits={tripsWithVisits}
      fetchError={fetchError}
    >
      <GlobeNavbar />
      {/* Desktop/tablet only — spec §2. Mobile restructure (globe above
          timeline) is owned by E1. GlobeViewport uses `fixed inset-0`, so the
          timeline sits in a fixed layer above it to remain visible. */}
      <div
        className="hidden md:block fixed left-0 right-0 z-40 px-4"
        style={{ top: NAVBAR_HEIGHT_PX }}
      >
        <Timeline />
      </div>
      <GlobeViewport>{children}</GlobeViewport>
    </GlobeProvider>
  )
}
