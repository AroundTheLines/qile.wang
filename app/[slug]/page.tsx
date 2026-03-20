export const dynamic = 'force-dynamic'

import { client } from '@/lib/sanity'
import { contentBySlugQuery } from '@/lib/queries'
import type { ContentFull } from '@/lib/types'
import { notFound } from 'next/navigation'
import Navbar from '@/components/Navbar'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const item: ContentFull | null = await client.fetch(contentBySlugQuery, { slug })

  if (!item) return notFound()

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white px-6 pt-24 pb-16 max-w-2xl mx-auto">
      {/* Navbar icon transition target will mount here — Phase 4 */}
      <span className="text-xs tracking-widest uppercase text-gray-300">{item.content_type}</span>
      <h1 className="text-3xl font-light text-black mt-2 mb-12">{item.title}</h1>

      {/* Body — Phase 3 will render PortableText properly */}
      <div className="text-gray-600 text-base leading-relaxed">
        {item.body ? (
          <p className="text-xs text-gray-300 tracking-widest uppercase">Body content renders here.</p>
        ) : null}
      </div>

      {/* Location timeline — Phase 3 */}
      {item.locations && item.locations.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xs tracking-widest uppercase text-gray-300 mb-6">Locations</h2>
          <ul className="flex flex-col gap-4">
            {item.locations.map((loc, i) => (
              <li key={i} className="flex flex-col gap-1">
                <span className="text-sm font-light">{loc.label}</span>
                <span className="text-xs text-gray-400">
                  {loc.date_label ?? loc.sort_date ?? ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      </main>
    </>
  )
}
