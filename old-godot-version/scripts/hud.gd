extends CanvasLayer
## In-game HUD, scoreboard, pause menu and game-over screen.

const UI = preload("res://scripts/ui.gd")

var world
var root: Control
var vignette: TextureRect
var scope: Control
var cross: Control
var cross_bars: Array = []
var hitmark: Label
var wave_l: Label
var pu_l: Label
var points_l: Label
var perks_box: HBoxContainer
var team_box: VBoxContainer
var weapon_l: Label
var ammo_l: Label
var nade_l: Label
var interact_l: Label
var interact_bar: ProgressBar
var center_l: Label
var down_l: Label
var boss_box: VBoxContainer
var boss_l: Label
var boss_bar: ProgressBar
var score_panel: PanelContainer
var score_grid: GridContainer
var pause_panel: Control
var over_panel: Control
var popups: Control

var dmg_alpha := 0.0
var hit_t := 0.0
var center_t := 0.0
var shown_wave := -1
var points_flash := 0.0
var dmg_dir: Control
var dmg_dir_t := 0.0
var ammo_hint: Label


func _ready() -> void:
	layer = 5
	process_mode = Node.PROCESS_MODE_ALWAYS
	root = UI.full_rect(Control.new())
	root.theme = UI.theme()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	# damage vignette
	vignette = TextureRect.new()
	UI.full_rect(vignette)
	var g := Gradient.new()
	g.set_color(0, Color(0.6, 0, 0, 0))
	g.set_color(1, Color(0.6, 0, 0, 0.95))
	g.add_point(0.45, Color(0.6, 0, 0, 0.0))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1.05, 1.05)
	vignette.texture = gt
	vignette.stretch_mode = TextureRect.STRETCH_SCALE
	vignette.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vignette.modulate.a = 0.0
	root.add_child(vignette)

	# sniper scope
	scope = TextureRect.new()
	UI.full_rect(scope)
	var sg := Gradient.new()
	sg.set_color(0, Color(0, 0, 0, 0))
	sg.set_color(1, Color(0, 0, 0, 1))
	sg.add_point(0.42, Color(0, 0, 0, 0))
	sg.add_point(0.44, Color(0, 0, 0, 1))
	var sgt := GradientTexture2D.new()
	sgt.gradient = sg
	sgt.fill = GradientTexture2D.FILL_RADIAL
	sgt.fill_from = Vector2(0.5, 0.5)
	sgt.fill_to = Vector2(0.5, 1.0)
	sgt.width = 512
	sgt.height = 512
	scope.texture = sgt
	scope.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	scope.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	scope.mouse_filter = Control.MOUSE_FILTER_IGNORE
	scope.visible = false
	root.add_child(scope)
	for v in [[Vector2(-1000, -1), Vector2(2000, 2)], [Vector2(-1, -1000), Vector2(2, 2000)]]:
		var line := ColorRect.new()
		line.color = Color(0, 0, 0, 0.9)
		line.position = v[0]
		line.size = v[1]
		line.set_anchors_preset(Control.PRESET_CENTER)
		line.mouse_filter = Control.MOUSE_FILTER_IGNORE
		scope.add_child(line)
		line.position = v[0]

	# crosshair
	cross = Control.new()
	cross.set_anchors_preset(Control.PRESET_CENTER)
	cross.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(cross)
	var dot := Panel.new()
	var dot_style := StyleBoxFlat.new()
	dot_style.bg_color = Color.WHITE
	dot_style.set_corner_radius_all(3)
	dot_style.border_color = Color(0, 0, 0, 0.6)
	dot_style.set_border_width_all(1)
	dot.add_theme_stylebox_override("panel", dot_style)
	dot.position = Vector2(-3, -3)
	dot.size = Vector2(6, 6)
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cross.add_child(dot)
	cross_bars.append(dot)
	hitmark = UI.label("X", 34, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER)
	hitmark.set_anchors_preset(Control.PRESET_CENTER)
	hitmark.position = Vector2(-12, -24)
	hitmark.modulate.a = 0.0
	root.add_child(hitmark)

	# damage direction wedge
	dmg_dir = Control.new()
	dmg_dir.set_anchors_preset(Control.PRESET_CENTER)
	dmg_dir.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(dmg_dir)
	var wedge := Polygon2D.new()
	wedge.polygon = PackedVector2Array([Vector2(-70, -150), Vector2(0, -185), Vector2(70, -150), Vector2(0, -165)])
	wedge.color = Color(0.9, 0.08, 0.05, 0.85)
	dmg_dir.add_child(wedge)
	dmg_dir.modulate.a = 0.0
	ammo_hint = UI.label("", 22, UI.GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	ammo_hint.set_anchors_preset(Control.PRESET_CENTER)
	ammo_hint.position = Vector2(-150, 34)
	ammo_hint.custom_minimum_size = Vector2(300, 0)
	root.add_child(ammo_hint)

	# top-left: wave
	var tl := UI.vbox(0)
	tl.position = Vector2(36, 20)
	root.add_child(tl)
	wave_l = UI.label("", 84, UI.RED)
	wave_l.add_theme_constant_override("outline_size", 14)
	tl.add_child(wave_l)
	pu_l = UI.label("", 22, UI.GOLD)
	tl.add_child(pu_l)

	# boss bar
	boss_box = UI.vbox(4)
	boss_box.set_anchors_preset(Control.PRESET_CENTER_TOP)
	boss_box.position = Vector2(-300, 24)
	boss_box.custom_minimum_size = Vector2(600, 0)
	boss_box.visible = false
	root.add_child(boss_box)
	boss_l = UI.label("", 24, UI.BONE, HORIZONTAL_ALIGNMENT_CENTER)
	boss_box.add_child(boss_l)
	boss_bar = ProgressBar.new()
	boss_bar.custom_minimum_size = Vector2(600, 18)
	boss_bar.show_percentage = false
	var fill := StyleBoxFlat.new()
	fill.bg_color = UI.RED
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0, 0, 0, 0.6)
	boss_bar.add_theme_stylebox_override("fill", fill)
	boss_bar.add_theme_stylebox_override("background", bg)
	boss_box.add_child(boss_bar)

	# bottom-left: team, perks, points
	var bl := UI.vbox(6)
	bl.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	bl.grow_vertical = Control.GROW_DIRECTION_BEGIN
	bl.position = Vector2(36, -40)
	root.add_child(bl)
	team_box = UI.vbox(2)
	bl.add_child(team_box)
	perks_box = UI.hbox(6)
	bl.add_child(perks_box)
	points_l = UI.label("500", 44, UI.BONE)
	points_l.add_theme_constant_override("outline_size", 10)
	bl.add_child(points_l)
	popups = Control.new()
	popups.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bl.add_child(popups)

	# bottom-right: weapon
	var br := UI.vbox(0)
	br.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	br.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	br.grow_vertical = Control.GROW_DIRECTION_BEGIN
	br.position = Vector2(-40, -36)
	root.add_child(br)
	weapon_l = UI.label("", 24, UI.DIM, HORIZONTAL_ALIGNMENT_RIGHT)
	br.add_child(weapon_l)
	ammo_l = UI.label("", 46, UI.BONE, HORIZONTAL_ALIGNMENT_RIGHT)
	br.add_child(ammo_l)
	nade_l = UI.label("", 20, UI.DIM, HORIZONTAL_ALIGNMENT_RIGHT)
	br.add_child(nade_l)

	# interact prompt
	var ib := UI.vbox(6)
	ib.set_anchors_preset(Control.PRESET_CENTER)
	ib.position = Vector2(-300, 70)
	ib.custom_minimum_size = Vector2(600, 0)
	root.add_child(ib)
	interact_l = UI.label("", 24, UI.BONE, HORIZONTAL_ALIGNMENT_CENTER)
	ib.add_child(interact_l)
	interact_bar = ProgressBar.new()
	interact_bar.custom_minimum_size = Vector2(300, 10)
	interact_bar.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	interact_bar.show_percentage = false
	interact_bar.max_value = 1.0
	interact_bar.visible = false
	var f2 := StyleBoxFlat.new()
	f2.bg_color = Color(0.4, 0.9, 0.4)
	interact_bar.add_theme_stylebox_override("fill", f2)
	interact_bar.add_theme_stylebox_override("background", bg)
	ib.add_child(interact_bar)

	center_l = UI.label("", 56, UI.RED, HORIZONTAL_ALIGNMENT_CENTER)
	center_l.set_anchors_preset(Control.PRESET_CENTER)
	center_l.position = Vector2(-500, -220)
	center_l.custom_minimum_size = Vector2(1000, 0)
	center_l.add_theme_constant_override("outline_size", 12)
	root.add_child(center_l)

	down_l = UI.label("", 30, Color(1, 0.4, 0.35), HORIZONTAL_ALIGNMENT_CENTER)
	down_l.set_anchors_preset(Control.PRESET_CENTER)
	down_l.position = Vector2(-500, 130)
	down_l.custom_minimum_size = Vector2(1000, 0)
	root.add_child(down_l)

	# scoreboard
	score_panel = UI.panel()
	score_panel.set_anchors_preset(Control.PRESET_CENTER)
	score_panel.position = Vector2(-360, -200)
	score_panel.custom_minimum_size = Vector2(720, 0)
	score_panel.visible = false
	root.add_child(score_panel)
	var sv := UI.vbox(12)
	score_panel.add_child(sv)
	sv.add_child(UI.label("SCOREBOARD", 28, UI.RED))
	score_grid = GridContainer.new()
	score_grid.columns = 5
	score_grid.add_theme_constant_override("h_separation", 34)
	score_grid.add_theme_constant_override("v_separation", 6)
	sv.add_child(score_grid)


