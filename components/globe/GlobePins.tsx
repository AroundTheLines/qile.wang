'use client'

import { useRef, useCallback, useMemo } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useGlobe } from './GlobeContext'
import { GLOBE_RADIUS, sphericalToCartesian } from '@/lib/globe'

const PIN_RADIUS = 0.042
// The dot is a full sphere sitting on the globe surface, so half of it
// is embedded inside the globe. We don't need any explicit hiding for
// that inner hemisphere: the depth-only occluder in GlobeMesh (radius
// GLOBE_RADIUS * 0.995) writes depth without color, and the pin's
// MeshBasicMaterial still runs depthTest (only depthWrite is off), so
// the embedded triangles fail the depth test and are culled for free.
// Tiny outward offset so the ring sits just above the surface without
// z-fighting against the depth-only occluder or the wireframe.
const SURFACE_OFFSET = 0.006
// ~1.8× the visible dot. Keeps a forgiving tap target without stealing
// hover/click from neighbors when the globe is zoomed in.
const HIT_RADIUS = 0.075
const PIN_COLOR = '#EF4444'

// Render-order bands — explicit so the transparent-sort order is
// deterministic and doesn't flip per-frame based on camera depth.
//   -2: depth-only occluder (opaque, writes depth, no color)
//   -1: pin dot + selection ring  (transparent, no depth write)
//    0: wireframe grid + country borders (transparent, default bucket)
// Lines always paint after pins, so map detail reads through every dot.
const RENDER_ORDER_PIN = -1

// Back-face fade — the pin opacity ramps from 0 → 1 as the dot's normal
// rotates from "just behind the camera-facing hemisphere" to "comfortably
// in front." FADE_START is slightly negative so the dot is already
// invisible a hair before it crosses the silhouette, avoiding a hard pop.
const FADE_START = -0.1
const FADE_END = 0.2

