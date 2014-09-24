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
		cacheKey = 'games.data',
		start = function () {
			logger.log('info', 'Getting Games');
			var cache = util.get_cache(cacheKey);

            if(cache && typeof req.query.filter == 'undefined' && typeof req.query.console == 'undefined') {
                console.log('From Cache');
                return res.send(cache);
            }

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

			util.set_cache(cacheKey, result[0]);

			res.send(result[0]);
		};

	start();
};

exports.get_game_videos = function (req, res, next) {
	var data = {},
		user,
		limit,
		page,
		cacheKey = 'games.video.'+req.params.gameid,
		regexEscape= function(s) {
		    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
		},
		start = function () {
			logger.log('info', 'Getting Game Videos');

			limit 	= parseInt(req.query.limit) || 25;
			page 	= req.query.page || 1;

			var cache = util.get_cache(cacheKey+'.'+page);

            if(cache && typeof req.query.filter == 'undefined' && typeof req.query.console == 'undefined') {
                console.log('From Cache');
                return res.send(cache);
            }

			var params = [req.params.gameid];
			var where = ' where game_id = ? limit 1';

			if(req.params.gameid == 'all' || req.params.gameid == '') {
				params = [];
				where = ''
			}

			mysql.open(config.mysql)
				.query(
					'select * from anytv_game_tags' + where,
					params,
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
		},
		get_videos = function(err, result) {
			if (err) {
				return next(err);
			}

			if(result.length > 0) {
				var searchString = typeof req.query.search != 'undefined'
					? regexEscape(req.query.search)
					: '';

				var searchRegExp = new RegExp(searchString, 'i');

				var find_params = {
					$and : [{
							'snippet.meta.tags' : {
								$in : result
							}
						},
						{
							$or : [
								{'snippet.title' : searchRegExp},
								{'snippet.channelTitle' : searchRegExp}
							]
						}
					]
				};

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
							},
							{
								$or : [
									{'snippet.title' : searchRegExp},
									{'snippet.channelTitle' : searchRegExp}
								]
							}
						]
					}
				}

				return mongo.collection('videos')
					.find(find_params)
					.sort({"snippet.publishedAt" : -1})
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

			util.set_cache(cacheKey+'.'+page, result);

			res.send(result);
		};
	start();
};

exports.get_game_playlists = function (req, res, next) {
	var data = {},
		user,
		limit,
		page,
		cacheKey = 'games.playlist.'+req.params.gameid,
		start = function () {
			logger.log('info', 'Getting Game playlists');
			limit 	= parseInt(req.query.limit) || 25;
			page 	= req.query.page || 1;

			var cache = util.get_cache(cacheKey+'.'+page);

            if(cache && typeof req.query.filter == 'undefined' && typeof req.query.console == 'undefined') {
                console.log('From Cache');
                return res.send(cache);
            }

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

			util.set_cache(cacheKey+'.'+page, result);

			res.send(result);
		};
	start();
};


exports.get_games_data = function(req, res, next) {
	var data = {},
		user,
		limit,
		page,
		cacheKey = 'games.page',
		start = function() {
			limit 	= parseInt(req.query.limit) || 25;
			page 	= req.query.page || 1;
			var cache = util.get_cache(cacheKey+'.'+page);

            if(cache && typeof req.query.filter == 'undefined' && typeof req.query.console == 'undefined') {
                console.log('From Cache');
                return res.send(cache);
            }

			get_videos(null, []);
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

		    return exports.get_games(req, {
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
};
