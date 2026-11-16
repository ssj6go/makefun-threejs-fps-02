# EMBERLINE — a round-based tactical FPS in three.js

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/ssj6go/makefun-threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/ssj6go/makefun-threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Built by an AI agent for make.fun's ["Make the best three.js tactical FPS"](https://make.fun/bounty/threejs-fps-02) bounty ($1,000 in USDC).

You attack alone against four Wardens on the FOUNDRY map — plant the bomb at site A or B, or eliminate the defenders. First to 5 rounds wins the match.

## Play

```sh
node serve.ts        # serves game/ at http://localhost:4173/
```

No build step, no network: static ES modules, three.js 0.187.0 vendored byte-for-byte under `game/vendor/three/`.

| Key | Action |
| --- | ------ |
| WASD / Space / Ctrl | Move / jump / crouch |
| Mouse / Click | Aim / shoot |
| R | Reload |
| B | Buy menu (buy phase only) |
| 1 / 2 | Primary / sidearm |
| G | Throw frag grenade |
| E (hold) | Plant the bomb inside a site |

## The game

- **Complete rounds.** 3 s freeze, 100 s live, buy phase at the start of every round, round banners, match end at 5 rounds (max 9), restart from the end screen.
- **Gunplay.** Four hitscan weapons (P9 pistol, VK-47 rifle, K9 SMG, Lynx sniper) with distinct damage, fire rate, recoil and spread. Headshots deal 3× damage. Spread grows with movement speed and sustained fire, so stopping to aim and firing in bursts both pay. Acceleration, crouch and collision are all in.
- **Tactics.** Bomb plant (3.5 s channel) and 30 s fuse; defenders rush the site and defuse (5 s, interrupted by damage). Money per kill and per round, a buy menu with four weapons and frag grenades, and bots that walk waypoint routes to their holds, investigate gunshots, strafe in combat and rush a planted bomb.
- **Map.** FOUNDRY, 46 × 40 m: three lanes, a mid door, a connector, a jumpable platform, two sites, and cover everywhere. One restrained palette — canvas, surface, hairline, ink, muted, amber accent for the player's side and the bomb, rust red for the enemy — applied to the 3D scene and the HUD alike.
- **Feel.** Synthesised WebAudio (shots, hits, explosion, bomb beeps, round stingers), tracers, impact sparks, an explosion flash, muzzle flash and a damage vignette. No audio or image assets.

## Layout

```
game/
  index.html            HUD, menus, import map
  src/
    main.js             fixed-step loop, shooting, grenades, round lifecycle
    world.js            FOUNDRY map, colliders, waypoint graph, sites
    bots.js             defender AI: routes, vision, hearing, combat, defuse
    bomb.js             bomb state machine (carried / planting / planted / …)
    rounds.js           match rules: phases, timers, money, scores
    weapons.js          four weapons, view models, spread and heat
    player.js           AABB movement, look, crouch, jump
    input.js            keyboard, mouse, pointer lock
    effects.js          pooled tracers and particles, explosion light
    audio.js            synthesised sound, no assets
    hud.js              every DOM binding, buy menu rendering
    palette.js          the six-colour look plan
  vendor/three/         three.js 0.187.0, vendored byte-for-byte
main.ts                 entrypoint: copies game/ + screenshots/ to /output,
                        writes /output/dossier.json
shots.json              the four screenshot stages (?shot=start|play|buy|end)
screenshots/            renders captured from the game itself
```

The simulation runs at a fixed 120 Hz, separated from rendering. Tracers and particles come from pools allocated once — nothing is allocated per frame in the hot loop.

## Screenshots

Captured from the game with `?shot=…&seed=1` (see `shots.json`):

| Stage | File |
| --- | ---- |
| Start screen | `screenshots/1-start.jpg` |
| Mid-round, rifle in hand | `screenshots/2-play.jpg` |
| Buy menu | `screenshots/3-buy.jpg` |
| Match end | `screenshots/4-end.jpg` |

## License

MIT. three.js is vendored under its own MIT license (`game/vendor/three/`).
