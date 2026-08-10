import * as THREE from 'three'

export function makeKatana() {
  const katana = new THREE.Group()
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.74, 0.035),
    new THREE.MeshStandardMaterial({ color: '#c9cfd8', metalness: 0.35, roughness: 0.3 })
  )
  blade.position.y = 0.47
  const guard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.012, 12),
    new THREE.MeshStandardMaterial({ color: '#3a2e1a', metalness: 0.4, roughness: 0.6 })
  )
  guard.position.y = 0.1
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.021, 0.023, 0.24, 8),
    new THREE.MeshLambertMaterial({ color: '#1d1a2a' })
  )
  grip.position.y = -0.02
  katana.add(blade, guard, grip)
  return katana
}

// hang a katana on a rig's right hand, undoing the armature's baked scale
export function attachKatana(model, katana) {
  let hand = null
  model.traverse(o => {
    if (o.isBone && /hand.*r|right.*hand|r_hand|mixamorigRightHand/i.test(o.name) && !hand) hand = o
  })
  if (!hand) return false
  const ws = new THREE.Vector3()
  hand.getWorldScale(ws)
  katana.scale.setScalar(1 / ws.x)
  katana.rotation.set(0, 0, -Math.PI / 2)
  katana.position.set(0, 0.06, 0.02).divideScalar(ws.x)
  hand.add(katana)
  return true
}
