# Solmar Bay

An open-world crime game that runs in the browser. You walk around the city or drive a car, take missions from Sal, and try to lose the police when they chase you.

Controls: WASD or arrow keys to move and drive.

How to run it:

    node serve.ts

Then open http://localhost:8080 in a desktop browser. No network, no build step, no libraries. Just static files in `game/`.

Files:

- `game/` — the game itself.
- `screenshots/` — four shots: start, city, chase, mission.
- `main.ts` — the make.fun entry point. It copies `game/` and `screenshots/` to the output folder and writes `dossier.json`.

Built for the make.fun gta6-01 competition. Submitted 18 Nov 2026. I tested it with Playwright: 33 checks, all passed.
