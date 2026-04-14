'use client'

import { urlFor } from '@/lib/sanity'
import type { GlobePinItem } from '@/lib/globe'

export default function GlobeDetailItem({ item }: { item: GlobePinItem }) {
  const handleClick = () => {
    // Phase 5A stub — Phase 5B implements actual navigation
    console.log(`Navigate to: /${item.slug.current}`)
  }

  return (
    <button
      className="flex gap-3 p-3 w-full text-left hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0"
      onClick={handleClick}
    >
      {/* Thumbnail */}
      <div className="w-16 h-20 flex-shrink-0 bg-gray-100 overflow-hidden">
        {item.cover_image ? (
          <img
            src={urlFor(item.cover_image).width(128).height(160).url()}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {item.content_type === 'post' && (
              <span className="text-[8px] tracking-widest uppercase text-gray-300">
                Post
              </span>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col justify-center min-w-0">
        <span className="text-xs tracking-widest uppercase font-light text-black truncate">
          {item.title}
        </span>
        <span className="text-[10px] tracking-wide text-gray-400 mt-0.5">
          {item.locationLabel}
        </span>
        {item.year && (
          <span className="text-[10px] tracking-wide text-gray-300 mt-0.5">
            {item.year}
          </span>
        )}
        {item.content_type === 'post' && (
          <span className="text-[8px] tracking-widest uppercase text-gray-300 mt-1 border border-gray-200 px-1 py-0.5 w-fit">
            Post
          </span>
        )}
      </div>
    </button>
  )
}
