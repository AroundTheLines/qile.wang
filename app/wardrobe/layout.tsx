export const dynamic = 'force-dynamic'

import Navbar from '@/components/Navbar'
import { client } from '@/lib/sanity'
import { wardrobeContentQuery } from '@/lib/queries'
import type { ContentSummary } from '@/lib/types'
import WardrobeShell from '@/components/wardrobe/WardrobeShell'
import '@/bones/registry'

export default async function WardrobeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const items: ContentSummary[] = await client.fetch(wardrobeContentQuery)

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white flex flex-col items-center pt-12">
        <WardrobeShell items={items} />
        {children}
      </main>
      {/* Scroll cue: fades out content at the bottom edge of the viewport */}
      <div
        className="fixed bottom-0 left-0 right-0 h-24 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, white)' }}
      />
    </>
  )
}
