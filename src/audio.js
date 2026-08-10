// generated clips live in public/assets/audio; every call degrades to
// silence if a file is missing so the game never depends on sound
const PATHS = {
  wind: './assets/audio/wind.mp3',
  music: './assets/audio/music.mp3',
  slash: './assets/audio/slash.mp3',
  cut: './assets/audio/cut.mp3',
  draw: './assets/audio/draw.mp3',
  taiko: './assets/audio/taiko.mp3'
}

const clips = {}
let started = false

function load(name, { loop = false, volume = 1 } = {}) {
  const a = new Audio(PATHS[name])
  a.loop = loop
  a.volume = volume
  a.addEventListener('error', () => { clips[name] = null })
  clips[name] = a
  return a
}

export function startAudio() {
  if (started) return
  started = true
  load('wind', { loop: true, volume: 0.45 })?.play().catch(() => {})
  load('music', { loop: true, volume: 0.3 })?.play().catch(() => {})
  load('slash', { volume: 0.5 })
  load('cut', { volume: 0.55 })
  load('taiko', { volume: 0.65 })
  const draw = load('draw', { volume: 0.5 })
  draw?.play().catch(() => {})
}

export function play(name) {
  const a = clips[name]
  if (!a) return
  a.currentTime = 0
  a.play().catch(() => {})
}
