import { defineField, defineType } from 'sanity'

export const CONTENT_TYPES = ['item', 'post'] as const
export type ContentType = typeof CONTENT_TYPES[number]

export const content = defineType({
  name: 'content',
  title: 'Content',
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
      options: { source: 'title', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'content_type',
      title: 'Content Type',
      type: 'string',
      options: {
        list: CONTENT_TYPES.map((t) => ({ title: t.charAt(0).toUpperCase() + t.slice(1), value: t })),
        layout: 'radio',
      },
      initialValue: 'item',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [{ type: 'block' }, { type: 'image', options: { hotspot: true } }],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'cover_image',
      title: 'Cover Image',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'gallery',
      title: 'Gallery',
      type: 'array',
      of: [{ type: 'image', options: { hotspot: true } }],
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    }),
    defineField({
      name: 'locations',
      title: 'Locations',
      type: 'array',
      of: [{ type: 'location' }],
      description: 'All places this item has been. Ordered by sort_date in the app.',
    }),
    defineField({
      name: 'acquisition',
      title: 'Acquisition Location',
      type: 'object',
      description: 'Which location entry represents where/when this was acquired.',
      fields: [
        defineField({
          name: 'location_index',
          title: 'Location index (0-based)',
          type: 'number',
          description: 'Index into the locations array for the acquisition entry.',
        }),
      ],
    }),
    defineField({
      name: 'published_at',
      title: 'Published At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'content_type',
      media: 'cover_image',
    },
  },
})
