'use client'

import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ------------------------------------------------------------------ */
/* materials                                                           */
/* ------------------------------------------------------------------ */

function useMaterials() {
  return useMemo(() => {
    const charcoal = new THREE.MeshStandardMaterial({
      color: '#1d1d24',
      roughness: 0.62,
      metalness: 0.35,
    })
    const graphite = new THREE.MeshStandardMaterial({
      color: '#2b2b34',
      roughness: 0.5,
      metalness: 0.45,
    })
    const steel = new THREE.MeshStandardMaterial({
      color: '#3a3a46',
      roughness: 0.3,
      metalness: 0.85,
    })
    const trim = new THREE.MeshStandardMaterial({
      color: '#b9b9c6',
      roughness: 0.4,
      metalness: 0.6,
    })
    // bright architectural light strips — near frames
    const stripBright = new THREE.MeshStandardMaterial({
      color: '#14092b',
      emissive: new THREE.Color('#8b5cf6'),
      emissiveIntensity: 2.4,
      roughness: 1,
      metalness: 0,
    })
    // dim strips — deep frames, atmospheric recession
    const stripDim = new THREE.MeshStandardMaterial({
      color: '#0d0720',
      emissive: new THREE.Color('#5b34c9'),
      emissiveIntensity: 1.1,
      roughness: 1,
      metalness: 0,
    })
    // white cold strip for the outermost frame reveal
    const stripWhite = new THREE.MeshStandardMaterial({
      color: '#1a1a20',
      emissive: new THREE.Color('#d9d9e6'),
      emissiveIntensity: 0.9,
      roughness: 1,
      metalness: 0,
    })
    return { charcoal, graphite, steel, trim, stripBright, stripDim, stripWhite }
  }, [])
}

/* ------------------------------------------------------------------ */
/* one portal frame — columns + lintel, center fully open              */
/* ------------------------------------------------------------------ */

type FrameSpec = {
  z: number
  scale: number
  bright: boolean
}

const FRAMES: FrameSpec[] = [
  { z: 0.4, scale: 1, bright: true },
  { z: -2.6, scale: 0.94, bright: true },
  { z: -5.6, scale: 0.88, bright: false },
  { z: -8.6, scale: 0.82, bright: false },
  { z: -11.6, scale: 0.76, bright: false },
]

const PortalFrame = React.memo(function PortalFrame({
  spec,
  mats,
}: {
  spec: FrameSpec
  mats: ReturnType<typeof useMaterials>
}) {
  const { z, scale, bright } = spec
  const colX = 4.35 * scale
  const colH = 6.2 * scale
  const beamY = 3.05 * scale
  const strip = bright ? mats.stripBright : mats.stripDim

  return (
    <group position={[0, 0, z]}>
      {/* columns */}
      <mesh position={[-colX, 0, 0]} castShadow receiveShadow material={mats.charcoal}>
        <boxGeometry args={[0.55 * scale, colH, 1.05]} />
      </mesh>
      <mesh position={[colX, 0, 0]} castShadow receiveShadow material={mats.charcoal}>
        <boxGeometry args={[0.55 * scale, colH, 1.05]} />
      </mesh>
      {/* recessed inner column layer */}
      <mesh position={[-colX + 0.36 * scale, 0, -0.1]} material={mats.graphite}>
        <boxGeometry args={[0.18 * scale, colH * 0.92, 0.8]} />
      </mesh>
      <mesh position={[colX - 0.36 * scale, 0, -0.1]} material={mats.graphite}>
        <boxGeometry args={[0.18 * scale, colH * 0.92, 0.8]} />
      </mesh>
      {/* lintel */}
      <mesh position={[0, beamY, 0]} castShadow receiveShadow material={mats.graphite}>
        <boxGeometry args={[colX * 2 + 0.55 * scale, 0.5 * scale, 1.05]} />
      </mesh>
      {/* thin illuminated edge — inner face of each column */}
      <mesh position={[-colX + 0.46 * scale, 0, 0.2]} material={strip}>
        <boxGeometry args={[0.035, colH * 0.78, 0.035]} />
      </mesh>
      <mesh position={[colX - 0.46 * scale, 0, 0.2]} material={strip}>
        <boxGeometry args={[0.035, colH * 0.78, 0.035]} />
      </mesh>
      {/* illuminated underside of the lintel */}
      <mesh position={[0, beamY - 0.3 * scale, 0.2]} material={strip}>
        <boxGeometry args={[colX * 1.55, 0.03, 0.03]} />
      </mesh>
    </group>
  )
})

