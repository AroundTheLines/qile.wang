// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getDarkMql } from '../GlobeProvider'

// jsdom doesn't implement matchMedia — stub it so getDarkMql has something
// to return. The spy also lets us assert the cache avoids re-calling it.
beforeAll(() => {
  const mqlStub: Partial<MediaQueryList> = {
    matches: false,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const matchMedia = vi.fn().mockReturnValue(mqlStub)
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia
})

describe('getDarkMql', () => {
  it('returns the same MediaQueryList instance across calls and invokes matchMedia once', () => {
    const spy = window.matchMedia as unknown as ReturnType<typeof vi.fn>
    const baseline = spy.mock.calls.length
    const a = getDarkMql()
    const b = getDarkMql()
    const c = getDarkMql()
    expect(a).toBe(b)
    expect(b).toBe(c)
    // Module-scope cache means matchMedia is called at most once across the
    // test run; it may already be 0 additional calls if another test in this
    // process hit it first.
    expect(spy.mock.calls.length - baseline).toBeLessThanOrEqual(1)
  })
})
