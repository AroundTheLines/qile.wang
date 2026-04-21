'use client'

import { useGlobe } from './GlobeContext'
import GlobeDetailItem from './GlobeDetailItem'
import type { PinWithVisits } from '@/lib/types'
import type { GlobePinItem } from '@/lib/globe'

export default function GlobeDetailPanel({ pin }: { pin: PinWithVisits }) {
  const { selectPin } = useGlobe()

  // Flatten visits → items. The real pin panel (C3) will render per-visit
  // sections; this placeholder keeps the existing flat list shape so the
  // viewport keeps compiling until C3 lands.
  const items: GlobePinItem[] = pin.visits.flatMap((v) =>
    v.items.map((i) => ({
      _id: i._id,
      title: i.title,
      slug: i.slug,
      content_type: i.content_type,
      cover_image: i.cover_image,
      locationLabel: pin.location.name,
      year: v.startDate ? v.startDate.slice(0, 4) : undefined,
    })),
  )

  return (
    <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-2">
        <div>
          <h2 className="text-sm tracking-widest uppercase font-light text-black dark:text-white">
            {pin.location.name}
          </h2>
          <span className="text-[10px] tracking-widest uppercase text-gray-400 dark:text-gray-500">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        <button
          onClick={() => selectPin(null)}
          className="w-12 h-12 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white transition-colors text-lg cursor-pointer"
          aria-label="Close panel"
        >
          &times;
        </button>
      </div>

      {/* Item list — scrollable */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ overscrollBehavior: 'contain' }}
      >
        {items.map((item) => (
          <GlobeDetailItem key={item._id} item={item} />
        ))}
      </div>
    </div>
  )
}
