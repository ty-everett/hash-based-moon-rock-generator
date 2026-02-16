import { useEffect, useMemo, useRef, useState } from 'react'

const TAU = Math.PI * 2

function makeRng(seed) {
  let state = seed >>> 0

  const next = () => {
    let t = (state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    state = t >>> 0
    return result
  }

  return {
    nextFloat: next,
    nextInt: (max) => Math.floor(next() * max),
    nextRange: (min, max) => min + next() * (max - min),
  }
}

function seedFromHash(hash) {
  let seed = 0
  for (let i = 0; i < hash.length; i++) {
    seed = ((seed * 31) ^ parseInt(hash[i], 16)) >>> 0
  }
  return seed
}

function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input)
  return crypto.subtle.digest('SHA-256', bytes).then((buffer) =>
    [...new Uint8Array(buffer)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
  )
}

function fmtPct(value) {
  return `${Math.round(value * 100)}%`
}

function buildProfile(hash) {
  const rng = makeRng(seedFromHash(hash))

  const weathering = rng.nextRange(0.2, 0.96)
  const porosity = rng.nextRange(0.08, 0.94)
  const fragmentation = rng.nextRange(0.15, 0.92)
  const glassContent = rng.nextRange(0.02, 0.6)
  const impactAge = rng.nextRange(0.1, 0.98)
  const albedo = rng.nextRange(0.2, 0.74)

  const compositionScale = [
    'Basaltic',
    'Anorthositic',
    'Brecciated',
    'Vesicular Basalt',
    'Impact Melt',
  ]
  const textureScale = [
    'Angular Fragment',
    'Rounded Clast',
    'Blocky Breccia',
    'Glassy Clast',
    'Pitted Regolith',
  ]

  const majorWave = 2 + rng.nextInt(5)
  const minorWave = majorWave + 2 + rng.nextInt(3)
  const points = 240 + rng.nextInt(170)

  const profile = {
    traits: {
      composition: compositionScale[rng.nextInt(compositionScale.length)],
      texture: textureScale[rng.nextInt(textureScale.length)],
      weathering,
      porosity,
      fragmentation,
      glassContent,
      impactAge,
      albedo,
      impactField: impactAge > 0.7 ? 'Ancient heavy bombardment' : impactAge > 0.4 ? 'Moderate bombardment' : 'Younger surface',
      poreClass: porosity > 0.65 ? 'Highly vesicular' : porosity > 0.35 ? 'Mixed vesicularity' : 'Dense interior',
    },
    geometry: {
      baseRadius: 0.25 + rng.nextRange(0.015, 0.09),
      axisY: 0.84 + rng.nextRange(0.02, 0.24),
      majorWave,
      minorWave,
      points,
      phase1: rng.nextRange(0, TAU),
      phase2: rng.nextRange(0, TAU),
      ruggedness: 0.16 + fragmentation * 0.2,
      asymmetry: rng.nextRange(-0.14, 0.14),
      facetBias: rng.nextRange(0.08, 0.34),
    },
    surface: {
      microPits: 420 + Math.floor(porosity * 900 + fragmentation * 300),
      craters: 14 + Math.floor(impactAge * 42 + rng.nextRange(0, 12)),
      craterRadiusMin: 0.02 + impactAge * 0.02,
      craterRadiusMax: 0.08 + impactAge * 0.05,
      striations: 30 + Math.floor(weathering * 70 + fragmentation * 50),
      chips: 16 + Math.floor(fragmentation * 48),
      dust: 0.03 + weathering * 0.09,
    },
    color: {
      // Neutral lunar palette with slight warm/cool variation per seed.
      baseHue: 28 + Math.round(rng.nextRange(-10, 10)),
      warmShift: rng.nextRange(-6, 7),
      coolShift: rng.nextRange(-8, 4),
      albedo,
      shadowDepth: 0.22 + (1 - albedo) * 0.28,
      specularity: 0.03 + glassContent * 0.12,
    },
  }

  return profile
}

