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

- **3 maps**: Outpost (open moonlit yard), Bunker (underground corridors), Factory (big hall, three wings). Buyable doors open new zones.
- **10 guns** with no spread: every bullet goes exactly where the dot is, standing, running or aiming. Wall-buys (M9, M14, Pump Shotgun, MP5, AK-47) and the **Mystery Box** (LMG, Desert Hawk, Barrett .50, Plasma Caster, Death Machine).
- **4 perks**: Iron Hide, Fast Hands, Double Tap, Second Wind. **Power-ups**: Max Ammo, Double Points, Insta-Kill, Nuke.
- **Bosses** every 5 waves (4 on Veteran): the Brute (ground slam) and the Abomination (acid lobs).
- **4 difficulties**: Recruit, Regular, Hardened, Veteran.
- **Co-op for up to 4**: down-and-revive, bleed-out, respawn next wave, scoreboard (Tab).
- Local stats and best runs per map and difficulty.
- No asset files: models, textures, music and sounds are all generated in code.

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

Maps are ASCII grids in `js/maps.js`: `#` wall, `.` start zone, `1`-`3` locked zones, `D` door, `W` wall-buy, `M` mystery box, `K` perk, `S` zombie spawn, `P` player spawn, `C` crate, `X` pillar.
