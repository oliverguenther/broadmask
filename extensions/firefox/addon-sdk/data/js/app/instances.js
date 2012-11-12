function instance_type(val) {
	switch(val) {
		case 1:
			return "Broadcast Encryption (Sender)";
			break;
		case 2:
			return "Broadcast Encryption (Receiver)";
			break;
		case 4:
			return "Shared-Key";
			break;
		default:
			return "unknown";
	}
}

function instance_details(id) {
	portRequest({
		method: 'pluginMultipleCall',
		array: [
			{
				method: 'get_instance_members', 
				args: [id]
			}, 	
			{
				method: 'gpg_associatedKeys', 
				args: []
			}, 	
			{
				method: 'get_instance_descriptor',
				args: [id]
			}
		]
	}, function (response) {
		var members = response.get_instance_members,
		gpg_map = response.gpg_associatedKeys,
		descriptor = response.get_instance_descriptor;

		get_cache(function(cache) {

			var rows = [];
			$("#instancedetail").empty()
			.append('<div class="page-header"><h3>Details <small>for instance ' + descriptor.name + '</small></h3></div>')
			.append('<h3>Identifier</h3><p>' + descriptor.id + ' </p>');
			$.each(members, function (userid, pseudonym) {
				rows.push("<tr id=\"" + userid + "\" data-type=\"detail\" data-instance=\"" + id + "\"><td>" + cache.friends[userid] + "</td>");
				rows.push("<td>" + userid + "</td><td>");
				if (typeof gpg_map === 'object' && gpg_map[userid]) {
					rows.push("<a href=\"#\" class=\"upload_key\" data-instanceid=\"" + id + "\" data-userid=\"" + userid + "\"><i class=\"icon-share\"></i> Publish (<small>PGP key: " + gpg_map[userid] + "</small>)</a><br/>");
					rows.push("<a href=\"#\" class=\"copysk_gpg\" data-id=\"" + userid + "\"><i class=\"icon-lock\"></i> Copy to clipboard (encrypted with PGP)</a></br><br/>");
				}
				rows.push("<a href=\"#\" class=\"copysk\" data-id=\"" + userid + "\"><i class=\"icon-warning-sign\"></i> Copy to clipboard (plaintext)</a>");
				rows.push("</td></tr>");
			});
			if (rows.length > 0) {
				$("#instancedetail").append('<h3>Instance members</h3><table class="table table-bordered table-striped"><thead><tr><th>Name</th><th>Id</th><th>Options</th></tr></thead><tbody>' + rows.join("") + '</tbody></table>');
				

				$(".upload_key").click(function () {
					var userid = $(this).attr("data-userid");
					var instanceid = $(this).attr("data-instanceid");
					upload_key(instanceid, userid);
				});

				$(".copysk").click(function () {
					var userid = $(this).attr("data-id");
					var instanceid = $(this).parent().parent().attr("data-instance");
					get_instance_object(instanceid, userid, function(instmsg) {
						self.port.emit("set_clipboard", JSON.stringify(instmsg));
					});
				});

				$(".copysk_gpg").click(function () {
					var userid = $(this).attr("data-id"),
					instanceid = $(this).parent().parent().attr("data-instance");
					get_instance_object(instanceid, userid, function(instmsg) {
						pluginCall({
							caller: 'print-instances',
							method: 'gpg_encrypt_for', 
							args: [JSON.stringify(instmsg), userid]
						}, function (enc_msg) {
							if (enc_msg.error === true) {
								UI.error("Error encrypting private key for user " + userid + ". Error was: " + instances.error_msg);
							} else {
								self.port.emit("set_clipboard", JSON.stringify(enc_msg.result));
							}
						});

					});
				});

				// Print public key if type == 1
				if (descriptor.type === 1) {
					pluginCall({
						caller: 'print-instances',
						method: 'get_bes_public_params', 
						args: [id]
					}, function (pk) {
						if (pk.error === true) {
							UI.error("Error retrieving public key for instance" + id + ". Error was: " + instances.error_msg);
						} else {
							$("#instancedetail").append("<h3>Public key</h3><p style=\"word-break: break-all\">" + pk.response.result + "</p>");
						}
					});
				}

			}
		});

	});
}

