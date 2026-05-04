// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// Stub next/image (needs Next runtime config) and the Sanity URL builder so
// the test focuses on branching/structure, not URL construction. We strip
// the boolean `fill` prop because passing it to a plain <img> triggers a
// React warning about non-boolean attributes.
vi.mock('next/image', () => ({
  default: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: any,
  ) => {
    // Strip the boolean `fill` prop so the test stub doesn't trigger React's
    // non-boolean attribute warning when passed through to a plain <img>.
    const { fill, alt, ...rest } = props
    void fill
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} {...rest} />
  },
}))
vi.mock('@/lib/sanity', () => ({
  urlFor: () => ({ width: () => ({ url: () => 'mock-url' }) }),
}))

// jsdom doesn't implement IntersectionObserver — stub it so the component
// can mount without the active-dot effect crashing.
beforeAll(() => {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
    root = null
    rootMargin = ''
    thresholds = []
  }
  ;(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO
})

// vitest doesn't auto-cleanup between tests (no globals: true), so DOM from
// one render lingers into the next and `getByRole` finds duplicates.
afterEach(() => cleanup())

import ArticleCarousel from '../ArticleCarousel'
import type { SanityImage } from '@/lib/types'

function fakeImage(ref: string): SanityImage {
  return {
    _type: 'image',
    asset: { _ref: ref, _type: 'reference' },
  } as unknown as SanityImage
}

describe('ArticleCarousel', () => {
  it('returns null for empty image arrays', () => {
    const { container } = render(<ArticleCarousel images={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a single static image without dots or prev/next controls', () => {
    render(<ArticleCarousel images={[fakeImage('a')]} alt="solo" />)
    // No carousel role on single-image render — it's a plain figure.
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryByRole('button', { name: /previous image/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /next image/i })).toBeNull()
    expect(screen.getByAltText('solo')).toBeTruthy()
  })

  it('renders carousel chrome (region + prev/next + dot per slide) for ≥2 images', () => {
    const imgs = [fakeImage('a'), fakeImage('b'), fakeImage('c')]
    render(<ArticleCarousel images={imgs} alt="multi" />)
    expect(screen.getByRole('region')).toBeTruthy()
    expect(screen.getByRole('button', { name: /previous image/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /next image/i })).toBeTruthy()
    // One dot per slide (aria-label "Go to image N").
    expect(screen.getAllByRole('button', { name: /go to image/i })).toHaveLength(3)
  })

  it('disables prev at the first slide and enables next', () => {
    const imgs = [fakeImage('a'), fakeImage('b')]
    render(<ArticleCarousel images={imgs} />)
    const prev = screen.getByRole('button', { name: /previous image/i }) as HTMLButtonElement
    const next = screen.getByRole('button', { name: /next image/i }) as HTMLButtonElement
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(false)
  })
})
