extends Node
## Procedurally synthesised sound effects (no audio assets needed).

const RATE := 22050
var sounds := {}


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_build()


func play(sname: String, vol_db := 0.0, pitch := 1.0) -> void:
	if not sounds.has(sname) or get_child_count() > 64:
		return
	var p := AudioStreamPlayer.new()
	p.stream = sounds[sname]
	p.volume_db = vol_db
	p.pitch_scale = pitch * randf_range(0.96, 1.04)
	add_child(p)
	p.play()
	p.finished.connect(p.queue_free)


func play3d(sname: String, pos: Vector3, vol_db := 0.0, pitch := 1.0, max_dist := 45.0) -> void:
	if not sounds.has(sname) or get_child_count() > 64:
		return
	var p := AudioStreamPlayer3D.new()
	p.stream = sounds[sname]
	p.volume_db = vol_db
	p.pitch_scale = pitch * randf_range(0.93, 1.07)
	p.max_distance = max_dist
	p.unit_size = 6.0
	add_child(p)
	p.global_position = pos
	p.play()
	p.finished.connect(p.queue_free)


var _ambience: AudioStreamWAV


## Looping eerie drone for matches (built on first use).
func ambience() -> AudioStreamWAV:
	if _ambience:
		return _ambience
	var dur := 12.0
	var w := [0.0]
	_ambience = _wav(dur, func(t):
		var lfo: float = 0.5 + 0.5 * sin(TAU * t / dur)
		var lfo2: float = 0.5 + 0.5 * sin(TAU * 3.0 * t / dur + 1.0)
		var drone: float = sin(TAU * 55.0 * t) * 0.5 + sin(TAU * 82.5 * t) * 0.3 * lfo + sin(TAU * 110.25 * t) * 0.12 * lfo2
		var wind: float = _lp(w, 0.02) * (0.6 + 0.4 * lfo2) * 3.0
		return (drone * 0.35 + wind * 0.25) * 0.8)
	_ambience.loop_mode = AudioStreamWAV.LOOP_FORWARD
	_ambience.loop_begin = 0
	_ambience.loop_end = int(dur * RATE)
	return _ambience


# ---------------------------------------------------------------- synthesis

func _wav(dur: float, fn: Callable) -> AudioStreamWAV:
	var n := int(dur * RATE)
	var data := PackedByteArray()
	data.resize(n * 2)
	for i in n:
		var t := float(i) / RATE
		var v: float = clampf(fn.call(t), -1.0, 1.0)
		data.encode_s16(i * 2, int(v * 32000.0))
	var s := AudioStreamWAV.new()
	s.format = AudioStreamWAV.FORMAT_16_BITS
	s.mix_rate = RATE
	s.stereo = false
	s.data = data
	return s


static func _lp(state: Array, k: float) -> float:
	state[0] = lerpf(state[0], randf_range(-1.0, 1.0), k)
	return state[0]


