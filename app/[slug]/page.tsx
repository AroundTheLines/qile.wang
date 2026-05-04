export const dynamic = 'force-dynamic'

import { client } from '@/lib/sanity'
import { contentBySlugQuery } from '@/lib/queries'
import type { ContentFull } from '@/lib/types'
import { notFound } from 'next/navigation'
import Navbar from '@/components/Navbar'
import ArticleContent from '@/components/ArticleContent'

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
      <main className="min-h-screen bg-white pt-12">
        <ArticleContent item={item} visits={item.visits} />
      </main>
    </>
  )
}
