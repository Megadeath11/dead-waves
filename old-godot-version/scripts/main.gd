extends Node
## Entry point: menus, Steam lobby screens, leaderboards and stats.
## Starts a World when a match begins and returns here when it ends.

const UI = preload("res://scripts/ui.gd")
const Maps = preload("res://scripts/maps.gd")
const WorldScript = preload("res://scripts/world.gd")

var canvas: CanvasLayer
var root: Control
var screen: Control
var world: Node3D
var toast_l: Label
var toast_t := 0.0
var current := "main"
var lb_map := 0
var lb_diff := 1
var lb_scope := 0
var browse_list: VBoxContainer


func _ready() -> void:
	canvas = CanvasLayer.new()
	canvas.layer = 10
	add_child(canvas)
	root = UI.full_rect(Control.new())
	root.theme = UI.theme()
	canvas.add_child(root)
	Net.lobby_updated.connect(_on_lobby_updated)
	Net.lobby_error.connect(toast)
	Net.match_start.connect(_on_match_start)
	Net.lobby_list_received.connect(_on_lobby_list)
	show_screen("main")
	if "--smoke-test" in OS.get_cmdline_user_args():
		_smoke_test()
	if "--playtest" in OS.get_cmdline_user_args():
		_playtest()
	if "--net-test" in OS.get_cmdline_user_args():
		_net_test()
	if "--screenshots" in OS.get_cmdline_user_args():
		_screenshots()


func _process(delta: float) -> void:
	if toast_t > 0.0:
		toast_t -= delta
		if toast_t <= 0.0 and toast_l:
			toast_l.text = ""


func toast(msg: String) -> void:
	if toast_l:
		toast_l.text = msg
		toast_t = 5.0


# ---------------------------------------------------------------- screens

func show_screen(name: String) -> void:
	current = name
	if screen:
		screen.queue_free()
	screen = UI.full_rect(Control.new())
	root.add_child(screen)
	_background(screen)
	match name:
		"main": _main_menu()
		"setup": _setup_menu()
		"lobby": _lobby_menu()
		"browse": _browse_menu()
		"leaderboard": _leaderboard_menu()
		"stats": _stats_menu()
		"settings": _settings_menu()
	toast_l = UI.label("", 20, UI.GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	toast_l.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	toast_l.position = Vector2(-500, -60)
	toast_l.custom_minimum_size = Vector2(1000, 0)
	screen.add_child(toast_l)


func _background(parent: Control) -> void:
	var bg := TextureRect.new()
	UI.full_rect(bg)
	var g := Gradient.new()
	g.set_color(0, Color(0.16, 0.03, 0.02))
	g.set_color(1, Color(0.01, 0.01, 0.015))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.3, 0.2)
	gt.fill_to = Vector2(1.2, 1.2)
	bg.texture = gt
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_SCALE
	parent.add_child(bg)


func _frame(title: String, sub := "") -> VBoxContainer:
	var margin := MarginContainer.new()
	UI.full_rect(margin)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 70 if side in ["left", "right"] else 50)
	screen.add_child(margin)
	var v := UI.vbox(16)
	margin.add_child(v)
	v.add_child(UI.label(title, 56, UI.RED))
	if sub != "":
		v.add_child(UI.label(sub, 20, UI.DIM))
	return v


func _main_menu() -> void:
	var margin := MarginContainer.new()
	UI.full_rect(margin)
	margin.add_theme_constant_override("margin_left", 90)
	margin.add_theme_constant_override("margin_top", 80)
	screen.add_child(margin)
	var v := UI.vbox(12)
	v.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	margin.add_child(v)
	var title := UI.label("DEAD WAVES", 96, UI.RED)
	title.add_theme_constant_override("outline_size", 16)
	v.add_child(title)
	v.add_child(UI.label("Survive the night. Together.", 24, UI.DIM))
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 24)
	v.add_child(spacer)
	v.add_child(UI.button("Solo", func(): show_screen("setup")))
	var host_b := UI.button("Host co-op (Steam)", func():
		Net.host_lobby()
		toast("Creating lobby..."))
	host_b.disabled = not Game.steam_ok
	v.add_child(host_b)
	var find_b := UI.button("Find co-op games", func():
		show_screen("browse")
		Net.find_lobbies())
	find_b.disabled = not Game.steam_ok
	v.add_child(find_b)
	v.add_child(UI.button("Leaderboards", func(): show_screen("leaderboard")))
	v.add_child(UI.button("Stats", func(): show_screen("stats")))
	v.add_child(UI.button("Settings", func(): show_screen("settings")))
	v.add_child(UI.button("Quit", func(): get_tree().quit()))
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 20)
	v.add_child(gap)
	v.add_child(UI.label(Game.steam_status + "   -   v" + Game.VERSION, 18, UI.DIM))


