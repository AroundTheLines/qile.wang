export const dynamic = 'force-dynamic'

// readClient (not `client`): this dataset denies anonymous reads for trip
// docs, so the public client silently returns null and every slug 404s.
// Matches app/(globe)/layout.tsx.
import type { Metadata } from 'next'
import { readClient as client } from '@/lib/sanity'
import { tripBySlugQuery } from '@/lib/queries'
import type { TripArticle } from '@/lib/types'
import { notFound } from 'next/navigation'
import { formatDateRange } from '@/lib/formatDates'
import TripArticleContent from '@/components/globe/TripArticleContent'
import TripArticleReveal from '@/components/globe/TripArticleReveal'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const trip: TripArticle | null = await client.fetch(tripBySlugQuery, { slug })
  if (!trip || !trip._id) return {}
  const description =
    trip.startDate && trip.endDate
      ? `${formatDateRange(trip.startDate, trip.endDate)} · ${trip.visitCount} ${trip.visitCount === 1 ? 'visit' : 'visits'}`
      : undefined
  return {
    title: trip.title,
    description,
    openGraph: {
      title: trip.title,
      ...(description ? { description } : {}),
      type: 'article',
    },
    twitter: {
      card: 'summary',
      title: trip.title,
      ...(description ? { description } : {}),
    },
  }
}

export default async function TripArticlePage({ params }: Props) {
  const { slug } = await params
  const trip: TripArticle | null = await client.fetch(tripBySlugQuery, { slug })
  // GROQ projects `null { ... }` into an all-null object, so `!trip` alone
  // misses the missing-slug case. `trip._id` is the authoritative signal.
  if (!trip || !trip._id) return notFound()

  return (
    <TripArticleReveal tripId={trip._id}>
      <TripArticleContent trip={trip} />
    </TripArticleReveal>
  )
}
