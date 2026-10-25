extends RefCounted
## Low-poly blocky models built from primitives: characters, guns and props.
## Everything faces -Z. Materials and meshes are cached and shared.

static var _mats := {}
static var _meshes := {}

const METAL := Color(0.13, 0.13, 0.14)
const STEEL := Color(0.32, 0.33, 0.35)
const WOOD := Color(0.42, 0.25, 0.12)
const POLY := Color(0.09, 0.09, 0.1)


static func mat(c: Color, emit := 0.0, metal := 0.0, rough := 0.85, unshaded := false) -> StandardMaterial3D:
	var key := "%s|%.2f|%.2f|%.2f|%s" % [c.to_html(true), emit, metal, rough, unshaded]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.metallic = metal
	m.roughness = rough
	if c.a < 0.999:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if emit > 0.0:
		m.emission_enabled = true
		m.emission = Color(c.r, c.g, c.b)
		m.emission_energy_multiplier = emit
	if unshaded:
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_mats[key] = m
	return m


static func box(parent: Node, pos: Vector3, size: Vector3, m: Material, rot := Vector3.ZERO) -> MeshInstance3D:
	var key := "b%.3f,%.3f,%.3f" % [size.x, size.y, size.z]
	if not _meshes.has(key):
		var bm := BoxMesh.new()
		bm.size = size
		_meshes[key] = bm
	var mi := MeshInstance3D.new()
	mi.mesh = _meshes[key]
	mi.material_override = m
	mi.position = pos
	mi.rotation = rot
	parent.add_child(mi)
	return mi


static func cyl(parent: Node, pos: Vector3, r_top: float, r_bot: float, h: float, m: Material, segs := 6, rot := Vector3.ZERO) -> MeshInstance3D:
	var key := "c%.3f,%.3f,%.3f,%d" % [r_top, r_bot, h, segs]
	if not _meshes.has(key):
		var cm := CylinderMesh.new()
		cm.top_radius = r_top
		cm.bottom_radius = r_bot
		cm.height = h
		cm.radial_segments = segs
		cm.rings = 0
		_meshes[key] = cm
	var mi := MeshInstance3D.new()
	mi.mesh = _meshes[key]
	mi.material_override = m
	mi.position = pos
	mi.rotation = rot
	parent.add_child(mi)
	return mi


static func ball(parent: Node, pos: Vector3, r: float, m: Material, segs := 7) -> MeshInstance3D:
	var key := "s%.3f,%d" % [r, segs]
	if not _meshes.has(key):
		var sm := SphereMesh.new()
		sm.radius = r
		sm.height = r * 2.0
		sm.radial_segments = segs
		sm.rings = maxi(3, segs / 2)
		_meshes[key] = sm
	var mi := MeshInstance3D.new()
	mi.mesh = _meshes[key]
	mi.material_override = m
	mi.position = pos
	parent.add_child(mi)
	return mi


static func joint(parent: Node, pos: Vector3) -> Node3D:
	var j := Node3D.new()
	j.position = pos
	parent.add_child(j)
	return j


# ================================================================ characters