func _map_picker(v: VBoxContainer, editable: bool) -> void:
	v.add_child(UI.label("MAP", 22, UI.DIM))
	var maps_row := UI.hbox(14)
	v.add_child(maps_row)
	for m in Game.MAP_ORDER:
		var def: Dictionary = Maps.MAPS[m]
		var best := int(Game.stats.best_wave.get("%s:%d" % [m, Game.diff_id], 0))
		var b := UI.button("%s\n%s\nBest wave: %s" % [def.name, def.desc, str(best) if best > 0 else "-"], func():
			Game.map_id = m
			Net.push_config()
			show_screen(current), 330, 18)
		b.custom_minimum_size = Vector2(330, 120)
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.disabled = not editable
		if m == Game.map_id:
			b.add_theme_stylebox_override("normal", UI._flat(Color(0.3, 0.05, 0.04, 0.95), UI.RED, 3))
			b.add_theme_stylebox_override("disabled", UI._flat(Color(0.3, 0.05, 0.04, 0.95), UI.RED, 3))
		maps_row.add_child(b)
	v.add_child(UI.label("DIFFICULTY", 22, UI.DIM))
	var diff_row := UI.hbox(14)
	v.add_child(diff_row)
	for i in Game.DIFFS.size():
		var d: Dictionary = Game.DIFFS[i]
		var b := UI.button(d.name, func():
			Game.diff_id = i
			Net.push_config()
			show_screen(current), 180)
		b.tooltip_text = d.desc
		b.disabled = not editable
		if i == Game.diff_id:
			b.add_theme_stylebox_override("normal", UI._flat(Color(0.3, 0.05, 0.04, 0.95), UI.RED, 3))
			b.add_theme_stylebox_override("disabled", UI._flat(Color(0.3, 0.05, 0.04, 0.95), UI.RED, 3))
		diff_row.add_child(b)
	v.add_child(UI.label(Game.diff().desc, 18, UI.DIM))


func _setup_menu() -> void:
	var v := _frame("SOLO", "Pick a map and difficulty.")
	_map_picker(v, true)
	var row := UI.hbox(14)
	v.add_child(row)
	row.add_child(UI.button("Start", func(): Net.start_match()))
	row.add_child(UI.button("Back", func(): show_screen("main"), 180))


func _lobby_menu() -> void:
	var host := Net.is_host()
	var v := _frame("LOBBY", "Up to 4 players. Friends can join from your Steam profile or an invite.")
	var cols := UI.hbox(40)
	v.add_child(cols)
	var left := UI.vbox(10)
	cols.add_child(left)
	left.add_child(UI.label("PLAYERS (%d/4)" % Net.members.size(), 22, UI.DIM))
	for m in Net.members:
		var tag := "  (host)" if int(m.id) == Net.host_id else ""
		left.add_child(UI.label(str(m.name) + tag, 26, UI.GOLD if int(m.id) == Game.my_id else UI.BONE))
	var right := UI.vbox(10)
	cols.add_child(right)
	_map_picker(right, host)
	if not host:
		right.add_child(UI.label("Waiting for the host to start...", 20, UI.GOLD))
	var row := UI.hbox(14)
	v.add_child(row)
	if host:
		row.add_child(UI.button("Start match", func(): Net.start_match()))
	row.add_child(UI.button("Invite friends", func(): Net.invite_friends(), 220))
	row.add_child(UI.button("Leave lobby", func():
		Net.leave_lobby()
		show_screen("main"), 200))


