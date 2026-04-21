import { defineField, defineType } from 'sanity'

// Trip has no startDate/endDate fields — they are auto-computed from
// visits (min start / max end) at query time. See Phase 5C spec §1.4.
export const trip = defineType({
  name: 'trip',
  title: 'Trip',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
        isUnique: (value, context) => context.defaultIsUnique(value, context),
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'articleBody',
      title: 'Article body',
      type: 'array',
      of: [{ type: 'block' }, { type: 'image', options: { hotspot: true } }],
      description:
        'Optional long-form body for /trip/<slug>. Leave empty to ship the trip as a timeline-only entry.',
    }),
  ],
  orderings: [
    {
      title: 'Title, A→Z',
      name: 'titleAsc',
      by: [{ field: 'title', direction: 'asc' }],
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'slug.current' },
  },
})
