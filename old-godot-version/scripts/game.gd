extends Node
## Global data tables, settings, lifetime stats and the Steam bootstrap.
## Steam is reached through `Game.steam` so the project still runs (solo, offline)
## when the GodotSteam extension or the Steam client is missing.

const APP_ID := 480 # Spacewar test app. Swap for your own app ID before release.
const GAME_TAG := "deadwaves_v1"
const VERSION := "1.0"

var steam = null
var steam_ok := false
var steam_status := "GodotSteam not installed"
var my_id: int = 1
var my_name: String = "Survivor"

var settings := {"sens": 0.2, "fov": 80.0, "volume": 0.8, "fullscreen": false}
var stats := {}

# Current match selection (host decides in co-op).
var map_id := "outpost"
var diff_id := 1

const DIFFS := [
	{"name": "Recruit", "hp": 0.7, "dmg": 0.5, "spd": 0.9, "pts": 1.25, "boss_every": 5,
		"desc": "Weaker, slower zombies and bonus points."},
	{"name": "Regular", "hp": 1.0, "dmg": 1.0, "spd": 1.0, "pts": 1.0, "boss_every": 5,
		"desc": "The intended experience."},
	{"name": "Hardened", "hp": 1.35, "dmg": 1.5, "spd": 1.1, "pts": 1.0, "boss_every": 5,
		"desc": "Tougher, faster zombies. Hits hurt."},
	{"name": "Veteran", "hp": 1.8, "dmg": 2.2, "spd": 1.2, "pts": 0.9, "boss_every": 4,
		"desc": "Brutal. Bosses every 4 waves."},
]

const MAP_ORDER := ["outpost", "bunker", "factory"]

# spread/ads in degrees, range in metres (damage halves past it).
const WEAPONS := {
	"pistol": {"name": "M9 Sidearm", "dmg": 45, "rpm": 360, "auto": false, "mag": 8, "reserve": 64,
		"reload": 1.3, "spread": 1.4, "ads": 0.3, "pellets": 1, "range": 50.0, "cost": 0, "head": 2.5,
		"color": Color(0.22, 0.22, 0.25), "len": 0.3, "snd": "shot_light", "splash": 0.0, "kick": 1.4, "pierce": 1},
	"m14": {"name": "M14 Rifle", "dmg": 120, "rpm": 320, "auto": false, "mag": 10, "reserve": 100,
		"reload": 2.0, "spread": 1.2, "ads": 0.05, "pellets": 1, "range": 90.0, "cost": 500, "head": 3.0,
		"color": Color(0.42, 0.27, 0.13), "len": 0.9, "snd": "shot_heavy", "splash": 0.0, "kick": 2.2, "pierce": 2},
	"shotgun": {"name": "Pump Shotgun", "dmg": 55, "rpm": 80, "auto": false, "mag": 6, "reserve": 48,
		"reload": 2.4, "spread": 5.5, "ads": 4.0, "pellets": 8, "range": 16.0, "cost": 750, "head": 1.5,
		"color": Color(0.33, 0.2, 0.1), "len": 0.75, "snd": "shot_shotgun", "splash": 0.0, "kick": 5.0, "pierce": 1},
	"mp5": {"name": "MP5 SMG", "dmg": 40, "rpm": 800, "auto": true, "mag": 30, "reserve": 240,
		"reload": 1.8, "spread": 2.2, "ads": 0.7, "pellets": 1, "range": 35.0, "cost": 1000, "head": 2.0,
		"color": Color(0.1, 0.1, 0.11), "len": 0.55, "snd": "shot_light", "splash": 0.0, "kick": 0.7, "pierce": 1},
	"ak": {"name": "AK-47", "dmg": 65, "rpm": 600, "auto": true, "mag": 30, "reserve": 270,
		"reload": 2.3, "spread": 2.4, "ads": 0.45, "pellets": 1, "range": 70.0, "cost": 1400, "head": 2.5,
		"color": Color(0.45, 0.29, 0.13), "len": 0.85, "snd": "shot_heavy", "splash": 0.0, "kick": 1.3, "pierce": 1},
	# Mystery box only
	"lmg": {"name": "RPK Machine Gun", "dmg": 75, "rpm": 700, "auto": true, "mag": 100, "reserve": 400,
		"reload": 4.0, "spread": 3.0, "ads": 0.9, "pellets": 1, "range": 70.0, "cost": 0, "head": 2.0,
		"color": Color(0.2, 0.22, 0.17), "len": 1.0, "snd": "shot_heavy", "splash": 0.0, "kick": 1.0, "pierce": 2},
	"deagle": {"name": "Desert Hawk", "dmg": 260, "rpm": 220, "auto": false, "mag": 7, "reserve": 63,
		"reload": 1.7, "spread": 1.6, "ads": 0.2, "pellets": 1, "range": 60.0, "cost": 0, "head": 3.0,
		"color": Color(0.6, 0.6, 0.62), "len": 0.36, "snd": "shot_heavy", "splash": 0.0, "kick": 4.0, "pierce": 2},
	"sniper": {"name": "Barrett .50", "dmg": 1500, "rpm": 55, "auto": false, "mag": 5, "reserve": 40,
		"reload": 3.2, "spread": 5.0, "ads": 0.0, "pellets": 1, "range": 250.0, "cost": 0, "head": 4.0,
		"color": Color(0.16, 0.17, 0.15), "len": 1.25, "snd": "shot_sniper", "splash": 0.0, "kick": 7.0, "pierce": 5},
	"plasma": {"name": "Plasma Caster", "dmg": 900, "rpm": 190, "auto": false, "mag": 20, "reserve": 160,
		"reload": 2.0, "spread": 0.6, "ads": 0.2, "pellets": 1, "range": 80.0, "cost": 0, "head": 1.2,
		"color": Color(0.2, 0.95, 0.45), "len": 0.45, "snd": "shot_ray", "splash": 3.2, "kick": 1.8, "pierce": 1},
	"minigun": {"name": "Death Machine", "dmg": 110, "rpm": 1300, "auto": true, "mag": 200, "reserve": 200,
		"reload": 5.0, "spread": 3.5, "ads": 2.0, "pellets": 1, "range": 60.0, "cost": 0, "head": 1.5,
		"color": Color(0.3, 0.3, 0.33), "len": 1.1, "snd": "shot_light", "splash": 0.0, "kick": 0.5, "pierce": 1},
}