func _browse_menu() -> void:
	var v := _frame("FIND GAMES", "Public Dead Waves lobbies on Steam (Spacewar test app).")
	var row := UI.hbox(14)
	v.add_child(row)
	row.add_child(UI.button("Refresh", func():
		toast("Searching...")
		Net.find_lobbies(), 180))
	row.add_child(UI.button("Back", func(): show_screen("main"), 180))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(scroll)
	browse_list = UI.vbox(8)
	browse_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(browse_list)
	browse_list.add_child(UI.label("Searching...", 20, UI.DIM))


func _on_lobby_list(lobbies: Array) -> void:
	if current != "browse" or not is_instance_valid(browse_list):
		return
	for c in browse_list.get_children():
		c.queue_free()
	if lobbies.is_empty():
		browse_list.add_child(UI.label("No open games found. Host one, or invite a friend.", 20, UI.DIM))
		return
	for l in lobbies:
		var h := UI.hbox(20)
		var map_name: String = Maps.MAPS.get(l.map, {"name": "?"}).name
		var dname: String = Game.DIFFS[clampi(int(l.diff), 0, 3)].name
		var count_txt := ("%d/4" % l.count) if int(l.count) > 0 else ""
		h.add_child(UI.label("%s   -   %s / %s   %s   %s" % [l.name, map_name, dname, count_txt,
			"(in progress)" if l.state == "ingame" else ""], 22))
		var jb := UI.button("Join", func(): Net.join_lobby(int(l.id)), 120)
		jb.disabled = l.state == "ingame"
		h.add_child(jb)
		browse_list.add_child(h)


func _leaderboard_menu() -> void:
	var v := _frame("LEADERBOARDS", "Highest wave per map and difficulty (kills break ties).")
	var row := UI.hbox(14)
	v.add_child(row)
	var map_names := []
	for m in Game.MAP_ORDER:
		map_names.append(Maps.MAPS[m].name)
	var diff_names := []
	for d in Game.DIFFS:
		diff_names.append(d.name)
	var list := UI.vbox(6)
	row.add_child(UI.option(map_names, lb_map, func(i): lb_map = i; _load_board(list)))
	row.add_child(UI.option(diff_names, lb_diff, func(i): lb_diff = i; _load_board(list)))
	row.add_child(UI.option(["Global top 20", "Around me", "Friends", "My local runs"], lb_scope, func(i): lb_scope = i; _load_board(list)))
	row.add_child(UI.button("Back", func(): show_screen("main"), 160))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(scroll)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(list)
	_load_board(list)


func _load_board(list: VBoxContainer) -> void:
	for c in list.get_children():
		c.queue_free()
	var map_id: String = Game.MAP_ORDER[lb_map]
	if lb_scope == 3 or not Game.steam_ok:
		if lb_scope != 3:
			list.add_child(UI.label("Steam isn't connected - showing your local runs.", 18, UI.GOLD))
		var grid := _board_grid(list, ["#", "Map", "Difficulty", "Wave", "Kills", "Date"])
		var n := 0
		for r in Game.stats.runs:
			n += 1
			for cell in [str(n), Maps.MAPS.get(r.map, {"name": r.map}).name, Game.DIFFS[int(r.diff)].name,
					str(int(r.wave)), str(int(r.kills)), str(r.date)]:
				grid.add_child(UI.label(cell, 20))
		if n == 0:
			list.add_child(UI.label("No runs yet. Go play!", 20, UI.DIM))
		return
	var loading := UI.label("Loading from Steam...", 20, UI.DIM)
	list.add_child(loading)
	var board: String = Boards.board_name(map_id, lb_diff)
	var rows: Array = await Boards.fetch(board, lb_scope)
	if not is_instance_valid(list):
		return
	loading.queue_free()
	if rows.is_empty():
		list.add_child(UI.label("No scores on this board yet - be the first.", 20, UI.DIM))
		return
	var grid := _board_grid(list, ["Rank", "Player", "Wave", "Kills", "Headshots", "Squad"])
	for r in rows:
		var wk: Vector2i = Boards.decode(int(r.score))
		var det: PackedInt32Array = r.details if typeof(r.details) == TYPE_PACKED_INT32_ARRAY else PackedInt32Array()
		var col := UI.GOLD if int(r.id) == Game.my_id else UI.BONE
		for cell in [str(r.rank), str(r.name), str(wk.x), str(wk.y), str(det[2]) if det.size() > 2 else "-",
				("%d" % det[3]) if det.size() > 3 else "-"]:
			grid.add_child(UI.label(cell, 20, col))


