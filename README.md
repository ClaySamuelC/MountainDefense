# Mountain Defense

Co-op tower defense + mining logistics prototype. Mine the mountain by day, haul ore
home by minecart, refine it by hand at the forge, and hold the wall when night falls.

Built with Three.js (isometric 2.5D, Thronefall-inspired) and a shared TypeScript
simulation. Solo and co-op both run in the browser — co-op is host-authoritative
peer-to-peer over PeerJS (WebRTC) with 4-digit room codes.

## Run it

```bash
npm install
npm run dev:client        # open the printed URL

# Solo Expedition — single player
# Host Co-op — claim a 4-digit code, share it
# Join — enter a friend's code (host must stay in the game)
```

## Controls

| Key | Action |
|-----|--------|
| WASD | Move (while riding: push / brake the cart) |
| E | Start work (mine, anvil, forge, furnace, repair/rebuild). Walk away to leave |
| Space | Hit the beat while mining / anvil / forge (miss = slower next swing) |
| Mouse wheel / R | At the anvil or forge: pick which recipe to run |
| F | Ride / leave the minecart |
| Q / Right-click | Stone gun: aimed heavy shot (1.5s cool-down), burns 1 stone |
| P / Esc | Pause (host/solo freezes the sim) and sound settings; solo can Save here |
| B | Build menu (towers and the blast furnace; crude = stone, refined = ingots) |
| T | Tech tree (research anytime) |
| Mouse wheel | Zoom (away from a station) |
| Esc / Right-click | Close menus / cancel placement |

## The loop

1. The cart starts at the dock. Ride it up the mountain and work the **veins**
   (iron-rich, copper-rich, coal). Iron and copper veins mostly yield their ore,
   with a 25% cross-yield of the other; coal still sheds stone rubble. A depleted
   vein respawns elsewhere on the plateau. Walking over the cart dumps your pack.
2. Roll back down, unload at the dock -> ore piles up in the yard.
3. Break raw ore at the **anvil** (hold E, Space on the beat), then walk to the
   **forge** and tend it the same way — crush → smelt is a short walk so the
   refining chain stays readable. Refining sheds **stone** as a byproduct.
   Both stations run one recipe at a time: scroll (or press R) to choose it, and
   inputs are only spent when a pour actually lands.
4. Steel is its own project. Research **Steel** to unlock the **blast furnace**,
   build it, then hand-charge it with iron ingots and coal. It smelts on its own
   in the background — a trickle at first, until you spend ingots and stone on
   its two upgrades to shorten the burn.
5. Build towers in the deep strip behind the wall: **crude** (stone) or
   **refined** (ingots). Stand next to a tower to buy its two field upgrades.
   Towers fire free once built. Patch damaged gates any time of day; a fallen
   gate or wall takes about a minute of work (and stone) to raise again.
   Research anytime from the Tech menu — no hub required.
6. Survive the night. Monsters pour down the canyon and batter the two **gates**
   in the wall; once a gate falls they flood inside. Your pickaxe swings on its
   own whenever enemies are in reach. Aim the stone gun with the cursor for a
   heavy, slow shot. The gate **torches** light the approach, and the horde
   carries its own dim glow. Waves grow with the nights — and a little faster
   as your base advances. Raw ore is for refining only; stone pays for crude
   towers, repairs, and the gun.

## Workspace layout

- `shared/` - game simulation, terrain, rail solver, balance data
- `client/` - Three.js renderer + React HUD + PeerJS co-op
- `server/` - optional legacy Colyseus room (not required for Pages co-op)

## Play online (GitHub Pages)

The static client includes Solo and peer-to-peer co-op (PeerJS cloud for signaling):

```bash
npm run deploy
```

Share:

`https://<your-github-user>.github.io/MountainDefense/`

One friend clicks **Host Co-op**, reads the 4-digit room code in the HUD, and
keeps that tab open. Everyone else **Join**s with that code. The host's browser
runs the sim — if they leave, the session ends.

## Report a problem or idea

Open an issue with one of the forms:

- [Crash report](https://github.com/ClaySamuelC/MountainDefense/issues/new?template=crash_report.yml)
- [Bug report](https://github.com/ClaySamuelC/MountainDefense/issues/new?template=bug_report.yml)
- [Suggestion](https://github.com/ClaySamuelC/MountainDefense/issues/new?template=suggestion.yml)

Or use the chooser: [New issue](https://github.com/ClaySamuelC/MountainDefense/issues/new/choose).

## Dev scripts

- `npm run test:sim` - headless simulation smoke test
- `npm run typecheck` - typecheck all packages
- `npm run build` - production client build
- `npm run deploy` - build + publish the client to GitHub Pages
