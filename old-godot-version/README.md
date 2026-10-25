# Dead Waves

A wave-based co-op zombie shooter in the style of Call of Duty Zombies, built in Godot 4 with Steam multiplayer (lobbies + P2P) and Steam leaderboards. It's wired to **Spacewar (App ID 480)**, Valve's public test app, so you can play with friends over Steam without a Steamworks account.

## What's in it

- **Waves** that grow every round. Runners appear from wave 4. Zombie health scales like CoD (linear to wave 9, then +10% per wave).
- **Bosses** every 5 waves (every 4 on Veteran): the **Brute** (armoured, ground-slam shockwave) and the **Abomination** (lobs acid from range). From the third boss wave both come at once.
- **3 maps**: Outpost (open moonlit yard), Bunker (tight underground corridors), Factory (big hall, three wings). Each has buyable doors that open new zones and new zombie spawns.
- **10 guns**: 5 wall-buys (M14, Pump Shotgun, MP5, AK-47, plus the M9 starter) and a **Mystery Box** (950) with an LMG, Desert Hawk, Barrett .50, Plasma Caster (splash damage) and Death Machine.
- **4 perks**: Iron Hide (250 HP), Fast Hands (fast reload), Double Tap (fire rate), Second Wind (solo self-revive / faster co-op revives).
- **Power-ups**: Max Ammo, Double Points, Insta-Kill, Nuke.
- **4 difficulties**: Recruit, Regular, Hardened, Veteran.
- **Points economy**: 10 per hit, 60 per kill, 100 headshot, 130 knife, 500 boss.
- **Co-op for up to 4** via Steam lobbies: down-and-revive, bleed-out, respawn next wave, live scoreboard (Tab).
- **Stats** saved locally (kills, headshots, bosses, time, best wave per map/difficulty) and **Steam leaderboards** per map + difficulty, plus lifetime kills.
- **Low-poly blocky models**: jointed, animated zombies with randomised clothes, blood, exposed ribs and the odd missing arm; a hunched Runner; the bloated, glowing Abomination; the armour-plated Brute; soldier models for teammates; a distinct model for every gun; vending-machine perks, a Mystery Box with a light beam, barricaded doors, crates, barrels, sandbags and lamps.
- **Feel**: zombies claw up out of the ground, flinch when shot and lose their heads on headshot kills; red damage-direction markers; the crosshair turns red on a target; reload/low-ammo prompts; footsteps; a spinning Mystery Box you have to grab before it closes; a round-change flash; an ambient soundtrack; a spectator camera when you bleed out in co-op.
- No asset files: geometry, textures, music and sound effects are all generated in code.

## Setup (about 10 minutes)

1. **Install Godot 4.4 or newer** (standard version, not .NET): https://godotengine.org/download
2. **Open the project**: in Godot's Project Manager, click *Import* and pick this folder's `project.godot`.
3. **Add GodotSteam**: in the editor, open the **AssetLib** tab, search **GodotSteam GDExtension**, download and install it (it goes into `addons/godotsteam`). Restart the editor when asked.
4. **Start the Steam client** and log in.
5. Press **F5** to play. The main menu's bottom line should say *Steam connected as <your name>*. If it says GodotSteam isn't installed, step 3 didn't take; solo still works offline either way.

> If Steam won't connect, open `steam://install/480` in a browser to install Spacewar to your account, then try again.

## Playing co-op with a friend

1. **Export the game** so your friend can run it: *Project > Export > Add > Windows Desktop* (install export templates when prompted), then *Export Project*. GodotSteam copies the Steam DLL next to the .exe automatically. Copy `steam_appid.txt` (it contains `480`) next to the .exe as well.
2. Send the exported folder to your friend. Both of you need Steam running.
3. One player clicks **Host co-op (Steam)**, then **Invite friends** (Steam overlay) or just tells the other player to use **Find co-op games**.
4. The host picks the map and difficulty and clicks **Start match**.

