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
      globe_group,
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

export const allTripsQuery = groq`
  *[_type == "trip"] {
    _id,
    title,
    slug,
    "startDate": *[_type == "visit" && references(^._id)] | order(startDate asc)[0].startDate,
    "endDate":   *[_type == "visit" && references(^._id)] | order(endDate desc)[0].endDate,
    "visitCount": count(*[_type == "visit" && references(^._id)]),
    "hasArticle": defined(articleBody) && length(articleBody) > 0,
  } | order(startDate desc)
`

export const allVisitsQuery = groq`
  *[_type == "visit"] {
    _id,
    startDate,
    endDate,
    "location": location->{ _id, name, coordinates, slug },
    "trip": trip->{ _id, title, slug },
    "items": items[]->{
      _id,
      title,
      slug,
      content_type,
      cover_image,
      tags
    }
  } | order(startDate desc)
`

export const tripBySlugQuery = groq`
  *[_type == "trip" && slug.current == $slug][0] {
    _id,
    title,
    slug,
    articleBody,
    "startDate": *[_type == "visit" && references(^._id)] | order(startDate asc)[0].startDate,
    "endDate":   *[_type == "visit" && references(^._id)] | order(endDate desc)[0].endDate,
    "visitCount": count(*[_type == "visit" && references(^._id)]),
    "hasArticle": defined(articleBody) && length(articleBody) > 0,
    "visits": *[_type == "visit" && references(^._id)] | order(startDate asc) {
      _id,
      startDate,
      endDate,
      "location": location->{ _id, name, coordinates },
      "items": items[]->{ _id, title, slug, content_type, cover_image }
    }
  }
`
