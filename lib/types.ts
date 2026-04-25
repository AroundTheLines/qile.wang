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

// --- Phase 5C: trips / visits / locations ---

export interface LocationDoc {
  _id: string
  name: string
  coordinates: Coordinates
  slug?: { current: string }
}

// Trips returned from `allTripsQuery` and `allTripsWithVisitsQuery` are
// filtered to those with ≥1 visit, so startDate / endDate are always present.
export interface TripSummary {
  _id: string
  title: string
  slug: { current: string }
  startDate: string
  endDate: string
  visitCount: number
  hasArticle: boolean
}

export interface Trip extends TripSummary {
  articleBody?: PortableTextBlock[]
}

/**
 * Slim item shape returned by visit projections. Narrower than `ContentSummary`
 * because visit → item projections omit `published_at` and other fields the
 * pin/trip panels (§7.1, §7.2) don't need. Keeps the type honest against the
 * actual GROQ shape.
 */
export interface VisitItemSummary {
  _id: string
  title: string
  slug: { current: string }
  content_type: ContentType
  cover_image?: SanityImage
  tags?: string[]
}

export interface VisitSummary {
  _id: string
  startDate: string
  endDate: string
  location: LocationDoc
  trip: { _id: string; title: string; slug: { current: string } }
  items: VisitItemSummary[]
}

/** Alias for the canonical visit shape returned by `allVisitsQuery`. */
export type Visit = VisitSummary

/** Visits returned embedded inside TripWithVisits do not repeat the trip ref. */
export interface VisitInTrip {
  _id: string
  startDate: string
  endDate: string
  location: LocationDoc
  items: VisitItemSummary[]
}

export interface TripWithVisits extends Trip {
  visits: VisitInTrip[]
}

// `tripBySlugQuery` permits zero-visit (article-only) trips, so the date /
// count fields can be missing. Distinct from TripWithVisits to keep the
// list-side guarantees tight.
export interface TripArticle {
  _id: string
  title: string
  slug: { current: string }
  articleBody?: PortableTextBlock[]
  hasArticle: boolean
  visits: VisitInTrip[]
  startDate?: string
  endDate?: string
  visitCount: number
}

export interface PinWithVisits {
  location: LocationDoc
  visits: VisitSummary[]
  coordinates: Coordinates
  visitCount: number
  tripIds: string[]
}
