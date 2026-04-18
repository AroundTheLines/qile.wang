'use client'

import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGlobe } from './GlobeContext'
import { sphericalToCartesian } from '@/lib/globe'

const GLOBE_RADIUS = 2

export default function GlobePositionBridge() {
  const { camera, size } = useThree()
  const { pins, pinPositionRef, globeScreenRef, frameSubscribersRef } = useGlobe()

  useFrame(() => {
    const positions: Record<string, { x: number; y: number; visible: boolean; behind: boolean }> = {}
    const pinWorld = new THREE.Vector3()
    const ndc = new THREE.Vector3()

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
      const camDirFromOrigin = camPos.clone().normalize()
      const sinA = GLOBE_RADIUS / dist
      const cosA = Math.sqrt(1 - sinA * sinA)
      const silhouetteCenter3D = camDirFromOrigin
        .clone()
        .multiplyScalar(GLOBE_RADIUS * sinA)
      const silhouetteRadius3D = GLOBE_RADIUS * cosA
      // Camera right vector — lies in the silhouette plane (perpendicular to
      // camera forward), so adding it picks a representative silhouette point.
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
      const silhouettePoint = silhouetteCenter3D
        .clone()
        .add(camRight.multiplyScalar(silhouetteRadius3D))

      const centerNdc = silhouetteCenter3D.clone().project(camera)
      const cx = (centerNdc.x * 0.5 + 0.5) * size.width
      const cy = (-centerNdc.y * 0.5 + 0.5) * size.height

      const edgeNdc = silhouettePoint.project(camera)
      const ex = (edgeNdc.x * 0.5 + 0.5) * size.width
      const ey = (-edgeNdc.y * 0.5 + 0.5) * size.height

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
      const cameraToPin = pinWorld.clone().sub(camPos)
      const pinNormal = pinWorld.clone().normalize()
      const behind = cameraToPin.dot(pinNormal) > 0

      positions[pin.group] = {
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
