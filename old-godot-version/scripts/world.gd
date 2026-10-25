extends Node3D
## A running match. The host (or a solo player) simulates zombies and waves;
## everyone simulates their own player and reports hits to the host.

signal finished(restart: bool)

const Maps = preload("res://scripts/maps.gd")
const ZombieScript = preload("res://scripts/zombie.gd")
const PlayerScript = preload("res://scripts/player.gd")
const HudScript = preload("res://scripts/hud.gd")
const Models = preload("res://scripts/models.gd")

const MAX_ALIVE := 24
const SNAP_RATE := 1.0 / 15.0
const PSTATE_RATE := 1.0 / 20.0
const PU_TYPES := ["max_ammo", "double", "insta", "nuke"]
const PU_INFO := {
	"max_ammo": {"name": "MAX AMMO", "color": Color(0.3, 0.9, 0.3), "letter": "A"},
	"double": {"name": "DOUBLE POINTS", "color": Color(1.0, 0.85, 0.2), "letter": "x2"},
	"insta": {"name": "INSTA-KILL", "color": Color(0.9, 0.2, 0.2), "letter": "!"},
	"nuke": {"name": "NUKE", "color": Color(1.0, 0.55, 0.1), "letter": "N"},
}

var cfg := {}
var map_id := "outpost"
var diff := {}
var host := true
var online := false
var solo := true
var info := {}
var nav_map: RID
var rng := RandomNumberGenerator.new()

var player
var hud
var remotes := {} # id -> state dictionary (includes "node")
var zombies := {} # id -> zombie node
var dead_ids := {}
var next_zid := 1

var wave := 0
var state := "intermission"
var state_t := 6.0
var to_spawn := 0
var spawn_t := 0.0
var boss_queue: Array = []
var open_zones := {0: true}
var double_t := 0.0
var insta_t := 0.0
var powerups := {} # id -> {node, type, t}
var next_pu := 1
var drops_this_wave := 0
var game_over := false
var elapsed := 0.0
var snap_t := 0.0
var pstate_t := 0.0
var aoes: Array = []
var box_roll_t := 0.0
var box_choice := ""
var box_state := "idle"
var box_swap_t := 0.0
var box_holder: Node3D
var paused := false
var relocations := 0


func _ready() -> void:
	map_id = str(cfg.get("map", "outpost"))
	if not Maps.MAPS.has(map_id):
		map_id = "outpost"
	Game.map_id = map_id
	Game.diff_id = int(cfg.get("diff", 1))
	diff = Game.diff()
	online = Net.is_online()
	host = Net.is_host()
	var ids: Array = cfg.get("players", [Game.my_id])
	ids = ids.duplicate()
	ids.sort()
	solo = ids.size() <= 1
	rng.seed = int(cfg.get("seed", randi()))
	process_mode = Node.PROCESS_MODE_PAUSABLE

	_build_environment()
	info = Maps.build(map_id, self)
	_bake_nav()

	player = PlayerScript.new()
	player.world = self
	add_child(player)
	var spawns: Array = info.player_spawns
	var slot := maxi(ids.find(Game.my_id), 0)
	player.global_position = spawns[slot % spawns.size()]
	player.rotation.y = PI

	hud = HudScript.new()
	hud.world = self
	add_child(hud)

	for id in ids:
		if int(id) != Game.my_id:
			_ensure_remote(int(id))
	Net.packet.connect(_on_packet)
	Net.player_left.connect(_on_player_left)
	Net.host_left.connect(_on_host_left)
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	state = "intermission"
	state_t = 4.0
	var music := AudioStreamPlayer.new()
	music.stream = Sfx.ambience()
	music.volume_db = -14.0
	music.name = "Music"
	add_child(music)
	music.play()
	hud.center_msg("%s\n%s" % [map_name().to_upper(), diff.name], Color(0.9, 0.85, 0.75), 3.5)


func map_name() -> String:
	return Maps.MAPS[map_id].name


func _build_environment() -> void:
	var def: Dictionary = Maps.MAPS[map_id]
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = def.sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = def.ambient
	env.ambient_light_energy = def.ambient_energy
	env.fog_enabled = true
	env.fog_light_color = def.fog
	env.fog_density = def.fog_density
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.1
	env.glow_enabled = true
	env.glow_intensity = 0.7
	env.glow_bloom = 0.05
	env.ssao_enabled = true
	env.adjustment_enabled = true
	env.adjustment_saturation = 0.85
	env.adjustment_contrast = 1.08
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	if float(def.moon) > 0.0:
		var moon := DirectionalLight3D.new()
		moon.rotation_degrees = Vector3(-55, 35, 0)
		moon.light_color = Color(0.6, 0.7, 1.0)
		moon.light_energy = def.moon
		moon.shadow_enabled = true
		moon.directional_shadow_max_distance = 60.0
		add_child(moon)


func _bake_nav() -> void:
	var region: NavigationRegion3D = info.region
	region.bake_navigation_mesh(false)
	nav_map = get_world_3d().navigation_map


var _rebake_pending := false


func _rebake_nav() -> void:
	await get_tree().process_frame
	var region: NavigationRegion3D = info.region
	if not is_instance_valid(region):
		return
	if region.is_baking():
		# Another door opened mid-bake: bake again once this one finishes.
		if not _rebake_pending:
			_rebake_pending = true
			await region.bake_finished
			_rebake_pending = false
			_rebake_nav()
		return
	region.bake_navigation_mesh(true)


func set_paused(on: bool) -> void:
	paused = on
	player.input_enabled = not on
	if solo:
		get_tree().paused = on


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and not hud.is_paused() and not game_over:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


# ---------------------------------------------------------------- main loop

