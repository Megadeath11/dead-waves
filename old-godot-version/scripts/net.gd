extends Node
## Steam lobbies + Steam P2P messaging. Everything is sent as
## var_to_bytes([type, payload]) on channel 0. The lobby owner is the host:
## it simulates zombies and waves; everyone simulates their own player.

signal lobby_updated
signal lobby_list_received(lobbies: Array)
signal lobby_error(msg: String)
signal match_start(cfg: Dictionary)
signal packet(sender: int, type: String, data)
signal player_left(id: int)
signal host_left

const SEND_UNRELIABLE := 0
const SEND_RELIABLE := 2

var lobby_id: int = 0
var host_id: int = 0
var members: Array = [] # [{id, name}]
var in_match := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	if not Game.steam_ok:
		return
	var s = Game.steam
	s.connect("lobby_created", _on_lobby_created)
	s.connect("lobby_joined", _on_lobby_joined)
	s.connect("lobby_chat_update", _on_lobby_chat_update)
	s.connect("lobby_match_list", _on_lobby_match_list)
	s.connect("lobby_data_update", _on_lobby_data_update)
	s.connect("join_requested", _on_join_requested)
	s.connect("p2p_session_request", _on_p2p_session_request)
	s.connect("p2p_session_connect_fail", _on_p2p_fail)
	s.allowP2PPacketRelay(true)
	# Launched from a Steam invite while the game was closed.
	var args := OS.get_cmdline_args()
	for idx in args.size():
		if args[idx] == "+connect_lobby" and idx + 1 < args.size():
			call_deferred("join_lobby", int(args[idx + 1]))


func is_online() -> bool:
	return lobby_id != 0


func is_host() -> bool:
	return lobby_id == 0 or host_id == Game.my_id


func member_ids() -> Array:
	var out := []
	for m in members:
		out.append(int(m.id))
	if out.is_empty():
		out.append(Game.my_id)
	return out


# ---------------------------------------------------------------- lobbies

func host_lobby() -> void:
	if not Game.steam_ok:
		lobby_error.emit("Steam isn't running, so co-op is unavailable.")
		return
	if lobby_id != 0:
		leave_lobby()
	Game.steam.createLobby(2, 4) # public, 4 players


func find_lobbies() -> void:
	if not Game.steam_ok:
		lobby_error.emit("Steam isn't running.")
		return
	Game.steam.addRequestLobbyListStringFilter("game", Game.GAME_TAG, 0)
	Game.steam.addRequestLobbyListDistanceFilter(3)
	Game.steam.requestLobbyList()


func join_lobby(id: int) -> void:
	if not Game.steam_ok:
		return
	if lobby_id != 0 and lobby_id != id:
		leave_lobby()
	Game.steam.joinLobby(id)


func leave_lobby() -> void:
	if lobby_id == 0:
		return
	if Game.steam_ok:
		Game.steam.leaveLobby(lobby_id)
		for m in members:
			if int(m.id) != Game.my_id:
				Game.steam.closeP2PSessionWithUser(int(m.id))
	lobby_id = 0
	host_id = 0
	members.clear()
	in_match = false
	lobby_updated.emit()


func invite_friends() -> void:
	if Game.steam_ok and lobby_id != 0:
		Game.steam.activateGameOverlayInviteDialog(lobby_id)


func push_config() -> void:
	if lobby_id == 0 or not is_host():
		return
	Game.steam.setLobbyData(lobby_id, "map", Game.map_id)
	Game.steam.setLobbyData(lobby_id, "diff", str(Game.diff_id))
	Game.steam.setLobbyData(lobby_id, "state", "ingame" if in_match else "lobby")


func lobby_value(key: String) -> String:
	if lobby_id == 0 or not Game.steam_ok:
		return ""
	return str(Game.steam.getLobbyData(lobby_id, key))


func start_match() -> void:
	var cfg := {"map": Game.map_id, "diff": Game.diff_id, "seed": randi(), "players": member_ids()}
	if lobby_id != 0:
		in_match = true
		Game.steam.setLobbyJoinable(lobby_id, false)
		push_config()
		send_all("start", cfg)
	match_start.emit(cfg)


func end_match() -> void:
	in_match = false
	if lobby_id != 0 and is_host():
		Game.steam.setLobbyJoinable(lobby_id, true)
		push_config()


func _on_lobby_created(result: int, id: int) -> void:
	if result != 1:
		lobby_error.emit("Couldn't create a lobby (Steam result %d)." % result)
		return
	lobby_id = id
	Game.steam.setLobbyJoinable(id, true)
	Game.steam.setLobbyData(id, "game", Game.GAME_TAG)
	Game.steam.setLobbyData(id, "name", Game.my_name + "'s game")
	push_config()


