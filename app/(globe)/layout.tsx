export const dynamic = 'force-dynamic'

import '@/bones/registry'
import { readClient as client } from '@/lib/sanity'
import { allVisitsQuery, allTripsWithVisitsQuery } from '@/lib/queries'
import { aggregatePins } from '@/lib/globe'
import type { TripSummary, TripWithVisits, VisitSummary } from '@/lib/types'
import GlobeProvider from '@/components/globe/GlobeProvider'
import GlobeNavbar from '@/components/globe/GlobeNavbar'
import GlobeViewport from '@/components/globe/GlobeViewport'
import TimelineOverlay from '@/components/globe/TimelineOverlay'

export default async function GlobeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Use allSettled so one query failing doesn't blank the others — e.g. if
  // the visits query fails, the timeline still renders (no pins) instead of
  // blanking the page.
  // The light `allTripsQuery` was eliminated; `TripSummary` is derived from
  // tripsWithVisits below since TripWithVisits is a superset.
  const [visitsResult, tripsWithVisitsResult] = await Promise.allSettled([
    client.fetch<VisitSummary[]>(allVisitsQuery),
    client.fetch<TripWithVisits[]>(allTripsWithVisitsQuery),
  ])
  const visits: VisitSummary[] = visitsResult.status === 'fulfilled' ? visitsResult.value : []
  const tripsWithVisits: TripWithVisits[] =
    tripsWithVisitsResult.status === 'fulfilled' ? tripsWithVisitsResult.value : []
  const trips: TripSummary[] = tripsWithVisits.map((t) => ({
    _id: t._id,
    title: t.title,
    slug: t.slug,
    hasArticle: t.hasArticle,
    startDate: t.startDate,
    endDate: t.endDate,
    visitCount: t.visitCount,
  }))
  const fetchError =
    visitsResult.status === 'rejected' || tripsWithVisitsResult.status === 'rejected'
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
          timeline sits in a fixed layer above it to remain visible. The
          overlay hides itself while an article sliver is open. */}
      <TimelineOverlay />
      <GlobeViewport>{children}</GlobeViewport>
    </GlobeProvider>
  )
}
