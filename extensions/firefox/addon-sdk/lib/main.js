const tabs = require("tabs");
const data = require("self").data;
const pageMod = require('page-mod');
const storage = require("simple-storage").storage;
const clipboard = require("clipboard");
const base64 = require("api-utils/base64");
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
		forceMove: true
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


/**
* Wrapper function for a BroadMask encryption request
*/
plugin.encrypt = function (groupid, data, asimage, callback) {
	plugin.request({
		method: 'encrypt_b64',
		args: [groupid, data, asimage]
	}, callback);
};

/**
* Wrapper function for a BroadMask decryption request
*/
plugin.decrypt = function (groupid, data, asimage, callback) {
	plugin.request({
		method: 'decrypt_b64',
		args: [groupid, data, asimage]
	}, callback);
};

/**
*  Helper function for iterating over sharing requests
*/
plugin.asyncLoop = function (array, fn, callback) {
	if(Object.prototype.toString.call(array) !== '[object Array]') {
		return;
	}

	var completed = 0,
	result = [];
	if (array.length === 0) {
		callback(result);
	}
	for(var i = 0, len = array.length; i < len; i++) {
		var src = array[i];
		fn(src, function(res) {
			result.push(res);
			completed++;
			if(completed === array.length) {
				callback(result);
			}
		});
	}
};


/**
* Share a message (containing plaintext or/and media) to the given group instance
* @param groupid The group instance id
* @param message an object containing 'plaintext' key for raw text, or an array of image objects with the following structure
* {src: 'image data url', onprogress: 'onprogress callback function', success: 'success callback', error: 'error callback'}
*/
plugin.share = function (message) {

	var processImage = function (img, processcb) {
		plugin.encrypt(message.groupid, img.src, true, function (msg) {
			var ct_wrapped = msg.response;
			if (typeof ct_wrapped !== 'object' || !ct_wrapped.ciphertext) {
				img.error("Encryption failed " + (ct_wrapped.error ? ct_wrapped.error_msg : 'with unknown error.'));
				return;
			}
			// upload content
			handlers[message.imghandler].upload(ct_wrapped.ciphertext, img.onprogress, function(xhr, url) {
				console.log("Completed upload");
				if (url) {
					// img.success(xhr, url);
					console.log("Completed upload with success!");
					processcb(url);
				} else {
					console.log("Completed upload, but failed");
					// img.error("Upload failed. " + xhr.status);
				}
			});
		});
	};

	var encryptText = function(message, callback) {
		plugin.encrypt(message.groupid, message.plaintext, false, function (msg) {
			var result = msg.response;
			if (typeof result !== 'object' || !result.ciphertext) {
				error("Encryption failed " + (result.error ? result.error_msg : 'with unknown error.'));
			} else {
				callback(result.ciphertext);
			}
		});
	};

	var encryptMedia = function(message, callback) {
		plugin.asyncLoop(message.media, processImage, callback);
	}

	var shareMessage = function(share) {
		// Get receivers
		// var receivers = bm.module.get_instance_members(groupid);

		// Share as JSON string, base64 encoded
		console.log("sharing message!");
		handlers[message.handler].shareOnWall(base64.encode(JSON.stringify(share)), [], true);
	};

	// Prepare shared message
	var share = {};
	share.gid = message.groupid;
	share.data = {};

	var hasText = message.hasOwnProperty("plaintext"),
	hasMedia = (message.hasOwnProperty("media") && Array.isArray(message.media));

	if (hasText) {
		// Encrypt plaintext
		encryptText(message, function (ct) {
			share.data.text_message = ct;

			// Additionally encrypt media
			if (hasMedia) {
				encryptMedia(message, function (urls) {
					share.data.links = urls;
					console.log("now sharing media");
					shareMessage(share);
				});
			} else {
				// share directly
				shareMessage(share);
			}

		});
	} else {
		if (hasMedia) {
			encryptMedia(message, function (urls) {
				share.data.links = urls;
				console.log("now sharing media");

				shareMessage(share);
			});
		}
	}
};


/**
* Handle new images from API calls or content scripts.
* Unwraps the message and requests images from the imgHost
* @param groupid instance associated to the urls
* @param urls an array of image URLs
* @param callback a function to display/handle the loaded dataURLs
*/
plugin.handleImages = function (groupid, urls, cb) {

	var processImages = function (array, fn, callback) {
		var completed = 0,
		error = false,
		result = [];
		if (array.length === 0) {
			callback(result); // done immediately
		}
		for(var i = 0, len = array.length; error == false && i < len; i++) {
			var src = array[i];
			fn(src, function(response) {
				if (response.error) {
					callback(response);
					error = true;
				} else if (response.content) {
					result.push(response.content);
					completed++;
					if(completed === array.length) {
						callback(result);
					}
				}
			});
		}
	};

	processImages(urls, function(src, callback) {
		// TODO generalize
		var fetchfn = handlers['picasa'].download.bind(handlers['picasa']);

		// Get instance descriptor
		plugin.request({
			method: 'get_instance_descriptor',
			args: [groupid]
		}, function(msg) {
			var instance = msg.response

			if (instance.error) {
				// instance doesn't exist
				callback({error: true, error_msg: "No instance set up with groupid " + groupid});
				return;
			}

			// Download image
			fetchfn(src, function (bmp_ct) {
				if (bmp_ct.error || !bmp_ct.success) {
					callback({error: false, warning: true, warn_msg: "Image Download failed:  " + bmp_ct.error});
					return;
				}
				// decrypt content
				plugin.decrypt(groupid, bmp_ct.result, true, function(msg) {
					var result = msg.response;
					if (result.plaintext) {
						callback({error:false, content: result.plaintext});
					} else {
						// probably an error, just return it directly
						callback({error:true, error_msg: result});
					}
				});
			});
		});
	}, cb);
};