/* ------------------------------------------------------------------ */
/* the gateway environment                                             */
/* ------------------------------------------------------------------ */

export function GatewayScene() {
  const mats = useMaterials()
  const hoverLight = useRef<THREE.PointLight>(null)
  const fragA = useRef<THREE.Mesh>(null)
  const fragB = useRef<THREE.Mesh>(null)
  const fragC = useRef<THREE.Mesh>(null)
  const fragD = useRef<THREE.Mesh>(null)
  const breatheA = useRef<THREE.PointLight>(null)

  useFrame((state) => {
    const t = state.clock.elapsedTime

    // hover: a soft purple light follows the cursor near the front frames
    if (hoverLight.current) {
      hoverLight.current.position.x = THREE.MathUtils.lerp(
        hoverLight.current.position.x,
        state.pointer.x * 4.5,
        0.06,
      )
      hoverLight.current.position.y = THREE.MathUtils.lerp(
        hoverLight.current.position.y,
        state.pointer.y * 2.2,
        0.06,
      )
      hoverLight.current.intensity =
        2.2 + Math.abs(state.pointer.x) * 1.4 + Math.sin(t * 2.1) * 0.25
    }

    // floating fragments — slow independent drift at the edges
    if (fragA.current) {
      fragA.current.position.y = 1.7 + Math.sin(t * 0.5) * 0.09
      fragA.current.rotation.z = Math.sin(t * 0.3) * 0.08
    }
    if (fragB.current) {
      fragB.current.position.y = -0.4 + Math.sin(t * 0.42 + 2) * 0.08
      fragB.current.rotation.x = Math.sin(t * 0.35 + 1) * 0.06
    }
    if (fragC.current) {
      fragC.current.position.y = 2.1 + Math.sin(t * 0.56 + 4) * 0.07
    }
    if (fragD.current) {
      fragD.current.position.y = 0.9 + Math.sin(t * 0.47 + 3) * 0.1
      fragD.current.rotation.y = Math.sin(t * 0.28) * 0.1
    }

    // corridor light breathes slowly
    if (breatheA.current) {
      breatheA.current.intensity = 5.5 + Math.sin(t * 1.4) * 0.8
    }
  })

  return (
    <group>
      {/* ===== nested portal frames receding into depth ===== */}
      {FRAMES.map((spec) => (
        <PortalFrame key={spec.z} spec={spec} mats={mats} />
      ))}

      {/* ===== massive side structures — left ===== */}
      <group position={[-6.6, 0, -3]}>
        <mesh position={[0, 0.4, 0]} castShadow receiveShadow material={mats.charcoal}>
          <boxGeometry args={[2.6, 7.4, 9]} />
        </mesh>
        <mesh position={[1.35, -0.6, 1.8]} material={mats.graphite}>
          <boxGeometry args={[0.35, 4.2, 3.6]} />
        </mesh>
        {/* stacked horizontal fins on the inner face */}
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[1.42, 2.1 - i * 0.34, 1.2]} material={mats.steel}>
            <boxGeometry args={[0.14, 0.09, 2.6]} />
          </mesh>
        ))}
        {/* vertical white trim reveal */}
        <mesh position={[1.31, 0.2, 3.6]} material={mats.stripWhite}>
          <boxGeometry args={[0.025, 5.2, 0.025]} />
        </mesh>
      </group>

      {/* ===== massive side structures — right ===== */}
      <group position={[6.6, 0, -3]}>
        <mesh position={[0, 0.4, 0]} castShadow receiveShadow material={mats.charcoal}>
          <boxGeometry args={[2.6, 7.4, 9]} />
        </mesh>
        <mesh position={[-1.35, 0.3, 1.2]} material={mats.graphite}>
          <boxGeometry args={[0.35, 5, 4.4]} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[-1.42, -1.3 - i * 0.34, 1.6]} material={mats.steel}>
            <boxGeometry args={[0.14, 0.09, 2.2]} />
          </mesh>
        ))}
        <mesh position={[-1.31, 0.2, 3.6]} material={mats.stripWhite}>
          <boxGeometry args={[0.025, 5.2, 0.025]} />
        </mesh>
      </group>

      {/* ===== upper structural frame spanning the gateway ===== */}
      <group position={[0, 3.9, -3.5]}>
        <mesh castShadow material={mats.graphite}>
          <boxGeometry args={[11.5, 0.7, 8.5]} />
        </mesh>
        {/* recessed underside channel with a dim strip */}
        <mesh position={[0, -0.38, 1.5]} material={mats.stripDim}>
          <boxGeometry args={[8.5, 0.03, 0.03]} />
        </mesh>
        <mesh position={[0, -0.38, -1.5]} material={mats.stripDim}>
          <boxGeometry args={[7.5, 0.03, 0.03]} />
        </mesh>
      </group>

      {/* ===== floor — dark reflective slab with guide lines ===== */}
      <mesh
        position={[0, -3.15, -4]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        material={mats.charcoal}
      >
        <planeGeometry args={[40, 40]} />
      </mesh>
      {/* perspective guide strips running into the corridor */}
      <mesh position={[-2.9, -3.12, -5]} material={mats.stripDim}>
        <boxGeometry args={[0.04, 0.012, 17]} />
      </mesh>
      <mesh position={[2.9, -3.12, -5]} material={mats.stripDim}>
        <boxGeometry args={[0.04, 0.012, 17]} />
      </mesh>
      {/* cross seams on the floor for depth rhythm */}
      {[-1.2, -4.4, -7.6, -10.8].map((z) => (
        <mesh key={z} position={[0, -3.13, z]} material={mats.graphite}>
          <boxGeometry args={[7.5, 0.015, 0.09]} />
        </mesh>
      ))}

      {/* ===== deep end — faint illuminated wall far beyond ===== */}
      <mesh position={[0, 0, -15.5]} material={mats.stripDim}>
        <boxGeometry args={[4.6, 3.4, 0.05]} />
      </mesh>

      {/* ===== floating fragments — edges only, never the center ===== */}
      <mesh ref={fragA} position={[-4.6, 1.7, -1.4]} castShadow material={mats.steel}>
        <boxGeometry args={[0.5, 0.5, 0.07]} />
      </mesh>
      <mesh ref={fragB} position={[4.9, -0.4, -2.6]} castShadow material={mats.graphite}>
        <boxGeometry args={[0.38, 0.7, 0.06]} />
      </mesh>
      <mesh ref={fragC} position={[4.3, 2.1, -0.8]} castShadow material={mats.trim}>
        <boxGeometry args={[0.3, 0.3, 0.05]} />
      </mesh>
      <mesh ref={fragD} position={[-4.9, 0.9, -3.4]} castShadow material={mats.steel}>
        <boxGeometry args={[0.26, 0.9, 0.06]} />
      </mesh>

      {/* ===== internal architectural lighting ===== */}
      {/* corridor glow between the second and third frames */}
      <pointLight
        ref={breatheA}
        position={[0, 0.6, -4.2]}
        color="#7c4dff"
        intensity={5.5}
        distance={9}
        decay={2}
      />
      {/* deep glow near the end wall */}
      <pointLight position={[0, 0.2, -13]} color="#6d3df0" intensity={4} distance={8} decay={2} />
      {/* hover-follow light near the front plane */}
      <pointLight
        ref={hoverLight}
        position={[0, 0, 2.4]}
        color="#8b5cf6"
        intensity={2.2}
        distance={6}
        decay={2}
      />
    </group>
  )
}
