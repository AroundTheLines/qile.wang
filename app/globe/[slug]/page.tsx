export const dynamic = 'force-dynamic'

import { client } from '@/lib/sanity'
import { contentBySlugQuery } from '@/lib/queries'
import type { ContentFull } from '@/lib/types'
import { notFound, redirect } from 'next/navigation'
import ArticleContent from '@/components/ArticleContent'
import GlobeArticleReveal from '@/components/globe/GlobeArticleReveal'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function GlobeArticlePage({ params }: Props) {
  const { slug } = await params
  const item: ContentFull | null = await client.fetch(contentBySlugQuery, { slug })
  if (!item) return notFound()

  const hasGlobePin = item.locations?.some((l) => l.globe_group)
  if (!hasGlobePin) redirect(`/${slug}`)

  return (
    <GlobeArticleReveal>
      <ArticleContent item={item} globe />
    </GlobeArticleReveal>
  )
}
