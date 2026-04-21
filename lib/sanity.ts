import { createClient } from 'next-sanity'
import { createImageUrlBuilder } from '@sanity/image-url'
import type { SanityImageSource } from '@sanity/image-url'

export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET!
const apiVersion = '2024-01-01'

// Public client — no token, safe to reach client bundles (e.g. imported
// transitively via `urlFor` from 'use client' files). Use for image URL
// building and any fetch that doesn't need auth.
export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
})

// Server-only read client. Phase 5C moved content into types whose
// Sanity permissions deny anonymous reads even though the dataset's
// aclMode is `public`; without a token the Next.js server fetches in
// `app/**/layout.tsx` / `app/**/page.tsx` silently return empty. This
// client pulls `SANITY_API_TOKEN` from the server env (never exposed to
// the browser — no NEXT_PUBLIC_ prefix).
//
// INVARIANT: do not import `readClient` from any file marked
// `'use client'` or included in a client bundle. Next.js won't bundle
// the token (server-only env), but importing the client module into
// browser code still pulls in the createClient call graph unnecessarily
// and risks future token leaks if someone adds a NEXT_PUBLIC-prefixed
// env by mistake. Use `client` for browser-reachable code.
export const readClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  token: process.env.SANITY_API_TOKEN,
})

const builder = createImageUrlBuilder(client)

export function urlFor(source: SanityImageSource) {
  return builder.image(source)
}
