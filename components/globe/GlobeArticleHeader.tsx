import type { ContentFull } from '@/lib/types'

export default function GlobeArticleHeader({ item }: { item: ContentFull }) {
  return (
    <>
      <span className="text-xs tracking-widest uppercase text-gray-300 dark:text-gray-600">
        {item.content_type}
      </span>
      <span className="text-xs text-gray-300 dark:text-gray-600 mt-1 block">
        {new Date(item.published_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
        {item.acquired_at
          ? ` · acquired ${new Date(item.acquired_at).getFullYear()}`
          : ''}
      </span>
      <h1 className="text-3xl font-light text-black dark:text-white mt-2 mb-6">
        {item.title}
      </h1>
    </>
  )
}