func _board_grid(list: VBoxContainer, headers: Array) -> GridContainer:
	var grid := GridContainer.new()
	grid.columns = headers.size()
	grid.add_theme_constant_override("h_separation", 40)
	grid.add_theme_constant_override("v_separation", 6)
	list.add_child(grid)
	for h in headers:
		grid.add_child(UI.label(h, 18, UI.DIM))
	return grid


func _stats_menu() -> void:
	var v := _frame("STATS", "Lifetime stats on this PC. Lifetime kills also go to the Steam board %s." % Boards.LIFETIME)
	var s: Dictionary = Game.stats
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 50)
	grid.add_theme_constant_override("v_separation", 10)
	v.add_child(grid)
	var acc := 0.0
	if int(s.kills) > 0:
		acc = float(s.headshots) / float(s.kills) * 100.0
	var items := [
		["Games played", str(int(s.games))], ["Time survived", UI.fmt_time(float(s.time))],
		["Zombies killed", str(int(s.kills))], ["Headshots", "%d  (%.0f%%)" % [int(s.headshots), acc]],
		["Bosses killed", str(int(s.bosses))], ["Most kills in a game", str(int(s.most_kills))],
		["Points earned", str(int(s.points))], ["Revives", str(int(s.revives))],
		["Times downed", str(int(s.downs))],
	]
	for it in items:
		grid.add_child(UI.label(it[0], 22, UI.DIM))
		grid.add_child(UI.label(it[1], 26))
	v.add_child(UI.label("BEST WAVE", 22, UI.DIM))
	var bw := GridContainer.new()
	bw.columns = Game.DIFFS.size() + 1
	bw.add_theme_constant_override("h_separation", 50)
	v.add_child(bw)
	bw.add_child(UI.label("", 20))
	for d in Game.DIFFS:
		bw.add_child(UI.label(d.name, 20, UI.DIM))
	for m in Game.MAP_ORDER:
		bw.add_child(UI.label(Maps.MAPS[m].name, 22))
		for i in Game.DIFFS.size():
			var best := int(s.best_wave.get("%s:%d" % [m, i], 0))
			bw.add_child(UI.label(str(best) if best > 0 else "-", 22, UI.GOLD if best > 0 else UI.DIM))
	v.add_child(UI.button("Back", func(): show_screen("main"), 180))


func _settings_menu() -> void:
	var v := _frame("SETTINGS")
	v.add_child(UI.settings_panel())
	v.add_child(UI.label("Controls: WASD move - Shift sprint - Ctrl crouch - Space jump - LMB fire - RMB aim\n" +
		"R reload - 1/2/Q/wheel switch - V or MMB knife - G grenade - E buy/revive - Tab scores - Esc menu", 18, UI.DIM))
	v.add_child(UI.button("Back", func(): show_screen("main"), 180))


# ---------------------------------------------------------------- lobby & match

func _on_lobby_updated() -> void:
	if world:
		return
	if Net.is_online():
		show_screen("lobby")
	elif current == "lobby":
		show_screen("main")


func _on_match_start(cfg: Dictionary) -> void:
	if world:
		world.queue_free()
		world = null
	screen.visible = false
	canvas.visible = false
	world = WorldScript.new()
	world.cfg = cfg
	world.finished.connect(_on_world_finished)
	add_child(world)


func _on_world_finished(restart: bool) -> void:
	if world:
		world.queue_free()
		world = null
	get_tree().paused = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	canvas.visible = true
	Net.end_match()
	if restart and not Net.is_online():
		Net.start_match()
		return
	show_screen("lobby" if Net.is_online() else "main")


# ---------------------------------------------------------------- automated check

