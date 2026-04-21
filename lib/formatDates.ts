const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function formatMonthYear(iso: string): string {
  const y = iso.slice(0, 4)
  const m = Number(iso.slice(5, 7)) - 1
  return `${MONTHS[m]} ${y}`
}

export function formatFullDate(iso: string): string {
  const y = iso.slice(0, 4)
  const m = Number(iso.slice(5, 7)) - 1
  const d = Number(iso.slice(8, 10))
  return `${MONTHS[m]} ${d}, ${y}`
}

export function formatDateRange(startIso: string, endIso: string): string {
  const startY = startIso.slice(0, 4)
  const endY = endIso.slice(0, 4)
  const startM = startIso.slice(5, 7)
  const endM = endIso.slice(5, 7)

  if (startY === endY && startM === endM) {
    const m = Number(startM) - 1
    const startD = Number(startIso.slice(8, 10))
    const endD = Number(endIso.slice(8, 10))
    if (startD === endD) return `${MONTHS[m]} ${startD}, ${startY}`
    return `${MONTHS[m]} ${startD}–${endD}, ${startY}`
  }

  return `${formatMonthYear(startIso)} – ${formatMonthYear(endIso)}`
}
