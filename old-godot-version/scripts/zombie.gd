extends CharacterBody3D
## A zombie. On the host it runs AI (navmesh pathing, attacks, boss abilities).
## On clients it is a puppet that follows snapshots from the host.

const Models = preload("res://scripts/models.gd")
const RISE_TIME := 1.3

var world
var zid := 0
var ztype := "walker"
var max_hp := 150.0
var hp := 150.0
var hp_frac := 1.0
var speed := 2.0
var damage := 40.0
var puppet := false
var dead := false

var target_pos := Vector3.ZERO
var target_yaw := 0.0
var path := PackedVector3Array()
var path_i := 0
var repath_t := 0.0
var attack_t := 0.8
var ability_t := 5.0
var swing := 0.0
var flinch_t := 0.0
var anim_t := 0.0
var groan_t := 0.0
var stuck_t := 0.0
var rise_t := RISE_TIME
var last_pos := Vector3.ZERO
var miss := 0
var s := 1.0
var twitch := 0.0
var has_los := true

var head_shape: CollisionShape3D
var body_root: Node3D
var rig := {}


func setup(w, id: int, type: String, hp_val: float, spd: float, dmg: float, is_puppet: bool) -> void:
	world = w
	zid = id
	ztype = type
	max_hp = hp_val
	hp = hp_val
	speed = spd
	damage = dmg
	puppet = is_puppet
	s = {"walker": 1.0, "runner": 0.97, "brute": 1.7, "spitter": 1.35}.get(type, 1.0)


func is_zombie() -> bool:
	return true


func is_boss() -> bool:
	return ztype == "brute" or ztype == "spitter"


func is_head_shape(shape_idx: int) -> bool:
	return shape_owner_get_owner(shape_find_owner(shape_idx)) == head_shape


func _ready() -> void:
	collision_layer = 2
	collision_mask = 1
	floor_snap_length = 0.5
	groan_t = randf_range(1.0, 6.0)
	anim_t = randf() * TAU
	body_root = Node3D.new()
	body_root.scale = Vector3.ONE * s
	add_child(body_root)
	var rng := RandomNumberGenerator.new()
	rng.seed = zid * 7919 + 13
	rig = Models.zombie(body_root, ztype, rng)
	for mi in body_root.find_children("*", "MeshInstance3D", true, false):
		if mi.get_aabb().size.length() < 0.15:
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	var body_cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.32 * s * (1.2 if ztype == "brute" else 1.0)
	cap.height = 1.5 * s
	body_cs.shape = cap
	body_cs.position = Vector3(0, 0.78 * s, 0)
	add_child(body_cs)
	head_shape = CollisionShape3D.new()
	var sph := SphereShape3D.new()
	sph.radius = 0.19 * s
	head_shape.shape = sph
	head_shape.position = Vector3(0, 1.78 * s, -0.01 * s)
	add_child(head_shape)
	if ztype == "runner":
		head_shape.position = Vector3(0, 1.7 * s, -0.2 * s)
	last_pos = global_position
	body_root.position.y = -1.9 * s
	_rise_fx()


func _rise_fx() -> void:
	if world and world.has_method("dirt_burst"):
		world.dirt_burst(global_position, s)


# ---------------------------------------------------------------- animation

func flinch(head: bool) -> void:
	flinch_t = 1.0 if not head else 1.4


