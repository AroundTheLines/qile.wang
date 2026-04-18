export const dynamic = 'force-dynamic'

import { client } from '@/lib/sanity'
import { globeContentQuery } from '@/lib/queries'
import { groupPins, type GlobeContentItem } from '@/lib/globe'
import GlobeProvider from '@/components/globe/GlobeProvider'
import GlobeNavbar from '@/components/globe/GlobeNavbar'
import GlobeViewport from '@/components/globe/GlobeViewport'

export default async function GlobeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const content: GlobeContentItem[] = await client.fetch(globeContentQuery)
  const pins = groupPins(content)

  return (
    <GlobeProvider pins={pins}>
      <GlobeNavbar />
      <GlobeViewport>{children}</GlobeViewport>
    </GlobeProvider>
  )
}
