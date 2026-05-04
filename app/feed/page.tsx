export const dynamic = 'force-dynamic'

import { readClient as client } from '@/lib/sanity'
import { allContentQuery } from '@/lib/queries'
import type { ContentSummary } from '@/lib/types'
import Link from 'next/link'
import Navbar from '@/components/Navbar'

export default async function FeedPage() {
  const items: ContentSummary[] = await client.fetch(allContentQuery)

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white px-6 pt-24 pb-16 max-w-2xl lg:max-w-4xl xl:max-w-6xl 2xl:max-w-[70vw] mx-auto">
      <ul className="flex flex-col gap-8">
        {items.map((item) => (
          <li key={item._id}>
            <Link href={`/${item.slug.current}`} className="group flex flex-col gap-1">
              <span className="text-xs tracking-widest uppercase text-gray-300">
                {item.content_type}
              </span>
              <span className="text-lg font-light text-black group-hover:opacity-50 transition-opacity">
                {item.title}
              </span>
              {item.tags && item.tags.length > 0 && (
                <span className="text-xs text-gray-400">{item.tags.join(', ')}</span>
              )}
            </Link>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-xs tracking-widest uppercase text-gray-300">No content yet.</li>
        )}
      </ul>
      </main>
    </>
  )
}