## Builds a blocky humanoid under `parent`. Feet at y=0, facing -Z.
## opt keys: skin, shirt, pants, shoe, eye (Color or null), build ("normal","lean","brute","bloated")
static func humanoid(parent: Node3D, opt: Dictionary) -> Dictionary:
	var build: String = opt.get("build", "normal")
	var w: float = {"normal": 1.0, "lean": 0.85, "brute": 1.35, "bloated": 1.15}.get(build, 1.0)
	var skin := mat(opt.get("skin", Color(0.6, 0.48, 0.38)))
	var shirt := mat(opt.get("shirt", Color(0.3, 0.3, 0.3)))
	var pants := mat(opt.get("pants", Color(0.2, 0.2, 0.22)))
	var shoe := mat(opt.get("shoe", Color(0.1, 0.08, 0.07)))
	var sleeve := shirt if opt.get("sleeves", true) else skin
	var r := {}

	var hips := joint(parent, Vector3(0, 0.95, 0))
	r.hips = hips
	box(hips, Vector3.ZERO, Vector3(0.36 * w, 0.2, 0.22 * w), pants)
	for side in [-1, 1]:
		var leg := joint(hips, Vector3(0.11 * side * w, -0.03, 0))
		box(leg, Vector3(0, -0.21, 0), Vector3(0.16 * w, 0.44, 0.18 * w), pants)
		var knee := joint(leg, Vector3(0, -0.43, 0))
		box(knee, Vector3(0, -0.2, 0), Vector3(0.14 * w, 0.42, 0.15 * w), pants)
		box(knee, Vector3(0, -0.44, -0.05), Vector3(0.15 * w, 0.08, 0.27), shoe)
		r["leg_l" if side < 0 else "leg_r"] = leg
		r["knee_l" if side < 0 else "knee_r"] = knee

	var spine := joint(hips, Vector3(0, 0.08, 0))
	r.spine = spine
	box(spine, Vector3(0, 0.13, 0), Vector3(0.34 * w, 0.26, 0.2 * w), shirt)
	var chest_w: float = 0.44 * w if build != "brute" else 0.62
	box(spine, Vector3(0, 0.4, 0), Vector3(chest_w, 0.3, 0.26 * w), shirt)
	if build == "bloated":
		var belly := mat(opt.get("belly", Color(0.45, 0.55, 0.25)))
		ball(spine, Vector3(0, 0.18, -0.08), 0.27, belly, 8)
	box(spine, Vector3(0, 0.58, 0), Vector3(0.12, 0.08, 0.12), skin)

	var head := joint(spine, Vector3(0, 0.62, 0))
	r.head = head
	box(head, Vector3(0, 0.13, 0), Vector3(0.26, 0.27, 0.26), skin)
	var jaw := joint(head, Vector3(0, 0.03, -0.01))
	box(jaw, Vector3(0, -0.02, -0.03), Vector3(0.22, 0.07, 0.2), skin)
	r.jaw = jaw
	if opt.get("eye") != null:
		var em := mat(opt.eye, 7.0)
		box(head, Vector3(-0.06, 0.16, -0.131), Vector3(0.065, 0.035, 0.01), em)
		box(head, Vector3(0.06, 0.16, -0.131), Vector3(0.065, 0.035, 0.01), em)
	else:
		var dark := mat(Color(0.05, 0.05, 0.05))
		box(head, Vector3(-0.06, 0.16, -0.131), Vector3(0.04, 0.03, 0.01), dark)
		box(head, Vector3(0.06, 0.16, -0.131), Vector3(0.04, 0.03, 0.01), dark)

	var sh_x: float = 0.29 * w if build != "brute" else 0.4
	var arm_w: float = 1.0 if build != "brute" else 1.5
	for side in [-1, 1]:
		var arm := joint(spine, Vector3(sh_x * side, 0.5, 0))
		box(arm, Vector3(0, -0.14, 0), Vector3(0.12 * arm_w, 0.3, 0.13 * arm_w), sleeve)
		var elbow := joint(arm, Vector3(0, -0.29, 0))
		box(elbow, Vector3(0, -0.13, 0), Vector3(0.11 * arm_w, 0.27, 0.12 * arm_w), skin if not opt.get("long_sleeves", false) else sleeve)
		box(elbow, Vector3(0, -0.31, 0), Vector3(0.1 * arm_w, 0.11, 0.07 * arm_w), mat(opt.get("hand", opt.get("skin", Color(0.6, 0.48, 0.38)))))
		r["arm_l" if side < 0 else "arm_r"] = arm
		r["elbow_l" if side < 0 else "elbow_r"] = elbow
	return r


static func _pick(rng: RandomNumberGenerator, arr: Array):
	return arr[rng.randi_range(0, arr.size() - 1)]


