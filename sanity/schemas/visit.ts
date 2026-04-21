import { defineField, defineType } from 'sanity'

export const visit = defineType({
  name: 'visit',
  title: 'Visit',
  type: 'document',
  fields: [
    defineField({
      name: 'location',
      title: 'Location',
      type: 'reference',
      to: [{ type: 'locationDoc' }],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'trip',
      title: 'Trip',
      type: 'reference',
      to: [{ type: 'trip' }],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'startDate',
      title: 'Start date',
      type: 'date',
      options: { dateFormat: 'YYYY-MM-DD' },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'endDate',
      title: 'End date',
      type: 'date',
      options: { dateFormat: 'YYYY-MM-DD' },
      validation: (rule) =>
        rule.required().custom((endDate, ctx) => {
          const start = (ctx.document as { startDate?: string } | undefined)?.startDate
          if (!endDate || !start) return true
          return endDate >= start || 'End date must be on or after start date'
        }),
    }),
    defineField({
      name: 'items',
      title: 'Items worn / used',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'content' }],
          options: {
            filter: 'content_type == "item"',
          },
        },
      ],
      description:
        'Items associated with this visit. Same item can appear in other visits too.',
    }),
  ],
  preview: {
    select: {
      location: 'location.name',
      trip: 'trip.title',
      start: 'startDate',
      end: 'endDate',
    },
    prepare: ({ location, trip, start, end }) => ({
      title: location || 'Untitled visit',
      subtitle: [trip, start && end && `${start} — ${end}`].filter(Boolean).join(' · '),
    }),
  },
})