func _build() -> void:
	var a := [0.0]
	sounds["shot_light"] = _wav(0.22, func(t): return _lp(a, 0.55) * exp(-t * 28.0) * 1.1 + sin(TAU * 120.0 * t) * exp(-t * 35.0) * 0.6)
	var b := [0.0]
	sounds["shot_heavy"] = _wav(0.38, func(t): return _lp(b, 0.35) * exp(-t * 15.0) * 1.3 + sin(TAU * 70.0 * t) * exp(-t * 18.0) * 0.8)
	var c := [0.0]
	sounds["shot_shotgun"] = _wav(0.55, func(t): return _lp(c, 0.25) * exp(-t * 8.0) * 1.4 + sin(TAU * 55.0 * t) * exp(-t * 11.0) * 0.9)
	var d := [0.0]
	sounds["shot_sniper"] = _wav(0.8, func(t): return _lp(d, 0.3) * exp(-t * 7.0) * 1.4 + sin(TAU * 42.0 * t) * exp(-t * 6.0))
	sounds["shot_ray"] = _wav(0.32, func(t): return signf(sin(TAU * (1500.0 * t - 2000.0 * t * t))) * exp(-t * 9.0) * 0.35 + sin(TAU * (900.0 * t - 1000.0 * t * t)) * exp(-t * 7.0) * 0.4)
	var e := [0.0]
	sounds["hit"] = _wav(0.07, func(t): return sin(TAU * 1700.0 * t) * exp(-t * 70.0) * 0.45 + _lp(e, 0.8) * exp(-t * 90.0) * 0.3)
	sounds["headshot"] = _wav(0.14, func(t): return sin(TAU * 2600.0 * t) * exp(-t * 30.0) * 0.45 + sin(TAU * 3900.0 * t) * exp(-t * 45.0) * 0.2)
	var f := [0.0]
	sounds["reload"] = _wav(0.4, func(t): return _lp(f, 0.9) * (exp(-t * 110.0) + (exp(-(t - 0.25) * 110.0) if t > 0.25 else 0.0)) * 0.7)
	sounds["empty"] = _wav(0.05, func(t): return randf_range(-1.0, 1.0) * exp(-t * 150.0) * 0.4)
	var g := [0.0]
	sounds["groan"] = _wav(1.1, func(t):
		var ph: float = 85.0 * t - 12.0 / (TAU * 3.0) * cos(TAU * 3.0 * t)
		var saw: float = 2.0 * fposmod(ph, 1.0) - 1.0
		var env: float = pow(sin(PI * t / 1.1), 1.5)
		return (saw * 0.45 + _lp(g, 0.12) * 0.5) * env * 0.55)
	var h := [0.0]
	sounds["growl_boss"] = _wav(1.7, func(t):
		var ph: float = 48.0 * t - 8.0 / (TAU * 2.0) * cos(TAU * 2.0 * t)
		var saw: float = 2.0 * fposmod(ph, 1.0) - 1.0
		var env: float = pow(sin(PI * t / 1.7), 1.2)
		return (saw * 0.6 + _lp(h, 0.08) * 0.7) * env * 0.8)
	var i := [0.0]
	sounds["explode"] = _wav(1.3, func(t): return _lp(i, 0.08) * exp(-t * 3.2) * 2.2 + sin(TAU * 38.0 * t) * exp(-t * 4.5))
	var j := [0.0]
	sounds["slam"] = _wav(1.0, func(t): return _lp(j, 0.05) * exp(-t * 4.0) * 2.4 + sin(TAU * 30.0 * t) * exp(-t * 3.5) * 1.1)
	var k := [0.0]
	sounds["hurt"] = _wav(0.25, func(t): return sin(TAU * (160.0 * t - 150.0 * t * t)) * exp(-t * 12.0) * 0.6 + _lp(k, 0.3) * exp(-t * 20.0) * 0.4)
	sounds["buy"] = _wav(0.4, func(t):
		var v: float = sin(TAU * 660.0 * t) * exp(-t * 12.0)
		if t > 0.12:
			v += sin(TAU * 990.0 * t) * exp(-(t - 0.12) * 10.0)
		return v * 0.35)
	sounds["deny"] = _wav(0.22, func(t): return signf(sin(TAU * 130.0 * t)) * 0.2 * (1.0 - t / 0.22))
	sounds["wave_start"] = _wav(2.6, func(t):
		var env: float = minf(t * 4.0, 1.0) * exp(-t * 1.1)
		return (sin(TAU * 110.0 * t) + sin(TAU * 116.5 * t) * 0.8 + sin(TAU * 55.0 * t) * 0.7 + sin(TAU * 164.8 * t) * 0.3) * env * 0.28)
	sounds["wave_end"] = _wav(2.0, func(t):
		var notes := [392.0, 466.2, 587.3, 784.0]
		var v := 0.0
		for n in 4:
			var t0: float = n * 0.18
			if t > t0:
				v += sin(TAU * notes[n] * t) * exp(-(t - t0) * 3.0)
		return v * 0.18)
	sounds["pickup"] = _wav(0.55, func(t):
		var notes := [523.3, 659.3, 784.0, 1046.5]
		var n: int = mini(int(t / 0.1), 3)
		return sin(TAU * notes[n] * t) * exp(-fmod(t, 0.1) * 8.0) * 0.35)
	var l := [0.0]
	sounds["knife"] = _wav(0.22, func(t): return _lp(l, 0.6) * sin(PI * t / 0.22) * 0.6)
	var m := [0.0]
	sounds["door"] = _wav(1.0, func(t): return _lp(m, 0.15) * sin(PI * t) * 0.6 + sin(TAU * 60.0 * t) * exp(-t * 3.0) * 0.4)
	var n2 := [0.0]
	sounds["acid"] = _wav(0.6, func(t): return _lp(n2, 0.5) * exp(-t * 5.0) * (0.5 + 0.5 * sin(TAU * 28.0 * t)) * 0.7)
	var dg := [0.0]
	sounds["dig"] = _wav(0.7, func(t): return _lp(dg, 0.12) * (0.4 + 0.6 * absf(sin(TAU * 7.0 * t))) * exp(-t * 3.0) * 0.9)
	var st := [0.0]
	sounds["step"] = _wav(0.09, func(t): return _lp(st, 0.25) * exp(-t * 45.0) * 0.8 + sin(TAU * 70.0 * t) * exp(-t * 50.0) * 0.4)
	sounds["box_spin"] = _wav(2.7, func(t):
		var notes := [783.99, 659.25, 523.25, 659.25, 783.99, 1046.5, 987.77, 783.99, 659.25, 698.46, 587.33, 523.25, 659.25]
		var step := 0.2
		var n: int = mini(int(t / step), notes.size() - 1)
		var lt: float = t - n * step
		var fq: float = notes[n]
		return (sin(TAU * fq * t) + sin(TAU * fq * 2.0 * t) * 0.3) * exp(-lt * 9.0) * 0.3)
	sounds["throw"] = _wav(0.2, func(t): return randf_range(-1.0, 1.0) * sin(PI * t / 0.2) * 0.25)
	sounds["melee_hit"] = _wav(0.15, func(t): return sin(TAU * 90.0 * t) * exp(-t * 25.0) * 0.8 + randf_range(-1.0, 1.0) * exp(-t * 40.0) * 0.4)