func _process(delta: float) -> void:
	if world == null or world.player == null:
		return
	var p = world.player
	dmg_alpha = move_toward(dmg_alpha, 0.0, delta * 0.8)
	var low: float = 1.0 - clampf(p.hp / p.max_hp, 0.0, 1.0)
	vignette.modulate.a = clampf(maxf(dmg_alpha, low * 0.8 if p.hp < p.max_hp * 0.6 else 0.0), 0.0, 1.0)
	if p.downed:
		vignette.modulate.a = 0.85
	dmg_dir_t = maxf(dmg_dir_t - delta * 1.2, 0.0)
	dmg_dir.modulate.a = dmg_dir_t
	hit_t = maxf(hit_t - delta * 4.0, 0.0)
	hitmark.modulate.a = hit_t
	center_t -= delta
	if center_t <= 0.0:
		center_l.modulate.a = move_toward(center_l.modulate.a, 0.0, delta * 2.0)
	points_flash = maxf(points_flash - delta * 3.0, 0.0)
	points_l.add_theme_color_override("font_color", UI.BONE.lerp(UI.RED, points_flash))

	# wave counter (CoD style tally for first waves, number after)
	if world.wave != shown_wave:
		shown_wave = world.wave
		wave_l.text = _tally(world.wave)
		var tw := wave_l.create_tween()
		wave_l.scale = Vector2(1.6, 1.6)
		wave_l.pivot_offset = Vector2(0, 40)
		for k in 3:
			tw.tween_callback(func(): wave_l.add_theme_color_override("font_color", Color.WHITE))
			tw.tween_interval(0.25)
			tw.tween_callback(func(): wave_l.add_theme_color_override("font_color", UI.RED))
			tw.tween_interval(0.25)
		tw.parallel().tween_property(wave_l, "scale", Vector2.ONE, 1.2)
	var pu := []
	if world.double_t > 0.0:
		pu.append("DOUBLE POINTS %d" % ceili(world.double_t))
	if world.insta_t > 0.0:
		pu.append("INSTA-KILL %d" % ceili(world.insta_t))
	if world.state == "intermission" and world.wave > 0 and not world.game_over:
		pu.append("Next wave in %d" % ceili(maxf(world.state_t, 0.0)))
	pu_l.text = "\n".join(pu)

	points_l.text = str(p.points)
	var a: Dictionary = p.active()
	var wd: Dictionary = Game.WEAPONS[a.id]
	weapon_l.text = wd.name + ("   [RELOADING]" if p.reloading else "")
	ammo_l.text = "%d / %d" % [a.mag, a.reserve]
	ammo_l.add_theme_color_override("font_color", UI.RED if int(a.mag) <= int(wd.mag) / 4 else UI.BONE)
	nade_l.text = "Grenades: %d    [G]" % p.grenades
	var low_mag := int(a.mag) <= maxi(1, int(wd.mag) / 4)
	if p.dead or p.reloading:
		ammo_hint.text = ""
	elif int(a.mag) == 0 and int(a.reserve) == 0:
		ammo_hint.text = "NO AMMO"
	elif low_mag and int(a.reserve) > 0:
		ammo_hint.text = "RELOAD  [R]"
	elif low_mag:
		ammo_hint.text = "LOW AMMO"
	else:
		ammo_hint.text = ""
	ammo_hint.add_theme_color_override("font_color", UI.RED if int(a.reserve) == 0 else UI.GOLD)

	# dot crosshair (hidden behind the sniper scope)
	cross.visible = not p.dead and not scope.visible
	var dot_style: StyleBoxFlat = cross_bars[0].get_theme_stylebox("panel")
	dot_style.bg_color = Color(1.0, 0.25, 0.2) if p.aim_on_zombie else Color.WHITE

	# perks
	if perks_box.get_child_count() != p.perks.size():
		for c in perks_box.get_children():
			c.queue_free()
		for perk in p.perks:
			var pd: Dictionary = Game.PERKS[perk]
			var r := ColorRect.new()
			r.color = pd.color
			r.custom_minimum_size = Vector2(34, 34)
			r.tooltip_text = pd.name
			var l := UI.label(String(pd.name)[0], 22, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER)
			l.custom_minimum_size = Vector2(34, 34)
			l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			r.add_child(l)
			perks_box.add_child(r)

	# teammates
	var lines: Array = world.team_rows(false)
	while team_box.get_child_count() < lines.size():
		team_box.add_child(UI.label("", 20, UI.DIM))
	while team_box.get_child_count() > lines.size():
		var c := team_box.get_child(team_box.get_child_count() - 1)
		team_box.remove_child(c)
		c.queue_free()
	for i in lines.size():
		var row: Dictionary = lines[i]
		var tl: Label = team_box.get_child(i)
		var st := ""
		if row.down:
			st = "  [DOWN]"
		elif row.dead:
			st = "  [DEAD]"
		tl.text = "%s   %d%s" % [row.name, row.points, st]
		tl.add_theme_color_override("font_color", Color(1, 0.4, 0.35) if row.down or row.dead else UI.DIM)

	# downed text
	if world.game_over:
		down_l.text = ""
	elif p.downed:
		if p.self_revive_t > 0.0:
			down_l.text = "Second Wind... getting up in %d" % ceili(p.self_revive_t)
		else:
			down_l.text = "YOU ARE DOWN\nA teammate can revive you - bleed out in %d" % ceili(p.bleed_t) if not world.solo else "YOU ARE DOWN"
	elif p.dead:
		down_l.text = "Spectating - you respawn at the start of the next wave"
	else:
		down_l.text = ""

	# boss bar
	var boss = world.current_boss()
	boss_box.visible = boss != null
	if boss != null:
		boss_l.text = "BRUTE" if boss.ztype == "brute" else "ABOMINATION"
		boss_bar.value = boss.hp_frac * 100.0

	score_panel.visible = Input.is_action_pressed("scoreboard") and not world.game_over
	if score_panel.visible:
		_fill_scoreboard(score_grid)


