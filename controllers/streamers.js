var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    mysql			= require(__dirname + '/../lib/mysql'),
    curl			= require(__dirname + '/../lib/curl'),
    logger         	= require(__dirname + '/../lib/logger');


exports.get_streamers = function (req, res, next) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	var data = {},
		user,
		start = function () {
			logger.log('info', 'Getting Streamers');
			mysql.open(config.mysql)
				.query(
					'SELECT * FROM xf_user_field_value INNER JOIN \
					xf_user ON xf_user.user_id = xf_user_field_value.user_id \
					WHERE field_id = ? AND field_value != ""',
					['twitchStreams'],
					format_buffer
				).end();
		},
		format_buffer = function (err, result) {
			var request = [];
			if (err) {
				logger.log('warn', 'Error getting the twitch');
				return next(err);
			}

			if(result.length === 0) {
				return res.status(500).send({message: 'No streamers found'});
			}

			result.forEach(function(item, i) {
				item.field_value = item.field_value.split(',').map(function(item) {
					var value = item.trim()
						.replace(/(http:\/\/)?(www.)?twitch\.tv\/?([a-zA-Z0-9_.]+)\/?/, '$3');
					request.push(value);
					return value
				});
				item.field_id = new Buffer( item.field_id, 'binary' ).toString();
			});

			data.streamers = result;

			curl.get
				.to('api.twitch.tv', 443, '/kraken/streams')
				.secured()
				.send({
					channel: request.join(',')
				}).then(format_response);
		},
		format_response = function (err, result) {
			var online_streamers = [];
			if (err) {
				logger.log('warn', 'Error getting the streamers from twitch');
				return next(err);
			}

			online_streamers = result.streams
				.map(function(item) {
					return item.channel.name;
				});

			data.streamers = data.streamers.filter(function(item, i) {
				item.field_value = item.field_value.filter(function(item2) {
					var indexed = ~online_streamers.indexOf(item2);
					if (indexed) {
						item.twitch = result.streams[-(indexed)-1];
					}

					return indexed;
				});
				return item.field_value.length;
			});
			send_response(null, data);
		},
		send_response = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the streamers');
				return next(err);
			}

			if(result.length === 0) {
				return res.status(500).send({message: 'user not found'});
			}

			res.send(result);
		};

	start();
};
