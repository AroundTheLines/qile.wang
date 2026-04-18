'use client'

import { useRef, useCallback, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGlobe } from './GlobeContext'
import { sphericalToCartesian } from '@/lib/globe'

const PIN_RADIUS = 0.06
const STEM_LENGTH = 0.12
const STEM_RADIUS = 0.012
// Tuned so diameter ≈ 48px at RESTING_DISTANCE=6.5, FOV=45°.
const HIT_RADIUS = 0.17
const PIN_COLOR = '#EF4444'
const GLOBE_RADIUS = 2

function Pin({
  group,
  lat,
  lng,
}: {
  group: string
  lat: number
  lng: number
}) {
  const { selectedPin, selectPin, hoveredPin, setHoveredPin, showHover } = useGlobe()
  const meshRef = useRef<THREE.Mesh>(null)
  const hitRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const pinMaterialRef = useRef<THREE.MeshStandardMaterial>(null)
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const { camera } = useThree()

  // Tweened state — 0..1 for selected / hovered intensity and the current
  // visual scale. Using refs + useFrame gives us sub-frame smoothing so
  // select/deselect no longer snaps.
  const selectedT = useRef(0)
  const hoveredT = useRef(0)
  const scaleT = useRef(1)

  const pos = sphericalToCartesian(lat, lng, GLOBE_RADIUS)
  const isSelected = selectedPin === group
  const isHovered = hoveredPin === group

  // Orient the pin stem so its +Y axis points outward from the globe center.
  const quat = useMemo(() => {
    const normal = new THREE.Vector3(...pos).normalize()
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
  }, [pos])

  const stemMaterialRef = useRef<THREE.MeshStandardMaterial>(null)

  useFrame(({ clock }, delta) => {
    if (!meshRef.current || !pinMaterialRef.current) return

    // --- Back-face fade ---
    const pinNormal = new THREE.Vector3(...pos).normalize()
    const cameraDir = new THREE.Vector3()
      .subVectors(camera.position, new THREE.Vector3(...pos))
      .normalize()
    const dot = pinNormal.dot(cameraDir)
    const tRange = Math.max(0, Math.min(1, (dot - (-0.1)) / (0.2 - (-0.1))))
    const opacity = tRange * tRange * (3 - 2 * tRange)
    pinMaterialRef.current.opacity = opacity
    if (stemMaterialRef.current) stemMaterialRef.current.opacity = opacity

    if (hitRef.current) {
      hitRef.current.visible = opacity > 0.1
    }

    // --- Smoothly tween selected / hovered toward target ---
    // Equivalent to ~180ms exponential easing at 60fps
    const k = Math.min(1, delta * 8)
    selectedT.current += ((isSelected ? 1 : 0) - selectedT.current) * k
    hoveredT.current += ((isHovered ? 1 : 0) - hoveredT.current) * k

    // --- Target scale ---
    // Selected adds a pulse on top of a 1.0 baseline; hover pushes to 1.3.
    // We blend them via the tweened intensities so a switch between pins
    // gracefully unwinds the old ring + pulse instead of snapping.
    const pulse = 0.15 * Math.sin(clock.elapsedTime * 3)
    const selectedScale = 1 + pulse
    const hoverScale = 1.3
    const targetScale =
      1 + (selectedScale - 1) * selectedT.current + (hoverScale - 1) * hoveredT.current
    scaleT.current += (targetScale - scaleT.current) * k
    meshRef.current.scale.setScalar(scaleT.current)

    // --- Ring ---
    if (ringRef.current && ringMaterialRef.current) {
      const sel = selectedT.current
      ringRef.current.visible = sel > 0.01 && opacity > 0.1
      if (ringRef.current.visible) {
        ringRef.current.scale.setScalar(scaleT.current * 1.8)
        // Ring lives inside a rotated group; counter-rotate so it still faces camera.
        ringRef.current.quaternion
          .copy(quat)
          .invert()
          .multiply(camera.quaternion)
        ringMaterialRef.current.opacity = 0.4 * sel * opacity
      }
    }
  })

  const handlePointerOver = useCallback(() => {
    if (!showHover) return
    if (selectedPin === group) return // don't show tooltip when panel is open for this pin
    setHoveredPin(group)
  }, [showHover, selectedPin, group, setHoveredPin])

  const handlePointerOut = useCallback(() => {
    if (!showHover) return
    setHoveredPin(null)
  }, [showHover, setHoveredPin])

  const handleClick = useCallback(
    (e: THREE.Event) => {
      (e as unknown as { stopPropagation: () => void }).stopPropagation()
      selectPin(group)
      setHoveredPin(null)
    },
    [group, selectPin, setHoveredPin],
  )

  const headY = STEM_LENGTH + PIN_RADIUS * 0.8

  return (
    <group position={pos} quaternion={quat}>
      {/* Stem */}
      <mesh position={[0, STEM_LENGTH / 2, 0]}>
        <cylinderGeometry args={[STEM_RADIUS, STEM_RADIUS, STEM_LENGTH, 10]} />
        <meshStandardMaterial
          ref={stemMaterialRef}
          color={PIN_COLOR}
          transparent
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>

      {/* Pin head — shaded sphere for depth */}
      <mesh ref={meshRef} position={[0, headY, 0]}>
        <sphereGeometry args={[PIN_RADIUS, 24, 24]} />
        <meshStandardMaterial
          ref={pinMaterialRef}
          color={PIN_COLOR}
          transparent
          roughness={0.3}
          metalness={0.15}
        />
      </mesh>

      {/* Selected ring — sits around the pin head */}
      <mesh ref={ringRef} visible={false} position={[0, headY, 0]}>
        <ringGeometry args={[PIN_RADIUS * 1.5, PIN_RADIUS * 2, 32]} />
        <meshBasicMaterial
          ref={ringMaterialRef}
          color={PIN_COLOR}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Invisible hit target for tap/click */}
      <mesh
        ref={hitRef}
        position={[0, headY, 0]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[HIT_RADIUS, 8, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  )
}

export default function GlobePins() {
  const { pins } = useGlobe()

  return (
    <>
      {pins.map((pin) => (
        <Pin
          key={pin.group}
          group={pin.group}
          lat={pin.coordinates.lat}
          lng={pin.coordinates.lng}
        />
      ))}
    </>
  )
}
