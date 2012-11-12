function get_cache(callback) {
	portRequest({method: "get_cache", handler: 'facebook'}, function (msg) {
		console.log(JSON.stringify(msg));
		if (msg.error) {
			UI.error(msg.error_msg);
			return;
		} else {
			callback(msg);
		}
	});
}


function print_stored_map() {
	pluginCall({
		caller: 'print_stored_map',
		method: 'gpg_associatedKeys', 
		args: []
	}, function (users) {

		if (users.error === true) {
			UI.error("Error loading associated keys:" + users.error_msg);
			return;
		}

		get_cache(function(cache) {
			var rows = [],
			friends = cache.friends;
			$.each(users.response, function(id, key_id) {
				var friend_name = friends[id];
				rows.push("<tr><td>");
				rows.push(friend_name);
				rows.push("</td><td>");
				rows.push(id);
				rows.push("</td><td>");
				rows.push(key_id);
				rows.push('</td><td class="centered"><a class="keylist_remove" data-id="');
				rows.push(id);
				rows.push('"><i class="icon-minus-sign"></i></a></td></tr>');
			});
			if (rows.length > 0) {
				$("#user_list").replaceWith('<table class="table table-bordered table-striped"><thead><tr><th>Name</th><th>ID</th><th>PGP Key-ID</th><th>Remove</th></tr></thead><tbody>' + rows.join("") + '</tbody></table>');
				$(".keylist_remove").click(function() {
					var id = $(this).attr("data-id");
					keylist_remove(id);
				});
			}
		});

	});


}

function keylist_remove(userid) {
	if (confirm("Do you want to disable the GPG key mapping for user " + userid + "?")) {
		pluginCall({
			caller: 'keylist_remove',
			method: 'gpg_remove_key', 
			args: [userid]
		}, function () {
			location.reload(true);
		});

	}
}

function import_pgp_key(userid, keydata, is_keyblock) {
	pluginCall({
		caller: 'import_pgp_key',
		method: 'gpg_import_key', 
		args: [keydata, is_keyblock]
	}, function (msg) {
		var result = msg.response;
		if (!result || result.error) {
			UI.error("Could not import key. Error was: " + result.error_msg);
		} else if (Object.size(result) === 1) {
			var imported_key = Object.pop(result);
			pluginCall({
				caller: 'keylist_remove',
				method: 'gpg_store_keyid', 
				args: [userid, imported_key.fingerprint]
			}, function () {
				print_stored_map();
			});
		} else {
			UI.error("Found none or multiple keys for " + userid + ": " + JSON.stringify(result) + " . Insert mapping manually");
		}
	});

}

function parsePGPkey(data) {
	if (!data.hasOwnProperty("message")) {
		return;
	}
	var keyid = data.message.toLowerCase().match(/0x[a-z0-9]+/i);
	if (keyid[0]) {
		$.get("http://pgp.mit.edu:11371/pks/lookup", {op : "get", search : keyid[0]}, function (response) {
			var key_result = $(response).filter("pre");
			if (key_result && key_result.length > 0) {
				import_pgp_key(data.actor_id.toString(), key_result[0].innerText, true);
			} else {
				console.log("No key found for keyid: " + keyid);
			}
		});
	}
}

print_stored_map();

/** Create autocomplete cache for friends */
get_cache(function(cache) {
	var friends = cache.friends;
	if (Object.size(friends) === 0) {
		UI.setFormDisabled("#create_user_map", true);
		return;
	}

	var users_typeahead = [], 
	users_id_map = {};

	$.each(friends, function (id, name) {
		users_typeahead.push(name);
		users_id_map[name] = id;
	});
	$("#friend_name").typeahead({
		"source": users_typeahead,
		"items": 5,
	});

	$("#btn-create-mapping").click(function () {
		$("#create_user_success").hide();
		UI.resetFormErrors();
		var user = {};

		if (!$("#friend_name").val()) {
			return formError("#friend_name", "No user name specified");
		}
		user.name = $("#friend_name").val();
		user.id = users_id_map[user.name];
		if (!user.id) {
			return formError("#friend_name", "User id for user " + user.name + " not found.");
		}

		if ($("#key_id").val()) {
			user.key_id = $("#key_id").val().split(" ").join(""); // remove spaces from fingerprint
			import_pgp_key(user.id, user.key_id, false);
		} else if ($("#key_block").val()) {
			var key_data = $("#key_block").val();
			import_pgp_key(user.id, key_data, false);
		} else {
			return formError("#key_block", "You need to insert either a existing key id or a new key data block");
		}
		return false;
	});
});



// mapping refresh
$("#user_mapping_refresh").click(function () {
	$(this).button('loading');//AND app_id=281109321931593 
	query = "SELECT post_id, actor_id, target_id, message FROM stream WHERE filter_key = 'others' AND strpos(lower(message), 'My PGP-Key:')"; //AND NOT actor_id=me()";
	bm.osn.getFBData("https://api.facebook.com/method/fql.query?format=json&query=" + encodeURIComponent(query), function (data) {
		if (data.length > 0) {
			for (var i = 0, len = data.length; i < len; i++) {
				parsePGPkey(data[i]);
			}
		} else {
			console.log("No keys found.");
			console.log(data);
		}
	});
});

// Get private PGP keys
pluginCall({
	caller: 'usersjs.init',
	method: 'gpg_search_keys', 
	args: ["", 1]
}, function (msg) {
	var keys = msg.response;
	if (Object.size(keys) > 0) {
		var options = [];
		$.each(keys, function (id, keydata) {
			options.push('<option value="' + id + '">' + keydata.name + ' (' + id + ')</option>');
		});
		$("#key-select").removeAttr("disabled").empty().append(options.join(""));
		$("#upload-key-btn").removeAttr("disabled")
		.click(function() {
			portRequest({
				method: 'publish_key',
				handler: 'facebook',
				keyid: $("#key-select").val()
			}, function (response) {location.reload(true);});
			return false;
		});
	}
});



// Check PGP keys from FB
portRequest({method: 'get_published_keys', handler: 'facebook'}, function(msg) {
	if (msg.error) {
		UI.error(msg.error_msg);
		return;
	}

	if (msg.response) {
		$("#key-info").val(msg.response.keyid);
		$("#remove-key-btn").removeAttr("disabled").attr("data-posts", JSON.stringify(msg.response.all_keys))
		.click(function (e) {
			var data = JSON.parse($(this).attr("data-posts"));
			$.each(data, function(i, post) {
				self.port.emit("remove_post", {handler: 'facebook', id: post.post_id});
			});
			location.reload(true);
		});
		$("#btn_lookup_key").attr("href", msg.response.link);
	} else {
		$("#key-info").val("None published");
		$("#btn_lookup_key").click(function() { return false; });
	}
});
