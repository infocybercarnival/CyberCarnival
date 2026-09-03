'use client'

import { useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GatewayScene } from './gateway-scene'

type GatewayCanvasProps = {
  className?: string
  /** 0 = static camera, 1 = full scroll dolly through the gateway */
  dolly?: number
  /** base camera position */
  cameraPosition?: [number, number, number]
  /** where the camera looks */
  target?: [number, number, number]
  /** multiplier for cursor parallax */
  parallax?: number
}

/**
 * Cinematic camera rig: subtle cursor parallax, and — when dolly > 0 —
 * the camera physically moves FORWARD through the gateway as the user
 * scrolls, so the architecture passes around them.
 */
function CameraRig({
  dolly = 0,
  cameraPosition = [0, 0.2, 9.5],
  target = [0, 0.1, -6],
  parallax = 1,
}: Omit<GatewayCanvasProps, 'className'>) {
  const { camera } = useThree()
  const look = useMemo(() => new THREE.Vector3(...target), [target[0], target[1], target[2]])

  useFrame((state) => {
    // scroll progress through the first viewport
    const scroll =
      typeof window !== 'undefined'
        ? Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1)
        : 0

    // dolly forward through the frames as the user scrolls
    const eased = scroll * scroll * (3 - 2 * scroll) // smoothstep
    const targetZ = cameraPosition[2] - eased * 8.5 * dolly
    const targetY = cameraPosition[1] + state.pointer.y * 0.35 * parallax
    const targetX = cameraPosition[0] + state.pointer.x * 0.6 * parallax

    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.07)
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.05)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.05)
    camera.lookAt(look)
  })

  return null
}

export function GatewayCanvas({
  className,
  dolly = 0,
  cameraPosition = [0, 0.2, 9.5],
  target = [0, 0.1, -6],
  parallax = 1,
}: GatewayCanvasProps) {
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        shadows
        camera={{ position: cameraPosition, fov: 50 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
      >
        {/* atmospheric depth — geometry dissolves into darkness */}
        <fog attach="fog" args={['#0a0a0f', 7, 24]} />

        {/* dark exhibition ambience */}
        <ambientLight intensity={0.35} />
        {/* cold white key from above-left */}
        <directionalLight
          position={[-6, 9, 6]}
          intensity={2.2}
          color="#ffffff"
          castShadow
          shadow-mapSize-width={512}
          shadow-mapSize-height={512}
          shadow-bias={-0.0004}
        />
        {/* faint cool fill from the right */}
        <directionalLight position={[7, 3, 2]} intensity={0.5} color="#9d9db4" />

        <CameraRig
          dolly={dolly}
          cameraPosition={cameraPosition}
          target={target}
          parallax={parallax}
        />
        <GatewayScene />
      </Canvas>
    </div>
  )
}