function get_stored_instances(callback) {
	pluginCall({
		caller: 'get_stored_instances',
		method: 'get_stored_instances', 
		args: []
	}, function (instances) {
		if (instances.error === true) {
			UI.error("Error loading instances: " + instances.error_msg);
		} else {
			callback(instances.response);
		}
	});
}

function get_instance_descriptor(id, callback) {
	pluginCall({
		caller: 'get_instance_descriptor',
		method: 'get_instance_descriptor', 
		args: [id]
	}, function (descriptor) {
		if (descriptor.error) {
			UI.error("Couldn't retrieve private key for instance " + id + ". Error was: " + descriptor.error_msg);
		} else {
			callback(descriptor.response);
		}
	});


}

function print_instances() {
	get_stored_instances(function (instances) {

		var rows = [];
		$.each(instances, function(i, instance) {
			rows.push("<tr id=\"" + instance.id + "\"><td>");
			rows.push(instance.name);
			rows.push("</td><td>");
			rows.push(instance_type(instance.type));
			rows.push("</td><td>");
			rows.push((instance.max_users === 0) ? "-" : instance.max_users);
			rows.push('</td><td class="">');
			rows.push('<a class="instance_details" data-id="'+instance.id+'"><i class="icon-cog"></i> Details</a><br/>');
			rows.push('<a class="instance_remove" data-id="'+instance.id+'"><i class="icon-trash"></i> Trash</a><br/>');
			rows.push('</td></tr>');
		});
		if (rows.length > 0) {
			$("#instances").replaceWith('<table class="table table-bordered table-striped"><thead><tr><th>Instance</th><th>Type</th><th>Size</th><th>Options</th></tr></thead><tbody>' + rows.join("") + '</tbody></table>');
			// Instance Button listeners
			$(".instance_details").click(function() {
				var id = $(this).attr("data-id");
				instance_details(id);
			});
			$(".instance_remove").click(function() {
				var id = $(this).attr("data-id");
				instance_remove(id);
			});
		} else {
			$("#instances").replaceWith('<p class="light">No instances have been created</p>');
		}
	});
}




function instance_remove(id) {
	get_stored_instances(function (instances) {
		if (confirm("Do you REALLY want to delete the instance '" + instances[id].name + "' ?")) {
			pluginCall({
				caller: 'print_instances',
				method: 'remove_instance', 
				args: [id]
			}, function () {
				location.reload(true);
			});
		}
	});
}

function get_bes_keys(id, userid, callback) {
	pluginCall({
		caller: 'get_bes_keys',
		method: 'get_bes_public_params', 
		args: [id]
	}, function (pk) {
		if (pk.error === true) {
			UI.error("Error retrieving public key for instance " + id + ". Error was: " + instances.error_msg);
		} else {
			pluginCall({
				caller: 'get_bes_keys',
				method: 'get_member_sk', 
				args: [id, userid]
			}, function (sk) {
				if (sk.error === true) {
					UI.error("Error retrieving public key for instance " + id + ". Error was: " + sk.error_msg);
				} else {
					callback(pk.result, sk.result);
				}
			});	
		}
	});
}

function get_instance_object (instanceid, userid, callback) {
	get_instance_descriptor(instanceid, function (descriptor) {

		var instmsg = {}, sk = {error: true, error_msg: "No result"};
		instmsg.type = "instance";
		instmsg.instance_type = descriptor.type;
		instmsg.id = descriptor.id;
		instmsg.max_users = descriptor.max_users;
		if (descriptor.type === 1) {

			get_bes_keys(instanceid, userid, function(pk, sk) {
				instmsg.sk = sk;
				instmsg.pk = pk;
				callback(instmsg);
			});
		} else if (descriptor.type === 4) {
			pluginCall({
				caller: 'get_instance_object',
				method: 'get_symmetric_key', 
				args: [instanceid]
			}, function (sk) {
				if (sk.error) {
					UI.error("Couldn't retrieve private key for instance " + instanceid + ". Error was: " + sk.error_msg);
				} else {
					instmsg.sk = sk.result;
					callback(instmsg);
				}
			});
		} else {
			UI.error("Descriptor type neither BES sender nor Shared instance? Was " + descriptor.type);
		}
	});
}

