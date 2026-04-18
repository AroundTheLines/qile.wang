'use client'

import { useRouter } from 'next/navigation'
import { urlFor } from '@/lib/sanity'
import type { GlobePinItem } from '@/lib/globe'

export default function GlobeDetailItem({ item }: { item: GlobePinItem }) {
  const router = useRouter()

  const handleClick = () => {
    // Always route through /globe/[slug] so the GlobeLayout stays mounted and
    // browser back returns to the panel state the user came from. On mobile,
    // GlobeViewport's article-open branch renders the article full-screen.
    router.push(`/globe/${item.slug.current}`, { scroll: false })
  }

  return (
    <button
      className="flex gap-3 p-3 w-full text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer border-b border-gray-100 dark:border-gray-900 last:border-b-0"
      onClick={handleClick}
    >
      {/* Thumbnail */}
      <div className="w-16 h-20 flex-shrink-0 bg-gray-100 dark:bg-gray-900 overflow-hidden">
        {item.cover_image ? (
          <img
            src={urlFor(item.cover_image).width(128).height(160).url()}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {item.content_type === 'post' && (
              <span className="text-[8px] tracking-widest uppercase text-gray-300 dark:text-gray-600">
                Post
              </span>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col justify-center min-w-0">
        <span className="text-xs tracking-widest uppercase font-light text-black dark:text-white truncate">
          {item.title}
        </span>
        <span className="text-[10px] tracking-wide text-gray-400 dark:text-gray-500 mt-0.5">
          {item.locationLabel}
        </span>
        {item.year && (
          <span className="text-[10px] tracking-wide text-gray-300 dark:text-gray-600 mt-0.5">
            {item.year}
          </span>
        )}
        {item.content_type === 'post' && (
          <span className="text-[8px] tracking-widest uppercase text-gray-300 dark:text-gray-600 mt-1 border border-gray-200 dark:border-gray-800 px-1 py-0.5 w-fit">
            Post
          </span>
        )}
      </div>
    </button>
  )
}