func _process(delta: float) -> void:
	if game_over:
		return
	elapsed += delta
	double_t = maxf(double_t - delta, 0.0)
	insta_t = maxf(insta_t - delta, 0.0)
	if host:
		_host_tick(delta)
	_update_remotes(delta)
	_update_powerups(delta)
	_update_box(delta)
	if online:
		pstate_t -= delta
		if pstate_t <= 0.0:
			pstate_t = PSTATE_RATE
			send_pstate(false)


func _host_tick(delta: float) -> void:
	match state:
		"intermission":
			state_t -= delta
			if state_t <= 0.0:
				_start_wave()
		"wave":
			spawn_t -= delta
			if spawn_t <= 0.0 and zombies.size() < MAX_ALIVE and (to_spawn > 0 or not boss_queue.is_empty()):
				var n := _player_count()
				spawn_t = maxf(0.35, 2.0 - wave * 0.08) / (1.0 + 0.3 * (n - 1))
				if not boss_queue.is_empty():
					_spawn_zombie(boss_queue.pop_front(), _pick_spawn())
					spawn_t = 2.5
				else:
					to_spawn -= 1
					var runner_chance := clampf((wave - 3) * 0.12, 0.0, 0.8)
					_spawn_zombie("runner" if rng.randf() < runner_chance else "walker", _pick_spawn())
			if to_spawn <= 0 and boss_queue.is_empty() and zombies.is_empty():
				state = "intermission"
				state_t = 10.0
				Net.send_all("wave_end", {"n": wave})
				_on_wave_end()
	# delayed area attacks
	for a in aoes.duplicate():
		a.t -= delta
		if a.t <= 0.0:
			aoes.erase(a)
			for pl in _all_players(true):
				if Vector2(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z).length() <= a.r and absf(pl.pos.y - a.pos.y) < 3.0:
					damage_player(pl.id, a.dmg, a.pos)
	if online:
		snap_t -= delta
		if snap_t <= 0.0:
			snap_t = SNAP_RATE
			_send_snapshot()
	# game over: everyone down or dead
	if wave > 0:
		var any_up := false
		for pl in _all_players(false):
			if not pl.down and not pl.dead:
				any_up = true
		if not any_up:
			_end_game("Everyone went down on wave %d." % wave)


func _player_count() -> int:
	return 1 + remotes.size()


# ---------------------------------------------------------------- waves

static func zombie_hp(w: int) -> float:
	if w < 10:
		return 150.0 + 100.0 * (w - 1)
	return 950.0 * pow(1.1, w - 9)


func _start_wave() -> void:
	wave += 1
	drops_this_wave = 0
	var n := _player_count()
	var base := int(round(5 + wave * 2.6 + 0.09 * wave * wave))
	to_spawn = int(base * (1.0 + 0.6 * (n - 1)))
	boss_queue.clear()
	var every: int = diff.boss_every
	if wave % every == 0:
		var bi := wave / every
		boss_queue.append("brute" if bi % 2 == 1 else "spitter")
		if bi >= 3:
			boss_queue.append("spitter" if bi % 2 == 1 else "brute")
		to_spawn = int(to_spawn * 0.5)
	state = "wave"
	spawn_t = 2.5
	var boss := not boss_queue.is_empty()
	Net.send_all("wave", {"n": wave, "boss": boss})
	_on_wave_start(wave, boss)


func _on_wave_start(n: int, boss: bool) -> void:
	wave = n
	state = "wave"
	Sfx.play("wave_start", 2.0)
	if boss:
		hud.center_msg("WAVE %d\nBOSS INCOMING" % n, Color(1.0, 0.2, 0.15), 3.5)
	else:
		hud.center_msg("WAVE %d" % n, Color(0.85, 0.1, 0.08), 2.5)
	if player.dead:
		player.respawn(respawn_point())
	player.grenades = mini(player.grenades + 2, 4)


func _on_wave_end() -> void:
	state = "intermission"
	state_t = 10.0
	Sfx.play("wave_end")
	hud.center_msg("WAVE %d SURVIVED" % wave, Color(0.9, 0.85, 0.75), 3.0)


func respawn_point() -> Vector3:
	var spawns: Array = info.player_spawns
	var best: Vector3 = spawns[0]
	for pl in _all_players(false):
		if not pl.down and not pl.dead and pl.id != Game.my_id:
			return pl.pos + Vector3(1.0, 0.2, 0.0)
	return best


func _pick_spawn() -> Vector3:
	var cands := []
	var players := _all_players(true)
	for s in info.spawns:
		if not open_zones.has(int(s.zone)):
			continue
		var dmin := 9999.0
		for pl in players:
			dmin = minf(dmin, (pl.pos as Vector3).distance_to(s.pos))
		if dmin > 7.0:
			cands.append([dmin, s.pos])
	if cands.is_empty():
		for s in info.spawns:
			if open_zones.has(int(s.zone)):
				cands.append([0.0, s.pos])
	cands.sort_custom(func(a, b): return a[0] < b[0])
	var pick: Array = cands[rng.randi_range(0, mini(3, cands.size() - 1))]
	return (pick[1] as Vector3) + Vector3(rng.randf_range(-0.5, 0.5), 0.1, rng.randf_range(-0.5, 0.5))


