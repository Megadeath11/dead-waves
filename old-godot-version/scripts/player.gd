extends CharacterBody3D
## The local first-person player: movement, shooting, reloading, knife,
## grenades, perks, points, getting downed and revived.

const Models = preload("res://scripts/models.gd")

const WALK := 5.0
const SPRINT := 7.8
const CROUCH := 2.6
const JUMP := 4.8
const GRAV := 15.0

var world
var pivot: Node3D
var cam: Camera3D
var gun_root: Node3D
var gun_model: Node3D
var muzzle: Node3D
var flash_light: OmniLight3D
var flash_mesh: MeshInstance3D

var hp := 100.0
var max_hp := 100.0
var regen_delay := 0.0
var downed := false
var dead := false
var bleed_t := 0.0
var self_revive_t := 0.0

var points := 500
var kills := 0
var headshots := 0
var bosses := 0
var downs := 0
var revives := 0
var points_earned := 0

var perks: Array = []
var weapons: Array = []
var cur := 0
var downed_weapon := {}
var grenades := 2

var fire_cd := 0.0
var reloading := false
var reload_t := 0.0
var switch_t := 0.0
var ads_amt := 0.0
var sprinting := false
var crouching := false
var recoil := 0.0
var bloom := 0.0
var bob_t := 0.0
var melee_cd := 0.0
var melee_anim := 0.0
var fired_flag := 0.0
var trigger_held := false
var interact_hold := 0.0
var input_enabled := true
var cam_height := 1.65
var aim_on_zombie := false


func _ready() -> void:
	collision_layer = 4
	collision_mask = 1
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.4
	cap.height = 1.8
	cs.shape = cap
	cs.position = Vector3(0, 0.9, 0)
	add_child(cs)
	pivot = Node3D.new()
	pivot.position = Vector3(0, cam_height, 0)
	add_child(pivot)
	cam = Camera3D.new()
	cam.near = 0.03
	cam.far = 300.0
	cam.fov = float(Game.settings.fov)
	pivot.add_child(cam)
	cam.make_current()
	gun_root = Node3D.new()
	cam.add_child(gun_root)
	flash_light = OmniLight3D.new()
	flash_light.light_color = Color(1.0, 0.8, 0.45)
	flash_light.omni_range = 6.0
	flash_light.light_energy = 0.0
	cam.add_child(flash_light)
	flash_light.position = Vector3(0.2, -0.1, -1.0)
	var pistol: Dictionary = Game.WEAPONS.pistol
	weapons = [{"id": "pistol", "mag": pistol.mag, "reserve": pistol.reserve}]
	_build_gun()


func active() -> Dictionary:
	return downed_weapon if downed else weapons[cur]


func wdata() -> Dictionary:
	return Game.WEAPONS[active().id]


func alive() -> bool:
	return not downed and not dead


# ---------------------------------------------------------------- input

func _unhandled_input(event: InputEvent) -> void:
	if not input_enabled or dead:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var sens := float(Game.settings.sens) * 0.01 * lerpf(1.0, 0.55, ads_amt)
		if wdata().get("ads", 1.0) == 0.0:
			sens *= lerpf(1.0, 0.5, ads_amt) # sniper scope
		rotate_y(-event.relative.x * sens)
		pivot.rotation.x = clampf(pivot.rotation.x - event.relative.y * sens, -1.5, 1.5)
	elif event is InputEventMouseButton and event.pressed and not downed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP or event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_cycle_weapon()


func _cycle_weapon() -> void:
	if weapons.size() > 1:
		_switch_to((cur + 1) % weapons.size())


func _switch_to(i: int, force := false) -> void:
	if i < 0 or i >= weapons.size() or (i == cur and not force):
		return
	cur = i
	reloading = false
	switch_t = 0.45
	_build_gun()


# ---------------------------------------------------------------- frame

func _physics_process(delta: float) -> void:
	if dead:
		velocity = Vector3.ZERO
		_spectate(delta)
		return
	var can_act: bool = input_enabled and not world.game_over
	_move(delta, can_act)
	_timers(delta)
	if can_act:
		_combat(delta)
		_update_aim_target()
	else:
		trigger_held = false
	_view(delta)


