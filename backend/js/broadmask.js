function Broadmask() {

	// Setup API handlers
	this.imgHost = new Broadmask_Picasa();
	this.osn = new Broadmask_Facebook();

	// Handler for NPAPI module
	this.module = null;

}


/**
* Handle new images from API calls or content scripts.
* Unwraps the message and requests images from the imgHost
* @param urls an array of image URLs
* @param callback a function to display/handle the loaded dataURLs
*/
Broadmask.prototype.handleImages = function (urls, cb) {
	"use strict";
	if (!Array.isArray(urls)) {
		return;
	}

	var processImages = function (array, fn, callback) {
		var completed = 0;
		if (array.length === 0) {
			callback(); // done immediately
		}
		for(var i = 0, len = array.length; i < len; i++) {
			var src = array[i];
			fn(src, function(dataURL) {
				chrome.extension.getBackgroundPage().newUnread(src, dataURL);
				completed++;
				if(completed === array.length) {
					callback();
				}
			});
		}
	};

	processImages(urls, this.imgHost.fetchImage.bind(this.imgHost), cb);
};

Broadmask.prototype.uploadImage = function (scope, receivers, imageElement, callback) {
	var that = this;
	this.encrypt(scope, receivers, imageElement.src, true, function(wrapped) {
		var progress = document.createElement("progress");
		progress.value = 0;
		progress.max = 100;
		$(imageElement).parent().parent().append(progress);
		that.imgHost.uploadImage(wrapped, progress, function (xhrstatus, url) {
			var statusicon = document.createElement("img");
			if (url !== undefined) {
				statusicon.src = chrome.extension.getURL("img/ok.png");
				imageElement.setAttribute("rel", url);
				$(imageElement).parent().parent().append("<p><a href=\"" + url +"\">Link</a></p>");
				callback(url);
			} else {
				statusicon.src = chrome.extension.getURL("img/warning.png");
				// TODO allow retry with dataURL (popover)
			}
			$(progress).replaceWith(statusicon);
		});
	});
};


Broadmask.prototype.shareParams = function (scope, receivers, public_params, privkeys) {
	"use strict";
	if (!localStorage["system_" + scope]) {
		var system = {},
		sentkeys = [],
		cursent = 0;
		system.scope = scope;
		system.pubkey = public_params;
		system.pubkey_shared = false;
		system.receivers = JSON.stringify(receivers);

		var messages = [];
		for (var i = 0; i < receivers.length; i += 1) {
			var message = {},
			content = {};	

			content.message = privkeys[i];
			content.privacy = {value: 'CUSTOM', friends: 'SOME_FRIENDS', allow: receivers[i]};
			

			message.body = $.param(content);
			message.relative_url = "me/feed";
			message.method = "POST";
			messages.push(message);
		}

		shareBatch(messages, function(result) {
			console.log(result);
		});

		}
	};

	/** Send request to encrypt to BMP */
	Broadmask.prototype.encrypt = function (scope, receivers, data, asimage, callback) {
		// Start sender instance
		var public_params = this.module.start_sender_instance(scope, 256),
		privkeys = [];

		for (var i = 0; i < receivers.length; i += 1) {
			this.module.add_member(scope, receivers[i]);
			var privkey_i = this.module.get_member_sk(scope, receivers[i]);
			privkeys[receivers[i]] = privkey_i;
		}

		this.shareParams(scope, receivers, public_params, privkeys);

		var cts = this.module.encrypt_b64(scope, receivers, data, asimage);
		callback(cts);
	};

	/** Send request to unwrap image to BMP */
	Broadmask.prototype.decrypt = function (scope, data, fromimage, callback) {
	};

	Broadmask.prototype.getKeyMap = function (callback) {
		var list = this.module.gpg_associatedKeys();
		callback(list);
	}


	/** Called when NPAPI plugin is loaded */
	Broadmask.prototype.moduleDidLoad = function () {
		this.module = document.getElementById("broadmask");
	};

	Broadmask.prototype.moduleValid = function () {
		return (this.module && this.module.valid);
	}

	Broadmask.prototype.run = function () {
		var listener = document.getElementById("broadmask_listener");

		// Setup NPAPI plugin
		listener.innerHTML = '<object id="broadmask" type="application/x-broadmask" width="0" height="0"><param name="onload" value="pluginLoaded" /></object>';
	};
