import { groq } from 'next-sanity'

export const allContentQuery = groq`
  *[_type == "content"] | order(published_at desc) {
    _id,
    title,
    slug,
    content_type,
    cover_image,
    tags,
    published_at,
    "acquired_at": locations | order(sort_date asc)[0].sort_date,
  }
`

export const contentBySlugQuery = groq`
  *[_type == "content" && slug.current == $slug][0] {
    _id,
    title,
    slug,
    content_type,
    body,
    cover_image,
    gallery,
    tags,
    published_at,
    "acquired_at": locations | order(sort_date asc)[0].sort_date,
    acquisition,
    locations[] | order(sort_date asc) {
      label,
      coordinates,
      sort_date,
      date_label,
      body,
      images,
    },
  }
`

export const wardrobeContentQuery = groq`
  *[_type == "content" && content_type == "item"] | order(published_at desc) {
    _id,
    title,
    slug,
    content_type,
    cover_image,
    tags,
    published_at,
    "acquired_at": locations | order(sort_date asc)[0].sort_date,
  }
`

// Projection fragment for visit items. Narrower than ContentSummary —
// matches VisitItemSummary in lib/types.ts.
const visitItemProjection = `{
  _id,
  title,
  slug,
  content_type,
  cover_image,
  tags
}`

// Two-stage projection: fetch visits once into `__v`, then derive
// startDate/endDate/visitCount from that array instead of re-running
// references(^._id) for each aggregate.
export const allTripsQuery = groq`
  *[_type == "trip"] {
    _id,
    title,
    slug,
    "hasArticle": defined(articleBody) && length(articleBody) > 0,
    "__v": *[_type == "visit" && references(^._id)] { startDate, endDate }
  } {
    _id,
    title,
    slug,
    hasArticle,
    "startDate": __v | order(startDate asc)[0].startDate,
    "endDate":   __v | order(endDate desc)[0].endDate,
    "visitCount": count(__v),
  } | order(startDate desc)
`

export const allVisitsQuery = groq`
  *[_type == "visit"] {
    _id,
    startDate,
    endDate,
    "location": location->{ _id, name, coordinates, slug },
    "trip": trip->{ _id, title, slug },
    "items": items[]->${visitItemProjection}
  } | order(startDate desc)
`

// Bulk trip fetch with embedded visits — drives the trip panel (C4) so it
// has per-visit sections + items without a second network round-trip.
// Deliberately separate from `allTripsQuery` (which stays lean for the
// timeline) so we don't pay the item-reference cost for every timeline render.
export const allTripsWithVisitsQuery = groq`
  *[_type == "trip"] {
    _id,
    title,
    slug,
    "hasArticle": defined(articleBody) && length(articleBody) > 0,
    "visits": *[_type == "visit" && references(^._id)] | order(startDate asc) {
      _id,
      startDate,
      endDate,
      "location": location->{ _id, name, coordinates, slug },
      "items": items[]->${visitItemProjection}
    }
  } {
    _id,
    title,
    slug,
    hasArticle,
    visits,
    "startDate": visits[0].startDate,
    "endDate":   visits | order(endDate desc)[0].endDate,
    "visitCount": count(visits),
  } | order(startDate desc)
`

// Two-stage projection: fetch full visits once into `visits`, then derive
// startDate / endDate / visitCount from that array — avoids running
// `references(^._id)` four times.
export const tripBySlugQuery = groq`
  *[_type == "trip" && slug.current == $slug][0] {
    _id,
    title,
    slug,
    articleBody,
    "hasArticle": defined(articleBody) && length(articleBody) > 0,
    "visits": *[_type == "visit" && references(^._id)] | order(startDate asc) {
      _id,
      startDate,
      endDate,
      "location": location->{ _id, name, coordinates },
      "items": items[]->${visitItemProjection}
    }
  } {
    _id,
    title,
    slug,
    articleBody,
    hasArticle,
    visits,
    "startDate": visits[0].startDate,
    "endDate":   visits | order(endDate desc)[0].endDate,
    "visitCount": count(visits),
  }
`
