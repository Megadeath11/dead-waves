extends Node
## Playtest bot. Drives the local player through the real input actions:
## aims, shoots, reloads, knifes, throws grenades, kites, and walks to buy
## doors, perks, wall guns and the mystery box between waves.
## Logs a line per wave plus anything that looks like a bug.

var world
var log_prefix := "PT"
var t := 0.0
var think_t := 0.0
var target = null
var goal = null # {pos, kind, data}
var path := PackedVector3Array()
var path_i := 0
var repath_t := 0.0
var strafe_dir := 1.0
var strafe_t := 0.0
var semi_toggle := false
var last_wave := -1
var wave_start_t := 0.0
var stall_t := 0.0
var last_alive := -1
var stuck_t := 0.0
var last_pos := Vector3.ZERO
var issues := {}
var max_frame_ms := 0.0
var frame_ms_sum := 0.0
var frames := 0
var shots := 0
var hits_before := 0
var aim_skill := 0.85
var god := false


func issue(key: String, msg: String) -> void:
	if t < 5.0:
		return
	if not issues.has(key):
		issues[key] = 0
		print("%s ISSUE [%s] t=%.0f wave=%d: %s" % [log_prefix, key, t, world.wave, msg])
	issues[key] += 1


func _physics_process(delta: float) -> void:
	if world == null or not is_instance_valid(world) or world.game_over:
		_release_all()
		return
	t += delta
	var p = world.player
	var ms := Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0
	max_frame_ms = maxf(max_frame_ms, ms)
	frame_ms_sum += ms
	frames += 1
	_checks(p, delta)
	if god and not p.downed:
		p.hp = p.max_hp
	if world.wave != last_wave:
		_wave_log(p)
	if p.dead:
		_release_all()
		return
	think_t -= delta
	if think_t <= 0.0:
		think_t = 0.1
		target = _pick_target(p)
		_pick_goal(p)
	_move(p, delta)
	_aim_and_shoot(p, delta)


func _release_all() -> void:
	for a in ["fire", "ads", "move_forward", "move_back", "move_left", "move_right", "interact", "reload", "melee", "grenade", "sprint"]:
		Input.action_release(a)


func _pick_target(p):
	var best = null
	var bd := 45.0
	var eye: Vector3 = p.cam.global_position
	for id in world.zombies:
		var z = world.zombies[id]
		if z.dead or z.rise_t > 0.6:
			continue
		var c: Vector3 = z.global_position + Vector3.UP * 1.1 * z.s
		var d := eye.distance_to(c)
		if d < bd and world.has_line(eye, c):
			bd = d
			best = z
	return best


func _total_ammo(p) -> int:
	var n := 0
	for w in p.weapons:
		n += int(w.mag) + int(w.reserve)
	return n


func _reachable(p, pos: Vector3, tol: float) -> bool:
	var pth := NavigationServer3D.map_get_path(world.nav_map, p.global_position, pos, true)
	return pth.size() > 0 and Vector2(pth[-1].x - pos.x, pth[-1].z - pos.z).length() < tol


func _pick_goal(p) -> void:
	var dry := _total_ammo(p) == 0
	if dry and goal == null:
		for wb in world.info.wallbuys:
			if p.has_weapon(wb.weapon) and p.points >= int(Game.WEAPONS[wb.weapon].cost) / 2:
				goal = {"pos": wb.pos, "kind": "ammo"}
				return
	# Only shop when it's calm.
	var calm: bool = world.state == "intermission" or (target == null and world.zombies.size() <= 2)
	if not calm and not dry:
		goal = null
		return
	if goal != null:
		return
	var pts: int = p.points
	var info: Dictionary = world.info
	for i in info.doors.size():
		var d: Dictionary = info.doors[i]
		if not d.open and pts >= int(d.cost) + 300 and _reachable(p, d.pos, d.size.length() * 0.5 + 1.0):
			goal = {"pos": d.pos, "kind": "door", "i": i}
			return
	for perk in ["iron", "fast", "tap", "wind"]:
		if p.perks.has(perk) or pts < int(Game.PERKS[perk].cost):
			continue
		for pk in info.perks:
			if pk.perk == perk and world.open_zones.has(_zone_at(pk.pos)):
				goal = {"pos": pk.pos, "kind": "perk"}
				return
	var owns_good := false
	for w in p.weapons:
		if w.id != "pistol" and w.id != "m14":
			owns_good = true
	if pts >= 2200 and info.boxes.size() > 0:
		goal = {"pos": info.boxes[0].pos, "kind": "box"}
		return
	if not owns_good:
		for wb in info.wallbuys:
			var cost := int(Game.WEAPONS[wb.weapon].cost)
			if pts >= cost and world.open_zones.has(int(wb.zone)) and not p.has_weapon(wb.weapon):
				goal = {"pos": wb.pos, "kind": "wall"}
				return
	# low reserve: buy ammo for current wall gun
	var a: Dictionary = p.active()
	if int(a.reserve) < int(Game.WEAPONS[a.id].mag) and a.id != "pistol":
		for wb in info.wallbuys:
			if wb.weapon == a.id and pts >= int(Game.WEAPONS[a.id].cost) / 2:
				goal = {"pos": wb.pos, "kind": "ammo"}
				return