func _animate(delta: float, moving: float) -> void:
	anim_t += delta * (2.2 + speed * 1.5) * maxf(moving, 0.15)
	swing = maxf(swing - delta * 3.0, 0.0)
	flinch_t = maxf(flinch_t - delta * 6.0, 0.0)
	twitch = move_toward(twitch, 0.0, delta * 3.0)
	if randf() < delta * 0.4:
		twitch = randf_range(-1.0, 1.0)
	var t := anim_t
	var sw := sin(t) * 0.65 * moving
	rig.leg_l.rotation.x = sw
	rig.leg_r.rotation.x = -sw
	rig.knee_l.rotation.x = maxf(0.0, -sin(t - 0.6)) * 0.9 * moving + 0.05
	rig.knee_r.rotation.x = maxf(0.0, sin(t - 0.6)) * 0.9 * moving + 0.05
	rig.hips.position.y = 0.95 - absf(sin(t)) * 0.04 * moving
	var spine: Node3D = rig.spine
	match ztype:
		"runner":
			spine.rotation.x = -0.35 * maxf(moving, 0.3)
			rig.arm_l.rotation.x = sin(t) * 1.1 * moving - 0.3 - swing * 1.4
			rig.arm_r.rotation.x = -sin(t) * 1.1 * moving - 0.3 - swing * 1.6
			rig.elbow_l.rotation.x = -0.9
			rig.elbow_r.rotation.x = -0.9
		"brute":
			spine.rotation.x = -0.15
			rig.arm_l.rotation.x = -0.3 + sin(t) * 0.35 * moving - swing * 2.2
			rig.arm_r.rotation.x = -0.3 - sin(t) * 0.35 * moving - swing * 2.4
			rig.arm_l.rotation.z = -0.25
			rig.arm_r.rotation.z = 0.25
			rig.elbow_l.rotation.x = -0.5 + swing * 0.4
			rig.elbow_r.rotation.x = -0.5 + swing * 0.4
		_:
			var reach := -1.3 + sin(t * 0.5) * 0.12
			rig.arm_l.rotation.x = reach + swing * 1.5 + sin(t * 0.7) * 0.08
			rig.arm_r.rotation.x = reach - 0.12 + swing * 1.9
			rig.elbow_l.rotation.x = -0.2 - swing * 0.6
			rig.elbow_r.rotation.x = -0.3 - swing * 0.7
			spine.rotation.x = 0.08 if ztype == "walker" else 0.25
	spine.rotation.x -= flinch_t * 0.35
	spine.rotation.z = sin(t * 0.5) * 0.07 * (1.0 if ztype != "runner" else 0.4)
	var head: Node3D = rig.head
	head.rotation.z = twitch * 0.25 + sin(t * 0.5 + 1.0) * 0.06
	head.rotation.x = -flinch_t * 0.4 + (0.15 if ztype == "spitter" else 0.0)
	rig.jaw.rotation.x = 0.15 + absf(sin(t * 0.37)) * 0.25 + swing * 0.35


func _physics_process(delta: float) -> void:
	if dead:
		return
	if rise_t > 0.0:
		rise_t -= delta
		var k := 1.0 - clampf(rise_t / RISE_TIME, 0.0, 1.0)
		body_root.position.y = lerpf(-1.9 * s, 0.0, 1.0 - pow(1.0 - k, 2.0))
		body_root.rotation.x = (1.0 - k) * -0.5
		rig.arm_l.rotation.x = -2.6 * (1.0 - k) - 1.3 * k
		rig.arm_r.rotation.x = -2.9 * (1.0 - k) - 1.3 * k
		if puppet:
			global_position = global_position.lerp(target_pos, minf(1.0, delta * 12.0))
		return
	body_root.position.y = 0.0
	body_root.rotation.x = 0.0
	groan_t -= delta
	if groan_t <= 0.0:
		groan_t = randf_range(4.0, 10.0) if not is_boss() else randf_range(3.0, 6.0)
		Sfx.play3d("growl_boss" if is_boss() else "groan", global_position + Vector3.UP * 1.5, -7.0 if not is_boss() else 2.0, randf_range(0.8, 1.2) / (1.0 if ztype != "runner" else 0.85))
	if puppet:
		var before := global_position
		global_position = global_position.lerp(target_pos, minf(1.0, delta * 12.0))
		rotation.y = lerp_angle(rotation.y, target_yaw, minf(1.0, delta * 10.0))
		var mv := clampf((global_position - before).length() / maxf(delta, 0.001) / maxf(speed, 1.5), 0.0, 1.0)
		_animate(delta, mv)
		return
	_ai(delta)


