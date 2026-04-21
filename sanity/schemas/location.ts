import { defineField, defineType } from 'sanity'

// Embedded object type used inside `content.locations[]` for article travel-log
// display. Distinct from the top-level `locationDoc` document type (Phase 5C).
// Title is "Travel log entry" to disambiguate in the Studio UI.
export const location = defineType({
  name: 'location',
  title: 'Travel log entry',
  type: 'object',
  fields: [
    defineField({
      name: 'label',
      title: 'Label',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'coordinates',
      title: 'Coordinates',
      type: 'object',
      fields: [
        defineField({ name: 'lat', title: 'Latitude', type: 'number', validation: (rule) => rule.required() }),
        defineField({ name: 'lng', title: 'Longitude', type: 'number', validation: (rule) => rule.required() }),
      ],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'sort_date',
      title: 'Date (for ordering)',
      type: 'date',
      description: 'Used to sort locations chronologically and generate the timeline.',
    }),
    defineField({
      name: 'date_label',
      title: 'Date Label (display override)',
      type: 'string',
      description: 'If set, shown instead of the formatted sort_date. E.g. "around April 2023" or "April 1–30".',
    }),
    defineField({
      name: 'body',
      title: 'Story',
      type: 'array',
      of: [{ type: 'block' }],
      description: 'Notes or story about this specific visit.',
    }),
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [{ type: 'image', options: { hotspot: true } }],
    }),
    // Deprecated — Phase 5C replaces globe_group with locationDoc references
    // on visit documents. Kept hidden + readOnly through Phase 5C A2/A3 so
    // existing values are preserved on round-trip edits. Remove after A3 lands.
    defineField({
      name: 'globe_group',
      title: 'Globe Group (deprecated)',
      type: 'string',
      readOnly: true,
      hidden: true,
    }),
  ],
})
