# 5C-A1 — New Sanity schemas: `locationDoc`, `trip`, `visit`

**Epic**: A. Foundation · **Owner**: Dev A · **Can be run by agent?**: Yes (with ambiguity flagged below resolved first) · **Estimated size**: M

## Dependencies

### Hard
- None — greenfield.

### Soft
- None.

### Blocks
- A2 (imports types aligned to these schemas), A4 (fixtures target these types), and transitively: C1, D1, and everything downstream.

---

## Goal

Introduce three new **top-level Sanity document types** — `locationDoc`, `trip`, `visit` — that replace the `globe_group`-string-based pin grouping from Phase 5A/5B. The new model enables:

- **One pin per unique location** (Berlin '22 and Berlin '24 share the same location doc → one pin with a scrollable multi-visit panel).
- **Trips** as a first-class concept with optional article bodies and URL navigation.
- **Items on visits** (not on locations), so the same item can be worn at multiple visits across multiple trips.

This ticket **only adds schemas**. Data wiring comes in A2/A3, fixtures in A4.

## Spec references

- [`Phase 5C.markdown`](../../Phase%205C.markdown) §1.1 Data Model concepts
- §1.2 Relationships
- §1.3 Slugs and URLs
- §1.4 Sanity CMS
- §1.4.1 Item ↔ Visit reference direction
- §1.4.2 Date granularity
- §1.4.3 Slugs

## Files to read first