func _on_lobby_joined(id: int, _permissions: int, _locked: bool, response: int) -> void:
	if response != 1:
		var why := {2: "it no longer exists", 3: "you aren't allowed in", 4: "it's full", 6: "you're banned"}
		lobby_error.emit("Couldn't join lobby: %s." % why.get(response, "error %d" % response))
		return
	lobby_id = id
	_refresh_members()
	if not is_host():
		var m = lobby_value("map")
		if m != "":
			Game.map_id = m
		Game.diff_id = int(lobby_value("diff"))
		send_to(host_id, "hello", {"name": Game.my_name})
	lobby_updated.emit()


func _on_lobby_chat_update(id: int, changed_id: int, _maker: int, state: int) -> void:
	if id != lobby_id:
		return
	var old_host := host_id
	_refresh_members()
	if state & (2 | 4 | 8 | 16):
		if Game.steam_ok:
			Game.steam.closeP2PSessionWithUser(changed_id)
		player_left.emit(changed_id)
		if changed_id == old_host and in_match:
			host_left.emit()
	lobby_updated.emit()


func _on_lobby_data_update(_success, id: int, _member: int) -> void:
	if id != lobby_id or is_host():
		return
	var m := lobby_value("map")
	if m != "":
		Game.map_id = m
	Game.diff_id = int(lobby_value("diff"))
	lobby_updated.emit()


func _on_lobby_match_list(lobbies: Array) -> void:
	var out := []
	for l in lobbies:
		var lid := int(l)
		out.append({
			"id": lid,
			"name": str(Game.steam.getLobbyData(lid, "name")),
			"map": str(Game.steam.getLobbyData(lid, "map")),
			"diff": int(Game.steam.getLobbyData(lid, "diff")),
			"state": str(Game.steam.getLobbyData(lid, "state")),
			"count": int(Game.steam.getNumLobbyMembers(lid)),
		})
	lobby_list_received.emit(out)


func _on_join_requested(id: int, _friend: int) -> void:
	join_lobby(id)


func _on_p2p_session_request(remote_id: int) -> void:
	Game.steam.acceptP2PSessionWithUser(remote_id)


func _on_p2p_fail(remote_id: int, err: int) -> void:
	push_warning("P2P connection to %d failed (error %d)" % [remote_id, err])


func _refresh_members() -> void:
	members.clear()
	if lobby_id == 0:
		return
	host_id = int(Game.steam.getLobbyOwner(lobby_id))
	var n := int(Game.steam.getNumLobbyMembers(lobby_id))
	for idx in n:
		var mid := int(Game.steam.getLobbyMemberByIndex(lobby_id, idx))
		members.append({"id": mid, "name": Game.persona_name(mid)})


# ---------------------------------------------------------------- messaging

func send_to(id: int, type: String, data = null, reliable := true) -> void:
	if lobby_id == 0 or not Game.steam_ok or id == Game.my_id or id == 0:
		return
	var bytes := var_to_bytes([type, data])
	var mode := SEND_RELIABLE if reliable or bytes.size() > 1150 else SEND_UNRELIABLE
	Game.steam.sendP2PPacket(id, bytes, mode, 0)


func send_all(type: String, data = null, reliable := true) -> void:
	if lobby_id == 0:
		return
	for m in members:
		send_to(int(m.id), type, data, reliable)


func send_host(type: String, data = null, reliable := true) -> void:
	send_to(host_id, type, data, reliable)


func _process(_delta: float) -> void:
	if lobby_id == 0 or not Game.steam_ok:
		return
	for _guard in 512:
		var size := int(Game.steam.getAvailableP2PPacketSize(0))
		if size <= 0:
			break
		var p = Game.steam.readP2PPacket(size, 0)
		if typeof(p) != TYPE_DICTIONARY or p.is_empty():
			break
		var sender := int(p.get("steam_id_remote", p.get("remote_steam_id", 0)))
		var raw = p.get("data", PackedByteArray())
		if typeof(raw) != TYPE_PACKED_BYTE_ARRAY or raw.is_empty():
			continue
		var msg = bytes_to_var(raw)
		if typeof(msg) != TYPE_ARRAY or msg.size() != 2 or typeof(msg[0]) != TYPE_STRING:
			continue
		_dispatch(sender, msg[0], msg[1])


func _dispatch(sender: int, type: String, data) -> void:
	match type:
		"hello":
			lobby_updated.emit()
		"start":
			if sender == host_id and typeof(data) == TYPE_DICTIONARY:
				in_match = true
				match_start.emit(data)
		_:
			packet.emit(sender, type, data)
