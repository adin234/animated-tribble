var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    mysql			= require(__dirname + '/../lib/mysql'),
    curl			= require(__dirname + '/../lib/curl'),
    logger         	= require(__dirname + '/../lib/logger')
    us         		= require(__dirname + '/../lib/unserialize'),
    mongo			= require(__dirname + '/../lib/mongoskin');


exports.get_games = function (req, res, next) {
	var data = {},
		user,
		start = function () {
			logger.log('info', 'Getting Games');
			if(req.query.featured) {
				return get_featured();
			}

			if(req.query.filter) {
				data = req.query.filter.split(',');
				req.query.featured = true;
			}

			return get_games();
		},
		get_featured = function (err, result) {
			mysql.open(config.mysql)
				.query(
					'select * from anytv_game_featured \
					where active = 1 order by priority asc',
					[],
					function(err, result) {
						data = result.map(function(item, i) {
							return item.game_id;
						});

						get_games();
					}
				).end();
		},
		get_games = function (err, result) {
			return mysql.open(config.mysql)
				.query(
					'select * from xf_option \
					where option_id = \'anytv_categories_categories\'',
					[],
					format_buffer
				).end();
		}
		format_buffer = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the twitch');
				return next(err);
			}

			if(result.length === 0) {
				return res.status(500).send({message: 'No streamers found'});
			}

			result[0].option_id = new Buffer( result[0].option_id, 'binary' ).toString();
			result[0].option_value = us.unserialize(new Buffer( result[0].option_value, 'binary' )
					.toString());
			result[0].default_value = new Buffer( result[0].default_value, 'binary' ).toString();
			result[0].addon_id = new Buffer( result[0].addon_id, 'binary' ).toString();

			var values = result[0].option_value;
			var finalvalue = [];
			for(var i=0; i<values.game_id.length; i++) {
				if(values.game_id[i].length && 
					(req.query.featured 
						? ~data.indexOf(values.game_id[i]) 
						: 1)
				) {
					finalvalue.push({
						id		: values.game_id[i],
						name	: values.game_name[i],
						image	: values.game_image[i],
					});
				}
			}

			return send_response(null, [finalvalue]);
		},
		send_response = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the streamers');
				return next(err);
			}

			if(!result || result.length === 0) {
				return res.status(500).send({message: 'user not found'});
			}

			res.send(result[0]);
		};

	start();
};

exports.get_game_videos = function (req, res, next) {
	var data = {},
		user,
		limit,
		page,
		start = function () {
			logger.log('info', 'Getting Game Videos');
			limit 	= req.query.limit || 25;
			page 	= req.query.page || 1;

			mysql.open(config.mysql)
				.query(
					'select * from anytv_game_tags \
					where game_id = ? limit 1',
					[req.params.gameid],
					get_tags
				).end();
		},
		get_tags = function (err, result) {
			if (err) {
				return next(err);
			}

			if(result.length === 0) {
				return send_response(null, result);
			}

			var tags = result[0].tags.split(',').map(function(item) {
				return item.trim();
			});

			if(req.query.featured) {
				return get_featured(null, tags);
			}
			get_videos(null, tags);
		},
		get_featured = function(err, resultags) {
			mysql.open(config.mysql)
				.query(
					'select * from anytv_video_featured where \
					active = 1 order by priority asc',
					[],
					function(err, result) {
						get_videos(err, [{
							ids : result.map(function(item) { return item.video_id; }),
							tags: resultags
						}])
					}
				).end();
		}
		get_videos = function(err, result) {
			if (err) {
				return next(err);
			}

			if(result.length > 0) {
				var find_params = {
					'snippet.meta.tags' : {
						$in : result
					}
				}

				if(result[0].tags) {
					find_params = {
						$and : [{
								'snippet.meta.tags' : {
									$in : result[0].tags
								}
							},
							{
								'snippet.resourceId.videoId': {
									$in: result[0].ids
								}
							}
						]
					}
				}
				return mongo.collection('videos')
					.find(find_params)
					.skip((page-1)*limit)
					.limit(limit)
					.toArray(send_response);
			}

			return send_response(null, []);
		},

		send_response = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the streamers');
				return next(err);
			}

			res.send(result);
		};
	start();
};

exports.get_game_playlists = function (req, res, next) {
	var data = {},
		user,
		limit,
		page,
		start = function () {
			logger.log('info', 'Getting Game playlists');
			limit 	= req.query.limit || 25;
			page 	= req.query.page || 1;

			mysql.open(config.mysql)
				.query(
					'select * from anytv_game_tags \
					where game_id = ? limit 1',
					[req.params.gameid],
					get_tags
				).end();
		},
		get_tags = function (err, result) {
			if (err) {
				return next(err);
			}

			if(result.length === 0) {
				return send_response(null, result);
			}

			var tags = result[0].tags.split(',').map(function(item) {
				return item.trim();
			});

			get_playlists(null, tags);
		},
		get_playlists = function(err, result) {
			if(result.length > 0) {
				return mongo.collection('playlists')
					.find({
						'snippet.tags' : {
							$in : result
						}
					})
					.toArray(send_response);
			}

			send_response(null, []);
		}
		send_response = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the streamers');
				return next(err);
			}

			res.send(result);
		};
	start();
};
