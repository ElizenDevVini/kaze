import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { groundHeight, FIELD } from './terrain.js'

const WALK = 2.4
const RUN = 5.6
const SLASH_TIME = 0.55
const STRIKE_AT = 0.2

export function createPlayer(scene, camera, callbacks) {
  const root = new THREE.Group()
  root.position.set(0, groundHeight(0, 0), 4)
  scene.add(root)

  // placeholder until the generated model arrives; swapped on load
  const placeholder = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.26, 0.85, 4, 8),
    new THREE.MeshLambertMaterial({ color: '#2c3454' })
  )
  body.position.y = 0.85
  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 0.22, 10),
    new THREE.MeshLambertMaterial({ color: '#6e5a34' })
  )
  hat.position.y = 1.62
  placeholder.add(body, hat)
  root.add(placeholder)

  // fake blob shadow: cheaper than shadow maps and reads fine in tall grass
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 20),
    new THREE.MeshBasicMaterial({ color: '#1a1208', transparent: true, opacity: 0.4, depthWrite: false })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.03
  root.add(shadow)

  // procedural katana, attached to the model's hand bone once it loads
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

  let mixer = null
  let actions = {}
  let active = null
  let modelReady = false

  function fadeTo(name, dur = 0.22, once = false) {
    const next = actions[name]
    if (!next || active === next) return
    next.reset()
    if (once) {
      next.setLoop(THREE.LoopOnce)
      next.clampWhenFinished = true
    }
    next.fadeIn(dur).play()
    if (active) active.fadeOut(dur)
    active = next
  }

  new GLTFLoader().load('./assets/samurai.glb', gltf => {
    const model = gltf.scene
    // normalize to ~1.7m tall regardless of export scale
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const s = 1.7 / Math.max(size.y, 0.001)
    model.scale.setScalar(s)
    model.position.y = -box.min.y * s
    model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material.side = THREE.DoubleSide } })
    root.remove(placeholder)
    root.add(model)

    mixer = new THREE.AnimationMixer(model)
    const find = re => gltf.animations.find(c => re.test(c.name))
    const clips = {
      idle: find(/idle/i),
      walk: find(/walk/i),
      run: find(/run/i) || find(/walk/i),
      slash1: find(/slash1|left_slash/i),
      slash2: find(/slash2|judgment/i)
    }
    for (const [k, clip] of Object.entries(clips)) {
      if (clip) actions[k] = mixer.clipAction(clip)
    }
    if (actions.idle) { actions.idle.play(); active = actions.idle }

    // hand the katana to the right hand if the rig exposes one
    let hand = null
    model.traverse(o => {
      if (o.isBone && /hand.*r|right.*hand|r_hand|mixamorigRightHand/i.test(o.name) && !hand) hand = o
    })
    if (hand) {
      // the armature node carries a tiny scale (Meshy exports at 0.01);
      // undo the ACCUMULATED world scale so the sword keeps its real size
      const ws = new THREE.Vector3()
      hand.getWorldScale(ws)
      katana.scale.setScalar(1 / ws.x)
      katana.rotation.set(0, 0, -Math.PI / 2)
      katana.position.set(0, 0.06, 0.02).divideScalar(ws.x)
      hand.add(katana)
    } else {
      katana.position.set(0.3, 0.9, 0.1)
      katana.rotation.z = -0.4
      root.add(katana)
    }
    modelReady = true
    callbacks.onModelReady?.()
  }, undefined, () => {
    // no model yet: keep the placeholder, hang the sword at its side
    katana.position.set(0.34, 0.95, 0.05)
    katana.rotation.z = -0.5
    root.add(katana)
    callbacks.onModelReady?.()
  })

  // input
  const keys = {}
  let yaw = 0, pitch = 0.03
  let slashTimer = -1
  let struck = false
  let slashAlt = false

  addEventListener('keydown', e => { keys[e.code] = true })
  addEventListener('keyup', e => { keys[e.code] = false })
  addEventListener('mousemove', e => {
    if (document.pointerLockElement) {
      yaw -= e.movementX * 0.0024
      pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.0018, -0.2, 0.85)
    }
  })
  function trySlash() {
    if (slashTimer >= 0) return
    slashTimer = 0
    struck = false
    slashAlt = !slashAlt
    fadeTo(slashAlt ? 'slash1' : 'slash2', 0.08, true)
    callbacks.onSwing?.()
  }
  addEventListener('mousedown', e => {
    if (document.pointerLockElement && e.button === 0) trySlash()
  })

  const camTarget = new THREE.Vector3()
  const move = new THREE.Vector3()
  let charYaw = 0
  let speed = 0

  function update(dt, t) {
    // slash timeline
    if (slashTimer >= 0) {
      slashTimer += dt
      if (!struck && slashTimer >= STRIKE_AT) {
        struck = true
        callbacks.onStrike?.(root.position, charYaw)
      }
      if (slashTimer > SLASH_TIME) slashTimer = -1
    }

    // camera-relative movement
    move.set(
      (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0),
      0,
      (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0)
    )
    const wants = move.lengthSq() > 0
    const target = wants ? (keys.ShiftLeft || keys.ShiftRight ? RUN : WALK) : 0
    const slashSlow = slashTimer >= 0 ? 0.3 : 1
    speed += (target * slashSlow - speed) * Math.min(1, dt * 8)

    if (wants) {
      move.normalize()
      const dir = new THREE.Vector3(move.x, 0, move.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      const targetYaw = Math.atan2(dir.x, dir.z)
      let d = targetYaw - charYaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      charYaw += d * Math.min(1, dt * 10)
      root.position.x += dir.x * speed * dt
      root.position.z += dir.z * speed * dt
    }
    const bound = FIELD / 2 - 6
    root.position.x = THREE.MathUtils.clamp(root.position.x, -bound, bound)
    root.position.z = THREE.MathUtils.clamp(root.position.z, -bound, bound)
    root.position.y = groundHeight(root.position.x, root.position.z)
    root.rotation.y = charYaw

    // placeholder bob so the capsule reads as walking pre-model
    if (!modelReady) placeholder.position.y = Math.abs(Math.sin(t * 8)) * 0.05 * (speed / WALK)

    // animation state
    if (mixer) {
      if (slashTimer < 0) {
        if (speed > RUN * 0.6) fadeTo('run')
        else if (speed > 0.4) fadeTo('walk')
        else fadeTo('idle')
      }
      mixer.update(dt)
    }

    // third-person camera
    const camOff = new THREE.Vector3(0, 1.45 + pitch * 2.8, 4.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    camTarget.copy(root.position).add(camOff)
    camera.position.lerp(camTarget, Math.min(1, dt * 6))
    // keep the camera above the terrain
    const minY = groundHeight(camera.position.x, camera.position.z) + 0.4
    if (camera.position.y < minY) camera.position.y = minY
    camera.lookAt(root.position.x, root.position.y + 1.5, root.position.z)
  }

  return { root, update, trySlash, get position() { return root.position } }
}
