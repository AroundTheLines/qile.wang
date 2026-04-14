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

export const globeContentQuery = groq`
  *[_type == "content" && count(locations[defined(globe_group)]) > 0] {
    _id,
    title,
    slug,
    content_type,
    cover_image,
    tags,
    "acquired_at": locations | order(sort_date asc)[0].sort_date,
    "latest_location_date": locations | order(sort_date desc)[0].sort_date,
    locations[] | order(sort_date asc) {
      label,
      coordinates,
      sort_date,
      date_label,
      globe_group,
    },
  }
`
