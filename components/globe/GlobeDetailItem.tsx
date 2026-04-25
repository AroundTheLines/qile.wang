'use client'

import { useRouter } from 'next/navigation'
import { urlFor } from '@/lib/sanity'
import type { VisitItemSummary } from '@/lib/types'

export default function GlobeDetailItem({ item }: { item: VisitItemSummary }) {
  const router = useRouter()

  const handleClick = () => {
    // Always route through /globe/[slug] so the GlobeLayout stays mounted and
    // browser back returns to the panel state the user came from. On mobile,
    // GlobeViewport's article-open branch renders the article full-screen.
    router.push(`/globe/${item.slug.current}`, { scroll: false })
  }

  return (
    <button
      className="flex gap-3 px-4 py-2 w-full text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer"
      onClick={handleClick}
    >
      <div className="w-16 h-20 flex-shrink-0 bg-gray-100 dark:bg-gray-900 overflow-hidden">
        {item.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
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

      <div className="flex flex-col justify-center min-w-0">
        <span className="text-xs tracking-widest uppercase font-light text-black dark:text-white truncate">
          {item.title}
        </span>
        {item.content_type === 'post' && (
          <span className="text-[8px] tracking-widest uppercase text-gray-300 dark:text-gray-600 mt-1 border border-gray-200 dark:border-gray-800 px-1 py-0.5 w-fit">
            Post
          </span>
        )}
      </div>
    </button>
  )
}
