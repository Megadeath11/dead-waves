# Dead Waves

A wave-based co-op zombie shooter: hold out against growing waves, buy guns off the walls, open new areas, spin the Mystery Box and take down bosses. Up to 4 players over Steam on **Spacewar (App ID 480)**, Valve's free test app.

It's a single Windows exe (Electron + three.js + steamworks.js, the same setup as Tight-Opoly and Dust & Debt). No Godot or anything else to install.

## Playing

Double-click **`DeadWaves.exe`**. That's it. Solo works offline. For co-op, have Steam open first.

Co-op:
1. Host clicks **Host co-op (Steam)**, then **Invite friends** (Steam overlay, Shift+Tab if it doesn't pop up) or **Copy code** and sends the lobby code on Discord.
2. Friends open the game **first**, then accept the invite, or click **Join co-op game** and paste the code.
3. The host picks map and difficulty, then **Start match**.

Steam shows you as playing "Spacewar". That's expected with App ID 480. Troubleshooting: `%APPDATA%\Dead Waves\steam.log` says whether Steam started.

## What's in it

- **7 maps**: Outpost, Bunker, Factory, the multi-level Harbor (container decks, crane platform, elevators) and Overpass (raised highway bridge, stair ramps, elevators), the open town Crossroads (four wide plazas and a long park), and Proving Grounds (one massive open field with every shop lined up on the north wall, no doors). Buyable doors open new zones; zombies climb stairs after you.
- **Late-game spending**: Pack-a-Poonch tiers I-III (20k / 40k / 60k for 4x / 6x / 9x damage, and each tier doubles the magazine and ammo), 7 perks (Mule Kick, Deadshot, Stamin-Up added), armour lockers, ammo resupply crates, and sentry turrets you place anywhere with T (8,000 each, up to 4 per player, 2 minutes each).
- **Jump crits**: headshots while you're in the air do double damage.
- **30 s break between rounds**; everyone presses Enter to skip it.
- **10 guns** with no spread: every bullet goes exactly where the dot is, standing, running or aiming. Wall-buys (M9, M14, Pump Shotgun, MP5, AK-47) and the **Mystery Box** (LMG, Desert Hawk, Barrett .50, Plasma Caster, Death Machine).
- **4 perks**: Iron Hide, Fast Hands, Double Tap, Second Wind. **Power-ups**: Max Ammo, Double Points, Insta-Kill, Nuke.
- **Pack-a-Poonch** desk (20,000): gem finish and 4x damage. **Grenade wall-buy** fills you up to 10. **Wind charge** on key 4.
- **The Goon Lord** (the Wendygoon) rises on wave 20 and puts the lights out.
- **Dodgers** (from wave 6): hooded zombies with cyan eyes that sidestep whenever someone aims at them. Lead your shots and fire between dodges.
- **Bosses** every 5 waves (4 on Veteran): the Brute (ground slam) and the Abomination (acid lobs).
- **4 difficulties**: Recruit, Regular, Hardened, Veteran.
- **Reload animations** for every gun (mag swaps, shotgun shells and pump, Barrett bolt, plasma cells, Death Machine ammo box).
- **Downs** cost nothing: revived players keep everything. Bleeding out keeps your perks and guns too, but each gun drops one Pack-a-Poonch tier. Big bleed-out and revive bars.
- **Gear wall-buys** (3,000 each, on the walls near the start): the **Grapple Gun** (key 5) reels a downed teammate in to you, or zips you to whatever wall you aim at; the **Defibrillator** (key 6) makes revives take 1 second while you hold it out.
- **Hotbar** along the bottom with every gun, the wind charge, grapple, defib, grenades and sentries.
- Partial reloads are quicker; you can steer and brake in mid-air; the Nuke pays 100 per zombie it kills, split between everyone.
- **Co-op for up to 4**: down-and-revive, bleed-out, respawn next wave, scoreboard (Tab).
- **Settings** in five tabs: graphics (quality presets Low-Ultra, render resolution, shadows, lamp lights, particles, anti-aliasing, brightness, FOV, FPS limit and counter), audio (master / music / effects, mute when alt-tabbed), controls (sensitivity, aim sensitivity, invert Y, toggle aim / crouch), key bindings for every action, and HUD (crosshair colour and size, hit markers, point popups, HUD size, view bob, screen shake).
- **Progression** (Progression in the main menu): every match pays XP. 50 ranks; a new player starts with the M14, shotgun, pistol, Iron Hide, Double Tap, the Mystery Box, Outpost and Bunker, and everything else unlocks rank by rank (the AK-47 at 8, Mule Kick at 10, Deadshot at 14, the Death Machine at 30...). The Ranks tab lists every rank and what it unlocks, plus the same list by item. Prestige at rank 50 (up to 10) restarts the ranks for a badge and +10% starting points each time.
- **Challenges**: 3 daily and 1 weekly, with XP rewards. **Map medals**: 7 per map (waves 10/20/30, boss, Goon Lord, 4 perks, wave 15 on Hardened+).
- **Gun mastery** (Armory tab): kills level each gun to 10, with boosts at levels 3/5/7/10 (reload, magazine, reserve, damage). Kills and headshots unlock Copper, Silver, Gold and animated Inferno finishes.
- Local stats and best runs per map and difficulty.
- No asset files: models, textures, music and sounds are all generated in code.

## Controls

Default keys; every one can be changed under Settings > Key bindings.

| Action | Key |
|---|---|
| Move / sprint / crouch / jump | WASD / Shift / Ctrl or C / Space |
| Fire / aim down sights | Left / right mouse |
| Reload | R |
| Primary gun / second primary (Mule Kick) / pistol | 1 / 2 / 3 |
| Cycle weapons | Q or mouse wheel |
| Vote to skip the break between rounds | Enter |
| Knife | V or middle mouse |
| Grenade | G |
| Wind charge (knock zombies back, shoot at your feet to launch yourself) | 4 |
| Buy / open door / revive (hold) | E or F |
| Place a sentry turret (8,000) | T |
| Grapple gun (once bought) | 5 |
| Defibrillator (once bought) | 6 |
| Players online: stats and ping | Tab |
| Menu / settings | Esc |
| Fullscreen | F11 |

## Development

- `node tools/serve.js` then open http://127.0.0.1:8650/ to run it in a browser.
- Co-op without Steam: open `?fake=1001` and `?fake=1002` in two tabs of the same browser.
- Bot playtest: `?playtest&map=outpost&diff=1&seconds=600&speed=6&god=1` (also `skill=0.85`, `start_wave=9`). Per-wave lines and `ISSUE [...]` lines go to the console and `DW.ptLog`.
- Build the exe: `bash tools/build-exe.sh` makes `dist/DeadWaves-<version>-portable.exe` (copy it over `DeadWaves.exe`). It builds in `~/dead-waves-build`, outside OneDrive.

Files:
```
index.html        page + all CSS
js/data.js        guns, perks, difficulties, settings, stats
js/maps.js        ASCII map layouts + builder (walls, doors, wall-buys, perks, box, lamps)
js/models.js      low-poly characters, guns and props (+ mesh merging)
js/physics.js     box collisions, ray casts, zombie flow-field pathing
js/world.js       a running match: waves, bosses, buys, power-ups, effects, co-op sync
js/player.js      first-person controller, guns, health, revive
js/zombie.js      zombie bodies, animation, host-side AI
js/hud.js         HUD, scoreboard, pause and game-over screens
js/main.js        menus, lobby, game loop
js/net.js         Steam lobbies + P2P messages (and the fake-Steam test mode)
js/sfx.js         synthesised sound effects and ambient music
js/bot.js         playtest bot
tools/            Electron main + preload, build script, icon maker, test server
old-godot-version/  the previous Godot build, kept for reference
```

Maps are ASCII grids in `js/maps.js` (the full legend is at the top of that file): `#` wall, `.` start zone, `1`-`9` locked zones, `D` door, `W` wall-buy, `M` mystery box, `K` perk, `S` zombie spawn, `P` player spawn, `C` crate, `X` pillar, `U` Pack-a-Poonch, `G` grenade buy, `A` armour, `R` ammo, `T` turret, `H` deck, `E` elevator, `> < v ^` stairs. Keep each deck, its stairs and its elevator inside one zone, give every deck stairs (zombies can't ride elevators), and check every open cell is reachable.