## Bot plays a solo match. Env: PT_MAP, PT_DIFF, PT_SECONDS (game time), PT_SKILL.
func _playtest() -> void:
	await get_tree().process_frame
	Game.map_id = OS.get_environment("PT_MAP") if OS.get_environment("PT_MAP") != "" else "outpost"
	Game.diff_id = int(OS.get_environment("PT_DIFF")) if OS.get_environment("PT_DIFF") != "" else 1
	var limit := float(OS.get_environment("PT_SECONDS")) if OS.get_environment("PT_SECONDS") != "" else 600.0
	Net.start_match()
	await get_tree().process_frame
	var bot = load("res://tests/bot.gd").new()
	bot.world = world
	bot.log_prefix = "PT[%s/%s]" % [Game.map_id, Game.diff().name]
	bot.god = OS.get_environment("PT_GOD") != ""
	if OS.get_environment("PT_SKILL") != "":
		bot.aim_skill = float(OS.get_environment("PT_SKILL"))
	add_child(bot)
	world.state_t = 2.0
	if OS.get_environment("PT_START_WAVE") != "":
		# jump ahead: late-game loadout
		world.wave = int(OS.get_environment("PT_START_WAVE")) - 1
		world.player.points = 6000
		for i in world.info.doors.size():
			world._open_door(i)
		for perk in ["iron", "fast", "tap"]:
			world.player.add_perk(perk)
		world.player.give_weapon("lmg")
		world.player.give_weapon("plasma")
	while not world.game_over and bot.t < limit:
		await get_tree().physics_frame
	print(bot.summary())
	get_tree().quit()


## Two processes with DW_FAKE_STEAM=1001 (host) and 1002 (client) play a co-op match.
func _net_test() -> void:
	await get_tree().create_timer(0.5).timeout
	Net._on_lobby_joined(777, 0, false, 1)
	var role := "HOST" if Net.is_host() else "CLIENT"
	print("NET %s: members=%s host=%d" % [role, str(Net.member_ids()), Net.host_id])
	if Net.is_host():
		await get_tree().create_timer(3.0).timeout
		Game.map_id = "outpost"
		Game.diff_id = 1
		Net.start_match()
	var wait := 0.0
	while world == null and wait < 20.0:
		await get_tree().process_frame
		wait += get_process_delta_time()
	if world == null:
		print("NET %s: FAIL never started" % role)
		get_tree().quit()
		return
	var w = world
	w.state_t = 1.0
	var t := 0.0
	var shot_t := 0.0
	var door_done := false
	var min_hp := 999.0
	var max_seen := 0
	var dmg_taken := 0.0
	while t < 40.0:
		await get_tree().physics_frame
		var dt := get_physics_process_delta_time()
		t += dt
		max_seen = maxi(max_seen, w.zombies.size())
		if w.player.hp < w.player.max_hp:
			dmg_taken += w.player.max_hp - w.player.hp
			min_hp = minf(min_hp, w.player.hp)
			w.player.hp = w.player.max_hp
		if not Net.is_host() and t > 12.0 and not door_done:
			door_done = true
			w.player.points += 3000
			w._buy_door(0)
			print("NET CLIENT: bought door 0, zones=", w.open_zones.keys())
		shot_t -= dt
		if not Net.is_host() and shot_t <= 0.0 and OS.get_environment("DW_NOSHOOT") == "":
			shot_t = 0.25
			for zid in w.zombies:
				var z = w.zombies[zid]
				if not z.dead and z.global_position.distance_to(w.player.global_position) < 30.0:
					w.local_hit(z, 120.0, randf() < 0.3, false, z.global_position + Vector3.UP)
					break
		if Net.is_host() and t > 34.0 and not w.game_over:
			print("NET HOST: wave=%d alive=%d remotes=%s remote_kills=%s zones=%s dmg_taken=%.0f" % [w.wave, w.zombies.size(),
				str(w.remotes.keys()), str(w.remotes.values().map(func(r): return r.kills)), str(w.open_zones.keys()), dmg_taken])
			w._end_game("net test over")
	print("NET %s: wave=%d max_zombies_seen=%d kills=%d points=%d zones=%s dmg_taken=%.0f remotes=%s game_over=%s" % [role,
		w.wave, max_seen, w.player.kills, w.player.points, str(w.open_zones.keys()), dmg_taken, str(w.remotes.keys()), str(w.game_over)])
	await get_tree().create_timer(1.0).timeout
	print("NET %s: DONE" % role)
	get_tree().quit()


