var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    mysql			= require(__dirname + '/../lib/mysql'),
    logger         	= require(__dirname + '/../lib/logger'),
    cache			= {};


exports.get_user = function (req, res, next) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	var data = {},
		user,
		start = function () {
			if(cache[req.params.id]) {
				return send_response(null, cache[req.params.id]);
			}

			logger.log('info', 'Getting User');
			mysql.open(config.mysql)
				.query(
					'SELECT * FROM xf_user where user_id = ? LIMIT 1',
					[req.params.id],
					get_custom_fields
				).end();
		},

		get_custom_fields = function(err, result) {
			if (err) {
				logger.log('warn', 'Error getting the user');
				return next(err);
			}

			if(result.length === 0) {
				logger.log('warn', 'user does not exist');
				return send_response({message: "User does not exist"});	
			}

			user = result[0];
			mysql.open(config.mysql)
				.query(
					'SELECT * FROM xf_user_field_value where user_id = ?',
					[result[0].user_id],
					fix_response_data
				).end();
		},

		fix_response_data = function (err, result) {
			var custom_field_data = {};
			result.forEach(function(item, i) {
				custom_field_data[new Buffer( item.field_id, 'binary' ).toString()] = item.field_value;
			});

			user.custom_fields = custom_field_data;
			send_response(null, user);
		},

		send_response = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the user');
				return next(err);
			}

			if(result.length === 0) {
				return res.status(500).send({message: 'user not found'});
			}

			if(!cache[req.params.id]) {
				cache[req.params.id] = result[0];
			}

			res.send(result[0]);
		};

	start();
};