function paletteFromProfile(profile) {
  const { baseHue, warmShift, coolShift, albedo } = profile.color
  const baseLight = 18 + albedo * 28
  const sat = 9 + albedo * 12

  return {
    bright: `hsl(${baseHue + warmShift} ${sat + 4}% ${baseLight + 18}%)`,
    base: `hsl(${baseHue} ${sat}% ${baseLight}%)`,
    dark: `hsl(${baseHue + coolShift} ${Math.max(4, sat - 3)}% ${Math.max(8, baseLight - 14)}%)`,
    rim: `hsl(${baseHue + warmShift} ${sat + 6}% ${baseLight + 27}%)`,
  }
}

function buildRockPath(ctx, cx, cy, radius, profile, rng) {
  const { geometry } = profile
  const path = new Path2D()
  const ringPoints = []

  let first = true
  for (let i = 0; i <= geometry.points; i++) {
    const t = (i / geometry.points) * TAU
    const waveA = Math.sin(t * geometry.majorWave + geometry.phase1) * geometry.ruggedness
    const waveB = Math.sin(t * geometry.minorWave + geometry.phase2) * geometry.ruggedness * 0.46
    const facet = Math.sign(Math.sin(t * (geometry.majorWave + 5))) * geometry.facetBias * 0.12
    const randomJitter = (rng.nextFloat() - 0.5) * geometry.ruggedness * 0.12

    const shape = 0.75 + waveA * 0.5 + waveB * 0.34 + facet + randomJitter
    const r = radius * (0.66 + shape * 0.43)
    const x = cx + Math.cos(t) * r * (1 + geometry.asymmetry * 0.7)
    const y = cy + Math.sin(t) * r * geometry.axisY

    ringPoints.push({ t, x, y, r })
    if (first) {
      path.moveTo(x, y)
      first = false
    } else {
      path.lineTo(x, y)
    }
  }

  path.closePath()
  return { path, ringPoints }
}