func _spawn_zombie(type: String, pos: Vector3) -> void:
	var n := _player_count()
	var hpv := zombie_hp(wave) * float(diff.hp)
	var spd := rng.randf_range(1.4, 2.1)
	var dmg := 40.0
	match type:
		"runner":
			spd = rng.randf_range(4.0, 4.9)
		"brute":
			hpv = maxf(2500.0, hpv * 8.0) * (1.0 + 0.5 * (n - 1))
			spd = 2.7
			dmg = 55.0
		"spitter":
			hpv = maxf(2000.0, hpv * 6.0) * (1.0 + 0.5 * (n - 1))
			spd = 2.4
			dmg = 35.0
	var id := next_zid
	next_zid += 1
	var z = ZombieScript.new()
	z.setup(self, id, type, hpv, spd * float(diff.spd), dmg * float(diff.dmg), false)
	z.position = pos
	add_child(z)
	zombies[id] = z
	if type == "brute" or type == "spitter":
		Sfx.play3d("growl_boss", pos + Vector3.UP, 6.0, 0.8, 80.0)


func relocate_zombie(z) -> void:
	relocations += 1
	z.global_position = _pick_spawn()
	z.velocity = Vector3.ZERO
	z.repath_t = 0.0
	z.rise_t = z.RISE_TIME
	z.body_root.position.y = -1.9 * z.s
	dirt_burst(z.global_position, z.s)


func spectate_target():
	for id in remotes:
		var r: Dictionary = remotes[id]
		if not r.dead and r.stale < 5.0:
			return r
	return null


func current_boss():
	for id in zombies:
		var z = zombies[id]
		if is_instance_valid(z) and not z.dead and z.is_boss():
			return z
	return null


# ---------------------------------------------------------------- player queries (used by zombie AI)

func _all_players(alive_only: bool) -> Array:
	var out := []
	if is_instance_valid(player):
		var me := {"id": Game.my_id, "pos": player.global_position, "down": player.downed and player.self_revive_t <= 0.0, "dead": player.dead}
		if not alive_only or (not me.down and not me.dead):
			out.append(me)
	for id in remotes:
		var r: Dictionary = remotes[id]
		var entry := {"id": id, "pos": r.pos, "down": r.down, "dead": r.dead or r.stale > 10.0}
		if not alive_only or (not entry.down and not entry.dead):
			out.append(entry)
	return out


func nearest_player(pos: Vector3):
	var best = null
	var bd := INF
	for pl in _all_players(true):
		var d := (pl.pos as Vector3).distance_squared_to(pos)
		if d < bd:
			bd = d
			best = pl
	return best


func separation(z) -> Vector3:
	var push := Vector3.ZERO
	var p: Vector3 = z.global_position
	for id in zombies:
		var o = zombies[id]
		if o == z or o.dead:
			continue
		var d: Vector3 = p - o.global_position
		d.y = 0.0
		var l := d.length()
		var minl: float = 0.75 * (z.s + o.s) * 0.5
		if l < minl and l > 0.001:
			push += d / l * (minl - l) / minl
	return push


func zombie_attack(z, target_id: int, dmg: float) -> void:
	Sfx.play3d("melee_hit", z.global_position + Vector3.UP, -4.0)
	damage_player(target_id, dmg, z.global_position)


func damage_player(id: int, dmg: float, from := Vector3.INF) -> void:
	if id == Game.my_id:
		player.take_damage(dmg, from)
	else:
		Net.send_to(id, "pdmg", {"d": dmg, "f": from if from != Vector3.INF else null})


func spawn_aoe(pos: Vector3, r: float, delay: float, dmg: float, kind: String) -> void:
	aoes.append({"pos": pos, "r": r, "t": delay, "dmg": dmg})
	Net.send_all("aoe", {"p": pos, "r": r, "t": delay, "k": kind})
	_show_aoe(pos, r, delay, kind)


func _show_aoe(pos: Vector3, r: float, delay: float, kind: String) -> void:
	var col := Color(1.0, 0.3, 0.1) if kind == "slam" else Color(0.5, 1.0, 0.2)
	var ring := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = r
	cyl.bottom_radius = r
	cyl.height = 0.05
	ring.mesh = cyl
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(col, 0.35)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.emission_enabled = true
	m.emission = col
	m.emission_energy_multiplier = 1.5
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring.material_override = m
	add_child(ring)
	ring.global_position = Vector3(pos.x, pos.y + 0.06, pos.z)
	ring.scale = Vector3(0.2, 1, 0.2)
	if kind == "acid":
		Sfx.play3d("acid", pos, 0.0)
		_lob_fx(pos, delay, col)
	var tw := ring.create_tween()
	tw.tween_property(ring, "scale", Vector3.ONE, delay)
	tw.tween_callback(func():
		Sfx.play3d("slam" if kind == "slam" else "acid", pos, 4.0)
		_burst(pos + Vector3.UP * 0.3, col, 26, 6.0, 0.6))
	tw.tween_property(ring, "scale", Vector3(1.1, 1, 1.1), 0.25)
	tw.tween_callback(ring.queue_free)


func _lob_fx(target: Vector3, t: float, col: Color) -> void:
	var boss = current_boss()
	if boss == null:
		return
	var ball := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.3
	sm.height = 0.6
	ball.mesh = sm
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.emission_enabled = true
	m.emission = col
	m.emission_energy_multiplier = 3.0
	ball.material_override = m
	add_child(ball)
	var start: Vector3 = boss.global_position + Vector3.UP * 2.0
	ball.global_position = start
	var arc := func(k: float) -> void:
		if is_instance_valid(ball):
			ball.global_position = start.lerp(target, k) + Vector3.UP * sin(k * PI) * 4.0
	var tw := ball.create_tween()
	tw.tween_method(arc, 0.0, 1.0, t)
	tw.tween_callback(ball.queue_free)


# ---------------------------------------------------------------- damage (host authority)

