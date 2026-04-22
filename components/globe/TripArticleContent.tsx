import { PortableText } from '@portabletext/react'
import type { TripWithVisits } from '@/lib/types'
import { portableTextComponents } from '@/lib/portableTextComponents'
import { formatDateRange } from '@/lib/formatDates'

interface Props {
  trip: TripWithVisits
}

export default function TripArticleContent({ trip }: Props) {
  const hasBody = trip.articleBody && trip.articleBody.length > 0

  return (
    <div className="w-full px-6 pt-0 pb-16 max-w-xl mx-auto">
      <p className="text-xs tracking-widest uppercase text-gray-400 dark:text-gray-500">
        {formatDateRange(trip.startDate, trip.endDate)} · {trip.visitCount}{' '}
        {trip.visitCount === 1 ? 'visit' : 'visits'}
      </p>
      <h1 className="text-3xl font-light text-black dark:text-white mt-2 mb-8">
        {trip.title}
      </h1>

      {hasBody ? (
        <div>
          <PortableText value={trip.articleBody!} components={portableTextComponents} />
        </div>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No content yet for this trip.
        </p>
      )}
    </div>
  )
}