- [`../../Phase 5C.markdown`](../../Phase%205C.markdown) §1 (entire section)
- [`../../sanity/schemas/content.ts`](../../sanity/schemas/content.ts) — existing content doc schema
- [`../../sanity/schemas/location.ts`](../../sanity/schemas/location.ts) — existing **embedded** location object (important distinction — see §4.4 of README)
- [`../../sanity/schemas/index.ts`](../../sanity/schemas/index.ts) — schema registry
- [`../../sanity.config.ts`](../../sanity.config.ts) — Sanity studio config
- [README §4.4 Terminology distinction](./README.md#44-terminology-distinction)
- [README §5.6 Item↔Visit reference direction](./README.md#56-itemvisit-reference-direction)

## Files to create

- `sanity/schemas/locationDoc.ts` — top-level shared location document
- `sanity/schemas/trip.ts` — top-level trip document
- `sanity/schemas/visit.ts` — top-level visit document

## Files to modify

- `sanity/schemas/index.ts` — export the three new types in the `schemaTypes` array
- `sanity/schemas/location.ts` — **remove** the `globe_group` field (no longer used)
- `sanity/schemas/content.ts` — no field changes (leave `locations[]` embedded array as-is for article travel-log display)

## Files to delete

- None.

---

## Implementation guidance

### Naming

Sanity requires unique schema names. The existing embedded object type is named `location`. To avoid collision, name the **new** top-level document `locationDoc` (schema `name: 'locationDoc'`). TypeScript type name is `LocationDoc`.

> Record this choice in a header comment on `locationDoc.ts` so future readers don't trip over it.

### Schema details

#### `locationDoc.ts` (document)

```ts
defineType({
  name: 'locationDoc',
  title: 'Location',  // shown in Studio UI as "Location"
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
      description: 'Optional — for internal cross-refs. Not a user-facing URL in this phase.',
    }),
  ],
  preview: {
    select: { title: 'name', lat: 'coordinates.lat', lng: 'coordinates.lng' },
    prepare: ({ title, lat, lng }) => ({
      title,
      subtitle: lat !== undefined && lng !== undefined ? `${lat.toFixed(2)}, ${lng.toFixed(2)}` : undefined,
    }),
  },
})
```

#### `trip.ts` (document)

**IMPORTANT**: Do not add `startDate` / `endDate` fields. Spec §1.4 says they are auto-computed from visits (min start / max end). A2's GROQ query computes them at query time.

```ts
defineType({
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
      options: { source: 'title', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'articleBody',
      title: 'Article body',
      type: 'array',
      of: [{ type: 'block' }, { type: 'image', options: { hotspot: true } }],
      description: 'Optional long-form body for /trip/<slug>. Leave empty to ship the trip as a timeline-only entry.',
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'slug.current' },
  },
})
```

#### `visit.ts` (document)

```ts
defineType({
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
            filter: 'content_type == "item"',  // restrict to items, not posts
          },
        },
      ],
      description: 'Items associated with this visit. Same item can appear in other visits too.',
    }),
  ],
  preview: {
    select: { location: 'location.name', trip: 'trip.title', start: 'startDate', end: 'endDate' },
    prepare: ({ location, trip, start, end }) => ({
      title: location || 'Untitled visit',
      subtitle: [trip, start && end && `${start} — ${end}`].filter(Boolean).join(' · '),
    }),
  },
})
```

### `sanity/schemas/index.ts` update

```ts
import { content } from './content'
import { location } from './location'
import { locationDoc } from './locationDoc'
import { trip } from './trip'
import { visit } from './visit'

export const schemaTypes = [content, location, locationDoc, trip, visit]
```

### `sanity/schemas/location.ts` (embedded) — remove `globe_group`

Delete the `defineField({ name: 'globe_group', ... })` block entirely. The field is no longer used by any query or component after A2/A3. Any stray `globe_group` values in existing Sanity documents are tolerated but ignored — Sanity doesn't reject unknown fields.

---

## Acceptance criteria

- [ ] Three new document types appear in `/studio` sidebar: "Location", "Trip", "Visit".
- [ ] Creating a `visit` in Studio presents dropdowns for `location` (all `locationDoc`s) and `trip` (all `trip`s).
- [ ] Creating a `visit` with `endDate < startDate` shows the validation error from the `custom` rule.
- [ ] `visit.items` field only lists `content` docs with `content_type == 'item'` in its reference picker.
- [ ] `trip` has no `startDate` / `endDate` fields (they are computed, not stored).
- [ ] `globe_group` is no longer a field on the embedded `location` type (confirm via Studio).
- [ ] `npx tsc --noEmit` passes.
- [ ] Running `/studio` locally does not throw schema registration errors in the console.

## Non-goals

- **Do not write a migration script** — that's A4 (greenfield wipe).
- **Do not add queries** — A2.
- **Do not touch `content.ts`** beyond verifying `locations[]` stays. Items are still `content` docs with `content_type: 'item'`; do not refactor that.
- **Do not delete the embedded `location` object type** — `ArticleContent.tsx` still reads `item.locations[]` for the travel-log.
- **Do not add bidirectional visit↔item refs.** Only `visit.items` per README §5.6.

## Gotchas

- **Name collision**: existing embedded type is `location`; new top-level doc is `locationDoc`. Mixing them up will fail schema registration silently (the second registration may shadow the first).
- **`custom` validator for endDate** needs access to the sibling `startDate`. The `ctx.document` typing is loose — cast to `{ startDate?: string } | undefined`.
- **Reference filters** (`options.filter: 'content_type == "item"'`) operate in GROQ. Test the filter in Studio by creating a visit and confirming posts are excluded from the item-picker.
- **Sanity requires `_key` on array items** at write-time (seed script territory — A4), but schema definition doesn't need it.
- Slug `source: 'name'` / `source: 'title'` auto-generates on first edit; author can still override (§1.4.3).

## Ambiguities requiring clarification before starting

1. **Schema name for the new top-level location doc**: plan defaults to `locationDoc` to avoid colliding with the embedded `location` object type. This is a judgment call — the alternative is renaming the embedded type to `locationEntry`. Going with `locationDoc` because it's lower-blast-radius: the embedded type is referenced in content docs, and renaming it would force a content migration.

   **Resolution**: use `locationDoc` unless a human reviewer pushes back. Document the choice in the schema file header.

2. **`slug` on `locationDoc`**: spec §1.3 says visits aren't URL-navigable but leaves room for internal cross-refs. I included a slug field for flexibility (no cost to leave unused). If a reviewer prefers zero-optionality, drop it.

   **Resolution**: include slug as optional. No validation required.

3. **Nothing else is ambiguous** — proceed after resolving above.

## Handoff / outputs consumed by later tickets

- Type names the rest of the phase expects:
  - Schema name: `'locationDoc'`, `'trip'`, `'visit'`
  - TS type names (introduced in A2, but consumers should anticipate): `LocationDoc`, `Trip`, `Visit`
- A2 imports the schema names into GROQ queries.
- A4 uses the schema names in `_type` fields when creating docs.

## How to verify

1. `npm run dev`
2. Open `http://localhost:3000/studio`.
3. Verify sidebar shows "Content", "Location" (with two entries if Studio renders embedded vs doc separately — Sanity typically only shows documents), "Trip", "Visit".
4. Create a throwaway locationDoc: name "Test Berlin", coordinates `{ lat: 52.52, lng: 13.405 }`. Save.
5. Create a throwaway trip: title "Test Trip". Save.
6. Create a throwaway visit: location → Test Berlin, trip → Test Trip, startDate 2024-03-01, endDate 2024-03-05. Save. Delete it.
7. Create another throwaway visit with endDate before startDate — confirm validation error.
8. Delete the throwaway docs.
9. Confirm editing any existing `content` doc no longer shows `globe_group` in the locations array editor.