// upload.html contentscript
pageMod.PageMod({
	include: data.url("app/upload.html"),
	contentScriptWhen: 'ready',
	contentScriptFile: [data.url('js/jquery.min.js'), data.url("js/app.js"), data.url('js/app/upload.js')],
	onAttach: function(worker) {
		worker.port.on('shareMedia', function (message) {
			// Initiate callbacks for progress listeners
			if (message.media) {
			}
			plugin.share(message);
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
			handlers[message.handler].get_friends(function(cache) {
				worker.port.emit('get_cache', cache);
			});
		});

		worker.port.on('shareOnWall', function (message) {
			handlers[message.handler].shareOnWall.apply(this, message.args);
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
			handlers[message.handler].get_friends(function(cache) {
				worker.port.emit('get_cache', cache);
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

/**
* Social contentscripts
*/

pageMod.PageMod({
	include: "*.facebook.com",
		contentScriptWhen: 'ready',
		contentScriptFile: data.url("js/contentscripts/facebook.js"),
		onAttach: function(worker) {
			worker.port.on("request", function(request) {
				if (typeof request !== 'object') {
					return;
				}

				if (!request.hasOwnProperty("id")) {
					return;
				}

				var handleContent = function (message) {
					var bm_msg,
					start = message.indexOf("=== BEGIN BM DATA ===") + 22,
					end = message.indexOf("=== END BM DATA ===") - 23;

					try {
						bm_msg = JSON.parse(base64.decode(message.substr(start, end)));
					} catch (e) {
						console.error("Couldn't extract message from wall post: " + e);
						return;
					}
					if (!bm_msg.hasOwnProperty("data")) {
						worker.port.emit("request" + request.id, {error: true, error_msg: "No message content found in message"});
						console.warn("No message countent found in: " + JSON.stringify(bm_msg));
					}
					if (bm_msg.data.text_message) {
						// Decrypt inline text
						console.log("decrypting inline text");
						plugin.decrypt(bm_msg.gid, bm_msg.data.text_message, false, function (result) {
							worker.port.emit("request" + request.id, result.response);
						});
					}
					if (bm_msg.data.links) {
						// Download, decrypt images
						console.log("decrypting inline images");
						plugin.handleImages(bm_msg.gid, bm_msg.data.links, function (result) {
							if (result.length > 0) {
								result = {urls: result};
							}
							worker.port.emit("request" + request.id, result);
						});
					}
					if (!(bm_msg.data.text_message || bm_msg.data.links)) {
						worker.port.emit("request" + request.id,{error: true, error_msg: "Could not detect any messages or links"});
						console.warn("unknown message. " + JSON.stringify(bm_msg));
					}

				};

				var handleKeyTransmission = function (message) {
					plugin.request({
						method: 'gpg_decrypt',
						args: [message]
					}, function(msg) {
						var dec_msg = msg.response;

						if (typeof dec_msg !== 'object' || !dec_msg.hasOwnProperty("result")) {
							return;
						}

						try {
							var msg = JSON.parse(dec_msg.result);
							if (msg.type === "instance") {
								// incoming instance, set it up
								if (msg.instance_type === 1) {
									// receiver instance {pk, sk}
									plugin.request({
										method: 'create_receiver_instance',
										args: [msg.id, "receiver", msg.max_users, msg.pk, msg.sk]
									}, function (response) {
										worker.port.emit("request"+id, {error:false, plaintext: "Received a BM-BE instance with identifier " + msg.id + ". Added to your groups"});
									});
									//that.osn.message_ack({id: request.id, type: "post"});
								} else if (msg.instance_type === 4) {
									plugin.request({
										method: 'create_shared_instance_withkey',
										args: [msg.id, "shared receiver", msg.sk]
									}, function (response) {
										worker.port.emit("request"+id, {error:false, plaintext: "Received a BM-SK instance with identifier " + msg.id + ". Added to your groups"});
									});
									//that.osn.message_ack({id: request.id, type: "post"});
								} else {
									console.warn("unknown instance type");
								}
							}
						} catch (e) {
							console.log("Couldn't parse message. Error: " + e);
						}
					});

				};

				// fetch UIStreamMessage
				handlers['facebook'].getFBData("https://graph.facebook.com/" + request.id, function (response) {
					if (response.error || !response.hasOwnProperty("message")) {
						console.error("Error fetching wall post: " + response.error.message);
						return;
					}
					var fbmsg = response.message;
					if (request.type === 'broadmask') {
						handleContent(response.message);
					} else if (request.type === 'pgp') {
						handleKeyTransmission(response.message);
					}
				});
			});
		}
});
