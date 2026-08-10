import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { groundHeight, FIELD } from './terrain.js'
import { makeKatana, attachKatana } from './katana.js'

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
  const katana = makeKatana()

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
    // the rig is generated at real-world height; skinned-mesh bounding boxes
    // lie about size (bind matrices cancel the armature scale), so trust it
    const model = gltf.scene
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

    if (!attachKatana(model, katana)) {
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

  function reset() {
    root.position.set(0, groundHeight(0, 0), 4)
    speed = 0
    slashTimer = -1
    if (actions.idle) fadeTo('idle', 0.01)
  }

  return { root, update, trySlash, reset, get position() { return root.position } }
}
