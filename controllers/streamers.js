var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    mysql			= require(__dirname + '/../lib/mysql'),
    games			= require(__dirname + '/games'),
    curl			= require(__dirname + '/../lib/curl'),
    logger         	= require(__dirname + '/../lib/logger');

exports.get_youtube_streamers = function (req, res, next) {
	var data = {},
		user,
		index = 0,
		start = function () {

			mysql.open(config.mysql)
				.query('SELECT user.*, refresh.*, youtube.field_value youtube \
					FROM xf_user_field_value refresh INNER JOIN \
					xf_user_field_value youtube ON \
					youtube.user_id = refresh.user_id  INNER \
					JOIN xf_user user ON user.user_id = refresh.user_id \
					WHERE youtube.field_id = \
					"youtube_id" AND refresh.field_id = "refresh_token"',
					[],
					get_token)
				.end();
		},
		get_token = function(err, result) {
			if(err) {
				console.log('error in getting the refresh');
				return next(err);
			}
			result.forEach(function(user) {
				if(user.field_value.trim().length) {
					user.field_id = new Buffer( user.field_id, 'binary' )
						.toString();
					data[user.youtube] = { user: user }
					index++;
					curl.post
					.to(
						'accounts.google.com',
						443,
						'/o/oauth2/token'
					)
					.secured()
					.send({
						client_id: config.api.client_id,
						client_secret: config.api.client_secret,
						refresh_token: user.field_value,
						grant_type: 'refresh_token'
					}).then(get_streams);
				}
			});
		},
		get_streams = function(err, result) {
			if(err) {
				console.log('error in getting stream');
				return next(err);
			}

			curl.get
				.to(
					'www.googleapis.com',
					443,
					'/youtube/v3/liveBroadcasts'
				)
				.secured()
				.add_header(
					'Authorization',
					'Bearer '+result.access_token
				)
				.send({
					part: 'snippet',
					broadcastStatus: 'active'
				})
				.then(update_status);
		},
		update_status = function( err, result) {
			index--;
			if(result && result.items && result.items.length) {
				data[result.items[0].snippet.channelId].streams = result;
			}
			console.log('INDEX ', index);
			if(index < 1) {
				format_response(null, data);
			}
		},
		format_response = function (err, result) {
			response = {streamers: []};
			console.log('result', result);
			for(i in result) {
				item = result[i];
				console.log('streamas', item.streams)
				if(item.streams) {
					item.streams.items.forEach(function(iitem) {
						var topush = JSON
							.parse(JSON.stringify(item.user))

						topush.youtube = iitem;

						response.streamers.push(topush);
					});
				}
				console.log(i);
			};

			send_response(err, response);
		},
		send_response = function( err, result) {
			if(err) {
				console.log('there is an error');
				return next(err);
			}

			console.log('will send result');

			res.send(result);
		};
	start();
};

exports.get_streamers = function (req, res, next) {
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


exports.get_streamers_data = function(req, res, next) {
	var data = {},
		user,
		limit,
		page,
		cacheKey = 'streamers.data',
		start = function() {

			limit 	= parseInt(req.query.limit) || 25;
			page 	= req.query.page || 1;

			var cache = util.get_cache(cacheKey+'.'+page);

			if(cache && typeof req.query.filter == 'undefined' && typeof req.query.console == 'undefined') {
				console.log('From Cache');
				return res.send(cache);
			}

			get_streamers();
		},
		get_streamers = function() {
			exports.get_streamers(req, {
				send: function(result) {
					data.streamers = result.streamers;
					get_videos(null, []);
				}
			});
		},
		get_videos = function(err, result) {
			var searchString = typeof req.query.search != 'undefined'
				? regexEscape(req.query.search)
				: '';

			var searchRegExp = new RegExp(searchString, 'i');

			return mongo.collection('videos')
				.find(
				    { $or : [
						{'snippet.title' : searchRegExp},
						{'snippet.channelTitle' : searchRegExp}
						]
					}
				)
				.sort({"snippet.publishedAt" : -1})
				.skip((page-1)*limit)
				.limit(limit)
				.toArray(bind_videos);
		},
		bind_videos = function(err, result) {
			data.videos = result;
			get_featured_games(null, []);
		},
		get_featured_games = function (err, result) {
		    if(err) {
		        next.err;
		    }

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

		        if(~(result[i].platforms.indexOf(req.query.console)) || req.query.console == undefined) {
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
		            send_response(null, data);
		        }
		    }, next);
		},
		send_response = function (err, result) {
		    if (err) {
		        logger.log('warn', 'error getting youtubers');
		        return next(err);
		    }

		    delete data.featured_games_tags;
		    delete data.games_tags;

		    util.set_cache(cacheKey+'.'+page, result);
		    res.send(result);
		};
	start();
}