func _snap(path: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(path)
	print("SHOT: ", path)


func _gallery(out: String) -> void:
	const Models = preload("res://scripts/models.gd")
	canvas.visible = false
	var g := Node3D.new()
	add_child(g)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.08, 0.08, 0.1)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.6, 0.6, 0.65)
	env.ambient_light_energy = 0.6
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var we := WorldEnvironment.new()
	we.environment = env
	g.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-40, 30, 0)
	sun.shadow_enabled = true
	g.add_child(sun)
	Models.box(g, Vector3(0, -0.05, 0), Vector3(30, 0.1, 30), Models.mat(Color(0.25, 0.25, 0.25)))
	var rng := RandomNumberGenerator.new()
	var x := -5.0
	for t in ["walker", "walker", "walker", "runner", "spitter", "brute"]:
		rng.seed = int(x * 100) + 7
		var n := Node3D.new()
		n.position = Vector3(x, 0, 0)
		n.rotation.y = 0.35
		g.add_child(n)
		var sc: float = {"walker": 1.0, "runner": 0.97, "brute": 1.7, "spitter": 1.35}[t]
		n.scale = Vector3.ONE * sc
		var rig := Models.zombie(n, t, rng)
		rig.arm_l.rotation.x = -1.3
		rig.arm_r.rotation.x = -1.4
		rig.leg_l.rotation.x = 0.3
		x += 1.2 if t != "spitter" else 1.8
	for i in 2:
		var n := Node3D.new()
		n.position = Vector3(-5.5 + i * 1.2, 0, 2.5)
		n.rotation.y = 0.5
		g.add_child(n)
		var rig := Models.soldier(n, [Color(0.28, 0.35, 0.5), Color(0.5, 0.42, 0.25)][i])
		rig.gun_mount.add_child(Models.gun(["ak", "shotgun"][i]))
	var gx := -2.5
	for id in Game.WEAPONS:
		var gm := Models.gun(id)
		gm.position = Vector3(gx, 1.0, 2.5)
		gm.rotation.y = -PI / 2
		gm.scale = Vector3.ONE * 1.6
		g.add_child(gm)
		gx += 0.0
		var gi: int = Game.WEAPONS.keys().find(id)
		gm.position = Vector3(-2.2 + (gi % 2) * 1.9, 0.4 + (gi / 2) * 0.42, 2.8)
		gm.rotation.y = PI / 2
	var mb := Node3D.new()
	mb.position = Vector3(2.5, 0, 3)
	g.add_child(mb)
	Models.mystery_box(mb)
	var pk := Node3D.new()
	pk.position = Vector3(4.5, 0, 3)
	pk.rotation.y = 0.3
	g.add_child(pk)
	Models.perk_machine(pk, Game.PERKS.tap.color, "Double Tap")
	for i in 3:
		rng.seed = i * 3
		var c := Node3D.new()
		g.add_child(c)
		Models.crate_stack(c, Vector3(-7.5, 0, -1.5 + i * 2.0), rng)
	var cam := Camera3D.new()
	g.add_child(cam)
	cam.position = Vector3(0, 2.3, -6.5)
	cam.look_at(Vector3(0, 1.0, 1.0))
	cam.make_current()
	await get_tree().create_timer(0.5).timeout
	await _snap(out + "/gallery.png")
	cam.position = Vector3(-4.0, 1.6, -2.2)
	cam.look_at(Vector3(-3.5, 1.2, 0))
	await get_tree().create_timer(0.2).timeout
	await _snap(out + "/gallery_close.png")
	cam.position = Vector3(-1.2, 1.3, 0.6)
	cam.look_at(Vector3(-1.2, 1.25, 2.8))
	await get_tree().create_timer(0.2).timeout
	await _snap(out + "/gallery_guns.png")
	g.queue_free()
	canvas.visible = true


