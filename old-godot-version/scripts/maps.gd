extends RefCounted

const Models = preload("res://scripts/models.gd")
## Builds maps from ASCII layouts. Each character is a 2x2 m cell:
##   #  wall           X  pillar          C  crate (low cover)
##   .  floor, zone 0 (start)   1/2/3  floor in zones 1-3 (opened by doors)
##   D  door (opens the highest zone next to it)
##   W  wall-buy weapon on a wall      M  mystery box
##   K  perk machine    S  zombie spawn    P  player spawn
## Edit the rows or add a new entry to MAPS to make your own map.

const CELL := 2.0
const WALL_H := 3.6
const DOOR_COST := {1: 750, 2: 1000, 3: 1250}

const MAPS := {
	"outpost": {
		"name": "Outpost", "desc": "Moonlit military yard. Open lanes and two side compounds.",
		"floor": Color(0.2, 0.22, 0.18), "wall": Color(0.36, 0.34, 0.3), "pillar": Color(0.3, 0.32, 0.36),
		"sky": Color(0.02, 0.03, 0.07), "fog": Color(0.06, 0.08, 0.13), "fog_density": 0.03,
		"ambient": Color(0.4, 0.45, 0.65), "ambient_energy": 0.55, "moon": 0.55, "lamp": Color(1.0, 0.72, 0.42),
		"roof": false,
		"wallbuys": ["m14", "shotgun", "mp5", "ak"],
		"perks": ["iron", "fast", "tap", "wind"],
		"rows": [
			"##############################",
			"#S11111S#S..........S#S22222S#",
			"#1111111#............#2222222#",
			"#11C1111W..C......C..W222C222#",
			"#1111111#............#2222222#",
			"#1111111#....####....#2222222#",
			"#11111K1#....#M.#....#2K22222#",
			"#1111111#....#..#....#2222222#",
			"#1111111#....##.#....#2222222#",
			"#1111111D............D2222222#",
			"#1111111D.....PP.....D2222222#",
			"#1111111#.....PP.....#2222222#",
			"#11C1111#..C......C..#22222C2#",
			"#1111111W............W2222222#",
			"#1111111#...##..##...#2222222#",
			"#1111111#............#22K2222#",
			"#1111111#............#2222222#",
			"#1111111#..........K.#2222222#",
			"#S11111S#S....S.....S#S22222S#",
			"##############################",
		],
	},
	"bunker": {
		"name": "Bunker", "desc": "Cramped underground corridors. Nowhere to run.",
		"floor": Color(0.17, 0.17, 0.18), "wall": Color(0.3, 0.3, 0.29), "pillar": Color(0.4, 0.33, 0.2),
		"sky": Color(0.0, 0.0, 0.0), "fog": Color(0.05, 0.04, 0.04), "fog_density": 0.045,
		"ambient": Color(0.5, 0.42, 0.35), "ambient_energy": 0.35, "moon": 0.0, "lamp": Color(1.0, 0.55, 0.3),
		"roof": true,
		"wallbuys": ["ak", "m14", "shotgun"],
		"perks": ["fast", "tap", "iron", "wind"],
		"rows": [
			"##########################",
			"#S11111111S#S22222222222S#",
			"#1111111111#2222222222222#",
			"#11##11##11#22##22222##22#",
			"#1111111111D2222222222222#",
			"#11K1111111D22222222K2222#",
			"#1111111111#22##22222##22#",
			"#11##11##11#2222222222222#",
			"#1111111111W2222222222222#",
			"#S111111111#2222222222222#",
			"####DD##W###2222222222222#",
			"#..........#2222222222222#",
			"#..C....C..#22##22222##22#",
			"#..........W2222222222222#",
			"#...PP.....#22222222K2222#",
			"#...PP..M..D2222222222222#",
			"#..........D2222222222222#",
			"#..C....C..#22##22222##22#",
			"#....K.....#2222222222222#",
			"#S........S#S22222S22222S#",
			"##########################",
		],
	},
	"factory": {
		"name": "Factory", "desc": "A huge abandoned plant with three wings to unlock.",
		"floor": Color(0.23, 0.2, 0.17), "wall": Color(0.4, 0.35, 0.3), "pillar": Color(0.45, 0.25, 0.12),
		"sky": Color(0.05, 0.03, 0.03), "fog": Color(0.12, 0.07, 0.05), "fog_density": 0.022,
		"ambient": Color(0.6, 0.45, 0.35), "ambient_energy": 0.45, "moon": 0.35, "lamp": Color(1.0, 0.8, 0.55),
		"roof": false,
		"wallbuys": ["m14", "mp5", "shotgun", "ak"],
		"perks": ["iron", "fast", "wind", "tap"],
		"rows": [
			"################################",
			"#S111111111111111111S#S3333333S#",
			"#11111111111111111111#333333333#",
			"#1111X111111111X11111#333333333#",
			"#111111111111111111K1#3333K3333#",
			"#########DDDD#########333333333#",
			"#S..................S#33C333C33#",
			"#..X....X....X....X..W333333333#",
			"#....................#333333333#",
			"#....C....PP....C....D333333333#",
			"#........MPP.........D333333333#",
			"#..................K.#333333333#",
			"#..X....X....X....X..W333C33333#",
			"#S..................S#333333333#",
			"######W##DDDD##W######333333333#",
			"#22222222222222222222#333333333#",
			"#2222X222222222X22222#333333333#",
			"#222222222K2222222222#33C333C33#",
			"#22222222222222222222#333333333#",
			"#S222222222S22222222S#S3333333S#",
			"################################",
		],
	},
}

