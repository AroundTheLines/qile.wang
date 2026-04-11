export const dynamic = 'force-dynamic'

import { client } from '@/lib/sanity'
import { wardrobeContentQuery } from '@/lib/queries'
import type { ContentSummary } from '@/lib/types'
import WardrobeShell from '@/components/wardrobe/WardrobeShell'
import Navbar from '@/components/Navbar'

export default async function WardrobePage() {
  const items: ContentSummary[] = await client.fetch(wardrobeContentQuery)

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white flex flex-col items-center pt-12">
        <WardrobeShell items={items} />
      </main>
    </>
  )
}
