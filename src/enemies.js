import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { groundHeight } from './terrain.js'
import { makeKatana, attachKatana } from './katana.js'

const SPAWNS = [
  [18, -34], [-26, -20], [4, -48], [-38, -44], [34, -26], [-8, 24], [26, 14]
]
const AGGRO = 13
const ATTACK_RANGE = 1.8
const HIT_RANGE = 2.3
const WALK_SPEED = 2.0
const WINDUP = 0.55
const COOLDOWN = 1.3
const RESPAWN_SECONDS = 30

export function createEnemies(scene, callbacks) {
  const enemies = []
  let template = null // { scene, animations }

  function makeBody(at) {
    const group = new THREE.Group()
    group.position.set(at[0], groundHeight(at[0], at[1]), at[1])
    let mixer = null
    const actions = {}
    if (template) {
      // rigs are generated at real-world height; skinned-mesh bounding boxes
      // lie about size (bind matrices cancel the armature scale), so never
      // box-normalize a skinned model
      const model = cloneSkinned(template.scene)
      model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material.side = THREE.DoubleSide } })
      group.add(model)
      mixer = new THREE.AnimationMixer(model)
      const find = re => template.animations.find(c => re.test(c.name))
      const clips = {
        idle: find(/idle/i),
        walk: find(/walk/i),
        attack: find(/attack|judgment/i),
        death: find(/death|dying|fall_dead/i)
      }
      for (const [k, c] of Object.entries(clips)) if (c) actions[k] = mixer.clipAction(c)
      attachKatana(model, makeKatana())
    } else {
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.27, 0.9, 4, 8),
        new THREE.MeshLambertMaterial({ color: '#5a2020' })
      )
      body.position.y = 0.9
      group.add(body)
    }
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: '#1a1208', transparent: true, opacity: 0.4, depthWrite: false })
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.03
    group.add(shadow)
    scene.add(group)
    return { group, mixer, actions }
  }

  function spawnAll() {
    for (const e of enemies) scene.remove(e.group)
    enemies.length = 0
    for (const at of SPAWNS) {
      const { group, mixer, actions } = makeBody(at)
      enemies.push({
        group, mixer, actions, active: null,
        home: at, hp: 2, state: 'idle', timer: 0, yaw: Math.random() * Math.PI * 2,
        deadAt: 0
      })
    }
  }

  function fade(e, name, dur = 0.25, once = false) {
    const next = e.actions[name]
    if (!next || e.active === next) return
    next.reset()
    if (once) { next.setLoop(THREE.LoopOnce); next.clampWhenFinished = true }
    next.fadeIn(dur).play()
    if (e.active) e.active.fadeOut(dur)
    e.active = next
  }

  new GLTFLoader().load('./assets/enemy.glb', gltf => {
    template = gltf
    spawnAll()
  }, undefined, () => {
    // enemy model not there yet: red-tinted capsules keep the game playable
    spawnAll()
  })

  function update(dt, t, playerPos) {
    for (const e of enemies) {
      if (e.state === 'dead') {
        if (t > e.deadAt + RESPAWN_SECONDS) {
          e.hp = 2
          e.state = 'idle'
          e.group.position.set(e.home[0], groundHeight(e.home[0], e.home[1]), e.home[1])
          e.group.rotation.set(0, e.yaw, 0)
          e.group.visible = true
          if (e.actions.idle) { e.active?.stop(); e.active = null; fade(e, 'idle', 0.01) }
        }
        e.mixer?.update(dt)
        continue
      }
      if (e.state === 'dying') {
        e.timer += dt
        if (!e.actions.death) {
          // procedural fall when the death clip is missing
          e.group.rotation.x = Math.min(Math.PI / 2, e.timer * 2.4)
        }
        if (e.timer > 1.6) {
          e.state = 'dead'
          e.deadAt = t
          e.group.visible = false
          callbacks.onCorpseSettled?.(e.group.position)
        }
        e.mixer?.update(dt)
        continue
      }

      const dx = playerPos.x - e.group.position.x
      const dz = playerPos.z - e.group.position.z
      const dist = Math.hypot(dx, dz)
      const toPlayer = Math.atan2(dx, dz)

      if (e.state === 'stagger') {
        e.timer += dt
        if (e.timer > 0.45) e.state = 'chase'
      } else if (e.state === 'idle') {
        if (dist < AGGRO) { e.state = 'chase'; }
        fade(e, 'idle')
      } else if (e.state === 'chase') {
        let d = toPlayer - e.yaw
        d = Math.atan2(Math.sin(d), Math.cos(d))
        e.yaw += d * Math.min(1, dt * 6)
        if (dist > ATTACK_RANGE) {
          e.group.position.x += Math.sin(e.yaw) * WALK_SPEED * dt
          e.group.position.z += Math.cos(e.yaw) * WALK_SPEED * dt
          fade(e, 'walk')
        } else {
          e.state = 'windup'
          e.timer = 0
          fade(e, 'attack', 0.1, true)
        }
        if (dist > AGGRO * 1.8) { e.state = 'idle' }
      } else if (e.state === 'windup') {
        e.timer += dt
        if (e.timer >= WINDUP) {
          if (dist < HIT_RANGE) callbacks.onPlayerHit?.(e.group.position)
          e.state = 'recover'
          e.timer = 0
        }
      } else if (e.state === 'recover') {
        e.timer += dt
        if (e.timer > COOLDOWN) e.state = 'chase'
      }

      e.group.position.y = groundHeight(e.group.position.x, e.group.position.z)
      e.group.rotation.y = e.yaw
      e.mixer?.update(dt)
    }
  }

  // the player's blade sweeps an arc: stagger on first hit, fell on second
  function slash(origin, facing, t, reach = 2.5, halfArc = 1.1) {
    const events = []
    for (const e of enemies) {
      if (e.state === 'dead' || e.state === 'dying') continue
      const dx = e.group.position.x - origin.x
      const dz = e.group.position.z - origin.z
      const dist = Math.hypot(dx, dz)
      if (dist > reach) continue
      let a = Math.atan2(dx, dz) - facing
      a = Math.atan2(Math.sin(a), Math.cos(a))
      if (Math.abs(a) > halfArc) continue
      e.hp -= 1
      const away = Math.atan2(dx, dz)
      if (e.hp <= 0) {
        e.state = 'dying'
        e.timer = 0
        if (e.actions.death) fade(e, 'death', 0.08, true)
        events.push({ position: e.group.position.clone(), dir: away, killed: true })
      } else {
        e.state = 'stagger'
        e.timer = 0
        e.group.position.x += Math.sin(away) * 0.55
        e.group.position.z += Math.cos(away) * 0.55
        events.push({ position: e.group.position.clone(), dir: away, killed: false })
      }
    }
    return events
  }

  function reset() {
    spawnAll()
  }

  return { update, slash, reset, list: enemies }
}
