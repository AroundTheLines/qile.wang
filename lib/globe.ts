import type { ContentType, Coordinates, SanityImage } from './types'

// --- Types ---

export interface GlobePinItem {
  _id: string
  title: string
  slug: { current: string }
  content_type: ContentType
  cover_image?: SanityImage
  locationLabel: string
  year?: string
}

export interface GlobePin {
  group: string
  coordinates: Coordinates
  items: GlobePinItem[]
  latestDate?: string
}

export interface GlobeContentItem {
  _id: string
  title: string
  slug: { current: string }
  content_type: ContentType
  cover_image?: SanityImage
  tags?: string[]
  acquired_at?: string
  latest_location_date?: string
  locations: {
    label: string
    coordinates: Coordinates
    sort_date?: string
    date_label?: string
    globe_group?: string
  }[]
}

// --- Utilities ---

/**
 * Clamp the panel's top coordinate so it stays fully within the viewport
 * while aligning with the selected pin's Y position when possible.
 */
export function clampPanelTop(pinY: number | null, viewportHeight: number): number {
  if (pinY == null) return 100
  // Align panel top ~60px above the pin (so pin visually connects to header)
  const desired = pinY - 60
  return Math.max(24, Math.min(desired, viewportHeight - 400))
}

export function sphericalToCartesian(
  lat: number,
  lng: number,
  radius: number,
): [number, number, number] {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  return [
    radius * Math.cos(latRad) * Math.cos(lngRad),
    radius * Math.sin(latRad),
    radius * Math.cos(latRad) * Math.sin(lngRad),
  ]
}

export function groupPins(content: GlobeContentItem[]): GlobePin[] {
  const groups = new Map<
    string,
    {
      lats: number[]
      lngs: number[]
      items: Map<string, { item: GlobePinItem; sortDate?: string }>
      latestDate?: string
    }
  >()

  for (const c of content) {
    for (const loc of c.locations) {
      if (!loc.globe_group) continue

      let group = groups.get(loc.globe_group)
      if (!group) {
        group = { lats: [], lngs: [], items: new Map() }
        groups.set(loc.globe_group, group)
      }

      group.lats.push(loc.coordinates.lat)
      group.lngs.push(loc.coordinates.lng)

      // Track latest date across all locations in group
      if (loc.sort_date) {
        if (!group.latestDate || loc.sort_date > group.latestDate) {
          group.latestDate = loc.sort_date
        }
      }

      // Deduplicate content: if item already in group, keep most recent location label
      const existing = group.items.get(c._id)
      if (!existing || (loc.sort_date && (!existing.sortDate || loc.sort_date > existing.sortDate))) {
        group.items.set(c._id, {
          item: {
            _id: c._id,
            title: c.title,
            slug: c.slug,
            content_type: c.content_type,
            cover_image: c.cover_image,
            locationLabel: loc.label,
            year: loc.sort_date ? loc.sort_date.slice(0, 4) : undefined,
          },
          sortDate: loc.sort_date,
        })
      }
    }
  }

  const pins: GlobePin[] = []

  for (const [groupName, group] of groups) {
    const avgLat = group.lats.reduce((a, b) => a + b, 0) / group.lats.length
    const avgLng = group.lngs.reduce((a, b) => a + b, 0) / group.lngs.length

    pins.push({
      group: groupName,
      coordinates: { lat: avgLat, lng: avgLng },
      items: Array.from(group.items.values()).map((v) => v.item),
      latestDate: group.latestDate,
    })
  }

  // Sort by latestDate descending (most recent first)
  pins.sort((a, b) => {
    if (!a.latestDate && !b.latestDate) return 0
    if (!a.latestDate) return 1
    if (!b.latestDate) return -1
    return b.latestDate.localeCompare(a.latestDate)
  })

  return pins
}
