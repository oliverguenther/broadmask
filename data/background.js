	var module = null;

	window.addEventListener("pluginLoaded", function( event ) {
		// set the module through unsafeWindow
		module = unsafeWindow.document.getElementById("broadmask");
		module = XPCNativeWrapper.unwrap(module);
		self.port.emit("pluginLoaded");
	});


	self.port.on("pluginCall", function(msg) {
		var response = {id: msg.id, method: msg.method, caller: msg.caller};
		if (module) {

			// check if requesting property;
			if (msg.is_property) {
				response.response = module[msg.method];
			} else {
				response.response = module[msg.method].apply(this, msg.args);
			}
		} else {
			response.response = {error: true, error_msg: "Module not loaded!"};
		}
		self.port.emit("pluginResponse", response);
	});
