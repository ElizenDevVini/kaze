import * as THREE from 'three'

// one height function shared by the ground mesh, grass placement and the
// player controller, so feet, roots and soil always agree
const hash = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z)
  const xf = x - xi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = zf * zf * (3 - 2 * zf)
  const a = hash(xi, zi), b = hash(xi + 1, zi)
  const c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function groundHeight(x, z) {
  return (
    valueNoise(x * 0.02, z * 0.02) * 4.0 +
    valueNoise(x * 0.06, z * 0.06) * 1.2 +
    valueNoise(x * 0.18, z * 0.18) * 0.25 - 2.7
  )
}

export const FIELD = 170 // square field edge length

export function createTerrain() {
  const geo = new THREE.PlaneGeometry(FIELD, FIELD, 128, 128)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const soil = new THREE.Color('#5a4426')
  const dry = new THREE.Color('#7a5c2e')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const h = groundHeight(x, z)
    pos.setY(i, h)
    c.lerpColors(soil, dry, THREE.MathUtils.clamp((h + 2) / 5, 0, 1))
    c.offsetHSL(0, 0, (hash(x, z) - 0.5) * 0.04)
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
  return mesh
}
