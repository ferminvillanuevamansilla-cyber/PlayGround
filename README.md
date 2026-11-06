# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://go.ondev.store/).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://go.ondev.store/ferminvillanuevamansilla-cyber/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/ferminvillanuevamansilla-cyber/PlayGround)

- 🎮 [Open the project](https://go.ondev.store/ferminvillanuevamansilla-cyber/PlayGround).
- ✨ [Remix this project](https://go.ondev.store/ferminvillanuevamansilla-cyber/PlayGround?remix=1).
- 💻 [Explore the source](https://github.com/ferminvillanuevamansilla-cyber/PlayGround).
- 🛠️ [Check build runs](https://github.com/ferminvillanuevamansilla-cyber/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/ferminvillanuevamansilla-cyber/PlayGround/issues).
- 👤 [Explore the creator's projects](https://go.ondev.store/ferminvillanuevamansilla-cyber).
- 🌍 [Create with OMGithub](https://go.ondev.store/).
<!-- omgithub:readme:end -->

## BLOCK ISLE

A pocket-sized 3D voxel sandbox built with Three.js and Vite. Explore a procedural island, mine and place blocks, decorate a build, meet wandering pigs, and watch the sun set over the water. Everything (terrain, textures, sounds) is generated in the browser — no external assets.

### Play

```bash
npm install
npm run dev
```

Then open the printed local URL. A production build is available with `npm run build` (`dist/`), and `npm run preview` serves it locally.

### Controls

**Phone / tablet**

- Left joystick: move
- Drag anywhere on the world: look around
- **JUMP**: jump (hold to swim upward)
- **MINE**: hold to dig the highlighted block
- **PLACE**: place the selected block
- Tap a hotbar slot to switch blocks; the **+** button opens the block library

**Desktop**

- `WASD` / arrows: move, `Space`: jump, `Shift`: sprint
- Mouse: look (click the world to capture the pointer)
- Left click / hold: mine, right click: place
- `1`–`9`: hotbar slots, mouse wheel: cycle slots, `E`: block library
- `Esc`: pause, `M`: mute

### Details

- 128 × 128 × 48 island with hills, snow caps, beaches, caves, trees, flowers, and glowstone pockets.
- Nine-slot hotbar and a 13-block library. Five sequential island goals, then free build.
- Day/night cycle with sunset, stars, drifting clouds, and fireflies.
- Edits, inventory, position, stats, and time auto-save to `localStorage`. **New Island** generates a fresh random seed.
- Touch UI appears on coarse-pointer devices; desktop shows keyboard/mouse hints and a first-person arm with the held block.

### Notes

This is a creative sandbox: there is no survival health, hunger, or hostile mobs. The island is intentionally finite and small enough to run smoothly on phones.