func _screenshots() -> void:
	var out := OS.get_environment("SHOT_DIR")
	await get_tree().create_timer(0.5).timeout
	await _gallery(out)
	if OS.get_environment("GALLERY_ONLY") != "":
		get_tree().quit()
		return
	await _snap(out + "/menu.png")
	show_screen("setup")
	await get_tree().create_timer(0.3).timeout
	await _snap(out + "/setup.png")
	for m in Game.MAP_ORDER:
		Game.map_id = m
		Game.diff_id = 1
		Net.start_match()
		var w = world
		w.state_t = 0.0
		await get_tree().create_timer(9.0).timeout
		w.player.points = 4320
		w.player.give_weapon("ak")
		w.double_t = 20.0
		await get_tree().create_timer(0.6).timeout
		await _snap(out + "/%s_play.png" % m)
		# look at the nearest zombie
		var best = null
		var bd := INF
		for zid in w.zombies:
			var d: float = w.zombies[zid].global_position.distance_to(w.player.global_position)
			if d < bd:
				bd = d
				best = w.zombies[zid]
		if best:
			var dir: Vector3 = best.global_position - w.player.global_position
			w.player.rotation.y = atan2(-dir.x, -dir.z)
			w.player.pivot.rotation.x = -0.05
			await get_tree().create_timer(0.3).timeout
			await _snap(out + "/%s_zombie.png" % m)
		w._end_game("Everyone went down on wave %d." % w.wave)
		await get_tree().create_timer(0.5).timeout
		await _snap(out + "/%s_over.png" % m)
		w.quit_match()
		await get_tree().process_frame
	get_tree().quit()

## Run with: godot --headless -- --smoke-test
## Starts a solo match on every map, fast-forwards waves, and checks zombies path to the player.
func _smoke_test() -> void:
	print("SMOKE: steam=", Game.steam_status)
	for m in Game.MAP_ORDER:
		for di in [1, 3]:
			Game.map_id = m
			Game.diff_id = di
			Net.start_match()
			await get_tree().process_frame
			await get_tree().physics_frame
			await get_tree().physics_frame
			var w = world
			print("SMOKE: map=%s diff=%d spawns=%d doors=%d wallbuys=%d perks=%d boxes=%d" % [m, di,
				w.info.spawns.size(), w.info.doors.size(), w.info.wallbuys.size(), w.info.perks.size(), w.info.boxes.size()])
			var path := NavigationServer3D.map_get_path(w.nav_map, w.info.spawns[0].pos, w.player.global_position, true)
			print("SMOKE: nav path points=", path.size())
			w.state_t = 0.0
			var start_ms := Time.get_ticks_msec()
			while Time.get_ticks_msec() - start_ms < 6000:
				await get_tree().physics_frame
			var near := 999.0
			for zid in w.zombies:
				near = minf(near, w.zombies[zid].global_position.distance_to(w.player.global_position))
			print("SMOKE: wave=%d alive=%d to_spawn=%d hp=%.0f nearest_zombie=%.1fm" % [w.wave, w.zombies.size(), w.to_spawn, w.player.hp, near])
			# kill everything through the normal damage path and check points
			var before: int = w.player.points
			for id in w.zombies.keys():
				var z = w.zombies.get(id)
				if z:
					w.local_hit(z, 99999.0, true, false, z.global_position)
			print("SMOKE: points %d -> %d, kills=%d" % [before, w.player.points, w.player.kills])
			# open every door, buy every perk, spin the box
			w.player.points = 100000
			for i in w.info.doors.size():
				w._buy_door(i)
			w._buy_box()
			for pk in w.info.perks:
				w.player.add_perk(pk.perk)
			for wb in w.info.wallbuys:
				w.player.give_weapon(wb.weapon)
			w.throw_grenade(w.player.global_position + Vector3(0, 1, -2), Vector3.ZERO)
			w._drop_powerup(w.player.global_position, "nuke")
			# boss wave
			w.wave = int(Game.DIFFS[di].boss_every) - 1
			w.to_spawn = 0
			w.state = "intermission"
			w.state_t = 0.0
			start_ms = Time.get_ticks_msec()
			while Time.get_ticks_msec() - start_ms < 5000:
				await get_tree().physics_frame
			var boss = w.current_boss()
			print("SMOKE: boss wave=%d boss=%s open_zones=%s weapons=%s perks=%s hp=%.0f/%.0f" % [w.wave,
				boss.ztype if boss else "none", str(w.open_zones.keys()), str(w.player.weapons.map(func(x): return x.id)),
				str(w.player.perks), w.player.hp, w.player.max_hp])
			w._end_game("smoke test")
			await get_tree().process_frame
			w.quit_match()
			await get_tree().process_frame
	print("SMOKE: stats games=", Game.stats.games, " kills=", Game.stats.kills)
	print("SMOKE: DONE")
	get_tree().quit()
