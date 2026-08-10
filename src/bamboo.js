import * as THREE from 'three'
import { groundHeight } from './terrain.js'

// slashable bamboo: a slash severs the stalk at blade height, the top
// topples with a hinge at the cut, the stump regrows later
const CLUSTERS = [
  [14, -18], [-22, 10], [8, 26], [-12, -30], [30, 6]
]
const RESPAWN_SECONDS = 22

export function createBamboo() {
  const group = new THREE.Group()
  const stalks = []
  const stalkMat = new THREE.MeshLambertMaterial({ color: '#8fae5a', emissive: '#2c3d16' })
  const leafMat = new THREE.MeshLambertMaterial({ color: '#7d9c4e', emissive: '#26350f', side: THREE.DoubleSide })

  for (const [cx, cz] of CLUSTERS) {
    const n = 5 + Math.floor(Math.random() * 4)
    for (let i = 0; i < n; i++) {
      const x = cx + (Math.random() - 0.5) * 3.5
      const z = cz + (Math.random() - 0.5) * 3.5
      const h = 2.1 + Math.random() * 1.2
      const y = groundHeight(x, z)
      const holder = new THREE.Group()
      holder.position.set(x, y, z)
      holder.rotation.z = (Math.random() - 0.5) * 0.12
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 7), stalkMat)
      mesh.position.y = h / 2
      holder.add(mesh)
      // leaf tuft: a few splayed flattened cones, not one dart
      const tuft = new THREE.Group()
      for (let k = 0; k < 3; k++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 4), leafMat)
        leaf.scale.z = 0.3
        leaf.position.y = 0.1 + k * 0.12
        leaf.rotation.z = (k - 1) * 0.55 + (Math.random() - 0.5) * 0.2
        leaf.rotation.y = Math.random() * Math.PI
        tuft.add(leaf)
      }
      tuft.position.y = h
      holder.add(tuft)
      group.add(holder)
      stalks.push({ holder, mesh, tuft, h, x, z, y, cut: false, respawnAt: 0 })
    }
  }

  const falling = [] // { pivot, t }

  function slash(origin, facing, t, reach = 2.4, halfArc = 1.0) {
    let hits = 0
    for (const s of stalks) {
      if (s.cut) continue
      const dx = s.x - origin.x, dz = s.z - origin.z
      if (dx * dx + dz * dz > reach * reach) continue
      let a = Math.atan2(dx, dz) - facing
      a = Math.atan2(Math.sin(a), Math.cos(a))
      if (Math.abs(a) > halfArc) continue

      const cutY = Math.min(1.1, s.h - 0.5)
      s.cut = true
      s.respawnAt = t + RESPAWN_SECONDS
      // stump
      s.mesh.geometry.dispose()
      s.mesh.geometry = new THREE.CylinderGeometry(0.035, 0.05, cutY, 7)
      s.mesh.position.y = cutY / 2
      s.tuft.visible = false
      // severed top hinges over at the cut and fades into the grass
      const topLen = s.h - cutY
      const pivot = new THREE.Group()
      pivot.position.set(s.x, s.y + cutY, s.z)
      const fadeMat = stalkMat.clone()
      fadeMat.transparent = true
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, topLen, 7), fadeMat)
      top.position.y = topLen / 2
      pivot.add(top)
      const tuft = s.tuft.clone()
      tuft.traverse(o => { if (o.isMesh) o.material = fadeMat })
      tuft.position.y = topLen
      pivot.add(tuft)
      const dir = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.6
      pivot.userData = { t: 0, dir }
      group.add(pivot)
      falling.push(pivot)
      hits++
    }
    return hits
  }

  function update(dt, t) {
    for (let i = falling.length - 1; i >= 0; i--) {
      const p = falling[i]
      p.userData.t += dt
      const ft = p.userData.t
      const angle = Math.min(Math.PI / 2, ft * ft * 2.2)
      p.rotation.set(0, p.userData.dir, 0)
      p.rotateX(angle)
      if (ft > 2.2) {
        p.traverse(o => { if (o.isMesh) o.material.opacity = Math.max(0, 1 - (ft - 2.2)) })
        if (ft > 3.2) {
          group.remove(p)
          p.traverse(o => { if (o.isMesh) o.geometry.dispose() })
          falling.splice(i, 1)
        }
      }
    }
    for (const s of stalks) {
      if (s.cut && t > s.respawnAt) {
        s.cut = false
        s.mesh.geometry.dispose()
        s.mesh.geometry = new THREE.CylinderGeometry(0.035, 0.05, s.h, 7)
        s.mesh.position.y = s.h / 2
        s.tuft.visible = true
      }
    }
  }

  return { group, slash, update }
}
