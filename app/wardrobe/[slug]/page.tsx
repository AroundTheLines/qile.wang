import { readClient as client } from '@/lib/sanity'
import { contentBySlugQuery } from '@/lib/queries'
import type { ContentFull } from '@/lib/types'
import { notFound } from 'next/navigation'
import ArticleContent from '@/components/ArticleContent'
import ArticleReveal from '@/components/ArticleReveal'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function WardrobeArticlePage({ params }: Props) {
  const { slug } = await params
  const item: ContentFull | null = await client.fetch(contentBySlugQuery, { slug })
  if (!item) return notFound()

  return (
    <div className="w-full mt-20">
      <ArticleReveal>
        <ArticleContent item={item} wardrobe visits={item.visits} />
      </ArticleReveal>
    </div>
  )
}
