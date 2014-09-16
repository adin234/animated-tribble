var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    us         		= require(__dirname + '/../lib/unserialize'),
    mysql			= require(__dirname + '/../lib/mysql'),
    logger         	= require(__dirname + '/../lib/logger')
    games 			= require(__dirname + '/games'),
    streamers 		= require(__dirname + '/streamers');

exports.get_index = function (req, res, next) {
	var data = {},
		$options,
		date,
		start = function () {
			mysql.open(config.mysql)
				.query(
					'SELECT option_value FROM EWRporta_options WHERE option_id = ?',
					['recentnews_forum'],
					get_slider_options
				)
		},
		get_slider_options = function(err, result) {
			result = result[0];
			data.forum = us.unserialize(new Buffer(result.option_value, 'binary')
					.toString()).join(',');

			mysql.open(config.mysql)
				.query(
					"SELECT option_id, option_value from EWRporta_options \
					where option_id like 'recentfeatures_%'",
					[],
					get_slider
				).end();
		},
		get_slider = function(err, result) {
			$options = {};
			date = parseInt((+new Date)/1000);
			result.forEach(function(item, i) {
				$options[item.option_id] = new Buffer(item.option_value, 'binary')
					.toString();
			});
			mysql.open(config.mysql)
				.query(
					"SELECT xf_thread.*, xf_post.message, xf_attachment.*, \
						xf_attachment_data.*, xf_post_field_value.field_value as header_location, \
						IF(EWRporta_promotes.promote_date IS NULL, xf_thread.post_date, \
							EWRporta_promotes.promote_date) AS promote_date \
					FROM xf_thread \
						INNER JOIN xf_post ON (xf_post.post_id = xf_thread.first_post_id) \
						INNER JOIN xf_attachment ON (xf_attachment.content_id = xf_thread.first_post_id \
							AND xf_attachment.content_type = 'post') \
						INNER JOIN xf_attachment_data ON (xf_attachment_data.data_id = xf_attachment.data_id \
							AND xf_attachment_data.filename = ? AND xf_attachment_data.thumbnail_width > 0) \
						LEFT JOIN xf_post_field_value ON (xf_post_field_value.post_id = xf_post.post_id AND \
							xf_post_field_value.field_id = 'headerLocation') \
						LEFT JOIN EWRporta_promotes ON (EWRporta_promotes.thread_id = xf_thread.thread_id) \
					WHERE (xf_thread.node_id IN ("+data.forum+") OR EWRporta_promotes.promote_date < ?) \
						AND xf_thread.discussion_state = 'visible' \
						AND IF(EWRporta_promotes.promote_date IS NULL, xf_thread.post_date, EWRporta_promotes.promote_date) < ? \
					ORDER BY promote_date DESC \
					LIMIT "+$options['recentfeatures_limit'],
					[$options['recentfeatures_filename'], date, date],
					get_featured_games
				).end();
		},
		get_featured_games = function (err, result) {
			if(err) {
				next.err;
			}

			data.slider = result;
			delete data.forum;

			if(req.query.console) {
				return mysql.open(config.mysql)
					.query(
						'select a.*, c.active, \
						c.featured_date, c.priority, \
						c.active, b.tags \
						from anytv_games_consoles a \
						inner join anytv_game_tags b on \
						a.id = b.game_id \
						left join anytv_game_featured c on \
						a.id = c.game_id AND c.active = 1 \
						order by priority',
						[],
						filter_tags
					).end();
			}

			get_featured_videos();
		},
		filter_tags = function(err, result) {
			if(err) {
				return next(err);
			}

			data.games = [];
			data.games_ids = [];
			data.featured_games = [];
			data.featured_games_ids = [];

			for(var i=0; i < result.length; i++) {
				result[i].platforms = result[i].platforms && result[i].platforms
					.split(',').map(function(e) {
						return e.trim();
					});
				result[i].tags = result[i].tags && result[i].tags
					.split(',').map(function(e) {
						return e.trim();
					});

				if(~(result[i].platforms.indexOf(req.query.console))) {
					data.games.push(result[i]);
					data.games_ids.push(result[i].id);
					if(result[i].active) {
						data.featured_games.push(result[i]);
						data.featured_games_ids.push(result[i].id);
					}
				}
			}

			return games.get_games(req, {
				send: function(item) {
					data.featured_games_tags = [];
					data.featured_games.forEach(function(item, i) {
						data.featured_games_tags = data.featured_games_tags.concat(item.tags);
					});

					data.games_tags = [];
					data.games.forEach(function(item, i) {
						data.games_tags = data.games_tags.concat(item.tags);
					});

					data.featured_games = [];
					data.games = [];
					item.forEach(function(item, i) {
						if(~data.games_ids.indexOf(item.id)) {
							data.games.push(item);
							if(~data.featured_games_ids.indexOf(item.id)) {
								data.featured_games.push(item);
							}
						}
					});

					delete data.games_ids;
					delete data.featured_games_ids;

					get_featured_videos();
				}
			}, next);
		},
		get_featured_videos = function(err, result) {
			mysql.open(config.mysql)
				.query(
					'select * from anytv_video_featured where \
					active = 1 order by priority asc',
					[],
					function(err, result) {
						get_videos(err, [{
							ids : result.map(function(item) { return item.video_id; })
						}])
					}
				).end();
		},
		get_videos = function(err, result) {
			if(err) {
				return next(err);
			}

			var where = {
				'snippet.resourceId.videoId': {
					$in: result[0].ids
				}
			};

			if(req.query.console) {
				where = {
					$and : [
						where,
						{
							'snippet.meta.tags' : {
								$in : data.featured_games_tags
							}
						}
					]
				}
			}

			mongo.collection('videos')
				.find(where)
				.toArray(get_latest_videos);
		},
		get_latest_videos = function(err, result) {
			if(err) {
				return next(err);
			}

			data.featured_videos = result;

			var today = new Date();
			var yesterday = new Date();
			yesterday.setDate(today.getDate()-1);
			var minus2days = new Date();
			minus2days.setDate(today.getDate()-2);
			var minus3days = new Date();
			minus3days.setDate(today.getDate()-3);

			var where = {
				'snippet.publishedAt' : {
					$in: [
						new RegExp(today.toYMD()),
						new RegExp(yesterday.toYMD()),
						new RegExp(minus2days.toYMD()),
						new RegExp(minus3days.toYMD())
					]
				}
			};

			if(req.query.console) {
				where = {
					$and : [
						where,
						{
							'snippet.meta.tags' : {
								$in : data.games_tags
							}
						}
					]
				}
			}

			mongo.collection('videos')
				.find(where)
				.toArray(function(err, result) {
					data.latest_videos = result;
					get_featured_youtubers();
				});
		},
		get_featured_youtubers = function (err, result) {
			mysql.open(config.mysql)
				.query(
					'select * from anytv_user_featured \
					where active = 1 order by priority asc',
					[],
					function(err, result) {
						data.featured_users = result.map(function(item, i) {
							return item.user_id;
						}).join(',');

						get_users();
					}
				).end();
		},
		get_users = function (err, result) {
			mysql.open(config.mysql)
				.query(
					'select user_id, username \
					from xf_user \
					where user_id in ('+data.featured_users+')',
					[],
					function (err, result) {
						data.featured_users = result;
						if(!data.featured_games) {
							return games.get_games(req, { send: function (item) {
								data.games = item;
								req.query.featured = 1;
								games.get_games(req, {
									send: function(item) {
										data.featured_games = item;
										delete req.query.featured;
										that(null, data);
									}
								});
							}}, next);
						}

						that(null, data);
					}
				).end();
		},
		send_response = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the index');
				return next(err);
			}

			delete data.featured_games_tags;
			delete data.games_tags;

			res.send(result);
		},
		that = send_response;

	start();
};