func local_hit(z, dmg: float, head: bool, knife: bool, at: Vector3) -> void:
	if z.dead:
		return
	player.add_points(10)
	z.flinch(head)
	hud.hit_marker(head)
	Sfx.play("headshot" if head else "hit", -6.0)
	_burst(at, Color(0.5, 0.03, 0.02), 8, 3.0, 0.35)
	if host:
		apply_damage(z.zid, dmg, head, Game.my_id, knife)
	else:
		Net.send_host("hit", {"z": z.zid, "d": dmg, "h": head, "kn": knife})


func local_splash(at: Vector3, radius: float, dmg: float, skip) -> void:
	_burst(at, Color(0.3, 1.0, 0.5), 18, 5.0, 0.4)
	for id in zombies.keys():
		var z = zombies.get(id)
		if z == null or z == skip or z.dead:
			continue
		var d: float = (z.global_position + Vector3.UP).distance_to(at)
		if d <= radius:
			local_hit(z, dmg * (1.0 - d / radius * 0.5), false, false, z.global_position + Vector3.UP)


func apply_damage(zid: int, dmg: float, head: bool, by: int, knife: bool) -> void:
	var z = zombies.get(zid)
	if z == null or z.dead:
		return
	if insta_t > 0.0 and not z.is_boss():
		dmg = z.hp + 1.0
	z.hp -= dmg
	z.hp_frac = clampf(z.hp / z.max_hp, 0.0, 1.0)
	if z.hp <= 0.0:
		_kill_zombie(zid, by, head, knife, false)


func _kill_zombie(zid: int, by: int, head: bool, knife: bool, nuke: bool) -> void:
	var z = zombies.get(zid)
	if z == null:
		return
	var pos: Vector3 = z.global_position
	var msg := {"z": zid, "by": by, "h": head, "kn": knife, "nk": nuke, "b": z.is_boss(), "p": pos}
	Net.send_all("zkill", msg)
	_on_zkill(msg)
	if nuke:
		return
	if msg.b:
		_drop_powerup(pos, "max_ammo")
	elif drops_this_wave < 4 and rng.randf() < 0.035:
		drops_this_wave += 1
		_drop_powerup(pos, PU_TYPES[rng.randi_range(0, PU_TYPES.size() - 1)])


func _on_zkill(msg: Dictionary) -> void:
	var zid := int(msg.z)
	dead_ids[zid] = true
	var z = zombies.get(zid)
	zombies.erase(zid)
	var head: bool = msg.h
	if z != null and is_instance_valid(z):
		z.die(head)
	var pos: Vector3 = msg.p
	_burst(pos + Vector3.UP * (1.7 if head else 1.0), Color(0.45, 0.02, 0.02), 22 if head else 12, 4.0, 0.6)
	if int(msg.by) == Game.my_id and not msg.nk:
		player.kills += 1
		if head:
			player.headshots += 1
		hud.hit_marker(head, true)
		if msg.b:
			player.bosses += 1
			player.add_points(500)
		elif msg.kn:
			player.add_points(130)
		else:
			player.add_points(100 if head else 60)
	if msg.b:
		hud.center_msg("BOSS DOWN", Color(1.0, 0.8, 0.3), 2.5)
		if int(msg.by) != Game.my_id:
			player.add_points(200)


# ---------------------------------------------------------------- power-ups

func _drop_powerup(pos: Vector3, type: String) -> void:
	var id := next_pu
	next_pu += 1
	var p := Vector3(pos.x, 0.0, pos.z)
	Net.send_all("pu", {"i": id, "t": type, "p": p})
	_spawn_pu(id, type, p)


func _spawn_pu(id: int, type: String, pos: Vector3) -> void:
	var pi: Dictionary = PU_INFO[type]
	var root := Node3D.new()
	add_child(root)
	root.global_position = pos + Vector3.UP * 1.0
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.5, 0.5, 0.5)
	mi.mesh = bm
	var m := StandardMaterial3D.new()
	m.albedo_color = pi.color
	m.emission_enabled = true
	m.emission = pi.color
	m.emission_energy_multiplier = 3.0
	mi.material_override = m
	root.add_child(mi)
	var l := Maps.label(root, Vector3(0, 0.6, 0), pi.letter, 64, pi.color.lightened(0.4))
	l.no_depth_test = true
	var light := OmniLight3D.new()
	light.light_color = pi.color
	light.light_energy = 2.0
	light.omni_range = 4.0
	root.add_child(light)
	powerups[id] = {"node": root, "type": type, "t": 26.0, "mesh": mi}


func _update_powerups(delta: float) -> void:
	for id in powerups.keys():
		var pu: Dictionary = powerups[id]
		pu.t -= delta
		var node: Node3D = pu.node
		node.rotation.y += delta * 2.0
		node.position.y = 1.0 + sin(elapsed * 3.0) * 0.15
		if pu.t < 6.0:
			node.visible = fmod(pu.t, 0.4) > 0.15
		if pu.t <= 0.0:
			node.queue_free()
			powerups.erase(id)
			continue
		if player.alive() and Vector2(node.global_position.x - player.global_position.x, node.global_position.z - player.global_position.z).length() < 1.5:
			if host:
				_take_pu(id)
			elif not pu.get("pending", false):
				pu.pending = true
				Net.send_host("pu_take", {"i": id})


func _take_pu(id: int) -> void:
	if not powerups.has(id):
		return
	var type: String = powerups[id].type
	Net.send_all("pu_fx", {"i": id, "t": type})
	_apply_pu(id, type)


