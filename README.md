# kaze 風

A field, a sword, the wind. A samurai walks through an endless golden-hour grass field and cuts it. Built in three.js for a three.js hackathon.

The grass is the point: 150,000 GPU-instanced blades with analytic wind (broad traveling gusts, per-blade flutter, sheen bands that sweep the field), the player wades through and pushes blades aside, and every swing of the sword actually cuts the blades in the arc — they fall as clippings, leave stubble, and regrow. Bamboo stalks sever at blade height and topple. Crimson petals ride the wind.

The samurai is a generated asset: concept image to rigged, textured GLB with five animation clips (idle, walk, run, two slashes) through the Higgsfield pipeline, merged into one model. The katana is procedural, parented to the rig's hand bone. Wind, music, and sword sounds are generated audio.

## Controls

- click: take up the sword (pointer lock)
- wasd: move, mouse: look
- shift: run
- left click: slash

## Dev

```
npm install
npm run dev
```

Asset manifest in `design/assets.csv`. The character GLB lives in `public/assets/samurai.glb`; regenerating it requires the Higgsfield CLI.