## Zombie of a given type with randomised clothes and damage. Returns the rig.
static func zombie(parent: Node3D, type: String, rng: RandomNumberGenerator) -> Dictionary:
	var skins := [Color(0.45, 0.5, 0.4), Color(0.52, 0.5, 0.42), Color(0.4, 0.45, 0.42), Color(0.55, 0.47, 0.42), Color(0.38, 0.42, 0.33)]
	var shirts := [Color(0.32, 0.28, 0.22), Color(0.2, 0.26, 0.33), Color(0.38, 0.12, 0.1), Color(0.55, 0.53, 0.47),
		Color(0.22, 0.3, 0.2), Color(0.15, 0.15, 0.17), Color(0.45, 0.35, 0.2)]
	var pants_c := [Color(0.18, 0.2, 0.26), Color(0.25, 0.22, 0.17), Color(0.13, 0.13, 0.14), Color(0.3, 0.3, 0.28)]
	var opt := {"skin": _pick(rng, skins), "shirt": _pick(rng, shirts), "pants": _pick(rng, pants_c),
		"eye": Color(1.0, 0.3, 0.1), "build": "normal", "sleeves": rng.randf() < 0.5}
	match type:
		"runner":
			opt.build = "lean"
			opt.eye = Color(1.0, 0.85, 0.15)
			opt.sleeves = false
		"brute":
			opt.build = "brute"
			opt.skin = Color(0.42, 0.3, 0.28)
			opt.shirt = Color(0.22, 0.09, 0.07)
			opt.pants = Color(0.12, 0.1, 0.09)
			opt.eye = Color(1.0, 0.08, 0.04)
			opt.sleeves = false
		"spitter":
			opt.build = "bloated"
			opt.skin = Color(0.36, 0.46, 0.22)
			opt.shirt = Color(0.26, 0.3, 0.14)
			opt.belly = Color(0.5, 0.62, 0.22)
			opt.eye = Color(0.55, 1.0, 0.2)
			opt.sleeves = false
	var r := humanoid(parent, opt)
	var blood := mat(Color(0.35, 0.03, 0.02), 0.0, 0.0, 0.4)
	var bone := mat(Color(0.82, 0.78, 0.66))
	var spine: Node3D = r.spine
	var head: Node3D = r.head
	# blood stains + torn hem
	for i in rng.randi_range(1, 3):
		box(spine, Vector3(rng.randf_range(-0.15, 0.15), rng.randf_range(0.1, 0.5), -0.135), Vector3(rng.randf_range(0.06, 0.16), rng.randf_range(0.05, 0.14), 0.01), blood)
	for i in rng.randi_range(2, 4):
		box(spine, Vector3(rng.randf_range(-0.14, 0.14), -0.02, rng.randf_range(-0.08, 0.08)), Vector3(0.06, rng.randf_range(0.06, 0.14), 0.02), mat(opt.shirt), Vector3(0, 0, rng.randf_range(-0.4, 0.4)))
	if rng.randf() < 0.35 and type != "brute":
		for k in 3:
			box(spine, Vector3(0, 0.33 + k * 0.07, -0.135), Vector3(0.22, 0.025, 0.015), bone)
		box(spine, Vector3(0, 0.4, -0.13), Vector3(0.24, 0.24, 0.005), mat(Color(0.3, 0.05, 0.04)))
	# hair / cap / wound on head
	var hair_roll := rng.randf()
	if hair_roll < 0.45:
		box(head, Vector3(0, 0.29, 0.02), Vector3(0.27, 0.06, 0.24), mat(_pick(rng, [Color(0.12, 0.1, 0.08), Color(0.3, 0.22, 0.12), Color(0.5, 0.48, 0.45)])))
	elif hair_roll < 0.6 and type == "walker":
		var cap := mat(_pick(rng, [Color(0.2, 0.25, 0.4), Color(0.4, 0.15, 0.1), Color(0.25, 0.3, 0.2)]))
		box(head, Vector3(0, 0.3, 0.01), Vector3(0.28, 0.07, 0.28), cap)
		box(head, Vector3(0, 0.28, -0.17), Vector3(0.24, 0.02, 0.1), cap)
	if rng.randf() < 0.5:
		box(head, Vector3(rng.randf_range(-0.08, 0.08), rng.randf_range(0.18, 0.26), -0.131), Vector3(0.07, 0.05, 0.01), blood)
	box(r.jaw, Vector3(0, -0.04, -0.13), Vector3(0.16, 0.03, 0.01), mat(Color(0.12, 0.02, 0.02)))
	# missing forearm (walkers only)
	if type == "walker" and rng.randf() < 0.12:
		var e: Node3D = r.elbow_l if rng.randf() < 0.5 else r.elbow_r
		for c in e.get_children():
			c.visible = false
		box(e, Vector3(0, -0.04, 0), Vector3(0.1, 0.08, 0.1), blood)
		box(e, Vector3(0, -0.09, 0), Vector3(0.03, 0.06, 0.03), bone)
	match type:
		"brute":
			var plate := mat(Color(0.28, 0.28, 0.3), 0.0, 0.6, 0.5)
			var rust := mat(Color(0.35, 0.2, 0.1), 0.0, 0.3, 0.7)
			box(spine, Vector3(0, 0.42, -0.17), Vector3(0.6, 0.36, 0.05), plate)
			box(spine, Vector3(0, 0.15, -0.13), Vector3(0.5, 0.06, 0.04), rust)
			for side in [-1, 1]:
				var arm: Node3D = r.arm_l if side < 0 else r.arm_r
				box(arm, Vector3(0.02 * side, 0.02, 0), Vector3(0.28, 0.12, 0.3), plate)
				cyl(arm, Vector3(0.05 * side, 0.15, 0), 0.0, 0.05, 0.16, rust, 4)
			box(head, Vector3(0, 0.13, -0.14), Vector3(0.28, 0.3, 0.04), plate)
			box(head, Vector3(0, 0.16, -0.165), Vector3(0.2, 0.03, 0.01), mat(Color(1.0, 0.1, 0.05), 6.0))
			box(head, Vector3(0, 0.29, 0), Vector3(0.3, 0.06, 0.3), plate)
		"spitter":
			var pus := mat(Color(0.65, 1.0, 0.2), 3.0)
			for i in 7:
				var a := rng.randf() * TAU
				ball(spine, Vector3(cos(a) * 0.22, 0.12 + rng.randf_range(-0.1, 0.18), -0.08 + sin(a) * 0.22), rng.randf_range(0.04, 0.07), pus, 5)
			ball(spine, Vector3(0.15, 0.48, 0.12), 0.09, pus, 5)
			box(r.jaw, Vector3(0, -0.07, -0.08), Vector3(0.12, 0.08, 0.04), pus)
	return r