The Steam overlay often doesn't appear when running from the editor. Use *Find co-op games* in that case.

How the networking works: the lobby owner is the host and simulates all zombies, waves and power-ups. Every player simulates their own movement and shooting, and sends hits to the host. Zombie positions stream from the host 15 times a second. Steam relays traffic, so no port forwarding is needed.

## Leaderboards

Boards are created automatically on first upload: `DW_<Map>_<Difficulty>` (score = wave × 100000 + kills) and `DW_LifetimeKills`. Note that Spacewar is shared by every developer testing on Steam, so these boards are public and may pick up other people's test entries. When you get your own App ID, change `APP_ID` in `scripts/game.gd`, create the boards in the Steamworks partner site, and update `steam_appid.txt`.

## Controls

| Action | Key |
|---|---|
| Move / sprint / crouch / jump | WASD / Shift / Ctrl or C / Space |
| Fire / aim down sights | Left / right mouse |
| Reload | R |
| Switch weapon | 1, 2, Q or mouse wheel |
| Knife | V or middle mouse |
| Grenade | G |
| Buy / open door / revive (hold) | E or F |
| Scoreboard | Tab |
| Menu / settings | Esc |

## Making changes

- **Maps** are ASCII grids in `scripts/maps.gd`. Each character is a 2 m cell: `#` wall, `.` start zone, `1`-`3` locked zones, `D` door, `W` wall-buy, `M` mystery box, `K` perk, `S` zombie spawn, `P` player spawn, `C` crate, `X` pillar. Add a new entry to `MAPS` and to `MAP_ORDER` in `game.gd` to make a new map.
- **Guns, perks, difficulties** are data tables at the top of `scripts/game.gd`.
- **Zombie types and AI** are in `scripts/zombie.gd`; wave pacing and spawning in `scripts/world.gd`.
- **Models** (characters, guns, props) are all in `scripts/models.gd`, built from boxes and low-sided cylinders.

## Project layout

```
scripts/game.gd          data tables, settings, stats, Steam start-up
scripts/net.gd           Steam lobbies + P2P messages
scripts/leaderboards.gd  Steam leaderboard upload/download
scripts/world.gd         a running match: waves, bosses, buys, power-ups, sync
scripts/player.gd        first-person controller, guns, health, revive
scripts/zombie.gd        zombie bodies + host-side AI
scripts/maps.gd          ASCII map builder + navmesh
scripts/hud.gd           HUD, scoreboard, pause and game-over screens
scripts/main.gd          menus, lobby, leaderboards, stats
scripts/models.gd        low-poly character, gun and prop models
scripts/sfx.gd           synthesised sound effects and ambient music
tests/fake_steam.gd      Steam stand-in for automated co-op tests
tests/bot.gd             playtest bot that plays real matches
```

## Automated tests

```
# Solo: plays every map on two difficulties, checks pathing, kills, doors, perks, box, bosses
godot --headless --path . -- --smoke-test

# Co-op over a fake Steam layer: run both at once
DW_FAKE_STEAM=1001 DW_FAKE_DIR=/tmp/dw godot --headless --path . -- --net-test
DW_FAKE_STEAM=1002 DW_FAKE_DIR=/tmp/dw godot --headless --path . -- --net-test

# Playtest bot: plays a real match through the input system and logs a line per wave plus anything suspicious
# (stalled waves, stuck players, negative ammo/points, zombies falling out of the map). PT_GOD=1 makes it invulnerable.
PT_MAP=factory PT_DIFF=1 PT_SECONDS=900 godot --headless --fixed-fps 60 --path . -- --playtest
```

## Known limits

- Players can't join a match already in progress (the lobby locks at start).
- If the host leaves, the match ends for everyone (no host migration).
- Art is blocky placeholder geometry; the code is set up so you can replace the models in `zombie.gd`, `player.gd` and `maps.gd`.