func _ai(delta: float) -> void:
	var tgt = world.nearest_player(global_position)
	var pos := global_position
	var move := Vector3.ZERO
	var dist := 999.0
	var tp := pos
	if tgt != null:
		tp = tgt.pos
		dist = Vector2(pos.x - tp.x, pos.z - tp.z).length()
		repath_t -= delta
		if repath_t <= 0.0:
			repath_t = randf_range(0.25, 0.5) if dist < 12.0 else randf_range(0.6, 1.0)
			path = NavigationServer3D.map_get_path(world.nav_map, pos, tp, true)
			path_i = 0
			if ztype == "spitter":
				has_los = world.has_line(pos + Vector3.UP * 2.0, tp + Vector3.UP)
		var want_move := true
		if ztype == "spitter":
			want_move = dist > 11.0 or not has_los
		elif dist < (1.0 if ztype != "brute" else 1.6) * minf(s, 1.3):
			want_move = false
		if want_move:
			while path_i < path.size() and Vector2(path[path_i].x - pos.x, path[path_i].z - pos.z).length() < 0.45:
				path_i += 1
			var aim := tp
			if path_i < path.size() and dist > 1.8:
				aim = path[path_i]
			move = Vector3(aim.x - pos.x, 0, aim.z - pos.z).normalized()
		elif ztype == "spitter" and dist < 7.0 and has_los:
			move = Vector3(pos.x - tp.x, 0, pos.z - tp.z).normalized() * 0.6
		var face := Vector3(tp.x - pos.x, 0, tp.z - pos.z) if (dist < 5.0 or move == Vector3.ZERO) else move
		if face.length() > 0.01:
			rotation.y = lerp_angle(rotation.y, atan2(-face.x, -face.z), minf(1.0, delta * 8.0))
		attack_t -= delta
		var reach := (1.45 if ztype != "brute" else 2.5) * minf(s, 1.3)
		if dist < reach and attack_t <= 0.0 and absf(tp.y - pos.y) < 2.0 and world.has_line(pos + Vector3.UP * 1.2, tp + Vector3.UP * 1.2):
			attack_t = 1.15 if ztype != "brute" else 1.7
			swing = 1.0
			world.zombie_attack(self, tgt.id, damage)
		ability_t -= delta
		if ability_t <= 0.0:
			if ztype == "brute" and dist < 5.5:
				ability_t = randf_range(6.0, 8.0)
				swing = 1.0
				world.spawn_aoe(global_position, 5.0, 1.1, damage * 0.8, "slam")
			elif ztype == "spitter" and dist < 26.0 and has_los:
				ability_t = randf_range(2.6, 3.6)
				swing = 1.0
				world.spawn_aoe(tp, 3.0, 1.3, damage, "acid")
	move += world.separation(self) * 0.8
	var spd := speed * (1.0 - flinch_t * 0.5)
	velocity.x = move.x * spd
	velocity.z = move.z * spd
	if not is_on_floor():
		velocity.y -= 18.0 * delta
	else:
		velocity.y = -0.5
	move_and_slide()
	_animate(delta, clampf(Vector2(velocity.x, velocity.z).length() / maxf(speed, 0.1), 0.0, 1.0))
	stuck_t += delta
	if stuck_t > 3.0:
		if global_position.distance_to(last_pos) < 1.0 and dist > 6.0:
			world.relocate_zombie(self)
		stuck_t = 0.0
		last_pos = global_position
	if global_position.y < -10.0:
		world.relocate_zombie(self)


func die(headshot: bool) -> void:
	if dead:
		return
	dead = true
	collision_layer = 0
	collision_mask = 0
	set_physics_process(false)
	if headshot:
		for c in rig.head.get_children():
			c.visible = false
		Models.box(rig.spine, Vector3(0, 0.62, 0), Vector3(0.14, 0.06, 0.14), Models.mat(Color(0.4, 0.02, 0.02)))
	var tw := create_tween()
	var back := randf() < 0.6
	tw.tween_property(body_root, "rotation:x", (PI * 0.47) * (1.0 if back else -1.0), 0.5).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.parallel().tween_property(body_root, "position:y", 0.12, 0.5)
	tw.parallel().tween_property(rig.knee_l, "rotation:x", 0.8, 0.4)
	tw.parallel().tween_property(rig.arm_r, "rotation:x", -2.5, 0.5)
	tw.tween_interval(2.5)
	tw.tween_property(body_root, "position:y", -1.2, 1.5)
	tw.tween_callback(queue_free)
