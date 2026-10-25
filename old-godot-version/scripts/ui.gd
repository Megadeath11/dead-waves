extends RefCounted
## Small UI toolkit used by the menu and the HUD.

const RED := Color(0.85, 0.12, 0.1)
const BLOOD := Color(0.55, 0.05, 0.04)
const BONE := Color(0.93, 0.9, 0.82)
const DIM := Color(0.62, 0.6, 0.56)
const GOLD := Color(1.0, 0.82, 0.3)

static var _theme: Theme


static func theme() -> Theme:
	if _theme:
		return _theme
	var t := Theme.new()
	t.default_font_size = 20
	var normal := _flat(Color(0.09, 0.08, 0.08, 0.92), Color(0.35, 0.08, 0.06), 2)
	var hover := _flat(Color(0.2, 0.06, 0.05, 0.95), RED, 2)
	var pressed := _flat(Color(0.35, 0.05, 0.04, 1.0), RED, 2)
	var disabled := _flat(Color(0.07, 0.07, 0.07, 0.7), Color(0.2, 0.2, 0.2), 1)
	for type in ["Button", "OptionButton", "CheckBox"]:
		t.set_stylebox("normal", type, normal)
		t.set_stylebox("hover", type, hover)
		t.set_stylebox("pressed", type, pressed)
		t.set_stylebox("focus", type, _flat(Color(0, 0, 0, 0), RED, 1))
		t.set_stylebox("disabled", type, disabled)
		t.set_color("font_color", type, BONE)
		t.set_color("font_hover_color", type, Color.WHITE)
		t.set_color("font_pressed_color", type, Color.WHITE)
		t.set_color("font_disabled_color", type, Color(0.4, 0.4, 0.4))
	t.set_color("font_color", "Label", BONE)
	t.set_color("font_outline_color", "Label", Color(0, 0, 0, 0.85))
	t.set_constant("outline_size", "Label", 4)
	var panel := _flat(Color(0.05, 0.045, 0.045, 0.9), Color(0.3, 0.07, 0.05), 2)
	panel.content_margin_left = 22
	panel.content_margin_right = 22
	panel.content_margin_top = 18
	panel.content_margin_bottom = 18
	t.set_stylebox("panel", "PanelContainer", panel)
	t.set_stylebox("panel", "PopupMenu", panel)
	var slider_bg := _flat(Color(0.2, 0.2, 0.2), Color(0, 0, 0, 0), 0)
	slider_bg.content_margin_top = 3
	slider_bg.content_margin_bottom = 3
	t.set_stylebox("slider", "HSlider", slider_bg)
	t.set_stylebox("grabber_area", "HSlider", _flat(RED, Color(0, 0, 0, 0), 0))
	t.set_stylebox("grabber_area_highlight", "HSlider", _flat(RED.lightened(0.2), Color(0, 0, 0, 0), 0))
	t.set_stylebox("panel", "ScrollContainer", StyleBoxEmpty.new())
	_theme = t
	return t


static func _flat(bg: Color, border: Color, bw: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.border_width_bottom = bw
	sb.border_width_left = 0 if bw < 2 else 1
	sb.border_width_right = 0 if bw < 2 else 1
	sb.border_width_top = 0 if bw < 2 else 1
	sb.content_margin_left = 16
	sb.content_margin_right = 16
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	sb.corner_radius_top_left = 2
	sb.corner_radius_top_right = 2
	sb.corner_radius_bottom_left = 2
	sb.corner_radius_bottom_right = 2
	return sb


static func label(text: String, size := 20, color := BONE, align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_constant_override("outline_size", maxi(4, size / 8))
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	l.horizontal_alignment = align
	return l


static func button(text: String, cb: Callable, min_w := 280, size := 22) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(min_w, 48)
	b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	b.add_theme_font_size_override("font_size", size)
	b.pressed.connect(func():
		Sfx.play("hit", -10.0, 0.6)
		cb.call())
	return b


static func vbox(sep := 10) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	return v


static func hbox(sep := 10) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	return h


static func panel() -> PanelContainer:
	return PanelContainer.new()


static func slider(min_v: float, max_v: float, step: float, value: float, cb: Callable) -> HSlider:
	var s := HSlider.new()
	s.min_value = min_v
	s.max_value = max_v
	s.step = step
	s.value = value
	s.custom_minimum_size = Vector2(260, 28)
	s.value_changed.connect(cb)
	return s


static func option(items: Array, selected: int, cb: Callable) -> OptionButton:
	var o := OptionButton.new()
	for i in items.size():
		o.add_item(str(items[i]), i)
	o.select(selected)
	o.custom_minimum_size = Vector2(200, 44)
	o.item_selected.connect(cb)
	return o


## Settings rows shared by the main menu and the pause menu.
static func settings_panel(on_change: Callable = Callable()) -> VBoxContainer:
	var v := vbox(14)
	var rows := [
		["Mouse sensitivity", 0.05, 1.0, 0.01, "sens"],
		["Field of view", 65.0, 110.0, 1.0, "fov"],
		["Volume", 0.0, 1.0, 0.01, "volume"],
	]
	for r in rows:
		var h := hbox(16)
		var key: String = r[4]
		var name_l := label(r[0], 20)
		name_l.custom_minimum_size = Vector2(220, 0)
		var val_l := label(_fmt(key, Game.settings[key]), 20, DIM)
		val_l.custom_minimum_size = Vector2(70, 0)
		var s := slider(r[1], r[2], r[3], float(Game.settings[key]), func(value):
			Game.settings[key] = value
			val_l.text = _fmt(key, value)
			Game.apply_settings()
			Game.save_settings()
			if on_change.is_valid():
				on_change.call())
		h.add_child(name_l)
		h.add_child(s)
		h.add_child(val_l)
		v.add_child(h)
	var fs := CheckBox.new()
	fs.text = "Fullscreen"
	fs.button_pressed = bool(Game.settings.fullscreen)
	fs.toggled.connect(func(on):
		Game.settings.fullscreen = on
		Game.apply_settings()
		Game.save_settings())
	v.add_child(fs)
	return v


static func _fmt(key: String, value) -> String:
	match key:
		"fov":
			return str(int(value))
		"volume":
			return "%d%%" % int(float(value) * 100.0)
		_:
			return "%.2f" % float(value)


static func full_rect(c: Control) -> Control:
	c.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	return c


static func center(c: Control) -> CenterContainer:
	var cc := CenterContainer.new()
	full_rect(cc)
	cc.add_child(c)
	return cc


static func fmt_time(sec: float) -> String:
	var s := int(sec)
	if s >= 3600:
		return "%dh %02dm" % [s / 3600, (s % 3600) / 60]
	return "%dm %02ds" % [s / 60, s % 60]