func _unhandled_input(event: InputEvent) -> void:
	if world and event.is_action_pressed("pause"):
		toggle_pause()
		get_viewport().set_input_as_handled()


func _tally(n: int) -> String:
	if n <= 0:
		return ""
	if n <= 5:
		return "I".repeat(n)
	return str(n)


func _fill_scoreboard(grid: GridContainer) -> void:
	for c in grid.get_children():
		c.queue_free()
	for h in ["Player", "Points", "Kills", "Headshots", "Downs"]:
		grid.add_child(UI.label(h, 18, UI.DIM))
	for row in world.team_rows(true):
		grid.add_child(UI.label(row.name, 22, UI.GOLD if row.me else UI.BONE))
		grid.add_child(UI.label(str(row.points), 22))
		grid.add_child(UI.label(str(row.kills), 22))
		grid.add_child(UI.label(str(row.hs), 22))
		grid.add_child(UI.label(str(row.downs), 22))


# ---------------------------------------------------------------- events

func damage_dir(angle: float) -> void:
	dmg_dir.rotation = angle
	dmg_dir_t = 1.0


func set_interact(text: String, progress: float, affordable := true) -> void:
	interact_l.text = text
	interact_l.add_theme_color_override("font_color", UI.BONE if affordable else Color(1.0, 0.45, 0.4))
	interact_bar.visible = progress > 0.0
	interact_bar.value = progress