## Player soldier for remote teammates. Returns the rig plus a "gun_mount" node.
static func soldier(parent: Node3D, color: Color) -> Dictionary:
	var opt := {"skin": Color(0.62, 0.47, 0.36), "shirt": color, "pants": color.darkened(0.3),
		"shoe": Color(0.08, 0.07, 0.06), "hand": Color(0.08, 0.08, 0.08), "eye": null, "long_sleeves": true}
	var r := humanoid(parent, opt)
	var vest := mat(Color(0.2, 0.22, 0.17))
	var strap := mat(Color(0.12, 0.12, 0.1))
	var spine: Node3D = r.spine
	var head: Node3D = r.head
	box(spine, Vector3(0, 0.38, 0), Vector3(0.48, 0.36, 0.3), vest)
	for x in [-0.12, 0.0, 0.12]:
		box(spine, Vector3(x, 0.3, -0.16), Vector3(0.09, 0.11, 0.05), strap)
	box(spine, Vector3(0, 0.36, 0.22), Vector3(0.34, 0.4, 0.16), mat(color.darkened(0.45)))
	box(spine, Vector3(0, 0.6, 0.22), Vector3(0.3, 0.1, 0.14), strap)
	var helmet := mat(color.darkened(0.2).lerp(Color(0.25, 0.28, 0.2), 0.5))
	box(head, Vector3(0, 0.27, 0.01), Vector3(0.31, 0.1, 0.31), helmet)
	box(head, Vector3(0, 0.22, 0.01), Vector3(0.34, 0.04, 0.34), helmet)
	box(head, Vector3(0, 0.2, -0.15), Vector3(0.2, 0.04, 0.03), mat(Color(0.05, 0.05, 0.06), 0.0, 0.6, 0.2))
	# hold-the-rifle pose
	r.arm_r.rotation = Vector3(-1.2, 0, 0)
	r.elbow_r.rotation = Vector3(-0.35, 0, 0)
	r.arm_l.rotation = Vector3(-1.25, 0.55, 0)
	r.elbow_l.rotation = Vector3(-0.2, 0, 0)
	r.gun_mount = joint(spine, Vector3(0.13, 0.42, -0.36))
	return r


# ================================================================ guns

