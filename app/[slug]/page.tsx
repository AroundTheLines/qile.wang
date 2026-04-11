export const dynamic = 'force-dynamic'

import { client } from '@/lib/sanity'
import { contentBySlugQuery } from '@/lib/queries'
import type { ContentFull } from '@/lib/types'
import { notFound } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { PortableText } from '@portabletext/react'
import type { PortableTextComponents } from '@portabletext/react'

interface Props {
  params: Promise<{ slug: string }>
}

const portableTextComponents: PortableTextComponents = {
  block: {
    normal: ({ children }) => (
      <p className="text-gray-600 text-base font-light leading-relaxed mb-6">{children}</p>
    ),
    h2: ({ children }) => (
      <h2 className="text-xs tracking-widest uppercase text-gray-300 mt-12 mb-4">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-sm font-light text-gray-400 mt-8 mb-3">{children}</h3>
    ),
  },
  list: {
    bullet: ({ children }) => (
      <ul className="mb-6 flex flex-col gap-2 pl-0">{children}</ul>
    ),
    number: ({ children }) => (
      <ol className="mb-6 flex flex-col gap-2 pl-0 list-decimal list-inside">{children}</ol>
    ),
  },
  listItem: {
    bullet: ({ children }) => (
      <li className="text-gray-600 text-base font-light leading-relaxed flex gap-3">
        <span className="text-gray-300 select-none">—</span>
        <span>{children}</span>
      </li>
    ),
  },
  marks: {
    strong: ({ children }) => <strong className="font-medium text-gray-800">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
  },
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

        {item.body?.length > 0 && (
          <div>
            <PortableText value={item.body} components={portableTextComponents} />
          </div>
        )}

        {/* Location timeline */}
        {item.locations && item.locations.length > 0 && (
          <section className="mt-16 border-t border-gray-100 pt-12">
            <h2 className="text-xs tracking-widest uppercase text-gray-300 mb-6">Locations</h2>
            <ul className="flex flex-col gap-6">
              {item.locations.map((loc, i) => (
                <li key={i} className="flex flex-col gap-1">
                  <span className="text-sm font-light text-gray-800">{loc.label}</span>
                  <span className="text-xs text-gray-400">
                    {loc.date_label ?? loc.sort_date ?? ''}
                  </span>
                  {loc.body && loc.body.length > 0 && (
                    <div className="mt-2">
                      <PortableText value={loc.body} components={portableTextComponents} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  )
}
