import * as THREE from 'three'

// stylized blood: a burst of crimson droplets, a few spinning petal-quads,
// and an ink-splash sprite that blooms and fades. no gore, sumi-e energy.
function makeSplatTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(0,0,0,0)'
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 8 + Math.random() * 46
    const x = 64 + Math.cos(a) * r * 0.55
    const y = 64 + Math.sin(a) * r * 0.55
    const rad = 2 + Math.random() * (i < 6 ? 16 : 6)
    g.fillStyle = `rgba(150, 22, 18, ${0.5 + Math.random() * 0.5})`
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  return new THREE.CanvasTexture(c)
}

export function createBlood(scene) {
  const MAX = 600
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(MAX * 3)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const droplets = new THREE.Points(geo, new THREE.PointsMaterial({
    color: '#8e1a14', size: 0.085, transparent: true, opacity: 0.95, depthWrite: false
  }))
  droplets.frustumCulled = false
  scene.add(droplets)
  const parts = []

  const splatTex = makeSplatTexture()
  const splats = []

  function burst(p, dirAngle, big = false) {
    const n = big ? 90 : 40
    for (let i = 0; i < n; i++) {
      if (parts.length >= MAX) break
      const a = dirAngle + (Math.random() - 0.5) * 2.2
      const up = 1.2 + Math.random() * (big ? 3.2 : 1.8)
      const out = 0.8 + Math.random() * (big ? 3.0 : 1.6)
      parts.push({
        x: p.x, y: p.y + 1.05 + Math.random() * 0.35, z: p.z,
        vx: Math.sin(a) * out, vy: up, vz: Math.cos(a) * out,
        life: 0.5 + Math.random() * 0.5
      })
    }
    const mat = new THREE.SpriteMaterial({
      map: splatTex, transparent: true, opacity: 0.9, depthWrite: false, rotation: Math.random() * Math.PI * 2
    })
    const s = new THREE.Sprite(mat)
    s.position.set(p.x, p.y + 1.1, p.z)
    s.scale.setScalar(big ? 1.1 : 0.6)
    s.userData.life = 1
    s.userData.big = big
    scene.add(s)
    splats.push(s)
  }

  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.life -= dt
      if (p.life <= 0) { parts.splice(i, 1); continue }
      p.vy -= dt * 9
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt
    }
    for (let i = 0; i < MAX; i++) {
      const p = parts[i]
      pos[i * 3] = p ? p.x : 0
      pos[i * 3 + 1] = p ? p.y : -999
      pos[i * 3 + 2] = p ? p.z : 0
    }
    geo.attributes.position.needsUpdate = true
    for (let i = splats.length - 1; i >= 0; i--) {
      const s = splats[i]
      s.userData.life -= dt * 1.6
      if (s.userData.life <= 0) {
        scene.remove(s)
        s.material.dispose()
        splats.splice(i, 1)
        continue
      }
      s.scale.addScalar(dt * (s.userData.big ? 2.6 : 1.2))
      s.material.opacity = s.userData.life * 0.9
    }
  }

  return { burst, update }
}

// a white crescent that flashes along the sword's arc for one heartbeat
export function createSlashArc(scene) {
  const geo = new THREE.RingGeometry(1.0, 2.0, 24, 1, -Math.PI / 3, Math.PI * 2 / 3)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    color: '#fff4dd', transparent: true, opacity: 0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.visible = false
  scene.add(mesh)
  let life = 0
  function flash(p, facing) {
    mesh.position.set(p.x, p.y + 1.0, p.z)
    mesh.rotation.y = facing - Math.PI / 2
    mesh.visible = true
    life = 1
  }
  function update(dt) {
    if (!mesh.visible) return
    life -= dt * 6
    if (life <= 0) { mesh.visible = false; return }
    mat.opacity = life * 0.55
    mesh.scale.setScalar(1 + (1 - life) * 0.35)
  }
  return { flash, update }
}
