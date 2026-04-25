import type { PortableTextComponents } from '@portabletext/react'
import Image from 'next/image'
import { urlFor } from './sanity'
import type { SanityImage } from './types'

interface InlineImageValue extends SanityImage {
  alt?: string
  caption?: string
}

// Sanity asset _ref encodes intrinsic dimensions:
//   `image-<sha>-<width>x<height>-<format>` (e.g. `image-abc123-2000x3000-jpg`).
// We parse the ref so next/image can reserve the correct aspect ratio
// without forcing every image into a hardcoded 1.5:1 box (which would
// squish portrait shots).
function dimensionsFromRef(ref: string | undefined): { width: number; height: number } {
  const fallback = { width: 1200, height: 800 }
  if (!ref) return fallback
  const match = ref.match(/-(\d+)x(\d+)-/)
  if (!match) return fallback
  const w = Number(match[1])
  const h = Number(match[2])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w === 0 || h === 0) return fallback
  return { width: w, height: h }
}

export const portableTextComponents: PortableTextComponents = {
  types: {
    image: ({ value }: { value: InlineImageValue }) => {
      if (!value?.asset) return null
      const url = urlFor(value).width(1200).fit('max').auto('format').url()
      const alt = value.alt ?? value.caption ?? ''
      const { width, height } = dimensionsFromRef(
        (value.asset as { _ref?: string })._ref,
      )
      return (
        <figure className="my-8">
          <Image
            src={url}
            alt={alt}
            width={width}
            height={height}
            sizes="(max-width: 768px) 100vw, 720px"
            className="w-full h-auto"
          />
          {value.caption ? (
            <figcaption className="text-xs tracking-widest uppercase text-gray-400 mt-2">
              {value.caption}
            </figcaption>
          ) : null}
        </figure>
      )
    },
  },
  block: {
    normal: ({ children }) => (
      <p className="text-gray-600 text-base font-light leading-relaxed mb-6 text-justify hyphens-auto">{children}</p>
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
