// Top-level Location document (Phase 5C).
//
// Naming note: schema name is `locationDoc` (not `location`) to avoid colliding
// with the pre-existing embedded `location` object type in content.locations[].
// The embedded type is kept for article travel-log display; this new document
// type is what globe pins are built from. See implementation_plans/phase-5c/README.md §4.4.
import { defineField, defineType } from 'sanity'

export const locationDoc = defineType({
  name: 'locationDoc',
  title: 'Location',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'coordinates',
      title: 'Coordinates',
      type: 'object',
      fields: [
        defineField({ name: 'lat', title: 'Latitude', type: 'number', validation: (r) => r.required() }),
        defineField({ name: 'lng', title: 'Longitude', type: 'number', validation: (r) => r.required() }),
      ],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'name', maxLength: 96 },
      description:
        'Used as the stable URL key for this location (?pin=<slug>). Falls back to the document _id if absent, but the fallback creates inconsistent URLs across edits — set this and keep it stable.',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: { title: 'name', lat: 'coordinates.lat', lng: 'coordinates.lng' },
    prepare: ({ title, lat, lng }) => ({
      title,
      subtitle:
        typeof lat === 'number' && typeof lng === 'number'
          ? `${lat.toFixed(2)}, ${lng.toFixed(2)}`
          : undefined,
    }),
  },
})
