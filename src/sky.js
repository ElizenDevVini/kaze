import * as THREE from 'three'

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}`

const FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.62));
  float sun = clamp(dot(d, uSunDir), 0.0, 1.0);
  col += uSunColor * pow(sun, 350.0) * 3.0;   // disc
  col += uSunColor * pow(sun, 12.0) * 0.35;   // halo
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export function createSky(sunDir) {
  const geo = new THREE.SphereGeometry(600, 24, 16)
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uHorizon: { value: new THREE.Color('#f0a95a') },
      uZenith: { value: new THREE.Color('#6e6486') },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color('#ffdca0') }
    },
    side: THREE.BackSide,
    depthWrite: false
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  return mesh
}
