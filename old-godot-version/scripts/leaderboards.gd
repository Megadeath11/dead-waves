extends Node
## Steam leaderboards. One board per map + difficulty, plus lifetime kills.
## Score = wave * 100000 + kills (so ties on wave are broken by kills).
## Spacewar (480) lets you create boards on the fly with findOrCreateLeaderboard.

const LIFETIME := "DW_LifetimeKills"
const SCOPE_GLOBAL := 0
const SCOPE_AROUND := 1
const SCOPE_FRIENDS := 2

var _busy := false


func board_name(map_id: String, diff_id: int) -> String:
	return "DW_%s_%s" % [map_id.capitalize(), Game.DIFFS[diff_id].name]


static func encode(wave: int, kills: int) -> int:
	return wave * 100000 + mini(kills, 99999)


static func decode(score: int) -> Vector2i:
	return Vector2i(score / 100000, score % 100000)


func _lock() -> void:
	while _busy:
		await get_tree().process_frame
	_busy = true


func _wait(st: Dictionary, timeout: float) -> void:
	var t := 0.0
	while not st.done and t < timeout:
		await get_tree().process_frame
		t += get_process_delta_time()


func _find(board: String) -> int:
	var st := {"done": false, "h": 0}
	var cb := func(handle, found):
		st.done = true
		st.h = int(handle) if int(found) == 1 else 0
	Game.steam.connect("leaderboard_find_result", cb)
	Game.steam.findOrCreateLeaderboard(board, 2, 1) # descending, numeric
	await _wait(st, 8.0)
	Game.steam.disconnect("leaderboard_find_result", cb)
	return st.h


## Uploads a run. Keeps the player's best score on the board.
func upload_run(map_id: String, diff_id: int, wave: int, kills: int, headshots: int, players: int) -> bool:
	if not Game.steam_ok:
		return false
	await _lock()
	var ok := false
	var h := await _find(board_name(map_id, diff_id))
	if h != 0:
		ok = await _upload(h, encode(wave, kills), PackedInt32Array([wave, kills, headshots, players]), true)
	var h2 := await _find(LIFETIME)
	if h2 != 0:
		await _upload(h2, int(Game.stats.kills), PackedInt32Array(), false)
	_busy = false
	return ok


func _upload(handle: int, score: int, details: PackedInt32Array, keep_best: bool) -> bool:
	var st := {"done": false, "ok": false}
	var cb := func(success, _h, _score):
		st.done = true
		st.ok = int(success) == 1
	Game.steam.connect("leaderboard_score_uploaded", cb)
	Game.steam.uploadLeaderboardScore(score, keep_best, details, handle)
	await _wait(st, 8.0)
	Game.steam.disconnect("leaderboard_score_uploaded", cb)
	return st.ok


## Returns [{rank, id, name, score, details}] or [] on failure.
func fetch(board: String, scope: int) -> Array:
	if not Game.steam_ok:
		return []
	await _lock()
	var rows := []
	var h := await _find(board)
	if h != 0:
		var st := {"done": false, "entries": []}
		var cb := func(_msg, _handle, entries):
			st.done = true
			st.entries = entries if typeof(entries) == TYPE_ARRAY else []
		Game.steam.connect("leaderboard_scores_downloaded", cb)
		match scope:
			SCOPE_AROUND:
				Game.steam.downloadLeaderboardEntries(-5, 5, 1, h)
			SCOPE_FRIENDS:
				Game.steam.downloadLeaderboardEntries(0, 0, 2, h)
			_:
				Game.steam.downloadLeaderboardEntries(1, 20, 0, h)
		await _wait(st, 10.0)
		Game.steam.disconnect("leaderboard_scores_downloaded", cb)
		for e in st.entries:
			if typeof(e) != TYPE_DICTIONARY:
				continue
			var id := int(e.get("steam_id", 0))
			rows.append({"rank": int(e.get("global_rank", 0)), "id": id, "name": Game.persona_name(id),
				"score": int(e.get("score", 0)), "details": e.get("details", PackedInt32Array())})
	_busy = false
	return rows
