'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { urlFor } from '@/lib/sanity'
import type { SanityImage } from '@/lib/types'

interface ArticleCarouselProps {
  images: SanityImage[]
  alt?: string
}

export default function ArticleCarousel({ images, alt = '' }: ArticleCarouselProps) {
  const trackRef = useRef<HTMLUListElement | null>(null)
  const slideRefs = useRef<(HTMLLIElement | null)[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (images.length < 2) return
    const track = trackRef.current
    if (!track) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const i = slideRefs.current.findIndex((el) => el === entry.target)
            if (i !== -1) setActive(i)
          }
        }
      },
      { root: track, threshold: 0.6 },
    )
    for (const el of slideRefs.current) {
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [images.length])

  if (images.length === 0) return null

  if (images.length === 1) {
    const img = images[0]
    return (
      <section className="mt-12">
        <div className="relative w-full aspect-[4/3] overflow-hidden rounded-sm">
          <Image
            src={urlFor(img).width(1200).url()}
            alt={alt}
            fill
            className="object-cover"
            sizes="(max-width: 672px) 100vw, 672px"
          />
        </div>
      </section>
    )
  }

  const scrollTo = (i: number) => {
    const el = slideRefs.current[i]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  const prev = () => scrollTo(Math.max(0, active - 1))
  const next = () => scrollTo(Math.min(images.length - 1, active + 1))

  return (
    <section
      className="mt-12 relative group"
      role="region"
      aria-roledescription="carousel"
    >
      <ul
        ref={trackRef}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((img, i) => (
          <li
            key={img.asset?._ref ?? i}
            ref={(el) => { slideRefs.current[i] = el }}
            className="snap-center shrink-0 w-full"
            aria-roledescription="slide"
            aria-label={`Image ${i + 1} of ${images.length}`}
          >
            <div className="relative w-full aspect-[4/3] overflow-hidden rounded-sm">
              <Image
                src={urlFor(img).width(1200).url()}
                alt={alt}
                fill
                className="object-cover"
                sizes="(max-width: 672px) 100vw, 672px"
              />
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={prev}
        disabled={active === 0}
        aria-label="Previous image"
        className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 items-center justify-center w-9 h-9 rounded-full bg-white/80 dark:bg-black/80 backdrop-blur text-black dark:text-white shadow opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 disabled:pointer-events-none"
      >
        <span aria-hidden>{'←'}</span>
      </button>
      <button
        type="button"
        onClick={next}
        disabled={active === images.length - 1}
        aria-label="Next image"
        className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 items-center justify-center w-9 h-9 rounded-full bg-white/80 dark:bg-black/80 backdrop-blur text-black dark:text-white shadow opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 disabled:pointer-events-none"
      >
        <span aria-hidden>{'→'}</span>
      </button>

      <div className="flex justify-center gap-1.5 mt-3">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => scrollTo(i)}
            aria-label={`Go to image ${i + 1}`}
            className={
              'h-1.5 w-1.5 rounded-full transition-colors ' +
              (active === i
                ? 'bg-gray-700 dark:bg-gray-200'
                : 'bg-gray-300 dark:bg-gray-700')
            }
          />
        ))}
      </div>
    </section>
  )
}