static var _mats := {}


static func mat(color: Color, emissive := 0.0, rough := 0.9, tex := true) -> StandardMaterial3D:
	var key := "%s|%s|%s|%s" % [color.to_html(), emissive, rough, tex]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	if tex:
		var nt := NoiseTexture2D.new()
		nt.width = 128
		nt.height = 128
		nt.seamless = true
		var n := FastNoiseLite.new()
		n.frequency = 0.06
		n.fractal_octaves = 4
		nt.noise = n
		nt.color_ramp = Gradient.new()
		nt.color_ramp.set_color(0, Color(0.55, 0.55, 0.55))
		nt.color_ramp.set_color(1, Color(1.1, 1.1, 1.1))
		m.albedo_texture = nt
		m.uv1_triplanar = true
		m.uv1_scale = Vector3(0.35, 0.35, 0.35)
	if emissive > 0.0:
		m.emission_enabled = true
		m.emission = color
		m.emission_energy_multiplier = emissive
	_mats[key] = m
	return m


static func box(parent: Node, pos: Vector3, size: Vector3, material: Material, collide := true) -> Node3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = material
	if not collide:
		mi.position = pos
		parent.add_child(mi)
		return mi
	var body := StaticBody3D.new()
	body.position = pos
	var cs := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	cs.shape = shape
	body.add_child(cs)
	body.add_child(mi)
	parent.add_child(body)
	return body


static func label(parent: Node, pos: Vector3, text: String, size := 48, color := Color.WHITE) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.font_size = size
	l.pixel_size = 0.004
	l.modulate = color
	l.outline_size = 10
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.position = pos
	l.no_depth_test = false
	parent.add_child(l)
	return l


static func zone_of(ch: String) -> int:
	if ch == ".":
		return 0
	if ch in ["1", "2", "3"]:
		return int(ch)
	return -1


