/*jslint plusplus: false, indent: 4 */
/*global define: false, location: true, window: false, alert: false,
document: false, setTimeout: false, localStorage: false */
"use strict";

const {Cc, Ci} = require("chrome");
const base64 = require("api-utils/base64");
let OAuthConsumer = require("oauthconsumer").OAuthConsumer;
let storage = require("simple-storage").storage;

var picasa = exports.picasa = {};

(function() {
	var that = this;
	this.domain = "picasaweb.google.com";
	this.id = "picasa";
	this.name = "Picasa WebAlbums";

	this.features = {
		host: true,
		images: true,
		bmp: true,
		share: false
	};

	this.constraints = {
		filesize: 20
	};

	this.auth = {
		type: "oauth",
		name: "google",
		authname: "google-oauth2",
		calls: {
			userAuthorizationURL: "https://accounts.google.com/o/oauth2/auth"
		},
		key: "179165421211.apps.googleusercontent.com",
		secret: "Brwb_-o-gmfw89c0RldlGyhQ",
		version: "2.0",
		tokenRx: /\?code=([^&]*)/gi,
		requestParams: {
			client_id: '179165421211.apps.googleusercontent.com',
			response_type: 'code',
			scope: "https://picasaweb.google.com/data"
		},
		return_url: "http://localhost"
	};


	/**
	* Internal helper method
	* Generate a longer-living access token
	* Assumes a fresh authorization code for grant_type = "authorization_code"
	* Assumes a refresh token for grant_type = "refresh_token"
	*
	* @param authcode oauth token from OAuthConsumer
	* @param grant_type Auth type (authorization_code or refresh-token)
	* @param callback Returned to with xhr response
	*/
	function authorize_grant(authcode, grant_type, callback) {
		let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
		.createInstance(Ci.nsIXMLHttpRequest);

		var request = Cc["@mozilla.org/files/formdata;1"]
		.createInstance(Ci.nsIDOMFormData);

		if (grant_type === "refresh_token") {
			request.append(grant_type, authcode);
		} else {
			request.append("code", authcode);
			request.append("redirect_uri", that.auth.return_url);
		}
		request.append("client_id", that.auth.key);
		request.append("client_secret", that.auth.secret);
		request.append("grant_type", grant_type);

		xhr.open(
			"POST",
			"https://accounts.google.com/o/oauth2/token",
			true
		);
		xhr.responseType = "json";

		xhr.onreadystatechange = function () {
			if (xhr.readyState === 4) {
				var data = xhr.response;
				console.debug("broadmask.picasa: Authorize Grant response: " + JSON.stringify(xhr.response));
				if (typeof data !== "object") {
					callback({error: true, error_msg: "Request failed with status " + xhr.statusText});
					return;
				}

				if (data.hasOwnProperty("error")) {
					if (data.error === "invalid_grant") {
						// This happens if the svc hasnt been cleared,
						// but the user reqires new authorization
						console.error("broadmask.picasa: authorize - Invalid Grant received from Google OAuth!");
						that.revoke_authorization();
					}
					return;
				}

				if (data.hasOwnProperty("access_token")) {
					var now = new Date();
					now.setSeconds(now.getSeconds() + data.expires_in);
					data.expires_in = now.getTime();
					// refresh_token only returns a new access_token and expires_in
					// need to store access_token into old data
					if (grant_type === "refresh_token") {
						var tokeninfo = JSON.parse(storage['broadmask-picasa-token']);
						data.refresh_token = tokeninfo.refresh_token;
					}
					storage['broadmask-picasa-token'] = JSON.stringify(data);
					callback(data);
				} else {
					callback({error: true, data: data});
				}
			}
		};

		xhr.send(request);
	};


	function get_auth_token(callback) {
		var token = storage['broadmask-picasa-token'];
		if (!token) {
			console.debug("picasa.get_auth_token: token " + JSON.stringify(token));
			callback(null);
			return;
		}

		try {
			var tokeninfo = JSON.parse(token);
			if (tokeninfo.access_token && tokeninfo.refresh_token) {
				if (new Date(tokeninfo.expires_in).getTime() > new Date().getTime()) {
					console.debug("picasa.get_auth_token: token is fresh (expires " + new Date(tokeninfo.expires_in) + ")");
					callback(tokeninfo.access_token);
				} else {
					// use refresh_token to update the access_token
					console.debug("picasa.get_auth_token: token needs refresh" + JSON.stringify(tokeninfo));
					authorize_grant(
						tokeninfo.refresh_token,
						"refresh_token",
						function(data) {
							if (!data.error) {
								callback(data.access_token);
							} else {
								console.debug("picasa.get_auth_token: REFRESH ERROR " + JSON.stringify(data));
								callback(null);
							}
						}
					);
				}
			} else {
				// Cache is invalid
				console.warn("picasa.get_auth_token: Cached token is invalid! " + token);
				delete storage['broadmask-picasa-token'];
				callback(null);
			}
		} catch(e) {
			console.warn("Error parsing token. " + e);
			delete storage['broadmask-picasa-token'];
			callback(null);
		}
	};

	// Converts an ArrayBuffer directly to base64, without any intermediate 'convert to string then
	// use window.btoa' step. According to my tests, this appears to be a faster approach:
	// http://jsperf.com/encoding-xhr-image-data/5
	// https://gist.github.com/958841

	function base64ArrayBuffer(arrayBuffer) {
		var base64    = ''
		var encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

		var bytes         = new Uint8Array(arrayBuffer)
		var byteLength    = bytes.byteLength
		var byteRemainder = byteLength % 3
		var mainLength    = byteLength - byteRemainder

		var a, b, c, d
		var chunk

		// Main loop deals with bytes in chunks of 3
		for (var i = 0; i < mainLength; i = i + 3) {
			// Combine the three bytes into a single integer
			chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]

			// Use bitmasks to extract 6-bit segments from the triplet
			a = (chunk & 16515072) >> 18 // 16515072 = (2^6 - 1) << 18
			b = (chunk & 258048)   >> 12 // 258048   = (2^6 - 1) << 12
			c = (chunk & 4032)     >>  6 // 4032     = (2^6 - 1) << 6
			d = chunk & 63               // 63       = 2^6 - 1

			// Convert the raw binary segments to the appropriate ASCII encoding
			base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d]
		}

		// Deal with the remaining bytes and padding
		if (byteRemainder == 1) {
			chunk = bytes[mainLength]

			a = (chunk & 252) >> 2 // 252 = (2^6 - 1) << 2

			// Set the 4 least significant bits to zero
			b = (chunk & 3)   << 4 // 3   = 2^2 - 1

			base64 += encodings[a] + encodings[b] + '=='
		} else if (byteRemainder == 2) {
			chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1]

			a = (chunk & 64512) >> 10 // 64512 = (2^6 - 1) << 10
			b = (chunk & 1008)  >>  4 // 1008  = (2^6 - 1) << 4

			// Set the 2 least significant bits to zero
			c = (chunk & 15)    <<  2 // 15    = 2^4 - 1

			base64 += encodings[a] + encodings[b] + encodings[c] + '='
		}

		return base64
	}




	this.is_authorized = function(callback) {
		get_auth_token(function (token) {
			console.log("broadmask.picasa: We're " + (token !== null ? "authorized!" : "not authorized :("));
			callback((token !== null));
		});
	};

	/**
	* Authorize picasa API for use within broadmask
	* @param callback Called upon successful authentication
	*
	*/
	this.authorize = function (callback) {
		var that = this;

		var do_authorize = function() {
			var p = OAuthConsumer.makeProvider(
				that.auth.authname,
				that.auth.name,
				that.auth.key,
				that.auth.secret,
				that.auth.return_url,
			that.auth.calls);

			p.version = that.auth.version;
			p.tokenRx = that.auth.tokenRx;
			p.requestParams = that.auth.requestParams;


			var authcallback = function (svc) {
				// svc.token is the authorization token
				// we need to derive a refresh_token
				console.debug(JSON.stringify(svc));
				authorize_grant(svc.token, "authorization_code", function(data) {
					if (typeof data === "object" && !data.hasOwnProperty("error")) {
						callback(true);
					} else {
						console.error("broadmask.picasa: Picasa authorization failed! " + JSON.stringify(data));
						OAuthConsumer.resetAccess(that.auth.authname,
						that.auth.key, that.auth.secret);
						callback(false);
					}
				});
			};

			var handler = OAuthConsumer.getAuthorizer(p, authcallback);
			handler.startAuthentication();
		}

		this.is_authorized(function(authstatus) {
			if (authstatus !== true) {
				// Start oauth authorization
				do_authorize();
			} else {
				console.log("picasa.authorize: we're authorized!");
				callback(true);
			}
		});
	};

	/**
	* Revoke Authorization for Picasa WebAlbums
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
		delete storage['broadmask-picasa-token'];
	};

	/** 
	* Download an image from Picasa.
	* @param url The url to an picasa entry
	* @callback Called with downloaded dataURL
	*/
	this.download = function(url, callback) {
		var params = "&alt=json&imgmax=d";
		let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
		.createInstance(Ci.nsIXMLHttpRequest);
		xhr.open("GET", url + params, true);
		xhr.onreadystatechange = function (data) {
			if (xhr.readyState === 4) {
				var answerset = JSON.parse(xhr.response);
				if (typeof answerset === "object" && answerset.hasOwnProperty("entry")) {
					// Retrive entry data url
					var content = answerset.entry.content;
					let fetch = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
					.createInstance(Ci.nsIXMLHttpRequest);
					fetch.open('GET', content.src, true);
					fetch.responseType = 'arraybuffer';

					fetch.onload = function(e) {
						if (this.status == 200) {
							callback({success: true, result: base64ArrayBuffer(this.response)});
						} else {
							callback({success: false, error: true, error_msg: "Status was unsuccessful: " +this.status});
						}
					}
					fetch.send();
				}
			}
		};

		xhr.send();
	};

	/*
	* Uploads a BMP file to Picasa Webalbums. Assumes a user has been logged in through oauth
	* @param message the response from broadmask
	* @param file a BMP as string
	*
	*/
	this.upload = function(b64bmp, progresscb, callback) {
		// file is the wrapped BMP as string, base64 encoded
		var file = base64.decode(b64bmp);
		// we need to convert it to a blob
		var byteArray = new Uint8Array(file.length);
		for (var i = 0, len = file.length; i < len; i++) {
			byteArray[i] = file.charCodeAt(i) & 0xff;
		}

		// Get BMP blob
		// var builder = new (window.BlobBuilder || window.WebKitBlobBuilder)();
		// builder.append(byteArray.buffer);
		// var bmp = builder.getBlob("image/bmp");
		// var bmp = new Blob(byteArray.buffer, {type: "image\/bmp"});

		let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
		.createInstance(Ci.nsIXMLHttpRequest);

		// TODO upload to default album - create album per friendlist instead
		var url = 'https://picasaweb.google.com/data/feed/api/user/default/albumid/default';
		xhr.open('POST', url, true);

		xhr.setRequestHeader("GData-Version", '3.0');
		xhr.setRequestHeader("Content-Type", "image/bmp");

		get_auth_token(function(access_token) {
			xhr.setRequestHeader("Authorization", "Bearer " + access_token);
			// set progress handler
			xhr.upload.onprogress = progresscb;

			xhr.onreadystatechange = function (data) {
				console.log("Change state in upload with readystate " + xhr.readyState);
				if (xhr.readyState === 4) {
					var url = xhr.getResponseHeader("Content-Location");
					console.log("Returned from upload with status " + xhr.status + ". URL IS =? " + url);
					if (xhr.status === 201 && url !== null) {
						callback(xhr.status, url);
					} else {
						callback(xhr.status);
					}
				}
			};
			xhr.send(byteArray.buffer);
		});
	};

}).call(picasa);
