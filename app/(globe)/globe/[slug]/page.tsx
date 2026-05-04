export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { readClient, urlFor } from '@/lib/sanity'
import { contentBySlugQuery } from '@/lib/queries'
import type { ContentFull } from '@/lib/types'
import { notFound } from 'next/navigation'
import ArticleContent from '@/components/ArticleContent'
import GlobeArticleReveal from '@/components/globe/GlobeArticleReveal'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const item: ContentFull | null = await readClient.fetch(contentBySlugQuery, { slug })
  if (!item) return {}
  const ogImage = item.cover_image
    ? urlFor(item.cover_image).width(1200).height(630).fit('crop').url()
    : undefined
  return {
    title: item.title,
    openGraph: {
      title: item.title,
      type: 'article',
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: item.title,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

export default async function GlobeArticlePage({ params }: Props) {
  const { slug } = await params
  const item: ContentFull | null = await readClient.fetch(contentBySlugQuery, { slug })
  if (!item) return notFound()

  // Phase 5C: globe membership is determined by visits referencing this
  // item (see allVisitsQuery → PinWithVisits aggregation), not by the
  // embedded `globe_group` string. Items reached via /globe/<slug> are
  // already routed here from the globe sliver, so we no longer need the
  // pre-route guard; the parent layout's data fetch filters to items
  // that belong on the globe.
  void slug

  return (
    <GlobeArticleReveal>
      <ArticleContent item={item} globe />
    </GlobeArticleReveal>
  )
}
