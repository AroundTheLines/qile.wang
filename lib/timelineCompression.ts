export interface TripRange {
  id: string
  startDate: string
  endDate: string
}

export interface TickMark {
  date: string
  x: number
  label: string
  kind: 'year' | 'month'
}

export interface CompressedMap {
  dateToX(isoDate: string): number
  xToDate(x: number): string
  tickMarks: TickMark[]
  start: string
  end: string
}

export interface BuildOptions {
  minGapFraction?: number
  activeBoost?: number
  now?: string
}

interface Segment {
  startDate: string
  endDate: string
  kind: 'active' | 'empty'
  realDays: number
  xStart: number
  xEnd: number
}

const MS_PER_DAY = 86400000
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function isoToUtcMs(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
}

function daysBetween(iso1: string, iso2: string): number {
  return Math.round((isoToUtcMs(iso2) - isoToUtcMs(iso1)) / MS_PER_DAY)
}

function addDays(iso: string, days: number): string {
  const ms = isoToUtcMs(iso) + days * MS_PER_DAY
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function minIso(a: string, b: string): string {
  return a < b ? a : b
}

function subtractOneYear(iso: string): string {
  const y = +iso.slice(0, 4) - 1
  return `${y}${iso.slice(4)}`
}

export function buildCompressedMap(
  trips: TripRange[],
  opts: BuildOptions = {}
): CompressedMap {
  const minGapFraction = opts.minGapFraction ?? 0.02
  const activeBoost = opts.activeBoost ?? 3
  const now = opts.now ?? todayIso()

  // Normalize: clamp endDate to now, drop trips entirely after now.
  const normalized: TripRange[] = []
  for (const t of trips) {
    if (t.startDate > now) continue
    const endDate = minIso(t.endDate, now)
    const startDate = t.startDate < endDate ? t.startDate : endDate
    normalized.push({ id: t.id, startDate, endDate })
  }
  normalized.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))

  const start = normalized.length > 0 ? normalized[0].startDate : subtractOneYear(now)
  const end = now

  // Merge overlapping intervals.
  const active: Array<{ startDate: string; endDate: string }> = []
  for (const t of normalized) {
    if (active.length === 0) {
      active.push({ startDate: t.startDate, endDate: t.endDate })
      continue
    }
    const last = active[active.length - 1]
    if (t.startDate <= last.endDate) {
      if (t.endDate > last.endDate) last.endDate = t.endDate
    } else {
      active.push({ startDate: t.startDate, endDate: t.endDate })
    }
  }

  // Build alternating segments across [start, end].
  const rawSegments: Array<{ startDate: string; endDate: string; kind: 'active' | 'empty' }> = []
  let cursor = start
  for (const a of active) {
    if (a.startDate > cursor) {
      rawSegments.push({ startDate: cursor, endDate: a.startDate, kind: 'empty' })
    }
    rawSegments.push({ startDate: a.startDate, endDate: a.endDate, kind: 'active' })
    cursor = a.endDate
  }
  if (cursor < end) {
    rawSegments.push({ startDate: cursor, endDate: end, kind: 'empty' })
  }
  if (rawSegments.length === 0) {
    // start === end: one degenerate empty segment.
    rawSegments.push({ startDate: start, endDate: end, kind: 'empty' })
  }

  const totalRealDays = Math.max(daysBetween(start, end), 1)

  // Assign weights.
  const weights: number[] = rawSegments.map((s) => {
    const realDays = daysBetween(s.startDate, s.endDate)
    if (s.kind === 'active') {
      // Ensure even zero-day active segments have a tiny weight so they're addressable.
      return Math.max(realDays, 1) * activeBoost
    }
    // Empty time is compressed by `activeBoost` so active regions earn more x-share
    // than equivalent stretches of empty time. minGapFraction is the floor so tiny
    // gaps don't collapse to zero width.
    return Math.max(realDays / activeBoost, minGapFraction * totalRealDays)
  })
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1

  // Build segments with cumulative x.
  const segments: Segment[] = []
  let xCursor = 0
  for (let i = 0; i < rawSegments.length; i++) {
    const s = rawSegments[i]
    const realDays = daysBetween(s.startDate, s.endDate)
    const xWidth = weights[i] / totalWeight
    const xStart = xCursor
    let xEnd = xCursor + xWidth
    if (i === rawSegments.length - 1) xEnd = 1 // pin last to 1.0 exactly
    segments.push({
      startDate: s.startDate,
      endDate: s.endDate,
      kind: s.kind,
      realDays,
      xStart,
      xEnd,
    })
    xCursor = xEnd
  }

  function findSegmentByDate(iso: string): Segment {
    // Binary search for segment containing iso (startDate <= iso <= endDate).
    let lo = 0
    let hi = segments.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (iso > segments[mid].endDate) lo = mid + 1
      else hi = mid
    }
    return segments[lo]
  }

  function findSegmentByX(x: number): Segment {
    let lo = 0
    let hi = segments.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (x > segments[mid].xEnd) lo = mid + 1
      else hi = mid
    }
    return segments[lo]
  }

  function dateToX(isoDate: string): number {
    let iso = isoDate
    if (iso < start) iso = start
    if (iso > end) iso = end
    if (iso === start) return 0
    if (iso === end) return 1
    const seg = findSegmentByDate(iso)
    if (seg.realDays === 0) return seg.xStart
    const elapsed = daysBetween(seg.startDate, iso)
    const segWidth = seg.xEnd - seg.xStart
    return seg.xStart + (elapsed / seg.realDays) * segWidth
  }

  function xToDate(x: number): string {
    let xc = x
    if (xc < 0) xc = 0
    if (xc > 1) xc = 1
    if (xc === 0) return start
    if (xc === 1) return end
    const seg = findSegmentByX(xc)
    const segWidth = seg.xEnd - seg.xStart
    if (segWidth === 0 || seg.realDays === 0) return seg.startDate
    const frac = (xc - seg.xStart) / segWidth
    const days = Math.round(frac * seg.realDays)
    return addDays(seg.startDate, days)
  }

  // Build tick marks.
  const tickMarks: TickMark[] = []
  const startYear = +start.slice(0, 4)
  const endYear = +end.slice(0, 4)
  for (let y = startYear; y <= endYear; y++) {
    const iso = `${y}-01-01`
    if (iso < start || iso > end) continue
    tickMarks.push({ date: iso, x: dateToX(iso), label: String(y), kind: 'year' })
  }

  if (totalRealDays < 365 * 2) {
    const monthCandidates: TickMark[] = []
    for (let y = startYear; y <= endYear; y++) {
      for (let m = 1; m <= 12; m++) {
        if (m === 1) continue // year tick already covers Jan
        const iso = `${y}-${String(m).padStart(2, '0')}-01`
        if (iso < start || iso > end) continue
        monthCandidates.push({
          date: iso,
          x: dateToX(iso),
          label: MONTH_NAMES[m - 1],
          kind: 'month',
        })
      }
    }
    for (const cand of monthCandidates) {
      const collides = tickMarks.some((t) => Math.abs(t.x - cand.x) < 0.02)
      if (!collides) tickMarks.push(cand)
    }
  }

  tickMarks.sort((a, b) => a.x - b.x)

  return { dateToX, xToDate, tickMarks, start, end }
}