func _apply_pu(id: int, type: String) -> void:
	if powerups.has(id):
		powerups[id].node.queue_free()
		powerups.erase(id)
	Sfx.play("pickup", 2.0)
	var pi: Dictionary = PU_INFO[type]
	hud.center_msg(pi.name, pi.color, 2.5)
	match type:
		"max_ammo":
			player.refill_ammo()
		"double":
			double_t = 30.0
		"insta":
			insta_t = 30.0
		"nuke":
			player.add_points(400, true)
			Sfx.play("explode", 4.0)
			hud.flash_damage(0.0)
			if host:
				for zid in zombies.keys():
					if not zombies[zid].is_boss():
						_kill_zombie(zid, 0, false, false, true)


# ---------------------------------------------------------------- interactions

func get_interaction() -> Dictionary:
	if game_over or not player.alive():
		return {}
	var p: Vector3 = player.global_position
	for id in remotes:
		var r: Dictionary = remotes[id]
		if r.down and not r.dead and (r.pos as Vector3).distance_to(p) < 2.3:
			var t := 1.5 if player.perks.has("wind") else 3.0
			return {"text": "Hold E to revive %s" % r.name, "hold": t, "action": func(): _revive_remote(id)}
	for i in info.doors.size():
		var d: Dictionary = info.doors[i]
		if d.open:
			continue
		var half: Vector3 = d.size * 0.5
		var c: Vector3 = d.pos
		var closest := Vector3(clampf(p.x, c.x - half.x, c.x + half.x), p.y, clampf(p.z, c.z - half.z, c.z + half.z))
		if closest.distance_to(Vector3(p.x, p.y, p.z)) < 1.7:
			return {"text": "Press E to clear debris  [%d]" % d.cost, "cost": int(d.cost), "action": func(): _buy_door(i)}
	for wb in info.wallbuys:
		if (wb.pos as Vector3).distance_to(p) < 2.0:
			var wd: Dictionary = Game.WEAPONS[wb.weapon]
			if player.has_weapon(wb.weapon):
				var c2 := int(wd.cost) / 2
				return {"text": "Press E for %s ammo  [%d]" % [wd.name, c2], "cost": c2, "action": func():
					if player.spend(c2):
						player.give_weapon(wb.weapon)}
			return {"text": "Press E to buy %s  [%d]" % [wd.name, wd.cost], "cost": int(wd.cost), "action": func():
				if player.spend(int(wd.cost)):
					player.give_weapon(wb.weapon)}
	for bx in info.boxes:
		if (bx.pos as Vector3).distance_to(p) < 2.2:
			if box_state == "rolling":
				return {"text": "The box is spinning..."}
			if box_state == "ready":
				return {"text": "Press E to take %s" % Game.WEAPONS[box_choice].name, "action": _take_box_weapon}
			return {"text": "Press E for a random weapon  [%d]" % Game.BOX_COST, "cost": Game.BOX_COST, "action": _buy_box}
	for pk in info.perks:
		if (pk.pos as Vector3).distance_to(p) < 2.0:
			var pd: Dictionary = Game.PERKS[pk.perk]
			if player.perks.has(pk.perk):
				return {"text": "You already have %s" % pd.name}
			if player.perks.size() >= 4:
				return {"text": "You can only hold 4 perks"}
			return {"text": "Press E for %s  [%d]\n%s" % [pd.name, pd.cost, pd.desc], "cost": int(pd.cost), "action": func():
				if player.spend(int(pd.cost)):
					player.add_perk(pk.perk)
					hud.center_msg(pd.name.to_upper(), pd.color, 2.0)}
	return {}


func _buy_door(i: int) -> void:
	if info.doors[i].open:
		return
	if player.spend(int(info.doors[i].cost)):
		Net.send_all("door", {"i": i})
		_open_door(i)


func _open_door(i: int) -> void:
	var d: Dictionary = info.doors[i]
	if d.open:
		return
	d.open = true
	open_zones[int(d.zone)] = true
	Sfx.play3d("door", d.pos, 4.0)
	_burst(d.pos, Color(0.5, 0.4, 0.3), 30, 5.0, 0.8)
	if is_instance_valid(d.node):
		d.node.queue_free()
	_rebake_nav()


func _buy_box() -> void:
	if box_state != "idle" or not player.spend(Game.BOX_COST):
		return
	var pool := []
	for w in Game.BOX_POOL:
		if not player.has_weapon(w):
			pool.append(w)
	box_choice = pool[randi() % pool.size()]
	box_state = "rolling"
	box_roll_t = 2.6
	box_swap_t = 0.0
	box_holder = Node3D.new()
	add_child(box_holder)
	box_holder.global_position = (info.boxes[0].pos as Vector3) + Vector3(0, 0.95, 0)
	Sfx.play3d("box_spin", box_holder.global_position, 0.0)


func _box_show(id: String) -> void:
	for c in box_holder.get_children():
		c.queue_free()
	var g := Models.gun(id)
	g.scale = Vector3.ONE * 1.5
	g.position = Vector3(0, 0, float(Game.WEAPONS[id].len) * 0.6)
	box_holder.add_child(g)


func _update_box(delta: float) -> void:
	if box_state == "idle":
		return
	box_roll_t -= delta
	box_holder.rotation.y += delta * (6.0 if box_state == "rolling" else 1.2)
	if box_state == "rolling":
		var base: Vector3 = (info.boxes[0].pos as Vector3) + Vector3(0, 0.95, 0)
		box_holder.global_position = base + Vector3.UP * (1.0 - box_roll_t / 2.6) * 0.6
		box_swap_t -= delta
		if box_swap_t <= 0.0:
			box_swap_t = 0.09 + (1.0 - box_roll_t / 2.6) * 0.18
			var names: Array = Game.BOX_POOL
			_box_show(names[randi() % names.size()])
		if box_roll_t <= 0.0:
			_box_show(box_choice)
			box_state = "ready"
			box_roll_t = 9.0
			Sfx.play("pickup")
	elif box_state == "ready":
		box_holder.position.y += sin(elapsed * 3.0) * delta * 0.1
		if box_roll_t <= 0.0:
			box_state = "idle"
			box_holder.queue_free()
			hud.center_msg("The box closed", Color(0.6, 0.85, 1.0), 1.5)


