export const dynamic = 'force-dynamic'

import { client } from '@/lib/sanity'
import { wardrobeContentQuery } from '@/lib/queries'
import type { ContentSummary } from '@/lib/types'

export default async function WardrobePage() {
  const items: ContentSummary[] = await client.fetch(wardrobeContentQuery)

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center">
      {/* Wardrobe arc component will live here — Phase 2 */}
      <p className="text-xs tracking-widest uppercase text-gray-300">
        {items.length} items — wardrobe coming soon
      </p>
    </main>
  )
}
