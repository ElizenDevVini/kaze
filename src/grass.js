import * as THREE from 'three'
import { groundHeight, FIELD } from './terrain.js'

const BLADES = 150000
const REGROW_SECONDS = 18

const VERT = /* glsl */ `
attribute vec3 aOffset;
attribute float aAngle;
attribute vec2 aShape;   // width, height
attribute float aPhase;
attribute float aTint;
attribute float aCut;

uniform float uTime;
uniform vec2 uWind;      // direction * strength
uniform vec3 uPlayer;
uniform vec3 uCam;

varying float vHeight;   // 0 at root, 1 at tip
varying float vTint;
varying float vSheen;
varying float vCut;
varying float vShade;    // per-blade lightness jitter

// cheap 2d noise for gust fields
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
    mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  float t = position.y;              // blade param 0..1
  vHeight = t;
  vTint = aTint;
  vCut = aCut;
  vShade = 0.8 + 0.4 * fract(aPhase * 7.31);

  // blades crouch near the camera so the foreground doesn't fill with
  // screen-sized triangles
  float camFade = mix(0.18, 1.0, smoothstep(0.7, 2.4, distance(aOffset.xz, uCam.xz)));
  float height = aShape.y * mix(1.0, 0.1, aCut) * camFade;
  float width = aShape.x;

  // local blade shape, rotated around y by aAngle
  float ca = cos(aAngle), sa = sin(aAngle);
  vec3 p = vec3(position.x * width * ca, t * height, -position.x * width * sa);

  // gust field: one broad traveling wave plus rolling noise, advected along wind
  vec2 root = aOffset.xz;
  float windMag = length(uWind);
  vec2 windDir = windMag > 0.001 ? uWind / windMag : vec2(1.0, 0.0);
  float along = dot(root, windDir);
  float gust = noise2(root * 0.06 - windDir * uTime * 0.9)
             + 0.5 * sin(along * 0.12 - uTime * 2.1)
             + 0.25 * noise2(root * 0.3 - windDir * uTime * 2.0);
  gust = gust * 0.5;

  // flutter: fast per-blade shiver, strongest at the tip
  float flutter = sin(uTime * 6.0 + aPhase * 6.28) * 0.035;

  // bend increases toward the tip; blades lean along the wind
  float bend = (0.35 + 0.65 * gust) * windMag;
  vec2 lean = windDir * bend + vec2(flutter);
  float tt = t * t;
  p.x += lean.x * tt * height;
  p.z += lean.y * tt * height;
  p.y -= length(lean) * tt * tt * height * 0.35;

  // the player wades through: push blades outward, flatten slightly
  vec2 away = root - uPlayer.xz;
  float d = length(away);
  float push = smoothstep(1.4, 0.15, d);
  if (push > 0.0) {
    vec2 dir = away / max(d, 0.001);
    p.x += dir.x * push * 0.6 * tt;
    p.z += dir.y * push * 0.6 * tt;
    p.y -= push * 0.35 * tt * height;
  }

  // sheen travels with the gusts: bright bands sweep the field
  vSheen = clamp(gust, 0.0, 1.0);

  vec4 world = modelMatrix * vec4(p + aOffset, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}`

