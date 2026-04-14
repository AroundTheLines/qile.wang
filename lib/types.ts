import type { PortableTextBlock } from 'sanity'
import type { SanityImageObject } from '@sanity/image-url'

export type ContentType = 'item' | 'post'

// Alias Sanity's own image type so urlFor() accepts it without casting
export type SanityImage = SanityImageObject & {
  hotspot?: { x: number; y: number; height: number; width: number }
}

export interface Coordinates {
  lat: number
  lng: number
}

export interface Location {
  label: string
  coordinates: Coordinates
  sort_date?: string
  date_label?: string
  body?: PortableTextBlock[]
  images?: SanityImage[]
  globe_group?: string
}

export interface ContentSummary {
  _id: string
  title: string
  slug: { current: string }
  content_type: ContentType
  cover_image?: SanityImage
  tags?: string[]
  published_at: string
  acquired_at?: string
}

export interface ContentFull extends ContentSummary {
  body: PortableTextBlock[]
  gallery?: SanityImage[]
  locations?: Location[]
  acquisition?: { location_index?: number }
}
