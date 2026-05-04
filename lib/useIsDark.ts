'use client'

import { useSyncExternalStore } from 'react'

// Read dark-mode preference synchronously from matchMedia, subscribe to
// changes without touching state in an effect. The MediaQueryList is cached
// at module scope and lazy-initialized on first client call so repeated
// getSnapshot/subscribe invocations reuse the same instance (SSR never
// reaches the getter — getServerSnapshot returns first).
// Exported for test consumption only — app code should go through useIsDark.
//
// 'use client' marks the file as client-only — the matchMedia call below
// would crash if Next.js ever bundled this into a server component. Today
// the only consumers are GlobeProvider and ArticleItemGlobe, both client
// components; the directive future-proofs against accidental server
// imports.
let _darkMql: MediaQueryList | null = null
export const getDarkMql = (): MediaQueryList =>
  (_darkMql ??= window.matchMedia('(prefers-color-scheme: dark)'))

function subscribeIsDark(callback: () => void): () => void {
  const mq = getDarkMql()
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}
function getIsDark(): boolean {
  return getDarkMql().matches
}
function getIsDarkServer(): boolean {
  return false
}

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribeIsDark, getIsDark, getIsDarkServer)
}
