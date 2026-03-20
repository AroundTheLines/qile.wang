'use client'

// This thin Client Component exists solely so that next/dynamic with ssr: false
// is declared inside a Client Component — a Next.js requirement.
import dynamic from 'next/dynamic'
import type { ContentSummary } from '@/lib/types'

const WardrobeCarousel = dynamic(() => import('./WardrobeCarousel'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <p className="text-xs tracking-widest uppercase text-gray-200">Loading</p>
    </div>
  ),
})

export default function WardrobeShell({ items }: { items: ContentSummary[] }) {
  return <WardrobeCarousel items={items} />
}
