export const dynamic = 'force-dynamic'

import { readClient as client } from '@/lib/sanity'
import { wardrobeContentQuery } from '@/lib/queries'
import type { ContentSummary } from '@/lib/types'
import WardrobeProvider from '@/components/wardrobe/WardrobeProvider'

// Server Component: data fetch + forwarding. The wardrobe-only navbar,
// the carousel, the transit element, and the bottom scrim are all
// rendered inside WardrobeProvider, which is a Client Component.
export default async function WardrobeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const items: ContentSummary[] = await client.fetch(wardrobeContentQuery)

  return <WardrobeProvider items={items}>{children}</WardrobeProvider>
}
