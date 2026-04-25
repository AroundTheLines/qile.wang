'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

let _mql: MediaQueryList | null = null
const getMql = (): MediaQueryList | null => {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  return (_mql ??= window.matchMedia(QUERY))
}

function subscribe(callback: () => void): () => void {
  const mql = getMql()
  if (!mql) return () => {}
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot(): boolean {
  return getMql()?.matches ?? false
}

function getServerSnapshot(): boolean {
  return false
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function prefersReducedMotion(): boolean {
  return getSnapshot()
}