func _take_box_weapon() -> void:
	if box_state != "ready":
		return
	player.give_weapon(box_choice)
	hud.center_msg(Game.WEAPONS[box_choice].name.to_upper(), Color(0.6, 0.85, 1.0), 2.0)
	box_state = "idle"
	box_holder.queue_free()


func _revive_remote(id: int) -> void:
	player.revives += 1
	player.add_points(100)
	Net.send_all("revive", {"t": id, "by": Game.my_id})
	if remotes.has(id):
		remotes[id].down = false


func local_player_out() -> void:
	# Solo with no Second Wind: game over now.
	if host:
		_end_game("You went down on wave %d." % wave)


# ---------------------------------------------------------------- grenades & effects

func throw_grenade(pos: Vector3, vel: Vector3) -> void:
	var rb := RigidBody3D.new()
	rb.collision_layer = 0
	rb.collision_mask = 1
	rb.mass = 0.4
	var pm := PhysicsMaterial.new()
	pm.bounce = 0.35
	pm.friction = 0.8
	rb.physics_material_override = pm
	var cs := CollisionShape3D.new()
	var sh := SphereShape3D.new()
	sh.radius = 0.09
	cs.shape = sh
	rb.add_child(cs)
	var mi := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.09
	sm.height = 0.18
	mi.mesh = sm
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.2, 0.25, 0.15)
	mi.material_override = m
	rb.add_child(mi)
	add_child(rb)
	rb.global_position = pos
	rb.linear_velocity = vel
	get_tree().create_timer(2.0, false).timeout.connect(func():
		if is_instance_valid(rb):
			var at := rb.global_position
			rb.queue_free()
			_explode(at, true))


func _explode(at: Vector3, mine: bool) -> void:
	Sfx.play3d("explode", at, 6.0, 1.0, 70.0)
	_burst(at + Vector3.UP * 0.3, Color(1.0, 0.6, 0.2), 40, 9.0, 0.6)
	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.6, 0.3)
	light.light_energy = 8.0
	light.omni_range = 10.0
	add_child(light)
	light.global_position = at + Vector3.UP
	var tw := light.create_tween()
	tw.tween_property(light, "light_energy", 0.0, 0.4)
	tw.tween_callback(light.queue_free)
	if not mine:
		return
	Net.send_all("fx", {"k": "boom", "p": at})
	var dmg := 150.0 + 70.0 * wave
	for id in zombies.keys():
		var z = zombies.get(id)
		if z == null or z.dead:
			continue
		var d: float = (z.global_position + Vector3.UP * 0.8).distance_to(at)
		if d < 5.5 and has_line(at + Vector3.UP * 0.3, z.global_position + Vector3.UP):
			local_hit(z, dmg * (1.0 - d / 5.5 * 0.6), false, false, z.global_position + Vector3.UP)
	if player.global_position.distance_to(at) < 3.0 and has_line(at + Vector3.UP * 0.3, player.global_position + Vector3.UP):
		player.take_damage(20.0, at)


func on_local_fire(_weapon: String) -> void:
	pass


func has_line(a: Vector3, b: Vector3) -> bool:
	var q := PhysicsRayQueryParameters3D.create(a, b, 1)
	return get_world_3d().direct_space_state.intersect_ray(q).is_empty()


func dirt_burst(at: Vector3, scale_f: float) -> void:
	_burst(at + Vector3.UP * 0.2, Color(0.25, 0.19, 0.13), int(14 * scale_f), 3.5 * scale_f, 0.7)
	Sfx.play3d("dig", at, -4.0 + scale_f * 3.0, 1.0 / scale_f)


func tracer(from: Vector3, to: Vector3, plasma: bool) -> void:
	var len := from.distance_to(to)
	if len < 0.5:
		return
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	var thick := 0.08 if plasma else 0.015
	bm.size = Vector3(thick, thick, len)
	mi.mesh = bm
	var m := StandardMaterial3D.new()
	var col := Color(0.4, 1.0, 0.5) if plasma else Color(1.0, 0.85, 0.5)
	m.albedo_color = col
	m.emission_enabled = true
	m.emission = col
	m.emission_energy_multiplier = 4.0
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	mi.global_position = (from + to) * 0.5
	mi.look_at(to, Vector3.UP if absf((to - from).normalized().y) < 0.99 else Vector3.RIGHT)
	get_tree().create_timer(0.05 if not plasma else 0.12, false).timeout.connect(mi.queue_free)


func impact_fx(at: Vector3, normal: Vector3, plasma: bool) -> void:
	_burst(at + normal * 0.05, Color(0.4, 1.0, 0.5) if plasma else Color(0.9, 0.8, 0.6), 6, 2.5, 0.25)


func _burst(at: Vector3, col: Color, amount: int, speed: float, life: float) -> void:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.amount = amount
	p.lifetime = life
	p.explosiveness = 1.0
	p.direction = Vector3.UP
	p.spread = 180.0
	p.initial_velocity_min = speed * 0.4
	p.initial_velocity_max = speed
	p.gravity = Vector3(0, -12, 0)
	p.scale_amount_min = 0.5
	p.scale_amount_max = 1.2
	var bm := BoxMesh.new()
	bm.size = Vector3(0.06, 0.06, 0.06)
	p.mesh = bm
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.vertex_color_use_as_albedo = false
	bm.material = m
	add_child(p)
	p.global_position = at
	p.emitting = true
	get_tree().create_timer(life + 0.5, false).timeout.connect(p.queue_free)