## Gun model for weapon `id`, pointing -Z, origin at the grip.
## Sets meta "muzzle" (local Vector3). `chalk` builds a flat outline for wall-buys.
static func gun(id: String, chalk := false) -> Node3D:
	var g := Node3D.new()
	var accent: Color = Game.WEAPONS[id].color
	var metal := mat(METAL, 0.0, 0.7, 0.4)
	var steel := mat(STEEL, 0.0, 0.8, 0.3)
	var wood := mat(accent if accent.r > accent.b + 0.1 else WOOD)
	var poly := mat(POLY, 0.0, 0.1, 0.6)
	if chalk:
		var c := mat(Color(0.92, 0.9, 0.82), 0.4, 0.0, 1.0, true)
		metal = c
		steel = c
		wood = c
		poly = c
	var x90 := Vector3(PI / 2, 0, 0)
	var muzzle := Vector3(0, 0.05, -0.5)
	match id:
		"pistol":
			box(g, Vector3(0, 0.05, -0.08), Vector3(0.035, 0.045, 0.2), metal)
			box(g, Vector3(0, 0.017, -0.07), Vector3(0.03, 0.03, 0.17), poly)
			box(g, Vector3(0, -0.045, 0.0), Vector3(0.032, 0.11, 0.05), poly, Vector3(0.25, 0, 0))
			box(g, Vector3(0, -0.005, -0.055), Vector3(0.01, 0.03, 0.045), poly)
			box(g, Vector3(0, 0.08, -0.17), Vector3(0.008, 0.012, 0.01), metal)
			muzzle = Vector3(0, 0.05, -0.19)
		"deagle":
			var chrome := steel if chalk else mat(Color(0.62, 0.62, 0.65), 0.0, 0.9, 0.2)
			box(g, Vector3(0, 0.06, -0.1), Vector3(0.045, 0.06, 0.27), chrome)
			box(g, Vector3(0, 0.095, -0.1), Vector3(0.015, 0.012, 0.26), chrome)
			box(g, Vector3(0, 0.02, -0.08), Vector3(0.038, 0.035, 0.2), chrome)
			box(g, Vector3(0, -0.05, 0.0), Vector3(0.04, 0.13, 0.06), poly, Vector3(0.22, 0, 0))
			box(g, Vector3(0, -0.005, -0.06), Vector3(0.012, 0.035, 0.05), chrome)
			muzzle = Vector3(0, 0.06, -0.24)
		"m14":
			box(g, Vector3(0, 0.0, -0.18), Vector3(0.05, 0.065, 0.62), wood)
			box(g, Vector3(0, -0.03, 0.27), Vector3(0.048, 0.12, 0.26), wood, Vector3(-0.08, 0, 0))
			box(g, Vector3(0, 0.05, -0.1), Vector3(0.045, 0.045, 0.28), metal)
			cyl(g, Vector3(0, 0.045, -0.62), 0.011, 0.013, 0.36, metal, 6, x90)
			box(g, Vector3(0, -0.075, -0.1), Vector3(0.035, 0.1, 0.07), metal)
			box(g, Vector3(0, 0.08, -0.76), Vector3(0.008, 0.03, 0.012), metal)
			box(g, Vector3(0, 0.085, 0.03), Vector3(0.02, 0.03, 0.03), metal)
			muzzle = Vector3(0, 0.045, -0.81)
		"shotgun":
			cyl(g, Vector3(0, 0.05, -0.45), 0.016, 0.016, 0.62, metal, 6, x90)
			cyl(g, Vector3(0, 0.017, -0.42), 0.013, 0.013, 0.5, metal, 6, x90)
			box(g, Vector3(0, 0.015, -0.4), Vector3(0.055, 0.05, 0.17), wood)
			for k in 4:
				box(g, Vector3(0, -0.012, -0.34 - k * 0.035), Vector3(0.057, 0.008, 0.012), poly)
			box(g, Vector3(0, 0.03, -0.06), Vector3(0.052, 0.075, 0.22), metal)
			box(g, Vector3(0, -0.02, 0.18), Vector3(0.048, 0.1, 0.3), wood, Vector3(-0.12, 0, 0))
			box(g, Vector3(0, -0.035, -0.02), Vector3(0.012, 0.04, 0.05), metal)
			box(g, Vector3(0, 0.07, -0.75), Vector3(0.01, 0.012, 0.01), steel)
			muzzle = Vector3(0, 0.05, -0.77)
		"mp5":
			box(g, Vector3(0, 0.03, -0.1), Vector3(0.05, 0.07, 0.32), poly)
			cyl(g, Vector3(0, 0.03, -0.33), 0.024, 0.024, 0.16, poly, 6, x90)
			cyl(g, Vector3(0, 0.03, -0.43), 0.01, 0.01, 0.06, metal, 6, x90)
			box(g, Vector3(0, -0.06, -0.16), Vector3(0.03, 0.1, 0.05), metal, Vector3(0.18, 0, 0))
			box(g, Vector3(0, -0.14, -0.13), Vector3(0.03, 0.08, 0.05), metal, Vector3(0.38, 0, 0))
			box(g, Vector3(0, -0.04, 0.02), Vector3(0.035, 0.1, 0.05), poly, Vector3(0.2, 0, 0))
			for y in [0.05, 0.0]:
				box(g, Vector3(0, y, 0.13), Vector3(0.012, 0.012, 0.18), metal)
			box(g, Vector3(0, 0.02, 0.22), Vector3(0.04, 0.09, 0.02), poly)
			box(g, Vector3(0, 0.075, -0.05), Vector3(0.02, 0.025, 0.05), metal)
			box(g, Vector3(0, 0.075, -0.35), Vector3(0.012, 0.03, 0.01), metal)
			muzzle = Vector3(0, 0.03, -0.47)
		"ak":
			box(g, Vector3(0, -0.015, 0.18), Vector3(0.046, 0.085, 0.28), wood, Vector3(-0.15, 0, 0))
			box(g, Vector3(0, 0.03, -0.08), Vector3(0.05, 0.07, 0.3), metal)
			box(g, Vector3(0, 0.025, -0.32), Vector3(0.052, 0.055, 0.18), wood)
			cyl(g, Vector3(0, 0.067, -0.33), 0.01, 0.01, 0.2, metal, 6, x90)
			cyl(g, Vector3(0, 0.03, -0.5), 0.01, 0.01, 0.22, metal, 6, x90)
			var mag := mat(Color(0.5, 0.25, 0.1)) if not chalk else metal
			box(g, Vector3(0, -0.07, -0.13), Vector3(0.032, 0.1, 0.06), mag, Vector3(0.25, 0, 0))
			box(g, Vector3(0, -0.155, -0.095), Vector3(0.032, 0.09, 0.06), mag, Vector3(0.5, 0, 0))
			box(g, Vector3(0, -0.045, 0.02), Vector3(0.035, 0.1, 0.05), wood, Vector3(0.25, 0, 0))
			box(g, Vector3(0, 0.07, -0.58), Vector3(0.008, 0.035, 0.012), metal)
			muzzle = Vector3(0, 0.03, -0.62)
		"lmg":
			box(g, Vector3(0, 0.03, -0.12), Vector3(0.07, 0.09, 0.42), metal)
			cyl(g, Vector3(0, 0.04, -0.6), 0.016, 0.016, 0.56, metal, 6, x90)
			box(g, Vector3(0, 0.04, -0.48), Vector3(0.05, 0.05, 0.28), poly)
			cyl(g, Vector3(0, -0.08, -0.12), 0.09, 0.09, 0.07, poly, 8, Vector3(0, 0, PI / 2))
			box(g, Vector3(0, 0.1, -0.15), Vector3(0.02, 0.05, 0.14), poly)
			box(g, Vector3(0, -0.01, 0.2), Vector3(0.05, 0.1, 0.26), poly, Vector3(-0.1, 0, 0))
			box(g, Vector3(0, -0.05, 0.0), Vector3(0.035, 0.1, 0.05), poly, Vector3(0.2, 0, 0))
			for side in [-1, 1]:
				box(g, Vector3(0.02 * side, 0.0, -0.62), Vector3(0.01, 0.01, 0.22), metal, Vector3(0.15, 0, 0.1 * side))
			muzzle = Vector3(0, 0.04, -0.9)
		"sniper":
			cyl(g, Vector3(0, 0.04, -0.62), 0.014, 0.016, 0.74, metal, 6, x90)
			box(g, Vector3(0, 0.04, -1.0), Vector3(0.05, 0.035, 0.07), metal)
			box(g, Vector3(0, 0.03, -0.12), Vector3(0.06, 0.08, 0.38), poly)
			cyl(g, Vector3(0, 0.12, -0.12), 0.026, 0.03, 0.34, metal, 8, x90)
			for z in [-0.04, -0.2]:
				box(g, Vector3(0, 0.085, z), Vector3(0.03, 0.03, 0.02), metal)
			box(g, Vector3(0, -0.07, -0.15), Vector3(0.04, 0.09, 0.09), metal)
			box(g, Vector3(0, -0.02, 0.22), Vector3(0.05, 0.12, 0.3), poly, Vector3(-0.08, 0, 0))
			box(g, Vector3(0, -0.05, 0.0), Vector3(0.035, 0.1, 0.05), poly, Vector3(0.2, 0, 0))
			for side in [-1, 1]:
				box(g, Vector3(0.02 * side, -0.02, -0.55), Vector3(0.01, 0.01, 0.24), metal, Vector3(0.12, 0, 0.08 * side))
			muzzle = Vector3(0, 0.04, -1.04)
		"plasma":
			var glow := mat(Color(0.35, 1.0, 0.5), 4.0) if not chalk else metal
			var shell := mat(Color(0.18, 0.2, 0.22), 0.0, 0.5, 0.4) if not chalk else metal
			box(g, Vector3(0, 0.04, -0.12), Vector3(0.08, 0.1, 0.3), shell)
			for k in 3:
				cyl(g, Vector3(0, 0.04, -0.15 - k * 0.07), 0.05, 0.05, 0.03, glow, 8, x90)
			cyl(g, Vector3(0, 0.04, -0.33), 0.03, 0.04, 0.08, shell, 8, x90)
			box(g, Vector3(0, 0.04, -0.38), Vector3(0.03, 0.03, 0.02), glow)
			box(g, Vector3(0, 0.11, -0.08), Vector3(0.015, 0.05, 0.16), shell)
			box(g, Vector3(0, -0.05, 0.0), Vector3(0.04, 0.1, 0.05), shell, Vector3(0.25, 0, 0))
			box(g, Vector3(0.042, 0.04, -0.05), Vector3(0.005, 0.03, 0.1), glow)
			muzzle = Vector3(0, 0.04, -0.4)
		"minigun":
			for k in 6:
				var a := k * TAU / 6.0
				cyl(g, Vector3(cos(a) * 0.035, 0.04 + sin(a) * 0.035, -0.45), 0.011, 0.011, 0.56, metal, 5, x90)
			for z in [-0.25, -0.68]:
				cyl(g, Vector3(0, 0.04, z), 0.06, 0.06, 0.025, steel, 8, x90)
			cyl(g, Vector3(0, 0.04, -0.06), 0.075, 0.075, 0.24, poly, 8, x90)
			box(g, Vector3(0, 0.15, -0.05), Vector3(0.02, 0.06, 0.2), metal)
			box(g, Vector3(0.1, -0.02, 0.0), Vector3(0.1, 0.12, 0.16), mat(Color(0.25, 0.3, 0.2)) if not chalk else metal)
			box(g, Vector3(0, -0.06, 0.08), Vector3(0.035, 0.1, 0.05), poly, Vector3(0.2, 0, 0))
			muzzle = Vector3(0, 0.04, -0.74)
	g.set_meta("muzzle", muzzle)
	return g