func _move(delta: float, can_act: bool) -> void:
	var input_dir := Vector2.ZERO
	if can_act:
		input_dir = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var dir := (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()
	crouching = can_act and Input.is_action_pressed("crouch") and not downed
	sprinting = can_act and Input.is_action_pressed("sprint") and input_dir.y < -0.3 and ads_amt < 0.3 \
		and not downed and not crouching and fire_cd <= 0.0
	var spd := WALK
	if sprinting:
		spd = SPRINT
	if crouching:
		spd = CROUCH
	spd *= lerpf(1.0, 0.6, ads_amt)
	if downed:
		spd = 1.1
	var accel := 12.0 if is_on_floor() else 3.0
	velocity.x = lerpf(velocity.x, dir.x * spd, minf(1.0, delta * accel))
	velocity.z = lerpf(velocity.z, dir.z * spd, minf(1.0, delta * accel))
	if not is_on_floor():
		velocity.y -= GRAV * delta
	elif can_act and Input.is_action_just_pressed("jump") and not downed:
		velocity.y = JUMP
	move_and_slide()
	if global_position.y < -20.0:
		global_position = world.respawn_point()
	var target_h := 1.65
	if crouching:
		target_h = 1.05
	if downed:
		target_h = 0.5
	cam_height = lerpf(cam_height, target_h, minf(1.0, delta * 10.0))
	var hspeed := Vector2(velocity.x, velocity.z).length()
	if is_on_floor() and hspeed > 0.5:
		var before := floori(bob_t / PI)
		bob_t += delta * hspeed * 1.6
		if floori(bob_t / PI) != before:
			Sfx.play("step", -16.0 if not sprinting else -12.0, randf_range(0.85, 1.1))
	pivot.position.y = cam_height + sin(bob_t * 2.0) * 0.03 * minf(hspeed / 5.0, 1.5) * (1.0 - ads_amt)


func _spectate(delta: float) -> void:
	var r = world.spectate_target()
	if r == null:
		return
	var yaw: float = r.yaw
	var back := Vector3(sin(yaw), 0, cos(yaw))
	global_position = global_position.lerp((r.pos as Vector3) + back * 3.0 + Vector3.UP * 0.6, minf(1.0, delta * 5.0))
	rotation.y = lerp_angle(rotation.y, yaw, minf(1.0, delta * 5.0))
	pivot.rotation.x = lerpf(pivot.rotation.x, -0.25, minf(1.0, delta * 5.0))


func _update_aim_target() -> void:
	var from := cam.global_position
	var q := PhysicsRayQueryParameters3D.create(from, from - cam.global_transform.basis.z * 60.0, 1 | 2, [get_rid()])
	var res := get_world_3d().direct_space_state.intersect_ray(q)
	aim_on_zombie = not res.is_empty() and res.collider != null and res.collider.has_method("is_zombie")


func _timers(delta: float) -> void:
	fire_cd = maxf(fire_cd - delta, 0.0)
	switch_t = maxf(switch_t - delta, 0.0)
	melee_cd = maxf(melee_cd - delta, 0.0)
	melee_anim = maxf(melee_anim - delta * 4.0, 0.0)
	fired_flag = maxf(fired_flag - delta, 0.0)
	bloom = move_toward(bloom, 0.0, delta * 6.0)
	recoil = move_toward(recoil, 0.0, delta * 14.0)
	flash_light.light_energy = move_toward(flash_light.light_energy, 0.0, delta * 60.0)
	if flash_mesh:
		flash_mesh.visible = fired_flag > 0.1
	if reloading:
		reload_t -= delta
		if reload_t <= 0.0:
			_finish_reload()
	# health
	if not downed:
		if regen_delay > 0.0:
			regen_delay -= delta
		else:
			hp = minf(max_hp, hp + 55.0 * delta)
	else:
		if self_revive_t > 0.0:
			self_revive_t -= delta
			if self_revive_t <= 0.0:
				revive()
		elif bleed_t > 0.0:
			bleed_t -= delta
			if bleed_t <= 0.0:
				_bleed_out()


func _combat(delta: float) -> void:
	# ADS
	var want_ads := Input.is_action_pressed("ads") and not sprinting and not reloading and switch_t <= 0.0
	ads_amt = move_toward(ads_amt, 1.0 if want_ads else 0.0, delta * 6.5)
	# fire
	var trig := Input.is_action_pressed("fire")
	if trig:
		_try_fire()
	trigger_held = trig
	if Input.is_action_just_pressed("reload"):
		start_reload()
	if downed:
		world.hud.set_interact("", 0.0)
		return
	if Input.is_action_just_pressed("weapon_1"):
		_switch_to(0)
	if Input.is_action_just_pressed("weapon_2"):
		_switch_to(1)
	if Input.is_action_just_pressed("swap"):
		_cycle_weapon()
	if Input.is_action_just_pressed("melee"):
		_melee()
	if Input.is_action_just_pressed("grenade"):
		_throw_grenade()
	# interact
	var it: Dictionary = world.get_interaction()
	if it.is_empty():
		interact_hold = 0.0
		world.hud.set_interact("", 0.0)
		return
	var hold: float = it.get("hold", 0.0)
	if hold > 0.0:
		if Input.is_action_pressed("interact"):
			interact_hold += delta
			if interact_hold >= hold:
				interact_hold = 0.0
				it.action.call()
		else:
			interact_hold = 0.0
		world.hud.set_interact(it.text, interact_hold / hold)
	else:
		world.hud.set_interact(it.text, 0.0, points >= int(it.get("cost", 0)))
		if Input.is_action_just_pressed("interact") and it.has("action"):
			it.action.call()


func _view(delta: float) -> void:
	var wd := wdata()
	var zoom := 0.72
	if wd.get("ads", 1.0) == 0.0:
		zoom = 0.3
	cam.fov = lerpf(float(Game.settings.fov), float(Game.settings.fov) * zoom, ads_amt)
	# viewmodel
	var hip := Vector3(0.2, -0.19, -0.42)
	var aim := Vector3(0.0, -0.1, -0.3)
	var p := hip.lerp(aim, ads_amt)
	var hs := Vector2(velocity.x, velocity.z).length()
	p += Vector3(cos(bob_t) * 0.012, absf(sin(bob_t)) * 0.012, 0) * minf(hs / 5.0, 1.5) * (1.0 - ads_amt * 0.8)
	p.z += recoil * 0.012
	if sprinting:
		p += Vector3(-0.05, -0.05, 0.05)
	if reloading:
		p += Vector3(0, -0.12, 0)
	p.y -= switch_t * 0.6
	p.z -= melee_anim * 0.25
	gun_root.position = gun_root.position.lerp(p, minf(1.0, delta * 18.0))
	var rot := Vector3(recoil * 0.02, 0, 0)
	if sprinting:
		rot += Vector3(-0.3, 0.6, 0.2)
	if reloading:
		rot += Vector3(0.5, 0, 0.3)
	gun_root.rotation = gun_root.rotation.lerp(rot, minf(1.0, delta * 14.0))
	gun_root.visible = not (wd.get("ads", 1.0) == 0.0 and ads_amt > 0.85) and not dead
	if world.hud:
		world.hud.scope_visible(wd.get("ads", 1.0) == 0.0 and ads_amt > 0.85)


# ---------------------------------------------------------------- weapons

func _try_fire() -> void:
	var w := active()
	var wd := wdata()
	if fire_cd > 0.0 or reloading or switch_t > 0.0 or melee_anim > 0.2:
		return
	if not wd.auto and trigger_held:
		return
	if int(w.mag) <= 0:
		if not trigger_held:
			Sfx.play("empty")
		fire_cd = 0.25
		if int(w.reserve) > 0:
			start_reload()
		return
	w.mag = int(w.mag) - 1
	var rpm: float = float(wd.rpm) * (1.33 if perks.has("tap") else 1.0)
	fire_cd = 60.0 / rpm
	fired_flag = 0.15
	Sfx.play(wd.snd, -5.0)
	recoil += float(wd.kick)
	var kick := deg_to_rad(float(wd.kick)) * 0.3 * (1.0 - ads_amt * 0.4)
	pivot.rotation.x = clampf(pivot.rotation.x + kick, -1.5, 1.5)
	rotate_y(randf_range(-kick, kick) * 0.35)
	bloom = minf(bloom + float(wd.kick) * 0.35, 5.0)
	flash_light.light_color = Color(0.3, 1.0, 0.5) if active().id == "plasma" else Color(1.0, 0.8, 0.45)
	flash_light.light_energy = 3.0
	for _p in int(wd.pellets):
		_shoot_ray(wd)
	world.on_local_fire(active().id)


func _shoot_ray(wd: Dictionary) -> void:
	# no spread: every shot goes exactly where the crosshair points
	var dir := -cam.global_transform.basis.z
	var from := cam.global_position
	var to := from + dir * 300.0
	var space := get_world_3d().direct_space_state
	var excl: Array[RID] = [get_rid()]
	var dmg := float(wd.dmg)
	var end_point := to
	for _k in int(wd.pierce):
		var q := PhysicsRayQueryParameters3D.create(from, to, 1 | 2, excl)
		var res := space.intersect_ray(q)
		if res.is_empty():
			break
		end_point = res.position
		var col = res.collider
		if col and col.has_method("is_zombie"):
			var head: bool = col.is_head_shape(res.shape)
			var dist := cam.global_position.distance_to(res.position)
			var d := dmg * (1.0 if dist <= float(wd.range) else 0.5) * (float(wd.head) if head else 1.0)
			world.local_hit(col, d, head, false, res.position)
			excl.append(col.get_rid())
			dmg *= 0.75
			if float(wd.splash) > 0.0:
				world.local_splash(res.position, float(wd.splash), float(wd.dmg), col)
				break
		else:
			world.impact_fx(res.position, res.normal, active().id == "plasma")
			if float(wd.splash) > 0.0:
				world.local_splash(res.position, float(wd.splash), float(wd.dmg), null)
			break
	var m := muzzle.global_position if muzzle else from
	world.tracer(m, end_point, active().id == "plasma")


func start_reload() -> void:
	var w := active()
	var wd := wdata()
	if reloading or int(w.mag) >= int(wd.mag) or int(w.reserve) <= 0 or switch_t > 0.0:
		return
	reloading = true
	reload_t = float(wd.reload) * (0.5 if perks.has("fast") else 1.0)
	Sfx.play("reload", -4.0)


func _finish_reload() -> void:
	reloading = false
	var w := active()
	var wd := wdata()
	var need := int(wd.mag) - int(w.mag)
	var take := mini(need, int(w.reserve))
	w.mag = int(w.mag) + take
	w.reserve = int(w.reserve) - take


func give_weapon(id: String) -> void:
	for i in weapons.size():
		if weapons[i].id == id:
			weapons[i].reserve = int(Game.WEAPONS[id].reserve)
			weapons[i].mag = int(Game.WEAPONS[id].mag)
			_switch_to(i, true)
			return
	var wd: Dictionary = Game.WEAPONS[id]
	var entry := {"id": id, "mag": int(wd.mag), "reserve": int(wd.reserve)}
	if weapons.size() < 2:
		weapons.append(entry)
		_switch_to(weapons.size() - 1, true)
	else:
		weapons[cur] = entry
		_switch_to(cur, true)


func has_weapon(id: String) -> bool:
	for w in weapons:
		if w.id == id:
			return true
	return false


func refill_ammo() -> void:
	for w in weapons:
		w.reserve = int(Game.WEAPONS[w.id].reserve)
	grenades = 4


func _melee() -> void:
	if melee_cd > 0.0 or switch_t > 0.0:
		return
	melee_cd = 0.75
	melee_anim = 1.0
	reloading = false
	Sfx.play("knife", -3.0)
	# lunge toward a zombie right in front of us
	var fwd := -cam.global_transform.basis.z
	fwd.y = 0
	for id in world.zombies:
		var z = world.zombies[id]
		var to: Vector3 = z.global_position - global_position
		to.y = 0
		if not z.dead and to.length() < 3.2 and to.length() > 1.2 and fwd.normalized().dot(to.normalized()) > 0.8:
			velocity += to.normalized() * 7.0
			break
	var space := get_world_3d().direct_space_state
	var b := cam.global_transform.basis
	for off in [Vector3.ZERO, b.x * 0.35, -b.x * 0.35, -b.y * 0.4]:
		var from := cam.global_position
		var to: Vector3 = from + (-b.z * 2.3) + off
		var q := PhysicsRayQueryParameters3D.create(from, to, 1 | 2, [get_rid()])
		var res := space.intersect_ray(q)
		if not res.is_empty() and res.collider and res.collider.has_method("is_zombie"):
			Sfx.play("melee_hit", -2.0)
			world.local_hit(res.collider, 160.0, false, true, res.position)
			return


func _throw_grenade() -> void:
	if grenades <= 0:
		Sfx.play("empty")
		return
	grenades -= 1
	Sfx.play("throw")
	var b := cam.global_transform.basis
	world.throw_grenade(cam.global_position - b.z * 0.6, -b.z * 15.0 + Vector3.UP * 3.5 + velocity * 0.5)


func _build_gun() -> void:
	if gun_model:
		gun_model.queue_free()
	var id: String = active().id
	gun_model = Node3D.new()
	gun_model.scale = Vector3.ONE * 0.9
	gun_root.add_child(gun_model)
	var g := Models.gun(id)
	gun_model.add_child(g)
	var length := float(wdata().len)
	# arms: sleeve + glove on the grip, support hand on the foregrip
	var sleeve := Models.mat(Color(0.24, 0.27, 0.2))
	var glove := Models.mat(Color(0.07, 0.07, 0.07))
	var cuff := Models.mat(Color(0.16, 0.17, 0.13))
	Models.box(gun_model, Vector3(0.0, -0.075, 0.03), Vector3(0.075, 0.08, 0.09), glove)
	Models.box(gun_model, Vector3(0.05, -0.15, 0.24), Vector3(0.085, 0.09, 0.34), sleeve, Vector3(0.45, 0.25, 0))
	Models.box(gun_model, Vector3(0.025, -0.1, 0.1), Vector3(0.09, 0.095, 0.05), cuff, Vector3(0.45, 0.25, 0))
	if length > 0.4 or id == "plasma":
		var fz := -length * 0.48 if id != "plasma" else -0.22
		Models.box(gun_model, Vector3(-0.01, -0.025, fz), Vector3(0.08, 0.07, 0.1), glove)
		Models.box(gun_model, Vector3(-0.07, -0.08, fz + 0.15), Vector3(0.08, 0.085, 0.28), sleeve, Vector3(0.3, -0.45, 0))
	else:
		Models.box(gun_model, Vector3(-0.03, -0.07, 0.0), Vector3(0.06, 0.07, 0.08), glove)
		Models.box(gun_model, Vector3(-0.09, -0.15, 0.2), Vector3(0.085, 0.09, 0.32), sleeve, Vector3(0.45, -0.35, 0))
	muzzle = Node3D.new()
	muzzle.position = g.get_meta("muzzle")
	gun_model.add_child(muzzle)
	flash_mesh = MeshInstance3D.new()
	var qm := BoxMesh.new()
	qm.size = Vector3(0.1, 0.1, 0.14)
	flash_mesh.mesh = qm
	var fcol := Color(1.0, 0.8, 0.35) if id != "plasma" else Color(0.4, 1.0, 0.5)
	flash_mesh.material_override = Models.mat(fcol, 8.0, 0.0, 1.0, true)
	flash_mesh.rotation = Vector3(0, 0, PI / 4)
	flash_mesh.visible = false
	muzzle.add_child(flash_mesh)
	for mi in gun_model.find_children("*", "MeshInstance3D", true, false):
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


# ---------------------------------------------------------------- health & points

func add_points(n: int, raw := false) -> void:
	var v := n
	if not raw:
		v = int(round(n * float(Game.diff().pts) * (2.0 if world.double_t > 0.0 else 1.0)))
	points += v
	points_earned += v
	world.hud.popup_points(v)


func spend(n: int) -> bool:
	if points < n:
		Sfx.play("deny")
		world.hud.flash_points()
		return false
	points -= n
	Sfx.play("buy", -2.0)
	return true


func take_damage(d: float, from := Vector3.INF) -> void:
	if not alive() or world.game_over:
		return
	if from != Vector3.INF:
		var local: Vector3 = global_transform.basis.inverse() * (from - global_position)
		world.hud.damage_dir(atan2(local.x, -local.z))
	hp -= d
	regen_delay = 4.0 if Game.diff_id < 3 else 5.5
	Sfx.play("hurt", -2.0)
	world.hud.flash_damage(d)
	if hp <= 0.0:
		_go_down()


func _go_down() -> void:
	hp = 0.0
	downed = true
	downs += 1
	reloading = false
	ads_amt = 0.0
	var had_wind := perks.has("wind")
	perks.clear()
	max_hp = 100.0
	var pd: Dictionary = Game.WEAPONS.pistol
	downed_weapon = {"id": "pistol", "mag": int(pd.mag), "reserve": int(pd.mag) * 3}
	_build_gun()
	if world.solo:
		if had_wind:
			self_revive_t = 4.0
			world.hud.center_msg("SECOND WIND", Color(0.3, 0.6, 1.0), 2.0)
		else:
			world.local_player_out()
	else:
		bleed_t = 30.0
	world.send_pstate(true)


func revive() -> void:
	if not downed:
		return
	downed = false
	bleed_t = 0.0
	self_revive_t = 0.0
	hp = max_hp * 0.6
	regen_delay = 1.0
	_build_gun()
	world.hud.center_msg("REVIVED", Color(0.5, 1.0, 0.5), 1.5)
	world.send_pstate(true)


func _bleed_out() -> void:
	downed = false
	dead = true
	gun_root.visible = false
	world.hud.center_msg("YOU BLED OUT\nYou'll respawn next wave", Color(0.9, 0.2, 0.2), 4.0)
	world.send_pstate(true)


func respawn(pos: Vector3) -> void:
	dead = false
	downed = false
	hp = 100.0
	max_hp = 100.0
	perks.clear()
	var pd: Dictionary = Game.WEAPONS.pistol
	weapons = [{"id": "pistol", "mag": int(pd.mag), "reserve": int(pd.reserve)}]
	cur = 0
	global_position = pos
	velocity = Vector3.ZERO
	gun_root.visible = true
	_build_gun()
	world.send_pstate(true)


func add_perk(id: String) -> void:
	if perks.has(id):
		return
	perks.append(id)
	if id == "iron":
		max_hp = 250.0
		hp = max_hp
