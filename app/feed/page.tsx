export const dynamic = 'force-dynamic'

import { client } from '@/lib/sanity'
import { allContentQuery } from '@/lib/queries'
import type { ContentSummary } from '@/lib/types'
import Link from 'next/link'

export default async function FeedPage() {
  const items: ContentSummary[] = await client.fetch(allContentQuery)

  return (
    <main className="min-h-screen bg-white px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-xs tracking-widest uppercase text-gray-400 mb-12">Feed</h1>
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
  )
}
