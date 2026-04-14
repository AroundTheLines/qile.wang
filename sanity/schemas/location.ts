import { defineField, defineType } from 'sanity'

export const location = defineType({
  name: 'location',
  title: 'Location',
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
    defineField({
      name: 'globe_group',
      title: 'Globe Group',
      type: 'string',
      description:
        'Editorial label for globe pin grouping (e.g., "Tokyo, Japan"). ' +
        'All locations sharing the same globe_group string cluster under one pin. ' +
        'Leave empty to exclude this location from the globe.',
    }),
  ],
})