const BOX_POOL := ["lmg", "deagle", "sniper", "plasma", "minigun", "ak", "mp5", "shotgun", "m14"]
const BOX_COST := 950

const PERKS := {
	"iron": {"name": "Iron Hide", "cost": 2500, "color": Color(0.9, 0.15, 0.15), "desc": "Max health 250"},
	"fast": {"name": "Fast Hands", "cost": 3000, "color": Color(0.25, 0.85, 0.3), "desc": "Reload 50% faster"},
	"tap": {"name": "Double Tap", "cost": 2000, "color": Color(0.95, 0.75, 0.1), "desc": "Fire rate +33%"},
	"wind": {"name": "Second Wind", "cost": 1500, "color": Color(0.2, 0.55, 1.0), "desc": "Solo: self-revive once. Co-op: revive twice as fast"},
}
const PERK_ORDER := ["iron", "fast", "tap", "wind"]

const ZTYPES := ["walker", "runner", "brute", "spitter"]


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_setup_input()
	load_settings()
	load_stats()
	apply_settings()
	_init_steam()


func _process(_delta: float) -> void:
	if steam_ok:
		steam.run_callbacks()


func _init_steam() -> void:
	var fake := OS.get_environment("DW_FAKE_STEAM")
	if fake != "":
		steam = load("res://tests/fake_steam.gd").new(int(fake), OS.get_environment("DW_FAKE_DIR"))
		add_child(steam)
		steam_ok = true
		my_id = int(fake)
		my_name = steam.getPersonaName()
		steam_status = "Fake Steam (test mode) as " + my_name
		return
	if not Engine.has_singleton("Steam"):
		steam_status = "GodotSteam not installed - offline solo only"
		return
	steam = Engine.get_singleton("Steam")
	OS.set_environment("SteamAppId", str(APP_ID))
	OS.set_environment("SteamGameId", str(APP_ID))
	var r = steam.steamInitEx(APP_ID, false)
	var status := 1
	if typeof(r) == TYPE_DICTIONARY:
		status = int(r.get("status", 1))
		steam_status = str(r.get("verbal", ""))
	elif typeof(r) == TYPE_BOOL:
		status = 0 if r else 1
	if status == 0:
		steam_ok = true
		my_id = int(steam.getSteamID())
		my_name = str(steam.getPersonaName())
		steam_status = "Steam connected as " + my_name
	else:
		steam_ok = false
		push_warning("Steam init failed: " + steam_status)
		steam_status = "Steam isn't running - solo only. Start Steam and relaunch for co-op."