# ================================================================ props

static func crate_stack(parent: Node3D, pos: Vector3, rng: RandomNumberGenerator) -> void:
	var root := joint(parent, pos)
	var kind := rng.randi_range(0, 2)
	var wood := mat(Color(0.45, 0.32, 0.17))
	var trim := mat(Color(0.3, 0.2, 0.1))
	match kind:
		0:
			_crate(root, Vector3(-0.25, 0.475, 0.12), 0.95, wood, trim, rng.randf_range(-0.2, 0.2))
			_crate(root, Vector3(0.38, 0.4, -0.28), 0.8, wood, trim, rng.randf_range(-0.3, 0.3))
			_crate(root, Vector3(-0.2, 1.26, 0.08), 0.62, wood, trim, rng.randf_range(-0.6, 0.6))
		1:
			var cols := [Color(0.55, 0.15, 0.1), Color(0.2, 0.35, 0.5), Color(0.3, 0.38, 0.22)]
			var bm := mat(cols[rng.randi_range(0, 2)], 0.0, 0.4, 0.6)
			var band := mat(Color(0.15, 0.15, 0.15), 0.0, 0.5, 0.5)
			for p in [Vector3(-0.32, 0, -0.28), Vector3(0.34, 0, -0.18), Vector3(0.0, 0, 0.33)]:
				cyl(root, p + Vector3(0, 0.5, 0), 0.3, 0.3, 1.0, bm, 8)
				for y in [0.25, 0.75]:
					cyl(root, p + Vector3(0, y, 0), 0.31, 0.31, 0.04, band, 8)
				cyl(root, p + Vector3(0, 1.005, 0), 0.24, 0.24, 0.01, band, 8)
		2:
			var bag := mat(Color(0.5, 0.45, 0.32))
			for row in 3:
				for k in 3:
					var x := -0.5 + k * 0.5 + (0.25 if row % 2 == 1 else 0.0)
					if x > 0.6:
						continue
					box(root, Vector3(x, 0.18 + row * 0.3, -0.35), Vector3(0.48, 0.28, 0.32), bag, Vector3(0, rng.randf_range(-0.1, 0.1), 0))
					box(root, Vector3(x, 0.18 + row * 0.3, 0.2), Vector3(0.48, 0.28, 0.32), bag, Vector3(0, rng.randf_range(-0.1, 0.1), 0))