const FRAG = /* glsl */ `
uniform vec3 uRoot;
uniform vec3 uMid;
uniform vec3 uTip;
uniform vec3 uRust;

varying float vHeight;
varying float vTint;
varying float vSheen;
varying float vCut;
varying float vShade;

void main() {
  vec3 col = vHeight < 0.5
    ? mix(uRoot, uMid, vHeight * 2.0)
    : mix(uMid, uTip, vHeight * 2.0 - 1.0);
  col = mix(col, uRust, vTint * 0.7);
  col *= vShade;
  col *= 0.85 + 0.5 * vSheen * vHeight;      // traveling light bands
  col = mix(col, uRoot * 0.7, vCut * 0.5);   // fresh-cut stubble darkens
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export function createGrass() {
  // one blade: 3 stacked quads tapering to a tip vertex, param in position.y
  const bladePos = []
  const bladeIdx = []
  const taper = [0.5, 0.44, 0.3, 0.14]
  const steps = 4
  for (let i = 0; i < steps; i++) {
    const t = i / steps
    bladePos.push(-taper[i], t, 0, taper[i], t, 0)
  }
  bladePos.push(0, 1, 0)
  for (let i = 0; i < steps - 1; i++) {
    const a = i * 2
    bladeIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  bladeIdx.push((steps - 1) * 2, (steps - 1) * 2 + 1, steps * 2)

  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(bladePos, 3))
  geo.setIndex(bladeIdx)
  geo.instanceCount = BLADES

  const offsets = new Float32Array(BLADES * 3)
  const angles = new Float32Array(BLADES)
  const shapes = new Float32Array(BLADES * 2)
  const phases = new Float32Array(BLADES)
  const tints = new Float32Array(BLADES)
  const cuts = new Float32Array(BLADES)

  const half = FIELD / 2 - 4
  for (let i = 0; i < BLADES; i++) {
    const x = (Math.random() * 2 - 1) * half
    const z = (Math.random() * 2 - 1) * half
    offsets[i * 3] = x
    offsets[i * 3 + 1] = groundHeight(x, z)
    offsets[i * 3 + 2] = z
    angles[i] = Math.random() * Math.PI * 2
    shapes[i * 2] = 0.06 + Math.random() * 0.08
    shapes[i * 2 + 1] = 0.7 + Math.random() * 0.75
    phases[i] = Math.random()
    // rust patches: large-scale noise decides where the field turns red
    const patch = Math.sin(x * 0.045 + 2.1) * Math.sin(z * 0.05 - 1.3)
    tints[i] = Math.max(0, patch - 0.35) * 1.6 * (0.6 + Math.random() * 0.4)
  }

  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3))
  geo.setAttribute('aAngle', new THREE.InstancedBufferAttribute(angles, 1))
  geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shapes, 2))
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 1))
  const cutAttr = new THREE.InstancedBufferAttribute(cuts, 1)
  cutAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('aCut', cutAttr)

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector2(0.32, 0.1) },
      uPlayer: { value: new THREE.Vector3(0, 0, 0) },
      uCam: { value: new THREE.Vector3(0, 0, 0) },
      uRoot: { value: new THREE.Color('#453317') },
      uMid: { value: new THREE.Color('#a8842f') },
      uTip: { value: new THREE.Color('#e6c463') },
      uRust: { value: new THREE.Color('#b05a2a') }
    },
    side: THREE.DoubleSide
  })

  const mesh = new THREE.Mesh(geo, material)
  mesh.frustumCulled = false

  const regrow = [] // { index, at }

  function update(dt, t, playerPos, camPos) {
    material.uniforms.uTime.value = t
    material.uniforms.uPlayer.value.copy(playerPos)
    material.uniforms.uCam.value.copy(camPos)
    // gusts breathe: wind strength slowly oscillates
    const base = 0.3 + 0.14 * Math.sin(t * 0.23) + 0.08 * Math.sin(t * 0.71)
    material.uniforms.uWind.value.set(base, base * 0.35)
    while (regrow.length && t - regrow[0].at > REGROW_SECONDS) {
      cuts[regrow.shift().index] = 0
      cutAttr.needsUpdate = true
    }
  }

  // slash a horizontal arc: origin, facing angle (radians), reach, half-angle
  function slash(origin, facing, t, reach = 2.1, halfArc = 1.15) {
    let cut = 0
    const positions = []
    for (let i = 0; i < BLADES; i++) {
      if (cuts[i] === 1) continue
      const dx = offsets[i * 3] - origin.x
      const dz = offsets[i * 3 + 2] - origin.z
      const d2 = dx * dx + dz * dz
      if (d2 > reach * reach) continue
      let a = Math.atan2(dx, dz) - facing
      a = Math.atan2(Math.sin(a), Math.cos(a))
      if (Math.abs(a) > halfArc) continue
      cuts[i] = 1
      regrow.push({ index: i, at: t })
      cut++
      if (positions.length < 60) {
        positions.push(offsets[i * 3], offsets[i * 3 + 1], offsets[i * 3 + 2])
      }
    }
    if (cut > 0) cutAttr.needsUpdate = true
    return { cut, positions }
  }

  return { mesh, update, slash }
}