func diff() -> Dictionary:
	return DIFFS[clampi(diff_id, 0, DIFFS.size() - 1)]


func persona_name(id: int) -> String:
	if id == my_id:
		return my_name
	if steam_ok:
		var n := str(steam.getFriendPersonaName(id))
		if n != "" and n != "[unknown]":
			return n
		steam.requestUserInformation(id, true)
	return "Player " + str(id % 10000)


# ---------------------------------------------------------------- input map

func _setup_input() -> void:
	var keys := {
		"move_forward": [KEY_W, KEY_UP], "move_back": [KEY_S, KEY_DOWN],
		"move_left": [KEY_A, KEY_LEFT], "move_right": [KEY_D, KEY_RIGHT],
		"jump": [KEY_SPACE], "sprint": [KEY_SHIFT], "crouch": [KEY_CTRL, KEY_C],
		"reload": [KEY_R], "interact": [KEY_E, KEY_F], "melee": [KEY_V],
		"grenade": [KEY_G], "weapon_1": [KEY_1], "weapon_2": [KEY_2], "swap": [KEY_Q],
		"scoreboard": [KEY_TAB], "pause": [KEY_ESCAPE],
	}
	for action in keys:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for k in keys[action]:
			var ev := InputEventKey.new()
			ev.physical_keycode = k
			InputMap.action_add_event(action, ev)
	var mouse := {"fire": MOUSE_BUTTON_LEFT, "ads": MOUSE_BUTTON_RIGHT}
	for action in mouse:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		var mb := InputEventMouseButton.new()
		mb.button_index = mouse[action]
		InputMap.action_add_event(action, mb)
	var mid := InputEventMouseButton.new()
	mid.button_index = MOUSE_BUTTON_MIDDLE
	InputMap.action_add_event("melee", mid)


# ---------------------------------------------------------------- settings

func load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load("user://settings.cfg") == OK:
		for k in settings.keys():
			settings[k] = cfg.get_value("settings", k, settings[k])


func save_settings() -> void:
	var cfg := ConfigFile.new()
	for k in settings.keys():
		cfg.set_value("settings", k, settings[k])
	cfg.save("user://settings.cfg")


func apply_settings() -> void:
	AudioServer.set_bus_volume_db(0, linear_to_db(maxf(float(settings.volume), 0.0001)))
	if DisplayServer.get_name() != "headless":
		if settings.fullscreen:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		elif DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)


# ---------------------------------------------------------------- lifetime stats

func _default_stats() -> Dictionary:
	return {"games": 0, "kills": 0, "headshots": 0, "bosses": 0, "points": 0, "downs": 0,
		"revives": 0, "time": 0.0, "best_wave": {}, "most_kills": 0, "runs": []}


func load_stats() -> void:
	stats = _default_stats()
	if FileAccess.file_exists("user://stats.json"):
		var f := FileAccess.open("user://stats.json", FileAccess.READ)
		var parsed = JSON.parse_string(f.get_as_text())
		if typeof(parsed) == TYPE_DICTIONARY:
			for k in parsed.keys():
				stats[k] = parsed[k]


func save_stats() -> void:
	var f := FileAccess.open("user://stats.json", FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(stats, "\t"))


func record_run(run: Dictionary) -> void:
	stats.games = int(stats.games) + 1
	for k in ["kills", "headshots", "bosses", "points", "downs", "revives"]:
		stats[k] = int(stats[k]) + int(run.get(k, 0))
	stats.time = float(stats.time) + float(run.get("time", 0.0))
	stats.most_kills = maxi(int(stats.most_kills), int(run.get("kills", 0)))
	var key := "%s:%d" % [run.map, run.diff]
	var best: Dictionary = stats.best_wave
	best[key] = maxi(int(best.get(key, 0)), int(run.wave))
	var runs: Array = stats.runs
	runs.append({"map": run.map, "diff": run.diff, "wave": run.wave, "kills": run.kills,
		"players": run.get("players", 1), "date": Time.get_date_string_from_system()})
	runs.sort_custom(func(a, b): return int(a.wave) * 100000 + int(a.kills) > int(b.wave) * 100000 + int(b.kills))
	if runs.size() > 25:
		runs.resize(25)
	save_stats()
