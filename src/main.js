import * as THREE from 'three'
import { createTerrain } from './terrain.js'
import { createGrass } from './grass.js'
import { createSky } from './sky.js'
import { createPetals, createClippings } from './effects.js'
import { createBamboo } from './bamboo.js'
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

let cutTotal = 0
const cutsEl = document.getElementById('cuts')
const hintEl = document.getElementById('hint')
const loadingEl = document.getElementById('loading')

const player = createPlayer(scene, camera, {
  onModelReady() {
    loadingEl.style.opacity = 0
    setTimeout(() => loadingEl.remove(), 1300)
  },
  onSwing() {
    play('slash')
  },
  onStrike(origin, facing) {
    const res = grass.slash(origin, facing, clock.elapsedTime)
    const stalks = bamboo.slash(origin, facing, clock.elapsedTime)
    if (res.cut > 0) clippings.burst(res.positions)
    if (res.cut > 0 || stalks > 0) play('cut')
    cutTotal += res.cut
    cutsEl.textContent = cutTotal > 0 ? `${cutTotal} blades` : ''
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

if (import.meta.env.DEV) window.__kaze = { scene, camera, player, grass, bamboo }

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05)
  const t = clock.elapsedTime
  player.update(dt, t)
  grass.update(dt, t, player.position, camera.position)
  petals.update(dt, t, player.position)
  clippings.update(dt)
  bamboo.update(dt, t)
  renderer.render(scene, camera)
})
