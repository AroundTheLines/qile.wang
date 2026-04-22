import { describe, expect, it } from 'vitest'
import { formatDateRange, formatFullDate, formatMonthYear } from './formatDates'

describe('formatMonthYear', () => {
  it('formats to "Month YYYY"', () => {
    expect(formatMonthYear('2024-03-15')).toBe('March 2024')
    expect(formatMonthYear('2022-12-01')).toBe('December 2022')
  })
})

describe('formatFullDate', () => {
  it('formats to "Month D, YYYY" without zero-padding the day', () => {
    expect(formatFullDate('2024-03-05')).toBe('March 5, 2024')
    expect(formatFullDate('2024-11-22')).toBe('November 22, 2024')
  })
})

describe('formatDateRange', () => {
  it('collapses to a single day when start === end', () => {
    expect(formatDateRange('2024-03-15', '2024-03-15')).toBe('March 15, 2024')
  })

  it('uses "Month D–D, YYYY" when start and end fall in the same month', () => {
    expect(formatDateRange('2024-03-15', '2024-03-20')).toBe('March 15–20, 2024')
  })

  it('uses "Month YYYY – Month YYYY" when the range crosses months', () => {
    expect(formatDateRange('2022-03-28', '2022-04-02')).toBe('March 2022 – April 2022')
    expect(formatDateRange('2022-12-28', '2024-01-02')).toBe('December 2022 – January 2024')
  })
})