static func _crate(parent: Node3D, pos: Vector3, size: float, wood: Material, trim: Material, yaw: float) -> void:
	if size <= 0.0:
		return
	var c := joint(parent, pos)
	c.rotation.y = yaw
	box(c, Vector3.ZERO, Vector3(size, size, size), wood)
	for s in [-1, 1]:
		box(c, Vector3(0, size * 0.45 * s, 0), Vector3(size + 0.02, size * 0.1, size + 0.02), trim)
	box(c, Vector3(0, 0, -size * 0.5 - 0.01), Vector3(size * 0.12, size * 1.1, 0.02), trim, Vector3(0, 0, 0.78))


static func pillar(parent: Node3D, pos: Vector3, h: float, m: Material, trim: Material) -> void:
	box(parent, pos + Vector3(0, 0.15, 0), Vector3(1.75, 0.3, 1.75), trim)
	box(parent, pos + Vector3(0, h - 0.15, 0), Vector3(1.75, 0.3, 1.75), trim)


static func door_visual(parent: Node3D, size: Vector3, rng: RandomNumberGenerator) -> void:
	var plank := mat(Color(0.45, 0.3, 0.15))
	var dark := mat(Color(0.2, 0.15, 0.1))
	var rubble := mat(Color(0.35, 0.33, 0.3))
	var horizontal := size.x > size.z
	var length := size.x if horizontal else size.z
	var depth := size.z if horizontal else size.x
	for face in [-1, 1]:
		for k in 5:
			var y := -size.y * 0.5 + 0.4 + k * 0.6 + rng.randf_range(-0.08, 0.08)
			var p := Vector3(0, y, depth * 0.5 * face + 0.03 * face)
			var sz := Vector3(length * 0.95, 0.22, 0.05)
			var rot := Vector3(0, 0, rng.randf_range(-0.12, 0.12))
			if not horizontal:
				p = Vector3(p.z, p.y, 0)
				sz = Vector3(0.05, 0.22, length * 0.95)
				rot = Vector3(rng.randf_range(-0.12, 0.12), 0, 0)
			box(parent, p, sz, plank if k % 2 == 0 else dark, rot)
	for k in 8:
		var off := rng.randf_range(-length * 0.45, length * 0.45)
		var p := Vector3(off, -size.y * 0.5 + 0.2, rng.randf_range(-0.3, 0.3) + (depth * 0.5 + 0.25) * (1 if k % 2 == 0 else -1))
		if not horizontal:
			p = Vector3(p.z, p.y, off)
		box(parent, p, Vector3.ONE * rng.randf_range(0.2, 0.45), rubble, Vector3(rng.randf(), rng.randf(), rng.randf()))


static func mystery_box(parent: Node3D) -> Node3D:
	var root := joint(parent, Vector3.ZERO)
	var wood := mat(Color(0.32, 0.2, 0.1))
	var metal := mat(Color(0.55, 0.45, 0.2), 0.0, 0.8, 0.3)
	var glow := mat(Color(0.35, 0.65, 1.0), 2.5)
	box(root, Vector3(0, 0.35, 0), Vector3(1.8, 0.6, 0.85), wood)
	box(root, Vector3(0, 0.72, 0), Vector3(1.84, 0.16, 0.89), wood)
	for x in [-0.88, 0.88]:
		box(root, Vector3(x, 0.45, 0), Vector3(0.06, 0.82, 0.92), metal)
	box(root, Vector3(0, 0.66, -0.45), Vector3(0.14, 0.12, 0.04), metal)
	for z in [-0.44, 0.44]:
		for x in [-0.45, 0.45]:
			var q := Label3D.new()
			q.text = "?"
			q.font_size = 96
			q.pixel_size = 0.004
			q.modulate = Color(0.5, 0.8, 1.0)
			q.outline_size = 0
			q.position = Vector3(x, 0.38, z + (-0.005 if z < 0 else 0.005))
			q.rotation.y = PI if z < 0 else 0.0
			root.add_child(q)
	for z in [-0.45, 0.45]:
		box(root, Vector3(0, 0.64, z * 1.0), Vector3(1.7, 0.02, 0.02), mat(Color(0.35, 0.65, 1.0), 1.2))
	var beam := cyl(root, Vector3(0, 6.0, 0), 0.22, 0.32, 11.0, mat(Color(0.4, 0.7, 1.0, 0.14), 2.0, 0.0, 1.0, true), 8)
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return root


static func perk_machine(parent: Node3D, color: Color, pname: String) -> Node3D:
	var root := joint(parent, Vector3.ZERO)
	var body := mat(color.darkened(0.55), 0.0, 0.3, 0.5)
	var trim := mat(color.darkened(0.2), 0.0, 0.4, 0.4)
	var sign := mat(color, 2.5)
	box(root, Vector3(0, 1.05, 0.05), Vector3(1.1, 1.9, 0.8), body)
	box(root, Vector3(0, 2.1, 0.05), Vector3(1.2, 0.3, 0.86), sign)
	box(root, Vector3(0, 1.15, -0.36), Vector3(0.75, 1.1, 0.03), mat(Color(0.1, 0.15, 0.2, 0.7), 0.3, 0.0, 0.1))
	for row in 3:
		for k in 4:
			cyl(root, Vector3(-0.27 + k * 0.18, 0.78 + row * 0.33, -0.3), 0.04, 0.05, 0.22, mat(color.lightened(0.15), 1.0), 6)
	box(root, Vector3(0, 0.38, -0.36), Vector3(0.6, 0.18, 0.04), mat(Color(0.05, 0.05, 0.05)))
	box(root, Vector3(0.45, 1.2, -0.36), Vector3(0.12, 0.4, 0.03), trim)
	for x in [-0.45, 0.45]:
		box(root, Vector3(x, 0.05, 0.05), Vector3(0.12, 0.1, 0.7), trim)
	var l := Label3D.new()
	l.text = pname.to_upper()
	l.font_size = 40
	l.pixel_size = 0.0035
	l.modulate = Color.WHITE
	l.outline_size = 8
	l.outline_modulate = color.darkened(0.6)
	l.position = Vector3(0, 2.1, -0.385)
	l.rotation.y = PI
	root.add_child(l)
	return root


