'use client'

import Timeline from './Timeline'
import { useGlobe } from './GlobeContext'
import { NAVBAR_HEIGHT_PX } from '@/lib/globe'

/**
 * Desktop/tablet timeline overlay. Hidden while an article sliver is open
 * (item article at /globe/<slug> or trip article at /trip/<slug>) so it
 * doesn't paint over the article body — the layout previously left it
 * visible and it punched through the top of the article region.
 */
export default function TimelineOverlay() {
  const { layoutState } = useGlobe()
  if (layoutState === 'article-open') return null
  return (
    <div
      className="hidden md:block fixed left-0 right-0 z-40 px-4"
      style={{ top: NAVBAR_HEIGHT_PX }}
    >
      <Timeline />
    </div>
  )
}
