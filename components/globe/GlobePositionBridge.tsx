'use client'

import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGlobe } from './GlobeContext'
import { sphericalToCartesian } from '@/lib/globe'

const GLOBE_RADIUS = 2

// Module-scoped scratch vectors. useFrame runs at 60fps; allocating a
// fresh THREE.Vector3 per frame per pin churns GC. Reusing these in
// place keeps the per-frame allocation count at zero.
const pinWorld = new THREE.Vector3()
const ndc = new THREE.Vector3()
const camDir = new THREE.Vector3()
const silhouetteCenter = new THREE.Vector3()
const camRight = new THREE.Vector3()
const silhouettePoint = new THREE.Vector3()
const cameraToPin = new THREE.Vector3()
const pinNormal = new THREE.Vector3()
const tmpProj = new THREE.Vector3()

// INVARIANT: this projection (and the back-face test below) assumes the
// globe geometry is fixed at the world origin and rotation happens by
// orbiting the camera. Pin positions are computed from raw lat/lng with
// no group transform applied. GlobePins.tsx makes the same assumption
// for its back-face fade. If a future change rotates the globe group
// instead, both this bridge and the GlobePins fade need to multiply by
// the globe's worldMatrix.

export default function GlobePositionBridge() {
  const { camera, size } = useThree()
  const { pins, pinPositionRef, globeScreenRef, frameSubscribersRef } = useGlobe()

  useFrame(() => {
    const positions: Record<string, { x: number; y: number; visible: boolean; behind: boolean }> = {}

    // --- Globe silhouette (small circle facing the camera) ---
    // For a sphere of radius R viewed from camera distance d (>R), the
    // silhouette circle in 3D has its center at distance R²/d from the
    // origin along the camera direction (= R·sinA where sinA = R/d) and
    // radius R·√(1 − R²/d²) (= R·cosA). Using the proper 3D circle rather
    // than a naive (R, 0, 0) projection keeps the screen circle accurate
    // at close camera distances (article-open zoom pulls the camera in
    // to ~4.2 world units).
    const camPos = camera.position
    const dist = camPos.length()
    let globeCircle: { cx: number; cy: number; r: number } | null = null
    if (dist > GLOBE_RADIUS) {
      camDir.copy(camPos).normalize()
      const sinA = GLOBE_RADIUS / dist
      const cosA = Math.sqrt(1 - sinA * sinA)
      silhouetteCenter.copy(camDir).multiplyScalar(GLOBE_RADIUS * sinA)
      const silhouetteRadius3D = GLOBE_RADIUS * cosA
      // Camera right vector — lies in the silhouette plane (perpendicular to
      // camera forward), so adding it picks a representative silhouette point.
      camRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
      silhouettePoint
        .copy(silhouetteCenter)
        .addScaledVector(camRight, silhouetteRadius3D)

      tmpProj.copy(silhouetteCenter).project(camera)
      const cx = (tmpProj.x * 0.5 + 0.5) * size.width
      const cy = (-tmpProj.y * 0.5 + 0.5) * size.height

      tmpProj.copy(silhouettePoint).project(camera)
      const ex = (tmpProj.x * 0.5 + 0.5) * size.width
      const ey = (-tmpProj.y * 0.5 + 0.5) * size.height

      globeCircle = { cx, cy, r: Math.hypot(ex - cx, ey - cy) }
    }
    globeScreenRef.current = globeCircle

    for (const pin of pins) {
      // Pin dot is a sphere centered ON the surface (half-embedded), so the
      // sphere's 3D center sits at exactly GLOBE_RADIUS. Projecting that
      // gives the dot's visual centroid on screen — projecting any further
      // out would aim at the dome's outer tip instead of its center.
      const [x, y, z] = sphericalToCartesian(
        pin.coordinates.lat,
        pin.coordinates.lng,
        GLOBE_RADIUS,
      )
      pinWorld.set(x, y, z)
      ndc.copy(pinWorld).project(camera)

      // Pin sits on the back hemisphere when its outward normal points
      // away from the camera. Pin position normalized == outward normal
      // (sphere centered at origin).
      cameraToPin.copy(pinWorld).sub(camPos)
      pinNormal.copy(pinWorld).normalize()
      const behind = cameraToPin.dot(pinNormal) > 0

      positions[pin.location._id] = {
        x: (ndc.x * 0.5 + 0.5) * size.width,
        y: (-ndc.y * 0.5 + 0.5) * size.height,
        visible: ndc.z < 1,
        behind,
      }
    }

    pinPositionRef.current = positions

    // Notify connector subscribers in the same tick. Running them inline
    // (not via a separate rAF) guarantees the SVG line is updated with
    // the same positions the canvas just rendered, so the line cannot
    // lag behind the pin during rotation.
    for (const fn of frameSubscribersRef.current) {
      fn()
    }
  })

  return null
}
