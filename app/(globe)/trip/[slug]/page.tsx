export const dynamic = 'force-dynamic'

// readClient (not `client`): this dataset denies anonymous reads for trip
// docs, so the public client silently returns null and every slug 404s.
// Matches app/(globe)/layout.tsx.
import { readClient as client } from '@/lib/sanity'
import { tripBySlugQuery } from '@/lib/queries'
import type { TripWithVisits } from '@/lib/types'
import { notFound } from 'next/navigation'
import TripArticleContent from '@/components/globe/TripArticleContent'
import TripArticleReveal from '@/components/globe/TripArticleReveal'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function TripArticlePage({ params }: Props) {
  const { slug } = await params
  const trip: TripWithVisits | null = await client.fetch(tripBySlugQuery, { slug })
  if (!trip) return notFound()

  return (
    <TripArticleReveal tripId={trip._id}>
      <TripArticleContent trip={trip} />
    </TripArticleReveal>
  )
}
