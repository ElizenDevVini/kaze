import * as THREE from 'three'
import { createTerrain } from './terrain.js'
import { createGrass } from './grass.js'
import { createSky } from './sky.js'
import { createPetals, createClippings } from './effects.js'
import { createBamboo } from './bamboo.js'
import { createBlood, createSlashArc } from './blood.js'
import { createEnemies } from './enemies.js'
import { createPlayer } from './player.js'
import { startAudio, play } from './audio.js'
import { groundHeight } from './terrain.js'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.12
document.body.prepend(renderer.domElement)

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2('#e0a05c', 0.0085)

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 700)
camera.position.set(0, 3, 10)

const sunDir = new THREE.Vector3(-0.55, 0.16, -0.8).normalize()
const sun = new THREE.DirectionalLight('#ffd9a0', 2.4)
sun.position.copy(sunDir).multiplyScalar(100)
scene.add(sun, sun.target)
scene.add(new THREE.HemisphereLight('#cfa068', '#42351e', 0.6))

scene.add(createTerrain())
scene.add(createSky(sunDir))

const grass = createGrass()
scene.add(grass.mesh)

const petals = createPetals()
scene.add(petals.mesh)

const clippings = createClippings()
scene.add(clippings.mesh)

const bamboo = createBamboo()
scene.add(bamboo.group)

// a weathered torii on the far hill, something to walk toward
function torii() {
  const g = new THREE.Group()
  const red = new THREE.MeshLambertMaterial({ color: '#a03826' })
  const mk = (geo, x, y, z) => { const m = new THREE.Mesh(geo, red); m.position.set(x, y, z); g.add(m); return m }
  mk(new THREE.CylinderGeometry(0.22, 0.28, 5.2, 10), -2.1, 2.6, 0)
  mk(new THREE.CylinderGeometry(0.22, 0.28, 5.2, 10), 2.1, 2.6, 0)
  const top = mk(new THREE.BoxGeometry(6.2, 0.42, 0.5), 0, 5.4, 0)
  top.rotation.z = 0.02
  mk(new THREE.BoxGeometry(5.0, 0.28, 0.34), 0, 4.4, 0)
  g.position.set(-30, groundHeight(-30, -52), -52)
  g.rotation.y = 0.5
  return g
}
scene.add(torii())

const blood = createBlood(scene)
const slashArc = createSlashArc(scene)

let cutTotal = 0
let kills = 0
let hp = 3
let dead = false
let timeScale = 1
const cutsEl = document.getElementById('cuts')
const hintEl = document.getElementById('hint')
const loadingEl = document.getElementById('loading')
const damageEl = document.getElementById('damage')
const fadeEl = document.getElementById('fade')

function updateCounter() {
  const parts = []
  if (cutTotal > 0) parts.push(`${cutTotal} blades`)
  if (kills > 0) parts.push(`${kills} fallen`)
  cutsEl.textContent = parts.join(' · ')
}

const enemies = createEnemies(scene, {
  onPlayerHit() {
    if (dead) return
    hp -= 1
    damageEl.style.opacity = Math.min(1, 0.35 + (3 - hp) * 0.25)
    play('cut')
    setTimeout(() => { if (hp > 0) damageEl.style.opacity = Math.max(0, (3 - hp) * 0.12) }, 500)
    if (hp <= 0) {
      dead = true
      fadeEl.style.opacity = 1
      setTimeout(() => {
        player.reset()
        enemies.reset()
        hp = 3
        dead = false
        damageEl.style.opacity = 0
        fadeEl.style.opacity = 0
      }, 2600)
    }
  },
  onCorpseSettled() {}
})

const player = createPlayer(scene, camera, {
  onModelReady() {
    loadingEl.style.opacity = 0
    setTimeout(() => loadingEl.remove(), 1300)
  },
  onSwing() {
    play('slash')
  },
  onStrike(origin, facing) {
    if (dead) return
    slashArc.flash(origin, facing)
    const duels = enemies.slash(origin, facing, clock.elapsedTime)
    for (const d of duels) {
      blood.burst(d.position, d.dir, d.killed)
      if (d.killed) {
        kills += 1
        grass.stain(d.position.x, d.position.z)
        play('taiko')
        timeScale = 0.22 // one slow breath as they fall
      }
    }
    const res = grass.slash(origin, facing, clock.elapsedTime)
    const stalks = bamboo.slash(origin, facing, clock.elapsedTime)
    if (res.cut > 0) clippings.burst(res.positions)
    if ((res.cut > 0 || stalks > 0) && duels.length === 0) play('cut')
    cutTotal += res.cut
    updateCounter()
  }
})

renderer.domElement.addEventListener('click', () => {
  if (!document.pointerLockElement) {
    renderer.domElement.requestPointerLock()
    startAudio()
    hintEl.style.opacity = 0
  }
})
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement) hintEl.style.opacity = 0.8
})

function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

if (import.meta.env.DEV) window.__kaze = { scene, camera, player, grass, bamboo, enemies }

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const raw = Math.min(clock.getDelta(), 0.05)
  timeScale += (1 - timeScale) * Math.min(1, raw * 2.6)
  const dt = raw * timeScale
  const t = clock.elapsedTime
  player.update(dt, t)
  enemies.update(dt, t, player.position)
  grass.update(dt, t, player.position, camera.position)
  petals.update(dt, t, player.position)
  clippings.update(dt)
  blood.update(dt)
  slashArc.update(raw)
  bamboo.update(dt, t)
  renderer.render(scene, camera)
})