func _zone_at(pos: Vector3) -> int:
	var best := 0
	var bd := INF
	for s in world.info.spawns:
		var d: float = (s.pos as Vector3).distance_to(pos)
		if d < bd:
			bd = d
			best = int(s.zone)
	return best


func _move(p, delta: float) -> void:
	for a in ["move_forward", "move_back", "move_left", "move_right", "interact", "sprint"]:
		Input.action_release(a)
	var near := 999.0
	var near_z = null
	for id in world.zombies:
		var z = world.zombies[id]
		if z.dead:
			continue
		var d: float = z.global_position.distance_to(p.global_position)
		if d < near:
			near = d
			near_z = z
	var danger := near < 4.5 and _total_ammo(p) > 0
	if goal != null and not danger:
		var gp: Vector3 = goal.pos
		repath_t -= delta
		if repath_t <= 0.0:
			repath_t = 0.5
			path = NavigationServer3D.map_get_path(world.nav_map, p.global_position, gp, true)
			path_i = 0
		while path_i < path.size() and Vector2(path[path_i].x - p.global_position.x, path[path_i].z - p.global_position.z).length() < 0.6:
			path_i += 1
		var dist := Vector2(gp.x - p.global_position.x, gp.z - p.global_position.z).length()
		var it: Dictionary = world.get_interaction()
		if dist < 2.2 and it.has("action"):
			Input.action_press("interact")
			goal = null
			return
		if dist < 1.0 or path.is_empty() and dist > 2.0:
			if path.is_empty():
				issue("no_path_to_" + str(goal.kind), "bot can't path to %s at %s" % [goal.kind, str(gp)])
			goal = null
			return
		var aim: Vector3 = path[path_i] if path_i < path.size() else gp
		if target == null:
			var dir: Vector3 = aim - p.global_position
			p.rotation.y = lerp_angle(p.rotation.y, atan2(-dir.x, -dir.z), minf(1.0, delta * 8.0))
			p.pivot.rotation.x = lerpf(p.pivot.rotation.x, 0.0, delta * 4.0)
			Input.action_press("move_forward")
			if world.state == "intermission":
				Input.action_press("sprint")
		else:
			_press_toward(p, aim)
		return
	if danger and near_z != null:
		# back away from the closest zombie while strafing
		var away: Vector3 = p.global_position - near_z.global_position
		away.y = 0
		_press_toward(p, p.global_position + away.normalized() * 3.0)
		strafe_t -= delta
		if strafe_t <= 0.0:
			strafe_t = randf_range(1.0, 2.5)
			strafe_dir = -strafe_dir
		Input.action_press("move_right" if strafe_dir > 0 else "move_left")


## Press movement keys so that the player moves toward `pos` regardless of facing.
func _press_toward(p, pos: Vector3) -> void:
	var dir: Vector3 = pos - p.global_position
	dir.y = 0
	if dir.length() < 0.2:
		return
	var local: Vector3 = p.global_transform.basis.inverse() * dir.normalized()
	if local.z < -0.3:
		Input.action_press("move_forward")
	elif local.z > 0.3:
		Input.action_press("move_back")
	if local.x > 0.3:
		Input.action_press("move_right")
	elif local.x < -0.3:
		Input.action_press("move_left")


