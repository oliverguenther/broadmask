/**
* Handle auth status, update buttons accordingly
*/
self.port.on("auth_status", function (message) {
	if (message.auth_status === true) {
		$('#' + message.handler + 'authbtn')
			.val('Revoke Authorization')
			.removeClass('btn-success')
			.addClass('btn-danger')
			.attr("data-action", "logout");
		$('.' + message.handler + 'auth-toggle').show();
	} else {
		$('#' + message.handler + 'authbtn')
			.addClass('btn-success')
			.removeClass('btn-danger')
			.val('Authorize')
			.attr("data-action", "login");
		$('.' + message.handler + 'auth-toggle').hide();
	}
});
$('#picasaauthbtn').val('loading');
$('#facebookauthbtn').val('loading');
self.port.emit("auth_status", {handler: "picasa"});
self.port.emit("auth_status", {handler: "facebook"});

$('#picasaauthbtn').click(function(e) {
	e.preventDefault();
	if ($(this).attr("data-action") === "logout") {
		self.port.emit("revoke_auth", {handler: "picasa"});
	} else {
		self.port.emit("authorize", {handler: "picasa"});
	}
});

$('#facebookauthbtn').click(function(e) {
	e.preventDefault();
	if ($(this).attr("data-action") === "logout") {
		self.port.emit("revoke_auth", {handler: "facebook"});
	} else {
		self.port.emit("authorize", {handler: "facebook"});
	}
});
