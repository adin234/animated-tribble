var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    mysql			= require(__dirname + '/../lib/mysql'),
    curl			= require(__dirname + '/../lib/curl'),
    logger         	= require(__dirname + '/../lib/logger')
    us         		= require(__dirname + '/../lib/unserialize'),
    mongo			= require(__dirname + '/../lib/mongoskin');

exports.send_message = function(req, res, next) {
	var data = {},
		start = function () {
			send_response(null, req);
		},
		send_response = function (err, result) {
			if(err) {
				return next(err);
			}

			res.send(result);
		};

	start();
};