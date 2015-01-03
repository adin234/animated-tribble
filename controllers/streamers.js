var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    mysql			= require(__dirname + '/../lib/mysql'),
    games			= require(__dirname + '/games'),
    curl			= require(__dirname + '/../lib/curl'),
    logger         	= require(__dirname + '/../lib/logger');

exports.get_views = function (req, res, next) {
	var data = {},
		start = function () {
			var twitch = req.params.twitch || false;
			var type = twitch.substr(0,2);
			twitch = twitch.substr(2);
			if(type == 'TW') {
				return curl.get
					.to('api.twitch.tv', 443, '/kraken/streams/'+twitch)
					.secured()
					.send()
					.then(send_response);
			}

			send_response(null, 'No data');
		},
		send_response = function (err, result) {
			if(err) {
				return next(err);
			}

			res.send(result);
		};
	start();
};

exports.get_youtube_streamers = function (req, res, next) {
	var data = {},
		user,
		index = 0,
		cacheKey = 'streamers.youtube',
		start = function () {
			cacheKey = req.query.lanparty ? cacheKey+'.lan' : cacheKey;
			cacheKey += req.query.user;
			var cache = util.get_cache(cacheKey);

			if(cache) {
				console.log('From Cache');
				return res.send(cache);
			}

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
				if(user.field_value.trim().length && (req.query.user ? user.user_id == req.query.user : 1)) {
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
			for(i in result) {
				item = result[i];
				console.log('streamas', item.streams)
				if(item.streams) {
					item.streams.items.forEach(function(iitem) {
						var topush = JSON
							.parse(JSON.stringify(item.user))

						topush.youtube = iitem;

						var lanparty_check = req.query.checker || 'LAN PARTY';
						lanparty_check = new RegExp(lanparty_check,'ig');
						if(!req.query.lanparty || (
							req.query.lanparty
							&& (topush.youtube.snippet
								.description.reIndexOf(lanparty_check)
								|| topush.youtube.snippet
									.title.reIndexOf(lanparty_check)))
						) {
							response.streamers.push(topush);
						}
					});
				}
			};

			send_response(err, response);
		},
		send_response = function( err, result) {
			if(err) {
				console.log('there is an error');
				return next(err);
			}

			console.log('will send result');

			util.set_cache(cacheKey, result, 60);

			res.send(result);
		};
	start();
};

exports.get_is_streaming = function (req, res, next) {
var data = {},
		twich,
		youtube,
		cacheKey = 'streaming.is_streaming'
		start = function() {
			twitch = req.params.twitch || false;
			youtube = req.params.youtube || false;

			var cache = util.get_cache(cacheKey+'.'+twitch+'.'+youtube);

			if(cache) {
				console.log('From Cache');
				return res.send(cache);
			}

			data.youtube = {};
			data.twitch = {};

			check_twitch();
		},
		check_twitch = function() {
			curl.get
				.to('api.twitch.tv', 443, '/kraken/streams/'+twitch)
				.secured()
				.send()
				.then(bind_twitch_data);
		},
		bind_twitch_data = function(err, result) {
			data.twitch = result;
			check_youtube();
		},
		check_youtube = function() {
			mysql.open(config.mysql)
				.query('SELECT refresh.*, youtube.field_value youtube \
					FROM xf_user_field_value refresh \
					INNER JOIN xf_user_field_value youtube ON youtube.user_id = refresh.user_id  \
					WHERE youtube.field_value = "'+youtube+'" \
					AND youtube.field_id = "youtube_id" \
					AND refresh.field_id = "refresh_token"',
					[],
					get_token)
				.end();
		},
		get_token = function(err, result) {
			if(result.length) {
				return send_response();
			}
			if(err) {
				console.log('error in getting the refresh');
				return next(err);
			}

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
					refresh_token: result[0].field_value,
					grant_type: 'refresh_token'
				}).then(get_streams);

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
				.then(bind_youtube_data);
		},
		bind_youtube_data = function( err, result) {
			data.youtube = result;
			send_response();
		},
		send_response = function (err, result) {
		    if (err) {
		        logger.log('warn', 'error getting youtubers');
		        return next(err);
		    }

		    delete data.featured_games_tags;
		    delete data.games_tags;

		    util.set_cache(cacheKey+'.'+twitch+'.'+youtube, data, 30);
		    res.send(data);
		};

	start();
}

exports.get_streamers = function (req, res, next) {
	var data = {},
		user,
		cache,
		cacheKey = 'streamers.twitch',
		start = function () {
			logger.log('info', 'Getting Streamers');
			if(req.query.user) {
				cacheKey+=req.query.user;
			}

			if(req.query.lanparty) {
				cacheKey+='.lanparty';
			}

			var cache = util.get_cache(cacheKey);

			if(cache) {
				console.log('From Cache');
				return res.send(cache);
			}

			where = '';
			join = '';

			if(req.query.user) {
				where = ' AND xf_user.user_id = '+req.query.user;
			}

			if(req.query.lanparty) {
				join = 'INNER JOIN xf_user_group_relation ON \
					xf_user_group_relation.user_id = xf_user.user_id';
				where = ' AND xf_user_group_relation.user_group_id = 5';
			}

			mysql.open(config.mysql)
				.query(
					'SELECT * FROM xf_user_field_value INNER JOIN \
					xf_user ON xf_user.user_id = xf_user_field_value.user_id \
					'+join+' WHERE field_id = ? AND field_value != ""'+where,
					['twitchStreams'],
					format_buffer
				).end();
		},
		format_buffer = function (err, result) {
			if(err) {
				return next(err);
			}

			if(!cache) {
				util.set_cache('streamers', JSON.parse(JSON.stringify(result)), 30);
			}

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

			mongo.collection('lan_party').find({}, function(err, result1) {
				if(err) {
					return next(err);
				}

				if(result1.length) {
					var temp;
					var twitch = result1[0].lanparty_twitch_channel || '';
					twitch = twitch.trim()
						.replace(/(http:\/\/)?(www.)?twitch\.tv\/?([a-zA-Z0-9_.]+)\/?/, '$3');

					if(result.length) {
						request.push(twitch);
						temp = JSON.parse(JSON.stringify(result[0]));
						temp.field_value = [twitch];
						result.push(temp);
					}
				}

				data.streamers = result;

				curl.get
					.to('api.twitch.tv', 443, '/kraken/streams')
					.secured()
					.send({
						channel: request.join(',')
					}).then(format_response);
				});

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

			var streamers = [];

			data.streamers = data.streamers.filter(function(item, i) {
				item.field_value = item.field_value.filter(function(item2) {
					var indexed = ~online_streamers.indexOf(item2);
					if (indexed) {
						item.twitch = result.streams[-(indexed)-1];
						var newitem = JSON.parse(JSON.stringify(item));
						newitem.field_value = [item2];
						var lanparty_check = req.query.checker || 'LAN PARTY';
						lanparty_check = new RegExp(lanparty_check,'ig');
						if(!req.query.lanparty || (
							req.query.lanparty
							&& newitem.twitch.channel
								.status.reIndexOf(lanparty_check))
						) {
							streamers.push(newitem);
						}
					}

					return indexed;
				});
				return item.field_value.length;
			});

			data.streamers = streamers;
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

			util.set_cache(cacheKey, result, 60);

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
