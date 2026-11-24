# makefun-gta6

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![make.fun rank](https://make.fun/badge/gta6-01/mamangzed/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01)
[![make.fun reward](https://make.fun/badge/gta6-01/mamangzed/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01)

**Solmar Bay — Street Heat** is an original open-world crime game that runs entirely
from static files in a desktop browser. No Rockstar names, no borrowed assets:
your own sun-soaked city, your own crew, your own heat.

Leo Marín came back to Solmar Bay with empty pockets and a fast reputation.
Rosa Delgado runs Club Neon and she has work for a driver who asks no questions.
Steal cars, outrun the Solmar Bay Police, and climb from courier to kingpin —
one job at a time.

## What's in the game

- **A living 3D city** — a procedural grid of pastel towers, crosswalks, street
  lamps, palms, a central park and a beach with open water, all in Three.js.
- **Drive anything** — walk up to a parked car, press **E**, and it's yours.
  Arcade driving with steering, braking and a handbrake.
- **Traffic and pedestrians** — AI cars cruise the grid and turn at
  intersections; locals stroll the sidewalks and flee when you drive at them.
- **Wanted level** — steal a car, hit a pedestrian or fire a shot and the
  stars climb. SBPD pursuit units chase, ram and flash their light bars.
  Break line of sight and the heat cools off, star by star.
- **Story missions** — three jobs for Rosa: pick up a package at the docks,
  tail a courier van, then survive a full SBPD manhunt and reach the safehouse.
  Each pays cash and moves the story on.
- **Combat** — fists (**F**) and a pistol (click to shoot) with a tracer and
  raycast hits.
- **Full HUD** — money, health, wanted stars, mission objective with distance,
  speedometer, and a live 2D minimap with traffic, police and the mission beacon.
- **Menus and saving** — start screen, pause, WASTED respawn, and save/load
  through localStorage.
- **Procedural sound** — engine hum, two-tone siren, gunshots and chimes,
  all synthesized with WebAudio. No audio files.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look (click the game to lock the pointer) |
| Shift | Sprint |
| E | Steal / exit car |
| Space | Handbrake |
| F | Punch |
| Click | Shoot pistol |
| R | Reload |
| P / Esc | Pause |
| M | Mute |

## How to run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network:
every script, model and sound is a file under `game/` (Three.js is vendored
as `game/vendor/three.module.min.js`).

## How to enter it (make.fun)

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` for the judge.

<sub>Entered on [make.fun](https://make.fun/?ref=rf1dx0vr&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