# ---------------------------------------------------------------- remote players

func _ensure_remote(id: int) -> Dictionary:
	if remotes.has(id):
		return remotes[id]
	var node := Node3D.new()
	add_child(node)
	var colors := [Color(0.28, 0.35, 0.5), Color(0.5, 0.42, 0.25), Color(0.3, 0.42, 0.28), Color(0.45, 0.28, 0.42)]
	var col: Color = colors[remotes.size() % colors.size()]
	var body := Node3D.new()
	body.name = "Body"
	node.add_child(body)
	var rig := Models.soldier(body, col)
	var flash := OmniLight3D.new()
	flash.light_color = Color(1.0, 0.8, 0.45)
	flash.light_energy = 0.0
	flash.omni_range = 5.0
	rig.gun_mount.add_child(flash)
	flash.position = Vector3(0, 0.05, -0.9)
	var name_l := Maps.label(node, Vector3(0, 2.25, 0), Game.persona_name(id), 40, Color(0.8, 0.9, 1.0))
	name_l.no_depth_test = true
	var r := {"node": node, "body": body, "rig": rig, "flash": flash, "label": name_l, "pos": node.global_position,
		"yaw": 0.0, "pitch": 0.0, "w": "", "down": false, "dead": false, "name": Game.persona_name(id),
		"points": 500, "kills": 0, "hs": 0, "downs": 0, "stale": 0.0, "fired": 0.0, "walk": 0.0, "gun": null}
	remotes[id] = r
	_set_remote_gun(r, "pistol")
	return r


func _set_remote_gun(r: Dictionary, id: String) -> void:
	if r.w == id and r.gun != null:
		return
	r.w = id
	if r.gun != null and is_instance_valid(r.gun):
		r.gun.queue_free()
	var g := Models.gun(id)
	r.rig.gun_mount.add_child(g)
	r.gun = g


func _update_remotes(delta: float) -> void:
	for id in remotes:
		var r: Dictionary = remotes[id]
		r.stale += delta
		var node: Node3D = r.node
		var before := node.global_position
		node.global_position = node.global_position.lerp(r.pos, minf(1.0, delta * 14.0))
		node.rotation.y = lerp_angle(node.rotation.y, r.yaw, minf(1.0, delta * 14.0))
		node.visible = not r.dead
		var speed := Vector2(node.global_position.x - before.x, node.global_position.z - before.z).length() / maxf(delta, 0.001)
		var moving := clampf(speed / 5.0, 0.0, 1.0)
		r.walk += delta * (2.0 + speed * 1.7)
		var rig: Dictionary = r.rig
		var sw := sin(r.walk) * 0.6 * moving
		rig.leg_l.rotation.x = sw
		rig.leg_r.rotation.x = -sw
		rig.knee_l.rotation.x = maxf(0.0, -sin(r.walk - 0.6)) * 0.8 * moving
		rig.knee_r.rotation.x = maxf(0.0, sin(r.walk - 0.6)) * 0.8 * moving
		rig.spine.rotation.x = lerpf(rig.spine.rotation.x, clampf(r.pitch, -0.8, 0.8) * 0.6, minf(1.0, delta * 10.0))
		var body: Node3D = r.body
		body.rotation.x = lerpf(body.rotation.x, 1.35 if r.down else 0.0, minf(1.0, delta * 6.0))
		body.position.y = lerpf(body.position.y, 0.3 if r.down else 0.0, minf(1.0, delta * 6.0))
		var flash: OmniLight3D = r.flash
		flash.light_energy = move_toward(flash.light_energy, 0.0, delta * 40.0)
		r.label.text = r.name + ("\n[DOWN - hold E to revive]" if r.down else "")
		r.label.modulate = Color(1.0, 0.45, 0.4) if r.down else Color(0.8, 0.9, 1.0)


func send_pstate(reliable: bool) -> void:
	if not online or not is_instance_valid(player):
		return
	Net.send_all("ps", {
		"p": player.global_position, "y": player.rotation.y, "x": player.pivot.rotation.x, "w": player.active().id,
		"dn": player.downed, "dd": player.dead, "f": player.fired_flag > 0.1,
		"s": player.points, "k": player.kills, "hs": player.headshots, "d": player.downs,
	}, reliable)


func team_rows(include_me: bool) -> Array:
	var rows := []
	if include_me:
		rows.append({"name": Game.my_name, "points": player.points, "kills": player.kills, "hs": player.headshots,
			"downs": player.downs, "down": player.downed, "dead": player.dead, "me": true})
	for id in remotes:
		var r: Dictionary = remotes[id]
		rows.append({"name": r.name, "points": r.points, "kills": r.kills, "hs": r.hs, "downs": r.downs,
			"down": r.down, "dead": r.dead, "me": false})
	rows.sort_custom(func(a, b): return a.points > b.points)
	return rows


func _on_player_left(id: int) -> void:
	if remotes.has(id):
		var r: Dictionary = remotes[id]
		r.node.queue_free()
		remotes.erase(id)
		hud.center_msg("%s left the game" % r.name, Color(0.8, 0.8, 0.8), 2.5)


func _on_host_left() -> void:
	_end_game("The host left the game.")


# ---------------------------------------------------------------- networking

