var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    mysql			= require(__dirname + '/../lib/mysql'),
    curl			= require(__dirname + '/../lib/curl'),
    logger         	= require(__dirname + '/../lib/logger')
    us         		= require(__dirname + '/../lib/unserialize'),
    mongo			= require(__dirname + '/../lib/mongoskin');

exports.get_shows = function (req, res, next) {
	var data = {},
		user,
		cacheKey = 'show.page',
		start = function () {
			var cache = util.get_cache(cacheKey);

            if(cache && typeof req.query.filter == 'undefined' && typeof req.query.console == 'undefined') {
                console.log('From Cache');
                return res.send(cache);
            }

			if(req.query.playlist) {
				data.playlist = req.query.playlist;
				data.page_token = req.query.pageToken || null;
				return get_playlist_videos();
			}

			return mysql.open(config.mysql)
				.query(
					"select (\
						select option_value from xf_option where option_id  = 'ShowsChannel'\
					) channel, ( \
					select option_value from xf_option where option_id = 'ShowsPlaylist'\
					) playlist LIMIT 1",
					[],
					get_shows_videos
				);
		},
		get_playlist_videos = function (err, result) {
			if(err) {
				return next(err);
			}

			var request_data = {
				part: 'snippet',
				playlistId: data.playlist,
				key: config.youtube_key,
				maxResults: 20
			};

			if(data.page_token) {
				request_data['pageToken'] = data.page_token;
			}

			return curl.get
				.to('www.googleapis.com', 443, '/youtube/v3/playlistItems')
				.secured()
				.send(request_data).then(send_response);
		},
		get_shows_videos = function (err, result) {
			data.config = {};
			data.config.channel = new Buffer(result[0].channel, 'binary').toString();
			data.config.playlist = new Buffer(result[0].playlist, 'binary').toString();

			return mongo.collection('shows')
				.find()
				.toArray(get_shows_playlists);
		},
		get_shows_playlists = function (err, result) {
			if(err) {
				return next(err);
			}

			data.videos = result;

			return mongo.collection('showsPlaylists')
				.find()
				.toArray(get_categories);

		},
		get_categories = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the twitch');
				return next(err);
			}

			data.playlists = result;

			return mysql.open(config.mysql)
				.query(
					"SELECT option_id, option_value FROM xf_option WHERE option_id = 'ShowsCategories' LIMIT 1",
					[],
					format_response
				);
		},
		format_response = function (err, result) {
			if(err) {
				return next(err);
			}
			result = result[0];

			var options = [];

			result.option_id = new Buffer(result.option_id, 'binary').toString();
			result.option_value = us.unserialize(new Buffer(result.option_value, 'binary').toString());

			for(var i=0; i<result.option_value.category_id.length; i++) {
				if(result.option_value.category_id[i].length) {
					options.push({
						id: result.option_value.category_id[i],
						name: result.option_value.category_name[i],
						tags: result.option_value.tags[i]
					})
				}
			}

			data.categories = options;

			return send_response(err, data);
		},
		send_response = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the streamers');
				return next(err);
			}

			if(!result || result.length === 0) {
				return res.status(500).send({message: 'user not found'});
			}

			res.send(result);
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
