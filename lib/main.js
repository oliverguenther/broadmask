const tabs = require("tabs");
const data = require("self").data;
const pageMod = require('page-mod');
const storage = require("simple-storage").storage;
const clipboard = require("clipboard");
const {Cc, Ci} = require("chrome");

// api handlers
let handlers = {
	picasa: require("broadmask-picasa").picasa,
	facebook: require("broadmask-facebook").facebook
};


Object.size = function(obj) {
	var size = 0, key;
	for (key in obj) {
		if (obj.hasOwnProperty(key)) size++;
	}
	return size;
};

// Create background page that loads NPAPI plugin
var plugin = exports.plugin = require("page-worker").Page({
	contentURL: data.url("background.html"),
	contentScriptFile: data.url("background.js"),
	contentScriptWhen: "ready"
});

plugin.port.on("pluginLoaded", function (data) {
	console.debug("plugin has loaded!");
});

// Upon installation, add toolbar button
exports.main = function(options) {

	var btn = require("toolbarbutton").ToolbarButton({
		id: 'broadmask-toolbarbutton',
		label: 'BroadMask',
		image: data.url('img/bm16.png'),
		onCommand: function() {
			tabs.open(data.url("app/upload.html"));
		}
	});

	btn.moveTo({
		toolbarID: "nav-bar",
		forceMove: false
	});
};

// cache plugin calls in order to map responses more easily
var callbacks = {};
var id = 0;

plugin.port.on("pluginResponse", function(message) {
	// Pass message along
	if (callbacks.hasOwnProperty(message.id)) {
		// console.debug("calling callback " + message.caller + " with:\n" + JSON.stringify(message.response));
		callbacks[message.id].apply(this, [message]);
	}

	// Remove callback
	delete callbacks[message.id];
	if (Object.size(callbacks) == 0) {
		id = 0;
	}
});

/**
* Requst util function for plugin calls
*/
plugin.request = function(message, callback) {
	// Insert timestamp id
	while (callbacks[id]) { id++; }

	message.id = id;
	callbacks[id] = callback;
	// console.debug("pluginCall: " + message.method + "\nARGS\n" + JSON.stringify(message.args));
	plugin.port.emit("pluginCall", message);
};

/**
* Return an object indexed by method name with all
* plugin return values for the given array of messages
*
* Useful for querying multiple calls to the plugin
*
*/
plugin.multiple_request = function(arr, callback) {
	var completed = 0,
	result = {};

	for (var i = 0, len = arr.length; i < len; i++) {
		var msg = arr[i];
		plugin.request(msg, function(rmsg) {
			result[rmsg.method] = rmsg.response;
			completed++;
			if(completed === arr.length) {
				callback(result);
			}

		});
	}
};

// upload.html contentscript
pageMod.PageMod({
	include: data.url("app/upload.html"),
	contentScriptWhen: 'ready',
	contentScriptFile: [data.url('js/jquery.min.js'), data.url("js/app.js"), data.url('js/app/upload.js')],
	onAttach: function(worker) {
		worker.port.on('shareMedia', function (message) {
			console.log(JSON.stringify(message));
		});

		worker.port.on('pluginCall', function (message) {
			plugin.request(message, function (response) {
				worker.port.emit(response.caller, response);
			});
		});

		worker.port.on('pluginMultipleCall', function (message) {
			plugin.multiple_request(message.array, function (response) {
				worker.port.emit(message.method, response);
			})
		});
	}
});

// instances.html contentscript
pageMod.PageMod({
	include: data.url("app/instances.html"),
	contentScriptWhen: 'ready',
	contentScriptFile: [
		data.url('js/jquery.min.js'),
		data.url('js/bootstrap.min.js'),
		data.url('js/sha256.js'),
		data.url("js/app.js"),
		data.url('js/app/instances.js')
	],
	onAttach: function(worker) {
		worker.port.on('get_cache', function (message) {
			worker.port.emit('get_cache', {
				response: {
					friends: {
						1: "Foo",
						2: "Bar"
					}
				}
			});
		});

		worker.port.on('pluginCall', function (message) {
			plugin.request(message, function (response) {
				worker.port.emit(response.caller, response);
			});
		});

		worker.port.on('set_clipboard', function (message) {
			clipboard.set(message);
		});

		worker.port.on('pluginMultipleCall', function (message) {
			plugin.multiple_request(message.array, function (response) {
				worker.port.emit(message.method, response);
			});
		});
	}
});

//networks.html contentscript
pageMod.PageMod({
	include: data.url("app/networks.html"),
	contentScriptWhen: 'ready',
	contentScriptFile: [data.url('js/jquery.min.js'), data.url("js/app.js"), data.url('js/app/networks.js')],
	onAttach: function(worker) {

		worker.port.on('authorize', function (message) {
			handlers[message.handler].authorize(function(result) {
				message.auth_status = result;
				worker.port.emit('auth_status', message);
			});
		});

		worker.port.on('revoke_auth', function (message) {
			handlers[message.handler].revoke_authorization();
			message.auth_status = false;
			worker.port.emit('auth_status', message);
		});


		worker.port.on('auth_status', function (message) {
			handlers[message.handler].is_authorized(function(result) {
				message.auth_status = result;
				worker.port.emit('auth_status', message);
			});

		});
	}
});

// users.html contentscript
pageMod.PageMod({
	include: data.url("app/users.html"),
	contentScriptWhen: 'ready',
	contentScriptFile: [
		data.url('js/jquery.min.js'),
		data.url('js/bootstrap.min.js'),
		data.url("js/app.js"),
		data.url('js/app/users.js')
		],
	onAttach: function(worker) {
		worker.port.on('get_cache', function (message) {
			worker.port.emit('get_cache', {
				response: {
					friends: {
						1: "Foo",
						2: "Bar"
					}
				}
			});
		});

		worker.port.on('get_published_keys', function (message) {
			handlers[message.handler].get_published_keys(function(result) {
				console.log("keys: " + JSON.stringify(result));
				worker.port.emit('get_published_keys', result);
			});

		});

		worker.port.on('publish_key', function (message) {
			handlers[message.handler].publish_key(message.keyid, function(response) {
				worker.port.emit('publish_key', response);
			});
		});

		worker.port.on('remove_post', function (message) {
			handlers[message.handler].remove_post(message.id);
		});

		worker.port.on('pluginCall', function (message) {
			plugin.request(message, function (response) {
				worker.port.emit(response.caller, response);
			});
		});

		worker.port.on('pluginMultipleCall', function (message) {
			plugin.multiple_request(message.array, function (response) {
				worker.port.emit(message.method, response);
			})
		});
	}
});

// settings.html contentscript
pageMod.PageMod({
	include: data.url("app/settings.html"),
	contentScriptWhen: 'ready',
	contentScriptFile: [data.url('js/jquery.min.js'), data.url("js/app.js"), data.url('js/app/settings.js')],
	onAttach: function(worker) {
		worker.port.on('pluginCall', function (message) {
			plugin.request(message, function (response) {
				worker.port.emit(response.caller, response);
			});
		});
	}
});