static func lamp_post(parent: Node3D, pos: Vector3, h: float, lamp_col: Color) -> void:
	var pole := mat(Color(0.18, 0.19, 0.2), 0.0, 0.6, 0.5)
	cyl(parent, pos + Vector3(0, h * 0.5, 0), 0.06, 0.09, h, pole, 6)
	box(parent, pos + Vector3(0, h, -0.35), Vector3(0.06, 0.06, 0.8), pole)
	cyl(parent, pos + Vector3(0, h - 0.1, -0.72), 0.08, 0.22, 0.16, pole, 6)
	box(parent, pos + Vector3(0, h - 0.19, -0.72), Vector3(0.18, 0.03, 0.18), mat(lamp_col, 5.0, 0.0, 0.5, true))


static func hanging_lamp(parent: Node3D, pos: Vector3, ceiling: float, lamp_col: Color) -> void:
	var dark := mat(Color(0.12, 0.12, 0.12), 0.0, 0.5, 0.5)
	var len := ceiling - pos.y
	box(parent, pos + Vector3(0, len * 0.5, 0), Vector3(0.02, len, 0.02), dark)
	cyl(parent, pos, 0.07, 0.28, 0.18, mat(Color(0.3, 0.35, 0.3), 0.0, 0.5, 0.5), 6)
	box(parent, pos - Vector3(0, 0.09, 0), Vector3(0.16, 0.04, 0.16), mat(lamp_col, 5.0, 0.0, 0.5, true))


static func clutter(parent: Node3D, pos: Vector3, rng: RandomNumberGenerator) -> void:
	var roll := rng.randf()
	if roll < 0.35:
		var blood := mat(Color(0.25, 0.02, 0.02), 0.0, 0.0, 0.3)
		box(parent, pos + Vector3(0, 0.005, 0), Vector3(rng.randf_range(0.5, 1.2), 0.01, rng.randf_range(0.4, 1.0)), blood, Vector3(0, rng.randf() * TAU, 0))
	elif roll < 0.65:
		var rubble := mat(Color(0.33, 0.31, 0.28))
		for k in rng.randi_range(3, 6):
			box(parent, pos + Vector3(rng.randf_range(-0.5, 0.5), 0.06, rng.randf_range(-0.5, 0.5)), Vector3.ONE * rng.randf_range(0.08, 0.25), rubble, Vector3(rng.randf(), rng.randf(), rng.randf()))
	elif roll < 0.85:
		var paper := mat(Color(0.75, 0.72, 0.62))
		for k in rng.randi_range(2, 4):
			box(parent, pos + Vector3(rng.randf_range(-0.6, 0.6), 0.004, rng.randf_range(-0.6, 0.6)), Vector3(0.22, 0.005, 0.28), paper, Vector3(0, rng.randf() * TAU, 0))
	else:
		var bone := mat(Color(0.82, 0.78, 0.66))
		box(parent, pos + Vector3(0, 0.1, 0), Vector3(0.18, 0.18, 0.2), bone, Vector3(0, rng.randf() * TAU, 0.3))
		box(parent, pos + Vector3(0.25, 0.03, 0.1), Vector3(0.35, 0.05, 0.05), bone, Vector3(0, rng.randf() * TAU, 0))
		box(parent, pos + Vector3(-0.2, 0.03, -0.15), Vector3(0.28, 0.04, 0.04), bone, Vector3(0, rng.randf() * TAU, 0))


static func spawn_hole(parent: Node3D, pos: Vector3, rng: RandomNumberGenerator) -> void:
	cyl(parent, pos + Vector3(0, 0.01, 0), 0.75, 0.85, 0.03, mat(Color(0.04, 0.03, 0.03)), 8)
	var dirt := mat(Color(0.22, 0.17, 0.12))
	for k in 7:
		var a := k * TAU / 7.0 + rng.randf_range(-0.2, 0.2)
		box(parent, pos + Vector3(cos(a) * 0.85, 0.08, sin(a) * 0.85), Vector3(0.35, 0.16, 0.22), dirt, Vector3(0, -a, rng.randf_range(-0.3, 0.3)))
	var plank := mat(Color(0.38, 0.27, 0.15))
	box(parent, pos + Vector3(0.2, 0.15, 0.6), Vector3(0.9, 0.05, 0.14), plank, Vector3(0.2, 0.6, 0.3))