## Returns a dictionary describing gameplay points of the built map.
static func build(map_id: String, parent: Node3D) -> Dictionary:
	var def: Dictionary = MAPS[map_id]
	var rows: Array = def.rows
	var h := rows.size()
	var w := String(rows[0]).length()
	var origin := Vector3(-w * CELL * 0.5, 0, -h * CELL * 0.5)
	var info := {
		"spawns": [], "player_spawns": [], "wallbuys": [], "doors": [], "boxes": [], "perks": [],
		"size": Vector2(w * CELL, h * CELL), "region": null, "def": def,
	}
	var grid := []
	for r in h:
		var row := []
		for c in w:
			row.append(String(rows[r])[c])
		grid.append(row)

	var cell_pos := func(c: int, r: int) -> Vector3:
		return origin + Vector3((c + 0.5) * CELL, 0, (r + 0.5) * CELL)
	var neighbor_zone := func(c: int, r: int) -> int:
		var best := 99
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var cc: int = c + d.x
			var rr: int = r + d.y
			if rr >= 0 and rr < h and cc >= 0 and cc < w:
				var z := zone_of(grid[rr][cc])
				if z >= 0 and z < best:
					best = z
		return 0 if best == 99 else best

	# Navigation region holds every collider zombies must path around.
	var region := NavigationRegion3D.new()
	region.name = "Nav"
	var nm := NavigationMesh.new()
	nm.agent_radius = 0.5
	nm.agent_height = 1.75
	nm.agent_max_climb = 0.25
	nm.cell_size = 0.25
	nm.cell_height = 0.25
	nm.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS
	nm.geometry_collision_mask = 1
	region.navigation_mesh = nm
	parent.add_child(region)
	info.region = region

	var floor_mat := mat(def.floor, 0.0, 0.95)
	var wall_mat := mat(def.wall)
	var pillar_mat := mat(def.pillar)
	box(region, Vector3(0, -0.25, 0), Vector3(w * CELL, 0.5, h * CELL), floor_mat)

	var cap_mat := Models.mat(Color(def.wall).darkened(0.35))
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(map_id)
	# Walls: merge horizontal runs of '#'/'W'.
	for r in h:
		var c := 0
		while c < w:
			var ch: String = grid[r][c]
			if ch == "#" or ch == "W":
				var start := c
				while c < w and (grid[r][c] == "#" or grid[r][c] == "W"):
					c += 1
				var length := c - start
				var p: Vector3 = cell_pos.call(start, r)
				p.x += (length - 1) * CELL * 0.5
				p.y = WALL_H * 0.5
				box(region, p, Vector3(length * CELL, WALL_H, CELL), wall_mat)
				Models.box(parent, Vector3(p.x, WALL_H + 0.06, p.z), Vector3(length * CELL + 0.12, 0.12, CELL + 0.12), cap_mat)
				Models.box(parent, Vector3(p.x, 0.12, p.z), Vector3(length * CELL + 0.06, 0.24, CELL + 0.06), cap_mat)
			else:
				c += 1

	var visited := {}
	var wb_i := 0
	var perk_i := 0
	for r in h:
		for c in w:
			var ch: String = grid[r][c]
			var p: Vector3 = cell_pos.call(c, r)
			match ch:
				"X":
					box(region, p + Vector3(0, WALL_H * 0.5, 0), Vector3(CELL * 0.75, WALL_H, CELL * 0.75), pillar_mat)
					Models.pillar(parent, p, WALL_H, pillar_mat, cap_mat)
				"C":
					_collider(region, p + Vector3(0, 0.6, 0), Vector3(1.5, 1.2, 1.5))
					Models.crate_stack(parent, p, rng)
				"S":
					var zone: int = neighbor_zone.call(c, r)
					info.spawns.append({"pos": p, "zone": zone})
					Models.spawn_hole(parent, p, rng)
				"P":
					info.player_spawns.append(p + Vector3(0, 0.1, 0))
				"M":
					_build_box(parent, p, info, _face_yaw(grid, c, r, w, h))
				"K":
					var perks: Array = def.perks
					var perk: String = perks[perk_i % perks.size()]
					perk_i += 1
					_build_perk(region, p, perk, info, _face_yaw(grid, c, r, w, h))
				"W":
					var weps: Array = def.wallbuys
					var wep: String = weps[wb_i % weps.size()]
					wb_i += 1
					_build_wallbuy(parent, grid, c, r, w, h, p, wep, info)
				"D":
					if not visited.has(Vector2i(c, r)):
						_build_door(region, grid, c, r, w, h, origin, visited, info)
			# Floor clutter (visual only).
			if zone_of(ch) >= 0 and rng.randf() < 0.1:
				Models.clutter(parent, p + Vector3(rng.randf_range(-0.4, 0.4), 0, rng.randf_range(-0.4, 0.4)), rng)
			# Lamps on a sparse grid.
			if zone_of(ch) >= 0 and c % 5 == 2 and r % 4 == 2:
				var lp := p + Vector3(0, WALL_H - 0.5, 0)
				if def.roof:
					Models.hanging_lamp(parent, lp, WALL_H, def.lamp)
				else:
					lp = p + Vector3(0.6, 3.2, 0.6)
					_collider(region, p + Vector3(0.6, 1.6, 0.6), Vector3(0.2, 3.2, 0.2))
					Models.lamp_post(parent, p + Vector3(0.6, 0, 0.6), 3.4, def.lamp)
					lp.z -= 0.72
				var light := OmniLight3D.new()
				light.position = lp - Vector3(0, 0.3, 0)
				light.light_color = def.lamp
				light.light_energy = 1.6
				light.omni_range = 11.0
				light.omni_attenuation = 1.3
				parent.add_child(light)

	if def.roof:
		box(parent, Vector3(0, WALL_H + 0.25, 0), Vector3(w * CELL, 0.5, h * CELL), wall_mat)
	return info