function Pin({
  locationId,
  lat,
  lng,
}: {
  locationId: string
  lat: number
  lng: number
}) {
  const {
    pins,
    selectedPin,
    selectPin,
    hoveredPin,
    setHoveredPin,
    setPinSubregionHighlight,
    lockedTrip,
    setLockedTrip,
    hoveredTrip,
    playbackHighlightedTripIds,
    requestPinScroll,
    showHover,
    isDesktop,
    addPauseReason,
    removePauseReason,
  } = useGlobe()
  const meshRef = useRef<THREE.Mesh>(null)
  const hitRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const pinMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const { camera } = useThree()

  // Tweened state — 0..1 for selected / hovered intensity and the current
  // visual scale. Using refs + useFrame gives us sub-frame smoothing so
  // select/deselect no longer snaps.
  const selectedT = useRef(0)
  const hoveredT = useRef(0)
  const scaleT = useRef(1)

  const pos = sphericalToCartesian(lat, lng, GLOBE_RADIUS)
  const isSelected = selectedPin === locationId
  const isHovered = hoveredPin === locationId
  // A pin is "trip-active" when it belongs to any trip currently being
  // highlighted — locked, hovered, or lit by the playback sweep. Trip-
  // active pins adopt the same visual active state as a selected pin
  // (ring + shared pulse) so the highlighted trip reads as a connected
  // set of stops rather than just animated arcs. Matches the arc
  // highlight rule in TripArcs.
  const pinTripIds = useMemo(
    () => pins.find((p) => p.location._id === locationId)?.tripIds ?? [],
    [pins, locationId],
  )
  const isInActiveTrip = useMemo(() => {
    if (lockedTrip && pinTripIds.includes(lockedTrip)) return true
    if (hoveredTrip && pinTripIds.includes(hoveredTrip)) return true
    if (playbackHighlightedTripIds.some((id) => pinTripIds.includes(id))) return true
    return false
  }, [pinTripIds, lockedTrip, hoveredTrip, playbackHighlightedTripIds])
  const isActive = isSelected || isInActiveTrip

  // Orient the pin stem so its +Y axis points outward from the globe center.
  const quat = useMemo(() => {
    const normal = new THREE.Vector3(...pos).normalize()
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
  }, [pos])

  useFrame(({ clock }, delta) => {
    if (!meshRef.current || !pinMaterialRef.current) return

    // --- Back-face fade ---
    // INVARIANT: assumes the globe is fixed at the world origin and
    // rotation happens by orbiting the camera (same assumption as
    // GlobePositionBridge). `pos` is the pin's local-space surface
    // point, so `pos.normalized()` doubles as the outward surface
    // normal in world space. If the globe group is ever rotated in
    // place, this dot product needs to take the world matrix into
    // account.
    const pinNormal = new THREE.Vector3(...pos).normalize()
    const cameraDir = new THREE.Vector3()
      .subVectors(camera.position, new THREE.Vector3(...pos))
      .normalize()
    const dot = pinNormal.dot(cameraDir)
    const tRange = Math.max(0, Math.min(1, (dot - FADE_START) / (FADE_END - FADE_START)))
    const opacity = tRange * tRange * (3 - 2 * tRange)
    pinMaterialRef.current.opacity = opacity

    if (hitRef.current) {
      hitRef.current.visible = opacity > 0.1
    }

    // --- Smoothly tween active / hovered toward target ---
    // Equivalent to ~180ms exponential easing at 60fps
    const k = Math.min(1, delta * 8)
    selectedT.current += ((isActive ? 1 : 0) - selectedT.current) * k
    hoveredT.current += ((isHovered ? 1 : 0) - hoveredT.current) * k

    // --- Target scale ---
    // The dot itself never changes size for active — the pulse lives
    // entirely on the ring border, so neighboring active pins don't
    // jitter in size. Only hover bumps the dot.
    const hoverScale = 1.15
    const targetScale = 1 + (hoverScale - 1) * hoveredT.current
    scaleT.current += (targetScale - scaleT.current) * k
    meshRef.current.scale.setScalar(scaleT.current)

    // --- Ring ---
    // Ring breathes outward and back with a smooth ease (sine → smoothstep)
    // whenever the pin is active — selected or part of an active trip
    // (locked, hovered, or playback-lit). Globally phased on
    // clock.elapsedTime so every active pin pulses in sync, matching
    // the shared rhythm of the trip arcs.
    if (ringRef.current && ringMaterialRef.current) {
      const sel = selectedT.current
      ringRef.current.visible = sel > 0.01 && opacity > 0.1
      if (ringRef.current.visible) {
        // 0..1 triangle-ish wave from a sine, then smoothstepped so the
        // in/out transitions ease rather than linearly ping-pong.
        const raw = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 2)
        const pulse = raw * raw * (3 - 2 * raw)
        // Grow outward with the pulse; fade back toward baseline opacity
        // as it expands so it reads as a breathing halo.
        ringRef.current.scale.setScalar(1 + (0.25 + 0.35 * pulse) * sel)
        ringMaterialRef.current.opacity = (0.55 - 0.3 * pulse) * sel * opacity
      }
    }
  })

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      // Stop propagation so only the nearest hit sphere claims the hover.
      // Without this, every overlapping pin in the ray fires pointer-over
      // and the last-fired one wins — causing Amsterdam to highlight when
      // you aim at London in a tight cluster.
      e.stopPropagation()
      if (!showHover) return
      if (selectedPin === locationId) return // don't show tooltip when panel is open for this pin
      setHoveredPin(locationId)
      // §7.5 / §9.2: emit sub-region highlight signal for the timeline
      // bands (B5 consumes).
      setPinSubregionHighlight(locationId)
      // §5.5: desktop pin hover pauses the playback sweep.
      if (isDesktop) addPauseReason('pin-hover')
    },
    [
      showHover,
      selectedPin,
      locationId,
      setHoveredPin,
      setPinSubregionHighlight,
      isDesktop,
      addPauseReason,
    ],
  )

  const handlePointerOut = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      if (!showHover) return
      // Only clear if *this* pin is the currently hovered one. When moving
      // between close pins, the new pin's pointer-over can fire before the
      // old pin's pointer-out — guarding prevents wiping out the new hover.
      setHoveredPin((prev) => (prev === locationId ? null : prev))
      // Keep sub-region bands lit while the pin panel is open for this
      // pin (spec §7.5). The provider clears the highlight when
      // selectedPin clears.
      if (selectedPin !== locationId) {
        setPinSubregionHighlight((prev) => (prev === locationId ? null : prev))
      }
      if (isDesktop) removePauseReason('pin-hover')
    },
    [
      showHover,
      locationId,
      selectedPin,
      setHoveredPin,
      setPinSubregionHighlight,
      isDesktop,
      removePauseReason,
    ],
  )

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      // Clear any lingering hover-pause; pointerOut may race with click.
      if (isDesktop) removePauseReason('pin-hover')

      // §9.2: context-aware dispatch when a trip is locked.
      if (lockedTrip) {
        const pin = pins.find((p) => p.location._id === locationId)
        const inLockedTrip = pin?.tripIds.includes(lockedTrip) ?? false
        if (inLockedTrip) {
          // Pin belongs to the locked trip — keep the lock, don't open a
          // pin panel, and signal TripPanel to scroll to this visit + pulse.
          setHoveredPin(null)
          requestPinScroll(locationId)
          return
        }
        // Outside the locked trip — release the lock and open pin panel.
        setLockedTrip(null)
        selectPin(locationId)
        setHoveredPin(null)
        setPinSubregionHighlight(locationId)
        return
      }

      // No lock — standard pin selection.
      selectPin(locationId)
      setHoveredPin(null)
      // §7.5: click keeps sub-region bands lit while the panel is open.
      setPinSubregionHighlight(locationId)
    },
    [
      pins,
      lockedTrip,
      locationId,
      selectPin,
      setLockedTrip,
      setHoveredPin,
      setPinSubregionHighlight,
      requestPinScroll,
      isDesktop,
      removePauseReason,
    ],
  )

  return (
    <group position={pos} quaternion={quat}>
      {/* Dot — half-embedded sphere with basic (unlit) material. Reads as a
          perfect flat-color circle from any viewing angle, unlike a flat
          disc which foreshortens to a line near the globe's silhouette.
          renderOrder sits in the pin band (RENDER_ORDER_PIN = -1) so the
          wireframe grid and country borders (default band, 0) always paint
          on top — otherwise depth-based transparent sorting flips the
          order per frame and map lines sometimes show through the dot
          and sometimes don't. */}
      <mesh ref={meshRef} renderOrder={RENDER_ORDER_PIN}>
        <sphereGeometry args={[PIN_RADIUS, 24, 24]} />
        <meshBasicMaterial
          ref={pinMaterialRef}
          color={PIN_COLOR}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* Selected ring — flat annulus tangent to the surface, offset
          outward enough to stay above the dot's embedded hemisphere.
          Shares the pin band so map lines read through it too (same
          "line art on top of pin art" invariant as the dot). */}
      <mesh
        ref={ringRef}
        visible={false}
        position={[0, SURFACE_OFFSET, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER_PIN}
      >
        <ringGeometry args={[PIN_RADIUS * 1.6, PIN_RADIUS * 2.2, 40]} />
        <meshBasicMaterial
          ref={ringMaterialRef}
          color={PIN_COLOR}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      {/* Invisible hit target for tap/click */}
      <mesh
        ref={hitRef}
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
          key={pin.location._id}
          locationId={pin.location._id}
          lat={pin.coordinates.lat}
          lng={pin.coordinates.lng}
        />
      ))}
    </>
  )
}