func _send_snapshot() -> void:
	var arr := PackedFloat32Array()
	for id in zombies:
		var z = zombies[id]
		if z.dead:
			continue
		var p: Vector3 = z.global_position
		arr.append_array([float(id), float(Game.ZTYPES.find(z.ztype)), p.x, p.y, p.z, z.rotation.y, z.hp_frac, z.swing])
	Net.send_all("zs", {"a": arr, "w": wave, "st": state, "t": state_t}, false)


func _apply_snapshot(data: Dictionary) -> void:
	var arr: PackedFloat32Array = data.a
	state = str(data.get("st", state))
	state_t = float(data.get("t", state_t))
	var seen := {}
	for i in range(0, arr.size() - 7, 8):
		var id := int(arr[i])
		if dead_ids.has(id):
			continue
		seen[id] = true
		var pos := Vector3(arr[i + 2], arr[i + 3], arr[i + 4])
		var z = zombies.get(id)
		if z == null:
			var type: String = Game.ZTYPES[clampi(int(arr[i + 1]), 0, 3)]
			z = ZombieScript.new()
			z.setup(self, id, type, 100.0, 2.0 if type != "runner" else 4.5, 0.0, true)
			z.position = pos
			z.target_pos = pos
			add_child(z)
			zombies[id] = z
		z.target_pos = pos
		z.target_yaw = arr[i + 5]
		z.hp_frac = arr[i + 6]
		z.swing = maxf(z.swing, arr[i + 7])
		z.miss = 0
	for id in zombies.keys():
		if not seen.has(id):
			var z = zombies[id]
			z.miss += 1
			if z.miss > 30:
				zombies.erase(id)
				z.queue_free()


func _on_packet(sender: int, type: String, data) -> void:
	if game_over and type != "over" and type != "bye":
		return
	var d: Dictionary = data if typeof(data) == TYPE_DICTIONARY else {}
	match type:
		"ps":
			if sender == Game.my_id:
				return
			var r := _ensure_remote(sender)
			r.pos = d.get("p", r.pos)
			r.yaw = float(d.get("y", r.yaw))
			r.pitch = float(d.get("x", 0.0))
			_set_remote_gun(r, str(d.get("w", "pistol")) if Game.WEAPONS.has(str(d.get("w", ""))) else "pistol")
			var was_down: bool = r.down
			r.down = bool(d.get("dn", false))
			r.dead = bool(d.get("dd", false))
			r.points = int(d.get("s", 0))
			r.kills = int(d.get("k", 0))
			r.hs = int(d.get("hs", 0))
			r.downs = int(d.get("d", 0))
			r.stale = 0.0
			if r.down and not was_down:
				hud.center_msg("%s IS DOWN" % r.name, Color(1.0, 0.4, 0.3), 2.0)
			if d.get("f", false) and r.flash.light_energy < 0.5:
				r.flash.light_energy = 3.0
				var wd: Dictionary = Game.WEAPONS.get(r.w, Game.WEAPONS.pistol)
				Sfx.play3d(wd.snd, r.pos + Vector3.UP * 1.4, -4.0)
		"zs":
			if not host:
				_apply_snapshot(d)
		"zkill":
			if not host:
				_on_zkill(d)
		"hit":
			if host:
				apply_damage(int(d.z), minf(float(d.d), 20000.0), bool(d.h), sender, bool(d.get("kn", false)))
		"pdmg":
			var f = d.get("f")
			player.take_damage(float(d.d), f if typeof(f) == TYPE_VECTOR3 else Vector3.INF)
		"wave":
			if not host:
				_on_wave_start(int(d.n), bool(d.boss))
		"wave_end":
			if not host:
				_on_wave_end()
		"aoe":
			if not host:
				_show_aoe(d.p, float(d.r), float(d.t), str(d.k))
		"pu":
			if not host:
				_spawn_pu(int(d.i), str(d.t), d.p)
		"pu_take":
			if host:
				_take_pu(int(d.i))
		"pu_fx":
			if not host:
				_apply_pu(int(d.i), str(d.t))
		"door":
			_open_door(int(d.i))
		"revive":
			if int(d.t) == Game.my_id:
				player.revive()
			elif remotes.has(int(d.t)):
				remotes[int(d.t)].down = false
		"fx":
			if str(d.get("k", "")) == "boom":
				_explode(d.p, false)
		"over":
			_end_game(str(d.get("why", "Game over.")))
		"bye":
			_on_player_left(sender)


# ---------------------------------------------------------------- end of match

func _end_game(why: String) -> void:
	if game_over:
		return
	if host:
		Net.send_all("over", {"why": why, "wave": wave})
	game_over = true
	state = "over"
	get_tree().paused = false
	player.input_enabled = false
	hud.set_interact("", 0.0)
	Sfx.play("wave_start", 0.0, 0.6)
	var run := {"map": map_id, "diff": Game.diff_id, "wave": wave, "kills": player.kills,
		"headshots": player.headshots, "bosses": player.bosses, "points": player.points_earned,
		"downs": player.downs, "revives": player.revives, "time": elapsed, "players": _player_count()}
	Game.record_run(run)
	hud.show_game_over(why, run, host)
	if Game.steam_ok and wave > 0:
		var ok: bool = await Boards.upload_run(map_id, Game.diff_id, wave, player.kills, player.headshots, _player_count())
		if is_instance_valid(hud):
			hud.leaderboard_status("Score posted to the Steam leaderboard." if ok else "Couldn't reach the Steam leaderboard.")


func quit_match() -> void:
	get_tree().paused = false
	if online and not game_over:
		if host:
			Net.send_all("over", {"why": "The host ended the match.", "wave": wave})
		else:
			Net.send_all("bye", {})
	finished.emit(false)


func restart_solo() -> void:
	get_tree().paused = false
	finished.emit(true)


func _exit_tree() -> void:
	get_tree().paused = false
