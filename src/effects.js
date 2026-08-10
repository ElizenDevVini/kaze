import * as THREE from 'three'
import { FIELD, groundHeight } from './terrain.js'

// crimson petals forever adrift on the wind, and gold clippings when grass falls
export function createPetals() {
  const COUNT = 240
  const geo = new THREE.PlaneGeometry(0.09, 0.06)
  const mat = new THREE.MeshBasicMaterial({
    color: '#c23a2e', side: THREE.DoubleSide, transparent: true, opacity: 0.9
  })
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT)
  const seeds = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  for (let i = 0; i < COUNT; i++) {
    seeds.push({
      x: (Math.random() - 0.5) * FIELD * 0.8,
      z: (Math.random() - 0.5) * FIELD * 0.8,
      y: Math.random() * 5 + 0.3,
      p: Math.random() * 100
    })
  }
  function update(dt, t, playerPos) {
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i]
      s.x += dt * (1.6 + Math.sin(s.p + t * 0.7) * 0.5)
      s.z += dt * (0.5 + Math.cos(s.p * 1.3 + t * 0.5) * 0.4)
      s.y += Math.sin(t * 1.7 + s.p) * dt * 0.5 - dt * 0.12
      // recycle petals that drift too far or settle, near the player so they stay visible
      const ground = groundHeight(s.x, s.z)
      if (s.y < ground + 0.1 || Math.abs(s.x - playerPos.x) > 45 || Math.abs(s.z - playerPos.z) > 45) {
        s.x = playerPos.x + (Math.random() - 0.5) * 70 - 20
        s.z = playerPos.z + (Math.random() - 0.5) * 70
        s.y = ground + 2 + Math.random() * 5
      }
      e.set(t * 2 + s.p, s.p * 3, t * 1.4 + s.p * 2)
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(1, 1, 1))
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
  }
  return { mesh, update }
}

export function createClippings() {
  const MAX = 400
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(MAX * 3)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color: '#e6c463', size: 0.06, transparent: true, opacity: 0.95, depthWrite: false
  })
  const mesh = new THREE.Points(geo, mat)
  mesh.frustumCulled = false
  const parts = []
  function burst(positions) {
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (parts.length >= MAX) return
        parts.push({
          x: positions[i], y: positions[i + 1] + 0.5 + Math.random() * 0.4, z: positions[i + 2],
          vx: (Math.random() - 0.5) * 2.4, vy: 1 + Math.random() * 2.2, vz: (Math.random() - 0.5) * 2.4,
          life: 0.9
        })
      }
    }
  }
  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.life -= dt
      if (p.life <= 0) { parts.splice(i, 1); continue }
      p.vy -= dt * 6
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt
    }
    for (let i = 0; i < MAX; i++) {
      const p = parts[i]
      pos[i * 3] = p ? p.x : 0
      pos[i * 3 + 1] = p ? p.y : -999
      pos[i * 3 + 2] = p ? p.z : 0
    }
    geo.attributes.position.needsUpdate = true
  }
  return { mesh, burst, update }
}
