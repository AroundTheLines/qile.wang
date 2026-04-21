export const dynamic = 'force-dynamic'

import { readClient as client } from '@/lib/sanity'
import { allTripsQuery, allVisitsQuery } from '@/lib/queries'
import { aggregatePins } from '@/lib/globe'
import type { TripSummary, VisitSummary } from '@/lib/types'
import GlobeProvider from '@/components/globe/GlobeProvider'
import GlobeNavbar from '@/components/globe/GlobeNavbar'
import GlobeViewport from '@/components/globe/GlobeViewport'

export default async function GlobeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let trips: TripSummary[] = []
  let visits: VisitSummary[] = []
  let fetchError = false
  try {
    ;[trips, visits] = await Promise.all([
      client.fetch<TripSummary[]>(allTripsQuery),
      client.fetch<VisitSummary[]>(allVisitsQuery),
    ])
  } catch {
    fetchError = true
  }
  const pins = aggregatePins(visits)

  return (
    <GlobeProvider trips={trips} pins={pins} fetchError={fetchError}>
      <GlobeNavbar />
      <GlobeViewport>{children}</GlobeViewport>
    </GlobeProvider>
  )
}
