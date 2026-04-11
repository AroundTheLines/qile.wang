import Image from 'next/image'
import { PortableText } from '@portabletext/react'
import type { ContentFull } from '@/lib/types'
import { urlFor } from '@/lib/sanity'
import { portableTextComponents } from '@/lib/portableTextComponents'

interface ArticleContentProps {
  item: ContentFull
  wardrobe?: boolean
}

export default function ArticleContent({ item, wardrobe = false }: ArticleContentProps) {
  return (
    <div className="w-full px-6 pt-0 pb-16 max-w-2xl mx-auto">

      {/* Cover image — hidden in wardrobe mode (shown in carousel instead) */}
      {!wardrobe && item.cover_image && (
        <div className="relative w-full aspect-[3/2] mb-10 overflow-hidden rounded-sm">
          <Image
            src={urlFor(item.cover_image).width(1200).url()}
            alt={item.title}
            fill
            className="object-cover"
            sizes="(max-width: 672px) 100vw, 672px"
            priority
          />
        </div>
      )}

      {/* Header metadata cluster — hidden in wardrobe mode (shown in museum label instead) */}
      {!wardrobe && (
        <>
          <span className="text-xs tracking-widest uppercase text-gray-300">{item.content_type}</span>
          <span className="text-xs text-gray-300 mt-1 block">
            {new Date(item.published_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
            {item.acquired_at
              ? ` · acquired ${new Date(item.acquired_at).getFullYear()}`
              : ''}
          </span>
          <h1 className="text-3xl font-light text-black mt-2 mb-6">{item.title}</h1>
        </>
      )}

      {/* Tags — hidden in wardrobe mode (shown in museum label instead) */}
      {!wardrobe && item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-10">
          {item.tags.map((tag) => (
            <span key={tag} className="text-xs tracking-widest uppercase text-gray-300 border border-gray-200 px-2 py-1">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Article body */}
      {item.body?.length > 0 && (
        <div>
          <PortableText value={item.body} components={portableTextComponents} />
        </div>
      )}

      {/* Gallery */}
      {item.gallery && item.gallery.length > 0 && (
        <section className="mt-12 flex flex-col gap-4">
          {item.gallery.map((img, i) => (
            <div key={img.asset?._ref ?? i} className="relative w-full aspect-[4/3] overflow-hidden rounded-sm">
              <Image
                src={urlFor(img).width(1200).url()}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 672px) 100vw, 672px"
              />
            </div>
          ))}
        </section>
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
                {/* Location images */}
                {loc.images && loc.images.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {loc.images.map((img, j) => (
                      <div key={img.asset?._ref ?? j} className="relative shrink-0 w-32 h-24 overflow-hidden rounded-sm">
                        <Image
                          src={urlFor(img).width(320).url()}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="128px"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  )
}
