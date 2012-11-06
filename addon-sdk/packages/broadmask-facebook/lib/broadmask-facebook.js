/*jslint plusplus: false, indent: 4 */
/*global define: false, location: true, window: false, alert: false,
document: false, setTimeout: false, localStorage: false */
"use strict";

const {Cc, Ci} = require("chrome");
let OAuthConsumer = require("oauthconsumer").OAuthConsumer;
let storage = require("simple-storage").storage;

var facebook = exports.facebook = {};

(function() {
	var that = this;
	this.domain = "facebook.com";
	this.id = "facebook";
	this.name = "Facebook";

	this.features = {
		host: false,
		images: false,
		bmp: false,
		share: false
	};

	this.constraints = {
	};

	this.auth = {
		type: "oauth",
		name: "facebook",
		authname: "facebook",
		key: "281109321931593",
		secret: "8aa112ab440533ab2d70bcde9b83af1e",
		version: "2.0",
		requestParams: {
			display: 'popup',
			type: 'user_agent',
			scope: "publish_stream,read_stream"
		},
		return_url: "https://www.facebook.com/connect/login_success.html"
	};


	/**
	* Helper function to add parameter to url
	*/
	function addParameterToURL(url, key, val){
		url += (url.split('?')[1] ? '&':'?') + key + "=" + val;
		return url;
	}


	/**
	* Retrieve a response a signed Facebook Graph API request.
	* 
	*/
	this.getFBData = function(url, callback) {

		var token = storage['broadmask-facebook-token'];
		if (typeof token !== "undefined") {	
			let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
			.createInstance(Ci.nsIXMLHttpRequest);

			xhr.open(
				"GET",
				addParameterToURL(url, "access_token", token),
				true
			);
			xhr.responseType = "json";

			xhr.onreadystatechange = function () {
				if (xhr.readyState === 4) {
					callback(xhr.response);
				}
			};

			xhr.send();

			return true;
		} else {
			return false;
		}
	};

	function armorData(message) {
		var d = [];
		d.push("=== BEGIN BM DATA ===");
		d.push(message);
		d.push("=== END BM DATA ===");
		d.push("This message has been encrypted using Broadmask");
		return d.join("\n");
	};

	/** 
	* Post a signed request to the Facebook Graph API
	*
	*/
	function sendFBData(url, type, params, callback) {
		"use strict";
		var token = storage['broadmask-facebook-token'];
		if (typeof token !== "undefined") {

			// prepare request data
			var request = Cc["@mozilla.org/files/formdata;1"]
			.createInstance(Ci.nsIDOMFormData);
			for (var key in params) {
				request.append(key, params[key]);
			}
			request.append("access_token", token);

			let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
			.createInstance(Ci.nsIXMLHttpRequest);

			xhr.open(
				type,
				url,
				true
			);
			xhr.responseType = "json";

			xhr.onreadystatechange = function () {
				if (xhr.readyState === 4 && typeof callback === 'function') {
					callback(xhr.response);
				}
			};

			xhr.send(request);

			return true;
		} else {
			return false;
		}
	};

	this.is_authorized = function(callback) {
		var expires = storage['broadmask-facebook-expiry'],
		token = storage['broadmask-facebook-token'];

		// If no token exists, we can stop here
		if (!token) {
			callback(false);
			return;
		}

		// Check for existing expiry data
		if (expires) {
			var now = new Date().getTime();
			if (now < expires) {
				console.debug("braodmask.facebook.is_authorized: cache token is fresh (expires " + new Date(expires) + ")");
				callback(true);
			} else {
				// token has expires, needs new /auth
				delete storage['broadmask-facebook-token'];
				delete storage['broadmask-facebook-expiry'];
				callback(false);
			}
			return;
		}

		// otherwise, get expiry info
		var started = that.getFBData("https://graph.facebook.com/oauth/access_token_info?client_id=" + this.auth.key, function (data) {
			if (data.hasOwnProperty("expires_in") && data.expires_in > 1200) {
				var now = new Date();
				now.setSeconds(now.getSeconds() + data.expires_in);	
				// Store expiry data
				storage['broadmask-facebook-expiry'] = now.getTime();
				console.debug("braodmask.facebook.is_authorized: token is fresh (expires " + now + ")");
				callback(true);
			} else {
				// token has expired, delete it
				delete storage['broadmask-facebook-token'];
				delete storage['broadmask-facebook-expiry'];
				callback(false);
			}
		});

		if (!started) {
			console.warn("broadmask.facebook: No token available");
			callback(false);
		}
	};

	/**
	* Authorize picasa API for use within broadmask
	* @param callback Called upon successful authentication
	*
	*/
	this.authorize = function (callback) {
		var that = this;

		var do_authorize = function() {
			var authcallback = function (svc) {
				// svc.token is the authorization token
				if (!svc.token) {
					callback(false);
					return;
				}

				var token = storage['broadmask-facebook-token'] = svc.token;
				console.debug("broadmask.facebook: auth completed " + token);
				callback(true);
			};

			OAuthConsumer.authorize(
				that.auth.authname,
				that.auth.key,
				that.auth.secret,
				that.auth.return_url,
				authcallback,
			that.auth.requestParams);
		}

		this.is_authorized(function(authstatus) {
			if (authstatus !== true) {
				// Start oauth authorization
				do_authorize();
			} else {
				console.log("facebook.authorize: we're authorized!");
				callback(true);
			}
		});
	};

	/**
	* Revoke Authorization for Facebook
	*
	*/
	this.revoke_authorization = function() {
		// Delete corresponding OAuthConsumer storage
		OAuthConsumer.resetAccess(
			this.auth.authname,
			this.auth.key,
			this.auth.secret
		);

		// Remove our own access token data
		delete storage['broadmask-facebook-token'];
	};

	/**
	* Searches for an uploaded PGP key using FQL
	* Returns an object with either (error, error_msg) keys set
	* or response with 'keyid' as the uploaded key identifier,
	* 'postid' with the FB post containing the key and
	* 'link' with a complete url to the corresponding FB post
	*/
	this.get_published_keys = function(callback) {
		console.log("keys: Init");
		var query = "SELECT post_id, actor_id, target_id, message FROM stream WHERE source_id = me() AND app_id = '" + this.auth.key + "' AND strpos(lower(message), 'my pgp-key:') >= 0";
		var result = {};
		var started = that.getFBData("https://graph.facebook.com/method/fql?q=" + encodeURIComponent(query), function (response) {
			if (response.data.length > 0) {
				var data = response.data;
				var keys = [];
				for (var i=0; i < data.length; i++) {
					keys.push({keyid: data[i].message.toLowerCase().match(/0x[a-z0-9]+/i)[0], post_id: data[i].post_id});
				}

				var keyid = data[0].message.toLowerCase().match(/0x[a-z0-9]+/i)[0];
				var post_id = data[0].post_id;
				if (!keyid) { 
					result.error = true;
					result.error_msg = "Found PGP key message, but couldn't parse content! " + data[0].message;
					callback(result);
				} else {
					// Retrieve link
					that.getFBData("https://graph.facebook.com/" + post_id, function(response) {
						if (response.hasOwnProperty("actions")) {
							result.response = {'all_keys': keys, 'keyid': keyid, 'post_id': post_id,  'link': response.actions[0].link};
						} else {
							result.error = true;
							result.error_msg = "Can't locate post with PGP key";
						}
						callback(result);
					});

				}
			} else {
				callback({});
			}
		});
	};


	this.remove_post = function(id) {
		console.debug("FB: Deleting Post with id " + id);
		sendFBData("https://graph.facebook.com/" + id, "DELETE");
	};

	this.publish_key = function(keyid, callback) {
		var keyid = "My PGP-Key: 0x" + keyid;
		sendFBData(
			"https://graph.facebook.com/me/feed", "POST", 
			{privacy : JSON.stringify({value: 'ALL_FRIENDS'}), message : keyid}, 
			callback
		);
	}

	/** 
	* share an upload on the logged in user's Facebook wall
	* @param message the message to send (if multiple images, include them here!)
	* @param link if one image uploaded, link it here!
	* @param allowed_users an array of allowed user ids or friendlist ids
	* @param callback Called when returned from upload
	*/
	this.shareOnWall = function (message, allowed_users, armoring, callback) {
		// Post to Facebook wall using privacy set to this friendlistid
		var data = {};
		if (armoring) {
			data.message = armorData(message);
		} else {
			data.message = message;
		}
		if (allowed_users.length > 0) {
			var privacy = {value: 'CUSTOM', friends: 'SOME_FRIENDS', allow: allowed_users.join(",")};
			data.privacy = JSON.stringify(privacy);
		}
		sendFBData("https://graph.facebook.com/me/feed", "POST", data, callback);
	};


	/**
	* Requests all friend's (identifiers, names) from Facebook
	* They are cached for two days
	*
	* @param callback is returned to with an object
	* of friend identifier => name from facebook
	*/
	this.get_friends = function(callback) {
		var cachestore = storage['broadmask-facebook-cache'];
		var check_cache = function() {
			try {
				var now = new Date().getTime(),
				cache = JSON.parse(cachestore);
				if (cache.friends && (now < cache.expires)) {
					return cache;
				}
			} catch (e) {
				return null;
			}
		};

		var cache = check_cache();
		if (cache) {
			console.log("cache exists " + JSON.stringify(cache));
			callback(cache);
		} else {
			console.log("cache does not exist");
			this.is_authorized(function (isvalid) {
				if (isvalid) {
					// update cache
					cache = {};
					that.getFBData("https://graph.facebook.com/me/friends", function (friends) {
						console.log("cache response " + JSON.stringify(friends));
						if (!friends.hasOwnProperty("data")) {
							callback(friends);
							return;
						}

						cache.expires = new Date().getTime() + 172800000; // Expire in 2 days
						cache.friends = {};
						for (var i = 0, len = friends.data.length; i < len; i += 1) {
							cache.friends[friends.data[i].id] = friends.data[i].name;
						}
						storage['broadmask-facebook-cache'] = JSON.stringify(cache);
						callback(cache);
					});

				} else {
					callback({error: true, error_msg: "Not authorized"});
				}
			});
		}
	};

}).call(facebook);