function drawMoonRock(canvas, profile, viewport, hash) {
  const ctx = canvas.getContext('2d')
  const seed = seedFromHash(hash)
  const rng = makeRng(seed)
  const palette = paletteFromProfile(profile)

  const size = Math.min(viewport.width, viewport.height)
  const logical = Math.min(760, Math.max(360, size))
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))

  canvas.width = logical * dpr
  canvas.height = logical * dpr
  canvas.style.width = `${logical}px`
  canvas.style.height = `${logical}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const cx = logical / 2
  const cy = logical * 0.52
  const radius = logical * profile.geometry.baseRadius

  ctx.clearRect(0, 0, logical, logical)

  const bg = ctx.createLinearGradient(0, 0, 0, logical)
  bg.addColorStop(0, '#090b12')
  bg.addColorStop(0.5, '#111624')
  bg.addColorStop(1, '#191f2e')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, logical, logical)

  const { path, ringPoints } = buildRockPath(ctx, cx, cy, radius, profile, rng)

  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.filter = 'blur(20px)'
  ctx.beginPath()
  ctx.ellipse(cx + radius * 0.18, cy + radius * 0.92, radius * 0.95, radius * 0.34, 0.05, 0, TAU)
  ctx.fill()
  ctx.filter = 'none'
  ctx.restore()

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = logical * 0.04

  const fill = ctx.createRadialGradient(
    cx - radius * 0.45,
    cy - radius * 0.52,
    radius * 0.2,
    cx + radius * 0.32,
    cy + radius * 0.4,
    radius * 1.4,
  )
  fill.addColorStop(0, palette.bright)
  fill.addColorStop(0.38, palette.base)
  fill.addColorStop(1, palette.dark)

  ctx.fillStyle = fill
  ctx.fill(path)
  ctx.clip(path)

  const dust = profile.surface.dust
  for (let i = 0; i < profile.surface.microPits; i++) {
    const px = cx + (rng.nextFloat() - 0.5) * radius * 2.08
    const py = cy + (rng.nextFloat() - 0.5) * radius * 2.08
    const nx = (px - cx) / radius
    const ny = (py - cy) / (radius * profile.geometry.axisY)
    if (nx * nx + ny * ny > 1.04) continue

    const s = rng.nextRange(0.35, 1.9)
    const isDark = rng.nextFloat() > 0.36
    ctx.fillStyle = isDark
      ? `rgba(0,0,0,${rng.nextRange(dust * 0.5, dust + 0.12)})`
      : `rgba(255,255,255,${rng.nextRange(0.01, dust * 0.4)})`

    ctx.beginPath()
    ctx.ellipse(px, py, s * (1 + rng.nextFloat()), s * (0.75 + rng.nextFloat() * 0.35), rng.nextRange(0, TAU), 0, TAU)
    ctx.fill()
  }

  const light = { x: -0.72, y: -0.58 }
  for (let c = 0; c < profile.surface.craters; c++) {
    const angle = rng.nextRange(0, TAU)
    const rr = Math.sqrt(rng.nextFloat())
    const px = cx + Math.cos(angle) * radius * rr * 0.62
    const py = cy + Math.sin(angle) * radius * rr * 0.57
    const craterR = radius * rng.nextRange(profile.surface.craterRadiusMin, profile.surface.craterRadiusMax)

    const grad = ctx.createRadialGradient(
      px - craterR * 0.36,
      py - craterR * 0.36,
      craterR * 0.1,
      px,
      py,
      craterR,
    )
    grad.addColorStop(0, `rgba(0,0,0,${rng.nextRange(0.16, 0.3)})`)
    grad.addColorStop(0.65, `rgba(0,0,0,${rng.nextRange(0.22, 0.45)})`)
    grad.addColorStop(1, `rgba(255,255,255,${rng.nextRange(0.04, 0.15)})`)

    ctx.beginPath()
    ctx.fillStyle = grad
    ctx.ellipse(px, py, craterR * 1.08, craterR * 0.92, rng.nextRange(0, TAU), 0, TAU)
    ctx.fill()

    const lightAngle = Math.atan2(light.y, light.x)
    ctx.lineWidth = Math.max(0.6, craterR * 0.18)
    ctx.strokeStyle = `rgba(255,255,255,${rng.nextRange(0.1, 0.2)})`
    ctx.beginPath()
    ctx.arc(px, py, craterR * 0.92, lightAngle - 0.85, lightAngle + 0.85)
    ctx.stroke()

    ctx.strokeStyle = `rgba(0,0,0,${rng.nextRange(0.2, 0.38)})`
    ctx.beginPath()
    ctx.arc(px, py, craterR * 0.92, lightAngle + 2.2, lightAngle - 2.2)
    ctx.stroke()
  }

  for (let i = 0; i < profile.surface.striations; i++) {
    const p = ringPoints[rng.nextInt(ringPoints.length)]
    const direction = rng.nextFloat() > 0.5 ? 1 : -1
    const length = rng.nextRange(radius * 0.08, radius * 0.22)

    ctx.strokeStyle = `rgba(255,255,255,${rng.nextRange(0.03, 0.09)})`
    ctx.lineWidth = rng.nextRange(0.4, 1.2)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.quadraticCurveTo(
      p.x + Math.cos(p.t + direction * 0.3) * length,
      p.y + Math.sin(p.t + direction * 0.3) * length * profile.geometry.axisY,
      p.x + Math.cos(p.t + direction * 0.55) * length,
      p.y + Math.sin(p.t + direction * 0.55) * length * profile.geometry.axisY,
    )
    ctx.stroke()
  }

  for (let i = 0; i < profile.surface.chips; i++) {
    const angle = rng.nextRange(0, TAU)
    const rr = 0.45 + rng.nextRange(0, 0.52)
    const px = cx + Math.cos(angle) * radius * rr
    const py = cy + Math.sin(angle) * radius * rr * profile.geometry.axisY
    const chip = rng.nextRange(1.2, 3.8)

    ctx.fillStyle = `rgba(255,255,255,${rng.nextRange(0.03, profile.color.specularity + 0.06)})`
    ctx.beginPath()
    ctx.ellipse(px, py, chip, chip * 0.7, rng.nextRange(0, TAU), 0, TAU)
    ctx.fill()

    ctx.fillStyle = `rgba(0,0,0,${rng.nextRange(0.08, 0.16)})`
    ctx.beginPath()
    ctx.ellipse(px + chip * 0.45, py + chip * 0.35, chip * 0.9, chip * 0.5, rng.nextRange(0, TAU), 0, TAU)
    ctx.fill()
  }

  ctx.restore()

  const directionalShade = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius)
  directionalShade.addColorStop(0, `rgba(255,255,255,${0.06 + profile.color.albedo * 0.1})`)
  directionalShade.addColorStop(0.5, 'rgba(0,0,0,0)')
  directionalShade.addColorStop(1, `rgba(0,0,0,${profile.color.shadowDepth})`)
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = directionalShade
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 1.35, 0, TAU)
  ctx.fill()

  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = `rgba(255,255,255,${0.1 + profile.color.specularity * 0.6})`
  ctx.lineWidth = logical * 0.0038
  ctx.stroke(path)

  const rimGlow = ctx.createRadialGradient(cx - radius * 0.7, cy - radius * 0.7, radius * 0.5, cx, cy, radius * 1.2)
  rimGlow.addColorStop(0, 'rgba(255,255,255,0)')
  rimGlow.addColorStop(1, palette.rim)
  ctx.strokeStyle = rimGlow
  ctx.lineWidth = logical * 0.008
  ctx.stroke(path)
}

function traitItems(profile) {
  const { traits } = profile
  return [
    ['Composition', traits.composition],
    ['Texture Class', traits.texture],
    ['Albedo', fmtPct(traits.albedo)],
    ['Weathering', fmtPct(traits.weathering)],
    ['Porosity', fmtPct(traits.porosity)],
    ['Fragmentation', fmtPct(traits.fragmentation)],
    ['Impact Age', fmtPct(traits.impactAge)],
    ['Glass Content', fmtPct(traits.glassContent)],
    ['Impact Field', traits.impactField],
    ['Interior', traits.poreClass],
  ]
}

export default function App() {
  const [input, setInput] = useState('Lunar specimen #001')
  const [hash, setHash] = useState('')
  const [profile, setProfile] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    sha256Hex(input)
      .then((value) => {
        if (cancelled) return
        setHash(value)
        setProfile(buildProfile(value))
      })
      .catch(() => {
        if (!cancelled) {
          setHash('')
          setProfile(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [input])

  useEffect(() => {
    if (!hash || !profile || !canvasRef.current) return

    const draw = () => {
      drawMoonRock(
        canvasRef.current,
        profile,
        {
          width: canvasRef.current.parentElement.clientWidth,
          height: canvasRef.current.parentElement.clientHeight,
        },
        hash,
      )
    }

    const observer = new ResizeObserver(draw)
    observer.observe(canvasRef.current.parentElement)
    draw()

    return () => {
      observer.disconnect()
    }
  }, [hash, profile])

  const shortHash = useMemo(() => {
    if (!hash) return ''
    return `${hash.slice(0, 12)}...${hash.slice(-12)}`
  }, [hash])

  const traits = useMemo(() => {
    if (!profile) return []
    return traitItems(profile)
  }, [profile])

  return (
    <div className="app-shell">
      <h1>Lunar Rock Deterministic Renderer</h1>
      <p className="subtitle">Identical input text always generates the same moon-rock specimen.</p>

      <label className="label" htmlFor="seed-input">
        Seed text
      </label>
      <textarea
        id="seed-input"
        value={input}
        spellCheck="false"
        onChange={(event) => setInput(event.target.value)}
        rows={2}
      />

      <div className="meta">
        <span>SHA-256</span>
        <code>{shortHash || 'computing...'}</code>
      </div>

      <div className="traits-grid" aria-live="polite">
        {traits.map(([label, value]) => (
          <div key={`${label}-${value}`} className="trait-card">
            <span className="trait-label">{label}</span>
            <span className="trait-value">{value}</span>
          </div>
        ))}
      </div>

      <div className="canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
