# Mountain Defense

Co-op tower defense + mining logistics prototype. Mine the mountain by day, haul ore
home by minecart, refine it by hand at the forge, and hold the wall when night falls.

Built with Three.js (isometric 2.5D, Thronefall-inspired), a shared TypeScript
simulation, and Colyseus for online co-op (1-4 players). Solo mode runs the same
simulation locally in the browser.

## Run it

```bash
npm install

# Solo / client (all you need for single player)
npm run dev:client        # open the printed URL, click "Solo Expedition"

# Online co-op (optional, second terminal)
npm run dev:server        # starts Colyseus on ws://localhost:2567
# then in the client menu: Host -> share the room code -> friends Join
```

## Controls

| Key | Action |
|-----|--------|
| WASD | Move (while riding: push / brake the cart) |
| E | Start work (mine, anvil, forge, furnace, repair/rebuild). Walk away to leave |
| Space | Hit the beat while mining / anvil / forge (miss = slower next swing) |
| Mouse wheel / R | At the anvil or forge: pick which recipe to run |
| F | Ride / leave the minecart |
| Q / Right-click | Stone gun: aimed heavy shot (1.5s cool-down), burns 1 stone (or raw ore) |
| P / Esc | Pause (solo) and sound settings |
| B | Build menu (towers and the blast furnace; crude = stone/raw ore, refined = ingots) |
| T | Tech tree (research requires standing near the Tech Hub) |
| Mouse wheel | Zoom (away from a station) |
| Esc / Right-click | Close menus / cancel placement |

## The loop

1. The cart starts at the dock. Ride it up the mountain and work the **veins**
   (iron-rich, copper-rich, coal). Veins yield mostly their promised resource
   plus stone rubble, and a depleted vein respawns somewhere else on the
   plateau — keep exploring. Walking over the cart dumps your pack into it.
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
5. Build towers in the deep strip behind the wall: **crude** (stone or raw ore,
   pricier now) or **refined** (ingots). Stand next to a tower to buy its two
   field upgrades. Towers fire free once built. Patch damaged gates any time of
   day; a fallen gate or wall takes about a minute of work (and stone) to raise
   again. Research at the **Tech Hub**.
6. Survive the night. Monsters pour down the canyon and batter the two **gates**
   in the wall; once a gate falls they flood inside. Your pickaxe swings on its
   own whenever enemies are in reach. Aim the stone gun with the cursor for a
   heavy, slow shot. The gate **torches** light the approach, and the horde
   carries its own dim glow. Waves grow with the nights — and a little faster
   as your base advances.
7. Feeling greedy? Toggle **Spend ore: OFF** to reserve raw ore for refining.
   Then crude tower builds, repairs and the stone gun run on stone alone —
   efficient economy, riskier nights.

## Workspace layout

- `shared/` - deterministic game simulation, terrain, rail solver, balance data
- `server/` - Colyseus room running the authoritative sim
- `client/` - Three.js renderer + React HUD

## Play online (GitHub Pages)

Solo mode is a static site — no server required. After the repo exists on GitHub:

```bash
npm run deploy
```

That builds the client with the correct `/<repo>/` base path and pushes it to the
`gh-pages` branch. Share:

`https://<your-github-user>.github.io/MountainDefense/`

Friends should click **Solo Expedition**. Host / Join still needs a Colyseus
server (`npm run dev:server`); Pages only ships the client.

## Dev scripts

- `npm run test:sim` - headless simulation smoke test
- `npm run typecheck` - typecheck all packages
- `npm run build` - production client build
- `npm run deploy` - build + publish the client to GitHub Pages
