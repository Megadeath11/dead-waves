extends Node
## Test double for the GodotSteam singleton. Two game processes exchange P2P
## packets through a shared folder so co-op can be tested without Steam.
## Enabled by setting DW_FAKE_STEAM=<my id> and DW_FAKE_DIR=<folder>.

signal lobby_created(result, lobby_id)
signal lobby_joined(lobby_id, permissions, locked, response)
signal lobby_chat_update(lobby_id, changed_id, making_change_id, chat_state)
signal lobby_match_list(lobbies)
signal lobby_data_update(success, lobby_id, member_id)
signal join_requested(lobby_id, steam_id)
signal p2p_session_request(remote_id)
signal p2p_session_connect_fail(remote_id, err)
signal leaderboard_find_result(handle, found)
signal leaderboard_score_uploaded(success, handle, score)
signal leaderboard_scores_downloaded(message, handle, entries)

var my_id := 0
var dir := ""
var members := [1001, 1002]
var data := {}
var seq := 0
var pending: Array = []


func _init(id: int, folder: String) -> void:
	my_id = id
	dir = folder
	DirAccess.make_dir_recursive_absolute(dir)


func run_callbacks() -> void:
	pass

func getSteamID() -> int: return my_id
func getPersonaName() -> String: return "Tester%d" % my_id
func getFriendPersonaName(id: int) -> String: return "Tester%d" % id
func requestUserInformation(_id: int, _n: bool) -> bool: return true
func allowP2PPacketRelay(_a: bool) -> bool: return true
func setLobbyJoinable(_l: int, _j: bool) -> bool: return true
func setLobbyData(_l: int, k: String, v: String) -> bool:
	data[k] = v
	return true
func getLobbyData(_l: int, k: String) -> String: return str(data.get(k, ""))
func getLobbyOwner(_l: int) -> int: return members[0]
func getNumLobbyMembers(_l: int) -> int: return members.size()
func getLobbyMemberByIndex(_l: int, i: int) -> int: return members[i]
func leaveLobby(_l: int) -> void: pass
func closeP2PSessionWithUser(_id: int) -> bool: return true
func acceptP2PSessionWithUser(_id: int) -> bool: return true
func activateGameOverlayInviteDialog(_l: int) -> void: pass
func addRequestLobbyListStringFilter(_k, _v, _c) -> void: pass
func addRequestLobbyListDistanceFilter(_d) -> void: pass
func requestLobbyList() -> void: lobby_match_list.emit.call_deferred([])
func createLobby(_t: int, _m: int) -> void: lobby_created.emit.call_deferred(1, 777)
func joinLobby(l: int) -> void: lobby_joined.emit.call_deferred(l, 0, false, 1)


func sendP2PPacket(to: int, bytes: PackedByteArray, _mode: int, _ch: int) -> bool:
	seq += 1
	var name := "%d_%d_%010d" % [to, my_id, seq]
	var tmp := dir.path_join(name + ".tmp")
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	f.store_buffer(bytes)
	f.close()
	DirAccess.rename_absolute(tmp, dir.path_join(name + ".bin"))
	return true


func _scan() -> void:
	if not pending.is_empty():
		return
	var files := DirAccess.get_files_at(dir)
	var mine := []
	for f in files:
		if f.begins_with("%d_" % my_id) and f.ends_with(".bin"):
			mine.append(f)
	mine.sort()
	pending = mine


func getAvailableP2PPacketSize(_ch: int) -> int:
	_scan()
	if pending.is_empty():
		return 0
	var path := dir.path_join(pending[0])
	return maxi(1, int(FileAccess.get_file_as_bytes(path).size()))


func readP2PPacket(_size: int, _ch: int) -> Dictionary:
	_scan()
	if pending.is_empty():
		return {}
	var name: String = pending.pop_front()
	var path := dir.path_join(name)
	var bytes := FileAccess.get_file_as_bytes(path)
	DirAccess.remove_absolute(path)
	var from := int(name.split("_")[1])
	return {"data": bytes, "steam_id_remote": from}


func findOrCreateLeaderboard(_n: String, _s: int, _d: int) -> void:
	leaderboard_find_result.emit.call_deferred(4242, 1)

func uploadLeaderboardScore(score: int, _keep: bool, _det, h: int) -> void:
	leaderboard_score_uploaded.emit.call_deferred(1, h, {"score": score})

func downloadLeaderboardEntries(_a: int, _b: int, _t: int, h: int) -> void:
	leaderboard_scores_downloaded.emit.call_deferred("ok", h, [{"score": 500012, "steam_id": my_id, "global_rank": 1, "details": PackedInt32Array([5, 12, 3, 2])}])
