'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import * as topojson from 'topojson-client'

const GLOBE_RADIUS = 2
const GRID_SEGMENTS_W = 36
const GRID_SEGMENTS_H = 18

// Parse country borders from world-atlas TopoJSON
function parseCountryBorders(): [number, number, number][][] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const worldData = require('world-atlas/countries-110m.json')
  const geojson = topojson.feature(worldData, worldData.objects.countries) as unknown as GeoJSON.FeatureCollection

  const lines: [number, number, number][][] = []

  function coordToCartesian(coord: number[]): [number, number, number] {
    const lng = (coord[0] * Math.PI) / 180
    const lat = (coord[1] * Math.PI) / 180
    return [
      GLOBE_RADIUS * Math.cos(lat) * Math.cos(lng),
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

  return lines
}

function GlobeShadow() {
  const texture = useMemo(() => {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2,
    )
    gradient.addColorStop(0, 'rgba(0,0,0,0.12)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    return tex
  }, [])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.3, 0]}>
      <circleGeometry args={[2.5, 32]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

export default function GlobeMesh() {
  const borderLines = useMemo(() => parseCountryBorders(), [])

  const wireframeGeo = useMemo(() => {
    const sphere = new THREE.SphereGeometry(GLOBE_RADIUS, GRID_SEGMENTS_W, GRID_SEGMENTS_H)
    return new THREE.WireframeGeometry(sphere)
  }, [])

  return (
    <group>
      {/* Solid inner sphere — occludes back-face wireframe + borders so
          the globe reads as a solid object, not a see-through wireframe.
          Sits just below GLOBE_RADIUS so the wireframe still appears on top. */}
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS * 0.995, 64, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Wireframe grid */}
      <lineSegments geometry={wireframeGeo}>
        <lineBasicMaterial color={0x000000} opacity={0.12} transparent />
      </lineSegments>

      {/* Country borders */}
      {borderLines.map((points, i) => (
        <Line
          key={i}
          points={points}
          color="black"
          lineWidth={1.5}
          opacity={0.45}
          transparent
        />
      ))}

      {/* Shadow plane */}
      <GlobeShadow />
    </group>
  )
}
