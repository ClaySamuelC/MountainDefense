# Mountain Defense

Co-op tower defense + mining logistics prototype. Mine the mountain by day, haul ore
home by minecart, refine it by hand at the forge, and hold the wall when night falls.

Built with Three.js (isometric 2.5D) and a shared TypeScript simulation. Solo and
co-op both run in the browser — co-op is host-authoritative peer-to-peer over
PeerJS (WebRTC) with 4-digit room codes.

## Run it

```bash
npm install
npm run dev:client        # open the printed URL
```

- **Solo Expedition** — single player (autosave / Continue)
- **Host Co-op** — claim a 4-digit code and share it
- **Join** — enter a friend's code (host must stay in the game)

Controls and the day/night loop are listed on the main menu and in pause.

## Workspace

- `shared/` — simulation, terrain, rail, balance
- `shared/src/catalog/` — content registries (resources, recipes, buildings, techs); see [catalog README](shared/src/catalog/README.md)
- `client/` — Three.js renderer, React HUD, PeerJS co-op
- `scripts/deploy.mjs` — GitHub Pages publish

## Play online (GitHub Pages)

```bash
npm run deploy
```

Share `https://<your-github-user>.github.io/MountainDefense/`. Host keeps their tab
open; guests Join with the room code. If the host leaves, the session ends.

## Report a problem or idea

- [Crash report](https://github.com/ClaySamuelC/MountainDefense/issues/new?template=crash_report.yml)
- [Bug report](https://github.com/ClaySamuelC/MountainDefense/issues/new?template=bug_report.yml)
- [Suggestion](https://github.com/ClaySamuelC/MountainDefense/issues/new?template=suggestion.yml)
- [New issue chooser](https://github.com/ClaySamuelC/MountainDefense/issues/new/choose)

## Dev scripts

- `npm run test:sim` — headless simulation smoke test
- `npm run typecheck` — typecheck client + shared
- `npm run build` — production client build
- `npm run deploy` — publish client to GitHub Pages
