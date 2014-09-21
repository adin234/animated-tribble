var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    mysql			= require(__dirname + '/../lib/mysql'),
    curl			= require(__dirname + '/../lib/curl'),
    logger         	= require(__dirname + '/../lib/logger')
    us         		= require(__dirname + '/../lib/unserialize'),
    mongo			= require(__dirname + '/../lib/mongoskin');

exports.login = function (req, res, next) {
	var data = {},
		user,
		start = function () {
			curl.post
				.to(config.community.url, 80, '/zh/api/index.php?oauth/token')
				.send({
					username: 	req.body.username,
					password: 	req.body.password,
					client_id:	config.community.key,
					grant_type:	'password'
				}).then(get_user_data);
		},
		get_user_data = function (err, result) {
			if(err) {
				return next('Invalid Login');
			}

			data.access = result;
			curl.get
				.to(config.community.url, 80, '/zh/api/index.php?users/me')
				.send({
					'users/me': null,
					oauth_token: result.access_token
				}).then(send_response);
		},
		send_response = function (err, result) {
			if(err) {
				next(err);
			}
			var hashed = util.hash(data.access.access_token);
			data.user = result.user
			process.cache['access'] = process.cache['access'] || {};
			process.cache['access'][hashed] = data;
			result.user.access_code = hashed;
			res.send(result.user);
		};
	start();
};