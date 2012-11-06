function get_stored_profiles(msg) {
	var is_unlocked = false,
	profiles = msg.response,
	tabled = [];

	if (msg.error) {
		UI.error(msg.error_msg);
	}



	pluginCall({
		caller: 'get_stored_profiles',
		method: 'active_profile', 
		is_property: true,
		args: []
	}, 
	function(active_profile_response) {
		var is_unlocked = false,
		active_profile = active_profile_response.response,
		tabled = [];

		var displayResults = function() {
			if (Object.size(profiles) > 0) {
				$.each(profiles, function (name, key) {
					var is_active = ((active_profile === name) && is_unlocked);
					tabled.push("<tr class=\"" + (is_active ? "highlight-row" : "") + "\"><td>" + name + "</td>");
					tabled.push("<td>" + key + "</td><td>");
					if (!is_active) {
						tabled.push("<a href=\"javascript:void(0)\" id=\"btn-activate-profile\" data-profilename=\"" + name + "\"><i class=\"icon-user\"></i> Use this profile</a><br/>");
					}  else {
						tabled.push("<a href=\"javascript:void(0)\" id=\"btn-remove-profile\" data-profilename=\"" + name + "\" ><i class=\"icon-remove\"></i> Delete this profile</a></td></tr>");
					}
				});
				$("#current_profiles").html('<table class="table table-bordered table-striped"><thead><tr><th>Name</th><th>PGP-Key</th><th>Action</th></tr></thead><tbody>' + tabled.join("") + '</tbody></table>');

			}
		};

		var unlockcb = function(unlockresult) {
			is_unlocked = !unlockresult.error;
			displayResults();
		}

		if (active_profile) {
			pluginCall({
				caller: 'active_profile',
				method: 'unlock_profile', 
				args: [active_profile]
			}, 
			unlockcb);
		} else {
			displayResults();
		}

	})
}

pluginCall({
	caller: 'update_keyselect',
	method: 'gpg_search_keys', 
	args: ["", 1]
}, 
function update_keyselect(msg) {
	var keys = msg.response;
	if (Object.size(keys) > 0) {
		var options = [];
		$.each(keys, function (id, keydata) {
			options.push('<option value="' + id + '">' + keydata.name + ' (' + id + ')</option>');
		});
		$("#add_profile_keyselect").removeAttr("disabled").empty().append(options.join(""));
	}
});


function request_profileupdate() {
	pluginCall({
		caller: 'request_profileupdate',
		method: 'get_stored_profiles', 
		args: []
	}, 
	get_stored_profiles);
}

request_profileupdate();

$("#btn-create-profile").on("click", function(e) {
	e.preventDefault();
	var name = $("#add_profile_name").val(),
	key = $("#add_profile_keyselect").val();

	pluginCall({
		caller: 'btn-create-profile',
		method: 'get_stored_profiles', 
		args: []
	}, function (msg) {
		profiles = msg.response;

		// Clear previous form errors
		UI.resetFormErrors();

		if (!name) { UI.formError("#add_profile_name", "Profile name cannot be empty");	}
		else if (profiles.hasOwnProperty(name)) { UI.formError("#add_profile_name", "Profile name exists already");	}
		else if (!key) { UI.formError("#add_profile_keyselect", "No GPG private key selected");	}
		else {
			pluginCall({
				caller: 'add_new_profile',
				method: 'add_profile', 
				args: [name, key]
			}, function (msg) { location.reload(true); });
		}
	});

});

$("#current_profiles").on("click", "#btn-activate-profile", function(e) {
	console.debug("FOO");
	e.preventDefault();
	var name = $(this).attr("data-profilename");
	pluginCall({
		caller: 'activate_profile',
		method: 'unlock_profile', 
		args: [name]
	}, function() {location.reload(true)});
});

$("#current_profiles").on("click", "#btn-remove-profile", function(e) {
	e.preventDefault();
	var name = $(this).attr("data-profilename");
	if (confirm("Are you sure you want to delete the active profile '" + name + "'?.\n" 
	+ "This will remove ALL communication groups you have created using this profile.")) {

		pluginCall({
			caller: 'delete_profile',
			method: 'delete_profile', 
			args: [name]
		}, function() {location.reload(true)});
	}
});



// $(document).ready(function () {
// 	// check auth status
// 	check_host_auth();
// 	check_osn_auth();
// 
// 	// update stored profiles for list
// 	get_stored_profiles();
// 
// 	// update private key selection
// 	update_keyselect();
// 
// 
// 
// 	$("#btn-create-profile").click(function() {
// 		var name = $("#add_profile_name").val(),
// 		key = $("#add_profile_keyselect").val(),
// 		profiles = bm.module.get_stored_profiles();
// 
// 		// Clear previous form errors
// 		UI.resetFormErrors();
// 
// 		if (!name) { UI.formError("#add_profile_name", "Profile name cannot be empty");	}
// 		else if (profiles.hasOwnProperty(name)) { UI.formError("#add_profile_name", "Profile name exists already");	}
// 		else if (!key) { UI.formError("#add_profile_keyselect", "No GPG private key selected");	}
// 		else { bm.module.add_profile(name, key); get_stored_profiles();}
// 
// 		return false;
// 
			// 	});
			// 
			// 
			// 
			// 
			// });