func center_msg(text: String, color := UI.RED, dur := 2.5) -> void:
	center_l.text = text
	center_l.add_theme_color_override("font_color", color)
	center_l.modulate.a = 1.0
	center_t = dur


func hit_marker(head: bool, kill := false) -> void:
	hit_t = 1.0
	hitmark.add_theme_color_override("font_color", UI.RED if kill else (UI.GOLD if head else Color.WHITE))


func flash_damage(d: float) -> void:
	dmg_alpha = clampf(dmg_alpha + d / 60.0, 0.0, 1.0)


func flash_points() -> void:
	points_flash = 1.0


func popup_points(n: int) -> void:
	if n == 0:
		return
	var l := UI.label("+%d" % n if n > 0 else str(n), 26, UI.GOLD)
	l.position = Vector2(170 + randf_range(-10, 30), -60)
	popups.add_child(l)
	var tw := l.create_tween()
	tw.tween_property(l, "position:y", -130.0, 0.9)
	tw.parallel().tween_property(l, "modulate:a", 0.0, 0.9)
	tw.tween_callback(l.queue_free)


func scope_visible(on: bool) -> void:
	scope.visible = on


func toggle_pause() -> void:
	if world.game_over:
		return
	if pause_panel:
		_close_pause()
		return
	pause_panel = UI.full_rect(ColorRect.new())
	(pause_panel as ColorRect).color = Color(0, 0, 0, 0.6)
	root.add_child(pause_panel)
	var panel := UI.panel()
	pause_panel.add_child(UI.center(panel))
	var v := UI.vbox(14)
	panel.add_child(v)
	v.add_child(UI.label("PAUSED" if world.solo else "MENU", 40, UI.RED, HORIZONTAL_ALIGNMENT_CENTER))
	if not world.solo:
		v.add_child(UI.label("The game keeps running in co-op.", 18, UI.DIM, HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(UI.settings_panel())
	for b in [UI.button("Resume", _close_pause), UI.button("Quit to menu", func(): world.quit_match())]:
		b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		v.add_child(b)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	world.set_paused(true)


func _close_pause() -> void:
	if pause_panel:
		pause_panel.queue_free()
		pause_panel = null
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	world.set_paused(false)


func is_paused() -> bool:
	return pause_panel != null


func show_game_over(title: String, run: Dictionary, host_can_restart: bool) -> void:
	if pause_panel:
		pause_panel.queue_free()
		pause_panel = null
	score_panel.visible = false
	interact_l.text = ""
	down_l.text = ""
	over_panel = UI.full_rect(ColorRect.new())
	(over_panel as ColorRect).color = Color(0.05, 0, 0, 0.75)
	root.add_child(over_panel)
	var panel := UI.panel()
	over_panel.add_child(UI.center(panel))
	var v := UI.vbox(14)
	panel.add_child(v)
	v.add_child(UI.label("GAME OVER", 64, UI.RED, HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(UI.label(title, 26, UI.BONE, HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(UI.label("%s  -  %s  -  %s" % [world.map_name(), Game.diff().name, UI.fmt_time(run.time)], 20, UI.DIM, HORIZONTAL_ALIGNMENT_CENTER))
	var grid := GridContainer.new()
	grid.columns = 5
	grid.add_theme_constant_override("h_separation", 34)
	v.add_child(grid)
	_fill_scoreboard(grid)
	var best: int = int(Game.stats.best_wave.get("%s:%d" % [run.map, run.diff], 0))
	if int(run.wave) >= best and int(run.wave) > 0:
		v.add_child(UI.label("NEW PERSONAL BEST!", 24, UI.GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	var lb_l := UI.label("", 18, UI.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	v.add_child(lb_l)
	if Game.steam_ok:
		lb_l.text = "Uploading to Steam leaderboard..."
	var hb := UI.hbox(14)
	hb.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_child(hb)
	hb.add_child(UI.button("Back to lobby" if Net.is_online() else "Main menu", func(): world.quit_match()))
	if not Net.is_online():
		hb.add_child(UI.button("Play again", func(): world.restart_solo()))
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	set_meta("lb_label", lb_l)


func leaderboard_status(text: String) -> void:
	if has_meta("lb_label"):
		var l = get_meta("lb_label")
		if is_instance_valid(l):
			l.text = text