func _aim_and_shoot(p, delta: float) -> void:
	var a: Dictionary = p.active()
	var wd: Dictionary = Game.WEAPONS[a.id]
	Input.action_release("melee")
	Input.action_release("grenade")
	Input.action_release("reload")
	if target == null or not is_instance_valid(target) or target.dead:
		Input.action_release("fire")
		Input.action_release("ads")
		if int(a.mag) < int(wd.mag) and int(a.reserve) > 0 and not p.reloading:
			Input.action_press("reload")
		return
	var head := randf() < 0.3
	var aim_pt: Vector3 = target.global_position + Vector3.UP * (1.72 if head else 1.15) * target.s
	var dir: Vector3 = aim_pt - p.cam.global_position
	var want_yaw := atan2(-dir.x, -dir.z)
	var want_pitch := atan2(dir.y, Vector2(dir.x, dir.z).length())
	var turn := delta * 7.0 * aim_skill
	p.rotation.y = lerp_angle(p.rotation.y, want_yaw + randf_range(-0.01, 0.01), minf(1.0, turn))
	p.pivot.rotation.x = lerpf(p.pivot.rotation.x, want_pitch, minf(1.0, turn))
	var err := absf(angle_difference(p.rotation.y, want_yaw)) + absf(p.pivot.rotation.x - want_pitch)
	var dist: float = dir.length()
	if dist < 1.7 and p.melee_cd <= 0.0 and (int(a.mag) == 0 or randf() < 0.3):
		Input.action_press("melee")
		return
	var crowd := 0
	for id in world.zombies:
		if world.zombies[id].global_position.distance_to(p.global_position) < 9.0:
			crowd += 1
	if crowd >= 5 and p.grenades > 0 and randf() < 0.02 and dist > 4.0:
		Input.action_press("grenade")
	if int(a.mag) == 0:
		Input.action_release("fire")
		if int(a.reserve) > 0:
			Input.action_press("reload")
		elif p.weapons.size() > 1:
			p._cycle_weapon()
		return
	if dist > 8.0:
		Input.action_press("ads")
	else:
		Input.action_release("ads")
	if err < 0.08:
		if wd.auto:
			Input.action_press("fire")
		else:
			semi_toggle = not semi_toggle
			if semi_toggle:
				Input.action_press("fire")
			else:
				Input.action_release("fire")
	else:
		Input.action_release("fire")


func _checks(p, delta: float) -> void:
	if p.points < 0:
		issue("neg_points", "points went negative: %d" % p.points)
	for w in p.weapons:
		if int(w.mag) < 0 or int(w.reserve) < 0:
			issue("neg_ammo", "negative ammo %s" % str(w))
	if p.hp > p.max_hp + 0.01:
		issue("hp_over_max", "hp %.0f > max %.0f" % [p.hp, p.max_hp])
	for id in world.zombies:
		var z = world.zombies[id]
		if not is_instance_valid(z):
			issue("freed_zombie_in_dict", "zombie %d freed but still tracked" % id)
			continue
		if z.global_position.y < -3.0:
			issue("zombie_fell", "zombie %d at y=%.1f" % [id, z.global_position.y])
	# wave stall: zombies alive but nobody dies or moves for a long time
	if world.state == "wave":
		if world.zombies.size() == last_alive:
			stall_t += delta
		else:
			stall_t = 0.0
			last_alive = world.zombies.size()
		if stall_t > 60.0:
			var far := 0.0
			for id in world.zombies:
				far = maxf(far, world.zombies[id].global_position.distance_to(p.global_position))
			issue("wave_stall", "%d zombies alive, no change for 60s, farthest %.0fm, to_spawn=%d" % [world.zombies.size(), far, world.to_spawn])
			print("%s   player at %s down=%s goal=%s" % [log_prefix, str(p.global_position.snapped(Vector3.ONE * 0.1)), p.downed, str(goal)])
			for id in world.zombies:
				var z = world.zombies[id]
				print("%s   z%d %s at %s dist=%.1f vel=%.2f path=%d/%d rise=%.1f los=%s" % [log_prefix, id, z.ztype,
					str(z.global_position.snapped(Vector3.ONE * 0.1)), z.global_position.distance_to(p.global_position),
					z.velocity.length(), z.path_i, z.path.size(), z.rise_t,
					world.has_line(z.global_position + Vector3.UP * 1.2, p.global_position + Vector3.UP * 1.2)])
			stall_t = 0.0
	# player stuck while trying to walk
	if Input.is_action_pressed("move_forward") and goal != null:
		if p.global_position.distance_to(last_pos) < 0.05:
			stuck_t += delta
			if stuck_t > 4.0:
				issue("player_stuck_" + str(goal.kind), "player stuck walking to %s %s at %s path=%d/%d" % [goal.kind, str(goal.pos), str(p.global_position), path_i, path.size()])
				goal = null
				stuck_t = 0.0
		else:
			stuck_t = 0.0
	last_pos = p.global_position


func _wave_log(p) -> void:
	var wtime := t - wave_start_t
	if last_wave >= 0:
		print("%s wave %d done in %.0fs | hp %.0f/%.0f pts %d kills %d hs %d | guns %s perks %s | zones %s | relocs %d | avg %.1fms max %.1fms" % [
			log_prefix, last_wave, wtime, p.hp, p.max_hp, p.points, p.kills, p.headshots,
			str(p.weapons.map(func(w): return w.id)), str(p.perks), str(world.open_zones.keys()),
			world.relocations, frame_ms_sum / maxf(frames, 1), max_frame_ms])
	last_wave = world.wave
	wave_start_t = t
	max_frame_ms = 0.0
	frame_ms_sum = 0.0
	frames = 0


func summary() -> String:
	var p = world.player
	return "%s SUMMARY wave=%d kills=%d hs=%d downs=%d points_earned=%d time=%.0fs issues=%s" % [log_prefix, world.wave, p.kills, p.headshots, p.downs, p.points_earned, t, str(issues)]
