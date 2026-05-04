'use client'

import { useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as topojson from 'topojson-client'
import Link from 'next/link'
import {
  GLOBE_RADIUS,
  computeFitCamera,
  greatCircleArcPoints,
  sphericalToCartesian,
} from '@/lib/globe'
import { useIsDark } from '@/lib/useIsDark'
import { formatDateRange } from '@/lib/formatDates'
import type { ItemVisit } from '@/lib/types'

interface ArticleItemGlobeProps {
  visits: ItemVisit[]
}

const GRID_SEGMENTS_W = 36
const GRID_SEGMENTS_H = 18
const PIN_RADIUS = 0.05
const PIN_COLOR = '#EF4444'
// Float arcs just above the surface so they don't z-fight with the wireframe
// or country borders, but stay below the pin spheres (PIN_RADIUS = 0.05).
const ARC_SURFACE_OFFSET = 0.01

// Module-scoped lazy parse so multiple consumers (and remounts of this
// component) don't re-parse the topojson. GlobeMesh keeps its own cache via
// `useMemo`; lifting once globally is a small refactor for later.
let _cachedBorders: [number, number, number][][] | null = null
function getCountryBorders(): [number, number, number][][] {
  if (_cachedBorders) return _cachedBorders
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const worldData = require('world-atlas/countries-110m.json')
  const geojson = topojson.feature(
    worldData,
    worldData.objects.countries,
  ) as unknown as GeoJSON.FeatureCollection

  const lines: [number, number, number][][] = []

  function coordToCartesian(coord: number[]): [number, number, number] {
    const lng = (coord[0] * Math.PI) / 180
    const lat = (coord[1] * Math.PI) / 180
    return [
      -GLOBE_RADIUS * Math.cos(lat) * Math.cos(lng),
      GLOBE_RADIUS * Math.sin(lat),
      GLOBE_RADIUS * Math.cos(lat) * Math.sin(lng),
    ]
  }

  function processCoords(coords: number[][]) {
    const points: [number, number, number][] = []
    for (const c of coords) {
      points.push(coordToCartesian(c))
    }
    if (points.length > 1) lines.push(points)
  }

  for (const feature of geojson.features) {
    const geom = feature.geometry
    if (geom.type === 'Polygon') {
      for (const ring of (geom as GeoJSON.Polygon).coordinates) {
        processCoords(ring)
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const polygon of (geom as GeoJSON.MultiPolygon).coordinates) {
        for (const ring of polygon) {
          processCoords(ring)
        }
      }
    }
  }

  _cachedBorders = lines
  return lines
}

function MiniGlobeMesh({ isDark }: { isDark: boolean }) {
  const borderLines = useMemo(() => getCountryBorders(), [])
  const wireframeGeo = useMemo(() => {
    const sphere = new THREE.SphereGeometry(GLOBE_RADIUS, GRID_SEGMENTS_W, GRID_SEGMENTS_H)
    return new THREE.WireframeGeometry(sphere)
  }, [])

  const lineColor = isDark ? 'white' : 'black'
  const wireframeHex = isDark ? 0xffffff : 0x000000

  return (
    <group>
      {/* Depth-only occluder — same render-order strategy as GlobeMesh. */}
      <mesh renderOrder={-2}>
        <sphereGeometry args={[GLOBE_RADIUS * 0.995, 64, 32]} />
        <meshBasicMaterial colorWrite={false} depthWrite={true} />
      </mesh>
      <lineSegments geometry={wireframeGeo}>
        <lineBasicMaterial color={wireframeHex} opacity={isDark ? 0.18 : 0.12} transparent />
      </lineSegments>
      {borderLines.map((points, i) => (
        <Line
          key={i}
          points={points}
          color={lineColor}
          lineWidth={1.5}
          opacity={isDark ? 0.55 : 0.45}
          transparent
        />
      ))}
    </group>
  )
}

function MiniPin({ lat, lng }: { lat: number; lng: number }) {
  const position = useMemo(() => {
    const [x, y, z] = sphericalToCartesian(lat, lng, GLOBE_RADIUS)
    return new THREE.Vector3(x, y, z)
  }, [lat, lng])
  // Pin renderOrder above arcs (which use the default 0) so the pin sphere
  // paints last and never gets clipped by the arc tip — both endpoints sit
  // inside the pin's bounding volume (PIN_RADIUS=0.05, ARC_SURFACE_OFFSET=0.01).
  return (
    <mesh position={position} renderOrder={1}>
      <sphereGeometry args={[PIN_RADIUS, 16, 16]} />
      <meshBasicMaterial color={PIN_COLOR} transparent depthWrite={false} />
    </mesh>
  )
}

interface MiniPinSpec {
  id: string
  lat: number
  lng: number
}

interface MiniArcSpec {
  key: string
  points: THREE.Vector3[]
}

function MiniArcs({ arcs }: { arcs: MiniArcSpec[] }) {
  // Static great-circle paths between the locations the item visited, in
  // chronological order. Tinted to match the pins (PIN_COLOR) so the journey
  // reads as one family — red dot → red line → red dot — and stands out
  // against the neutral wireframe + country borders. No theme variants: the
  // red holds its hue equally well in light and dark mode, and matching the
  // pins directly is the whole point.
  return (
    <group>
      {arcs.map((arc) => (
        <Line
          key={arc.key}
          points={arc.points}
          color={PIN_COLOR}
          lineWidth={2}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      ))}
    </group>
  )
}

function CameraFit({ pins }: { pins: MiniPinSpec[] }) {
  const { camera, invalidate } = useThree()
  // Recompute when the pin set changes; otherwise this fires once on mount.
  // We mutate camera.position directly (R3F doesn't track that), so under
  // `frameloop="demand"` we have to invalidate explicitly — otherwise the
  // canvas keeps rendering its initial pose and never picks up the fit.
  useEffect(() => {
    if (pins.length === 0) return
    const fit = computeFitCamera(pins, {
      globeRadius: GLOBE_RADIUS,
      minDistance: 5.5,
      maxDistance: 9,
    })
    camera.position.set(fit.x, fit.y, fit.z)
    camera.lookAt(0, 0, 0)
    invalidate()
  }, [pins, camera, invalidate])
  return null
}

function MiniGlobe({
  pins,
  arcs,
  isDark,
}: {
  pins: MiniPinSpec[]
  arcs: MiniArcSpec[]
  isDark: boolean
}) {
  return (
    <Canvas
      camera={{ fov: 35, near: 0.1, far: 100, position: [0, 0, 7] }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      // Demand-driven frameloop: the scene is fully static (no comet, no
      // auto-rotate), so there's nothing to render between frames. Drei's
      // OrbitControls invalidates on every change event, and CameraFit
      // invalidates after mutating `camera.position`. Idle GPU cost drops
      // from ~60 fps × DPR² of compositing to zero.
      frameloop="demand"
    >
      <CameraFit pins={pins} />
      <MiniGlobeMesh isDark={isDark} />
      <MiniArcs arcs={arcs} />
      {pins.map((p) => (
        <MiniPin key={p.id} lat={p.lat} lng={p.lng} />
      ))}
      <OrbitControls
        enableDamping
        enableZoom
        enablePan={false}
        autoRotate={false}
      />
    </Canvas>
  )
}

export default function ArticleItemGlobe({ visits }: ArticleItemGlobeProps) {
  const isDark = useIsDark()

  // Drop visits with dangling location/trip refs at the surface — every
  // downstream consumer (mini-globe pins, timeline list rendering) assumes
  // both refs resolve, and a partial render is more useful than a crash.
  const safeVisits = useMemo(
    () => visits.filter((v) => v.location && v.trip),
    [visits],
  )

  // De-dupe pins by location: multiple visits to the same place collapse to
  // a single dot. Computed at the parent so the aria-label count below
  // matches what the user actually sees on the globe.
  const uniquePins: MiniPinSpec[] = useMemo(() => {
    const seen = new Map<string, MiniPinSpec>()
    for (const v of safeVisits) {
      if (!v.location.coordinates) continue
      if (!seen.has(v.location._id)) {
        seen.set(v.location._id, {
          id: v.location._id,
          lat: v.location.coordinates.lat,
          lng: v.location.coordinates.lng,
        })
      }
    }
    return Array.from(seen.values())
  }, [safeVisits])

  // Travel arcs connect consecutive visits chronologically (visits arrive
  // oldest → newest from the GROQ query). Same-location consecutive pairs
  // are skipped — they would project to a degenerate arc — and we de-dupe
  // by unordered pair so an A→B→A pattern doesn't draw the same line twice.
  const travelArcs: MiniArcSpec[] = useMemo(() => {
    const seenPairs = new Set<string>()
    const result: MiniArcSpec[] = []
    for (let i = 0; i < safeVisits.length - 1; i++) {
      const a = safeVisits[i].location
      const b = safeVisits[i + 1].location
      if (!a.coordinates || !b.coordinates) continue
      if (a._id === b._id) continue
      const pairKey = a._id < b._id ? `${a._id}|${b._id}` : `${b._id}|${a._id}`
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)
      const points = greatCircleArcPoints(
        a.coordinates.lat,
        a.coordinates.lng,
        b.coordinates.lat,
        b.coordinates.lng,
        GLOBE_RADIUS + ARC_SURFACE_OFFSET,
      ).map(([x, y, z]) => new THREE.Vector3(x, y, z))
      result.push({ key: pairKey, points })
    }
    return result
  }, [safeVisits])

  if (safeVisits.length === 0) return null

  const locationCount = uniquePins.length
  const visitCount = safeVisits.length
  const aLabel =
    visitCount === locationCount
      ? `Map of ${locationCount} location${locationCount === 1 ? '' : 's'} this item travelled to`
      : `Map of ${visitCount} visits across ${locationCount} location${locationCount === 1 ? '' : 's'} this item travelled to`

  return (
    <section className="mt-16 border-t border-gray-100 dark:border-gray-900 pt-12">
      <h2 className="text-xs tracking-widest uppercase text-gray-300 mb-6">Travelled to</h2>

      <div
        className="relative w-full h-[40vh] sm:h-[50vh]"
        role="img"
        aria-label={aLabel}
      >
        <MiniGlobe pins={uniquePins} arcs={travelArcs} isDark={isDark} />
      </div>

      {/* Visits ordered oldest → newest in the GROQ query (matches the
          locations timeline above) so the list reads as a journey. */}
      <ul className="flex flex-col gap-3 mt-8">
        {safeVisits.map((v) => (
          <li key={v._id} className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">{formatDateRange(v.startDate, v.endDate)}</span>
            <span className="text-sm font-light text-gray-800 dark:text-gray-200">
              {v.location.name}
              {' · '}
              <Link
                href={`/trip/${v.trip.slug.current}`}
                className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
              >
                {v.trip.title}
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