static func _collider(parent: Node3D, pos: Vector3, size: Vector3) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.position = pos
	var cs := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	cs.shape = shape
	body.add_child(cs)
	parent.add_child(body)
	return body


## Yaw that makes a machine's front (-Z) face away from an adjacent wall.
static func _face_yaw(grid: Array, c: int, r: int, w: int, h: int) -> float:
	var best := Vector2i.ZERO
	var best_open := -1
	for d in [Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0)]:
		var open := 0
		for k in range(1, 4):
			var cc: int = c + d.x * k
			var rr: int = r + d.y * k
			if rr < 0 or rr >= h or cc < 0 or cc >= w or zone_of(grid[rr][cc]) < 0 and not grid[rr][cc] in ["P", "S"]:
				break
			open += 1
		if open > best_open:
			best_open = open
			best = d
	return atan2(-float(best.x), -float(best.y))


static func _build_box(parent: Node3D, p: Vector3, info: Dictionary, yaw := 0.0) -> void:
	var root := Node3D.new()
	root.position = p
	root.rotation.y = yaw
	parent.add_child(root)
	Models.mystery_box(root)
	var col := _collider(parent.get_node("Nav") if parent.has_node("Nav") else parent, p + Vector3(0, 0.4, 0), Vector3(1.8, 0.8, 0.9))
	col.rotation.y = yaw
	var light := OmniLight3D.new()
	light.position = Vector3(0, 1.6, 0)
	light.light_color = Color(0.3, 0.6, 1.0)
	light.light_energy = 2.2
	light.omni_range = 6.0
	root.add_child(light)
	label(root, Vector3(0, 1.5, 0), "MYSTERY BOX  %d" % 950, 34, Color(0.6, 0.85, 1.0))
	info.boxes.append({"pos": p, "node": root})


static func _build_perk(parent: Node3D, p: Vector3, perk: String, info: Dictionary, yaw := 0.0) -> void:
	var pd: Dictionary = Game.PERKS[perk]
	_collider(parent, p + Vector3(0, 1.1, 0), Vector3(1.1, 2.2, 1.1))
	var root := Node3D.new()
	root.position = p
	root.rotation.y = yaw
	parent.add_child(root)
	Models.perk_machine(root, pd.color, pd.name)
	var light := OmniLight3D.new()
	light.position = Vector3(0, 2.4, -0.8)
	light.light_color = pd.color
	light.light_energy = 1.6
	light.omni_range = 4.5
	root.add_child(light)
	label(root, Vector3(0, 2.75, 0), "%d" % pd.cost, 36, pd.color.lightened(0.3))
	info.perks.append({"pos": p, "perk": perk, "node": root})


