'use client'

import { useEffect, useRef } from 'react'

/**
 * Global Layer 2 atmospheric animation — soft drifting nebula-cloud blobs +
 * dense twinkling starfield, plus a population of compact subtle falling spiders
 * descending slowly through the background at z-index: 10 (behind foreground UI at z-20+).
 */

type Nebula = {
  x: number
  y: number
  r: number
  hue: 'violet' | 'indigo' | 'magenta'
  alpha: number
  driftX: number
  driftY: number
}

type Star = {
  x: number
  y: number
  size: number
  baseAlpha: number
  twinkleSpeed: number
  twinklePhase: number
}

type Spider = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  size: number
  opacity: number
  phase: number
}

const NEBULA_COUNT = 5
const STAR_COUNT_PER_MPX = 140
const MAX_DPR = 1.5

const NEBULA_COLORS: Record<Nebula['hue'], [number, number, number]> = {
  violet: [140, 90, 220],
  indigo: [90, 70, 200],
  magenta: [170, 80, 200],
}

export function BackgroundField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    let width = 0
    let height = 0
    let dpr = 1
    let nebulas: Nebula[] = []
    let stars: Star[] = []
    let spiders: Spider[] = []

    function buildScene() {
      nebulas = Array.from({ length: NEBULA_COUNT }, (_, i) => {
        const hues: Nebula['hue'][] = ['violet', 'indigo', 'magenta']
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.min(width, height) * (0.35 + Math.random() * 0.35),
          hue: hues[i % hues.length],
          alpha: 0.05 + Math.random() * 0.05,
          driftX: (Math.random() - 0.5) * 0.015,
          driftY: (Math.random() - 0.5) * 0.015,
        }
      })

      const starCount = Math.round(
        ((width * height) / 1_000_000) * STAR_COUNT_PER_MPX,
      )
      stars = Array.from({ length: starCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() < 0.08 ? 1.5 + Math.random() * 0.8 : 0.5 + Math.random() * 0.7,
        baseAlpha: 0.25 + Math.random() * 0.55,
        twinkleSpeed: 0.4 + Math.random() * 1.2,
        twinklePhase: Math.random() * Math.PI * 2,
      }))

      // Falling spider population: 16 visible spiders on desktop (>=1024px), 9 on mobile
      const spiderCount = width >= 1024 ? 16 : 9
      const baseBodySize = width >= 1024 ? Math.max(7, Math.min(10, width * 0.007)) : 5.5

      spiders = Array.from({ length: spiderCount }, (_, id) => ({
        id,
        x: width * 0.02 + Math.random() * (width * 0.96),
        y: Math.random() * (height * 1.3) - 150,
        vx: (Math.random() - 0.5) * 24,          // Horizontal drift (-12 to +12 px/sec)
        vy: 35 + Math.random() * 55,             // Falling speed (35 to 90 px/sec)
        rot: 0,
        size: baseBodySize * (0.75 + Math.random() * 0.5),
        opacity: 0.60 + Math.random() * 0.15,      // Luminous 60% - 75% opacity range
        phase: Math.random() * Math.PI * 2,
      }))
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      width = window.innerWidth
      height = window.innerHeight
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      buildScene()
    }

    resize()
    window.addEventListener('resize', resize)

    let raf = 0
    let running = true
    let last = performance.now()
    let elapsed = 0

    function onVisibility() {
      running = document.visibilityState === 'visible'
      if (running) {
        last = performance.now()
        raf = requestAnimationFrame(draw)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    function drawNebulas() {
      ctx!.save()
      ctx!.globalCompositeOperation = 'lighter'
      nebulas.forEach((n) => {
        if (!reduceMotion) {
          n.x += n.driftX
          n.y += n.driftY
          if (n.x < -n.r) n.x = width + n.r
          if (n.x > width + n.r) n.x = -n.r
          if (n.y < -n.r) n.y = height + n.r
          if (n.y > height + n.r) n.y = -n.r
        }
        const [r, g, b] = NEBULA_COLORS[n.hue]
        const grad = ctx!.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r)
        grad.addColorStop(0, `rgba(${r},${g},${b},${n.alpha})`)
        grad.addColorStop(0.6, `rgba(${r},${g},${b},${n.alpha * 0.35})`)
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx!.fillStyle = grad
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx!.fill()
      })
      ctx!.restore()
    }

    function drawStars(tSec: number) {
      stars.forEach((s) => {
        const twinkle = reduceMotion
          ? s.baseAlpha
          : s.baseAlpha *
            (0.55 + 0.45 * Math.sin(tSec * s.twinkleSpeed + s.twinklePhase))
        ctx!.beginPath()
        ctx!.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(215,200,245,${twinkle})`
        ctx!.fill()
      })
    }

    function drawSpider(s: Spider, tSec: number) {
      let edgeFade = 1
      if (s.y < 80) {
        edgeFade = Math.max(0, s.y / 80)
      } else if (s.y > height - 120) {
        edgeFade = Math.max(0, (height - s.y) / 120)
      }

      const currentAlpha = s.opacity * edgeFade
      if (currentAlpha <= 0.02) return

      ctx!.save()
      ctx!.globalCompositeOperation = 'source-over'
      ctx!.globalAlpha = currentAlpha

      ctx!.translate(s.x, s.y)
      ctx!.rotate(s.rot)

      // Luminous purple outer glow & atmospheric bloom halo
      ctx!.shadowColor = 'rgba(168, 85, 247, 0.85)'
      ctx!.shadowBlur = 12

      const sz = s.size
      const bodyBob = Math.sin(tSec * 2.5 + s.phase) * sz * 0.03

      // Abdomen (Rear oval carapace)
      ctx!.save()
      ctx!.translate(0, sz * 0.22 + bodyBob)
      ctx!.beginPath()
      ctx!.ellipse(0, 0, sz * 0.44, sz * 0.58, 0, 0, Math.PI * 2)
      ctx!.fillStyle = 'rgba(45, 18, 75, 0.95)'
      ctx!.strokeStyle = 'rgba(225, 170, 255, 0.95)'
      ctx!.lineWidth = 1.3
      ctx!.fill()
      ctx!.stroke()
      ctx!.restore()

      // Cephalothorax (Front torso)
      ctx!.save()
      ctx!.translate(0, bodyBob)
      ctx!.beginPath()
      ctx!.ellipse(0, -sz * 0.35, sz * 0.3, sz * 0.34, 0, 0, Math.PI * 2)
      ctx!.fillStyle = 'rgba(60, 25, 100, 0.95)'
      ctx!.strokeStyle = 'rgba(235, 180, 255, 0.95)'
      ctx!.lineWidth = 1.35
      ctx!.fill()
      ctx!.stroke()

      // Chelicerae / Pedipalps (Front feelers)
      ctx!.beginPath()
      ctx!.moveTo(-sz * 0.1, -sz * 0.65)
      ctx!.lineTo(-sz * 0.13, -sz * 0.78)
      ctx!.moveTo(sz * 0.1, -sz * 0.65)
      ctx!.lineTo(sz * 0.13, -sz * 0.78)
      ctx!.strokeStyle = 'rgba(245, 190, 255, 0.95)'
      ctx!.lineWidth = 1.1
      ctx!.stroke()

      // 8 Segmented Spider Legs
      const legConfigs = [
        { attachY: -sz * 0.46, coxaX: 0.38, coxaY: -0.18, femurX: 0.8, femurY: -0.4, tibiaX: 1.1, tibiaY: -0.2, tarsusX: 1.28, tarsusY: 0.05, phaseOffset: 0 },
        { attachY: -sz * 0.36, coxaX: 0.42, coxaY: -0.05, femurX: 0.9, femurY: -0.2, tibiaX: 1.25, tibiaY: 0.05, tarsusX: 1.45, tarsusY: 0.3, phaseOffset: 1.2 },
        { attachY: -sz * 0.26, coxaX: 0.42, coxaY: 0.1, femurX: 0.95, femurY: 0.15, tibiaX: 1.25, tibiaY: 0.4, tarsusX: 1.4, tarsusY: 0.7, phaseOffset: 2.4 },
        { attachY: -sz * 0.16, coxaX: 0.38, coxaY: 0.22, femurX: 0.8, femurY: 0.5, tibiaX: 1.1, tibiaY: 0.88, tarsusX: 1.25, tarsusY: 1.2, phaseOffset: 3.6 },
      ]

      legConfigs.forEach((cfg) => {
        const legSway = Math.sin(tSec * 2.8 + s.phase + cfg.phaseOffset) * 0.06

        ;[-1, 1].forEach((side) => {
          const sX = side
          const startX = sX * sz * 0.24
          const startY = cfg.attachY

          const coxaX = startX + sX * sz * cfg.coxaX * 0.4
          const coxaY = startY + sz * cfg.coxaY * 0.4

          const femurX = startX + sX * sz * (cfg.femurX + legSway)
          const femurY = startY + sz * (cfg.femurY - Math.abs(legSway))

          const tibiaX = startX + sX * sz * (cfg.tibiaX + legSway * 0.8)
          const tibiaY = startY + sz * (cfg.tibiaY + legSway * 0.5)

          const tarsusX = startX + sX * sz * (cfg.tarsusX + legSway * 0.5)
          const tarsusY = startY + sz * cfg.tarsusY

          // Femur
          ctx!.beginPath()
          ctx!.moveTo(startX, startY)
          ctx!.lineTo(coxaX, coxaY)
          ctx!.lineTo(femurX, femurY)
          ctx!.strokeStyle = 'rgba(225, 170, 255, 0.95)'
          ctx!.lineWidth = 1.25
          ctx!.stroke()

          // Tibia
          ctx!.beginPath()
          ctx!.moveTo(femurX, femurY)
          ctx!.lineTo(tibiaX, tibiaY)
          ctx!.strokeStyle = 'rgba(215, 160, 255, 0.85)'
          ctx!.lineWidth = 1.1
          ctx!.stroke()

          // Tarsus
          ctx!.beginPath()
          ctx!.moveTo(tibiaX, tibiaY)
          ctx!.lineTo(tarsusX, tarsusY)
          ctx!.strokeStyle = 'rgba(205, 150, 255, 0.75)'
          ctx!.lineWidth = 0.95
          ctx!.stroke()
        })
      })

      ctx!.restore()
      ctx!.restore()
    }

    function draw(now: number) {
      if (!running) return
      const dt = Math.min(now - last, 50)
      last = now
      elapsed += dt
      const tSec = elapsed / 1000

      ctx!.clearRect(0, 0, width, height)
      drawNebulas()
      drawStars(tSec)

      if (!reduceMotion) {
        spiders.forEach((sp) => {
          sp.y += (sp.vy * dt) / 1000
          sp.x += (sp.vx * dt) / 1000

          sp.rot = Math.atan2(sp.vx, sp.vy) * 0.3 + Math.sin(tSec * 1.5 + sp.phase) * 0.035

          if (sp.y > height + 40) {
            sp.y = -50 - Math.random() * 120
            sp.x = width * 0.02 + Math.random() * (width * 0.96)
            sp.vx = (Math.random() - 0.5) * 24
            sp.vy = 35 + Math.random() * 55
            sp.opacity = 0.60 + Math.random() * 0.15
            sp.phase = Math.random() * Math.PI * 2
          }
        })
      }

      spiders.forEach((sp) => drawSpider(sp, tSec))

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-10"
    />
  )
}