function upload_key(instanceid, userid) {
	get_instance_object(instanceid, userid, function(instmsg) {

		pluginCall({
			caller: 'instances-upload-key',
			method: 'gpg_encrypt_for', 
			args: [JSON.stringify(instmsg), userid]
		}, function (msg) {
			var enc_msg = msg.response;
			if (enc_msg.error === true) {
				UI.error("Error loading instances: " + instances.error_msg);
			} else {
				// share key
				self.port.emit("shareOnWall", {
					handler : 'facebook',
					args : [enc_msg.result, [userid], false]
				});
			}
		});
	});
}

function add_members(id, users) {
	pluginCall({
		caller: 'instances-add-members',
		method: 'add_members', 
		args: [id, users]
	}, function () {
		$("#create_instance_success").show();
		print_instances();
	});
}

function get_cache(callback) {
	portRequest({method: "get_cache", handler: 'facebook'}, function (msg) {
		if (msg.error) {
			UI.error(msg.error_msg);
			return;
		} else {
			callback(msg);
		}
	});
}

$("#instances").append('<div class="alert alert-info"><strong>Loading</strong> Updating cache, fetching instances</div>');
$("#create_instance :input").attr("disabled", true);
get_cache(function(cache) {
	$("#instances").empty();
	pluginCall({
		caller: 'update-instances',
		method: 'gpg_associatedKeys', 
		args: []
	}, function (msg) {
		var mapped_users = msg.response;

		// Determine cache friend size
		if (Object.size(cache.friends) === 0) {
			UI.error("Facebook friends couldn't be fetched. Did you authorize the extension yet?");
			return;
		}

		$("#create_instance :input").attr("disabled", false);
		var users_typeahead = [],
		user_ids = {};

		$.each(cache.friends, function(id, name) {
			user_ids[name] = id;
			users_typeahead.push(name);
		});

		$("#add_user").typeahead({
			"source": users_typeahead,
			"items": 10
		});

		$('#btn_add_user').click(function () {
			var add_user = $("#add_user").val(),
			classes = ["user_block"];
			id = user_ids[add_user];


			if (add_user && id) {
				var content = [];
				content.push(add_user);
				content.push("<br/>Facebook ID: ");
				content.push(id);
				if (mapped_users[id]) {
					content.push("<br/>");
					content.push("PGP fingerprint: ");
					content.push(mapped_users[id]);
					classes.push("pgp_user");
				}
				$('#added_users').append('<div class="' + classes.join(" ") + '" data-id="' + id +'" >' + content.join("") + '</div>');
			}

			return false;
		});

		$("#add_user").keyup(function(event){
			if(event.keyCode == 13){
				$("#btn_add_user").click();
				$(this).val('');
			}
		});

		$("#btn_create_instance").click(function (e) {
			e.preventDefault();

			var cached_instances, 
			inst = {},
			users = [],
			maxusers = 0;
			inst.name = $("#instance_name").val();
			inst.type = $("#instance_type").val();
			$("#create_instance_success").hide();
			$(".user_block").each(function () {
				users.push($(this).attr('data-id'));
				// set max users to > 2*users
				maxusers += 2;
			});
			inst.users = users;

			inst.id = CryptoJS.SHA256(inst.name + users.join("") + inst.type).toString(CryptoJS.enc.Hex);

			if (inst.type === "bes") {
				var i = 3, pow = 0;
				while (pow <= maxusers) {
					pow = Math.pow(2, i++);
				}
				inst.max_size = pow;
				pluginCall({
					caller: 'instance-create-instance',
					method: 'create_sender_instance', 
					args: [inst.id, inst.name, pow]
				}, function () {
					add_members(inst.id, users);
				});

			} else {
				pluginCall({
					caller: 'instance-create-instance',
					method: 'create_shared_instance', 
					args: [inst.id, inst.name]
				}, function () {
					add_members(inst.id, users);
				});
			}

		});
		print_instances();
	});


});