static func _build_wallbuy(parent: Node3D, grid: Array, c: int, r: int, w: int, h: int, p: Vector3, wep: String, info: Dictionary) -> void:
	var wd: Dictionary = Game.WEAPONS[wep]
	var best_dir := Vector2i.ZERO
	var best_zone := 99
	for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
		var cc: int = c + d.x
		var rr: int = r + d.y
		if rr >= 0 and rr < h and cc >= 0 and cc < w:
			var z := zone_of(grid[rr][cc])
			if z < 0 and grid[rr][cc] in ["S", "P", "M", "K"]:
				z = 0
			if z >= 0 and z < best_zone:
				best_zone = z
				best_dir = d
	var normal := Vector3(best_dir.x, 0, best_dir.y)
	var face := p + normal * (CELL * 0.5 + 0.02)
	var root := Node3D.new()
	root.position = face + Vector3(0, 1.5, 0)
	parent.add_child(root)
	root.look_at(root.global_position + normal, Vector3.UP)
	# dark board with a chalk outline of the gun
	Models.box(root, Vector3(0, 0, 0.0), Vector3(1.7, 0.85, 0.03), Models.mat(Color(0.12, 0.13, 0.12)))
	for e in [Vector3(0, 0.4, -0.02), Vector3(0, -0.4, -0.02)]:
		Models.box(root, e, Vector3(1.6, 0.02, 0.01), Models.mat(Color(0.9, 0.88, 0.8), 0.3, 0.0, 1.0, true))
	var gs := 1.6 if float(wd.len) < 0.5 else 1.15
	var holder := Node3D.new()
	holder.position = Vector3(0, 0, -0.03)
	holder.scale = Vector3(1, 1, 0.08)
	root.add_child(holder)
	var g := Models.gun(wep, true)
	g.rotation.y = -PI / 2
	g.scale = Vector3.ONE * gs
	g.position = Vector3(-float(wd.len) * 0.4 * gs, -0.02, 0)
	holder.add_child(g)
	label(root, Vector3(0, 0.62, -0.05), "%s  %d" % [wd.name, wd.cost], 34, Color(1.0, 0.95, 0.8))
	info.wallbuys.append({"pos": face + normal * 0.6, "weapon": wep, "zone": best_zone})


static func _build_door(parent: Node3D, grid: Array, c: int, r: int, w: int, h: int, origin: Vector3, visited: Dictionary, info: Dictionary) -> void:
	var cells := []
	var stack := [Vector2i(c, r)]
	visited[Vector2i(c, r)] = true
	var zone := 0
	while not stack.is_empty():
		var cur: Vector2i = stack.pop_back()
		cells.append(cur)
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var n: Vector2i = cur + d
			if n.y < 0 or n.y >= h or n.x < 0 or n.x >= w:
				continue
			var ch: String = grid[n.y][n.x]
			if ch == "D" and not visited.has(n):
				visited[n] = true
				stack.append(n)
			var z := zone_of(ch)
			if z > zone:
				zone = z
	var mn := Vector2i(9999, 9999)
	var mx := Vector2i(-1, -1)
	for cell in cells:
		mn = Vector2i(mini(mn.x, cell.x), mini(mn.y, cell.y))
		mx = Vector2i(maxi(mx.x, cell.x), maxi(mx.y, cell.y))
	var size := Vector3((mx.x - mn.x + 1) * CELL, WALL_H, (mx.y - mn.y + 1) * CELL)
	var center := origin + Vector3((mn.x + mx.x + 1) * CELL * 0.5, WALL_H * 0.5, (mn.y + mx.y + 1) * CELL * 0.5)
	var cost: int = DOOR_COST.get(zone, 1000)
	var body := box(parent, center, size - Vector3(0.3, 0, 0.3) * Vector3(1 if size.x < size.z else 0, 0, 1 if size.z < size.x else 0), mat(Color(0.16, 0.12, 0.08)))
	(body.get_child(0) as CollisionShape3D).shape.size = size
	var drng := RandomNumberGenerator.new()
	drng.seed = cells.size() * 31 + mn.x * 7 + mn.y
	Models.door_visual(body, size, drng)
	label(body, Vector3(0, 0.6, 0), "CLEAR DEBRIS  %d" % cost, 48, Color(1.0, 0.85, 0.4))
	info.doors.append({"pos": center, "size": size, "zone": zone, "cost": cost, "node": body, "open": false})
