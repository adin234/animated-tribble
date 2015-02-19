var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    us         		= require(__dirname + '/../lib/unserialize'),
    mysql			= require(__dirname + '/../lib/mysql'),
    curl			= require(__dirname + '/../lib/curl'),
    logger         	= require(__dirname + '/../lib/logger'),
    games 			= require(__dirname + '/games'),
    streamers 		= require(__dirname + '/streamers');

exports.get_index = function (req, res, next) {
	var data = {},
		$options,
		date,
		cacheKey = 'index.page',
		start = function () {
			cacheKey = cacheKey+req.query.console;
			var cache = util.get_cache(cacheKey);

			if(cache && typeof req.query.filter == 'undefined' && typeof req.query.console == 'undefined') {
				console.log('From Cache');
				return res.send(cache);
				return;
			}

			mysql.open(config.mysql)
				.query(
					'SELECT option_value FROM EWRporta_options WHERE option_id = ?',
					['recentnews_forum'],
					get_feature_list
				).end();
		},
		get_feature_list = function(err, result) {
			if(err) {
				return next(err);
			}

			result = result[0];
			data.forum = us.unserialize(new Buffer(result.option_value, 'binary')
					.toString()).join(',');

			mysql.open(config.mysql)
				.query(
					'SELECT * from xf_option where option_id in ("feature_list_header",'
						+' "feature_list_items", "feature_list_active")',
					[],
					get_slider_options
				).end();
		},
		get_slider_options = function(err, result) {
			if(err) {
				console.log('No results');
				return next(err);
			}

			$options = {};
			result.forEach(function(item, i) {
				$options[item.option_id] = new Buffer(item.option_value, 'binary')
					.toString();
			});

			var tmp = us.unserialize($options['feature_list_items']);

			$options['feature_list_items'] = [];

			for(var i in tmp['image']) {
				if(tmp['image'][i].trim().length
					&& tmp['label'][i].trim().length
					&& tmp['link'][i].trim().length ) {
					$options['feature_list_items'].push({
						image: tmp['image'][i],
						label: tmp['label'][i],
						link: tmp['link'][i]
					});
				}
			}

			data.feature_list = $options;

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
						xf_attachment_data.*, header.field_value as header_location, \
						youtube.field_value as youtube_link, \
						IF(EWRporta_promotes.promote_date IS NULL, xf_thread.post_date, \
							EWRporta_promotes.promote_date) AS promote_date \
					FROM xf_thread \
						INNER JOIN xf_post ON (xf_post.post_id = xf_thread.first_post_id) \
						INNER JOIN xf_attachment ON (xf_attachment.content_id = xf_thread.first_post_id \
							AND xf_attachment.content_type = 'post') \
						INNER JOIN xf_attachment_data ON (xf_attachment_data.data_id = xf_attachment.data_id \
							AND xf_attachment_data.filename = ? AND xf_attachment_data.thumbnail_width > 0) \
						LEFT JOIN xf_post_field_value header ON (header.post_id = xf_post.post_id AND \
							header.field_id = 'headerLocation') \
						LEFT JOIN xf_post_field_value youtube ON (youtube.post_id = xf_post.post_id AND \
							youtube.field_id = 'youtube_link') \
						LEFT JOIN EWRporta_promotes ON (EWRporta_promotes.thread_id = xf_thread.thread_id) \
					WHERE (xf_thread.node_id IN ("+data.forum+") OR EWRporta_promotes.promote_date < ?) \
						AND xf_thread.discussion_state = 'visible' \
						AND IF(EWRporta_promotes.promote_date IS NULL, xf_thread.post_date, EWRporta_promotes.promote_date) < ? \
					ORDER BY promote_date DESC \
					LIMIT "+$options['recentfeatures_limit'],
					[$options['recentfeatures_filename'], date, date],
					get_visible_news_playlists
				).end();
		},
                                   get_visible_news_playlists = function (err, result) {
			if (err) {
				return next(err);
			}

			data.slider = result;
			delete data.forum;

			return mysql.open(config.mysql)
				.query(
					"SELECT option_value FROM xf_option WHERE option_id = 'NewsChannelPlaylists' LIMIT 1",
					[],
					get_visible_shows_playlists
				).end();
		},
                                   get_visible_shows_playlists = function (err, result) {
			if (err) {
				return next(err);
			}

			data.visible_news_playlists = new Buffer(result[0].option_value, 'binary').toString();

			return mysql.open(config.mysql)
				.query(
					"SELECT option_value FROM xf_option WHERE option_id = 'ShowsChannelPlaylists' LIMIT 1",
					[],
					get_news_playlists
				).end();
		},
                                   get_news_playlists = function (err, result) {
			if(err) {
				return next(err);
			}

                                                     data.visible_shows_playlists = new Buffer(result[0].option_value, 'binary').toString();

			return mongo.collection('newsPlaylists')
				.find()
				.toArray(get_shows_playlists);

		},
                                   get_shows_playlists = function (err, result) {
			if(err) {
				return next(err);
			}

			data.news_playlists = result;

			return mongo.collection('showsPlaylists')
				.find()
				.toArray(get_news_videos);

		},
                                   get_news_videos = function (err, result) {
			if(err) {
				return next(err);
			}
			
                                                    data.shows_playlists = result;

			return mongo.collection('news')
				.find()
				.sort({'snippet.publishedAt': -1})
				.toArray(get_shows_videos);
		},
                                   get_shows_videos = function (err, result) {
			if(err) {
				return next(err);
			}
			
                                                    data.news_videos = result;

			return mongo.collection('shows')
				.find()
				.sort({'snippet.publishedAt': -1})
				.toArray(get_featured_games);
		},
		get_featured_games = function (err, result) {
			if(err) {
				return next(err);
			}

			data.shows_videos = result;

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
						a.id = c.game_id where c.active = 1 \
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

					data.featured_games_final = [];
					data.games = [];
					item.forEach(function(item, i) {
						if(~data.games_ids.indexOf(item.id)) {
							data.games.push(item);
							if(~data.featured_games_ids.indexOf(item.id)) {
								data.featured_games_final
									.push(data.featured_games[data.featured_games_ids.indexOf(item.id)]);
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
								$in : ['anytv_console_'+req.query.console]
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

			var ids = result.map(function(e) {
				return e.snippet.resourceId.videoId;
			});


			mysql.open(config.mysql)
				.query('select count(comment_id) as comments, video_id from anytv_comments'
					+' where video_id in(\''+ids.join('\',\'')+'\')'
					+' group by video_id',
					[],
					function(e, rlt) {
						if(e) {
							console.log(e);
							return next(e)
						}

						rlt.forEach(function(item, index) {
							var index = ids.indexOf(item.video_id);
							result[index].anytv_comment = item.comments
						});

						data.featured_videos = result;

						var today = new Date();
						/* RDC : Removed 2015-02-18 : Select latest videos ordered by latest */
						
						//var yesterday = new Date();
						//yesterday.setDate(today.getDate()-1);
						//var minus2days = new Date();
						//minus2days.setDate(today.getDate()-2);
						//var minus3days = new Date();
						//minus3days.setDate(today.getDate()-3);
						
						/* End */	
						
						var cYr = today.getFullYear.toString();
						var cMo, cDy;
						var paramDate = '';
						
						
						if (today.getMonth.length === 1) {
							cMo = "0" + today.getMonth.toString();
						} else {
							cMo = today.getMonth.toString();
						}
						
						if (today.getDay.length === 1) {
							cDy = "0" + today.getDay.toString();
						} else {
							cDy = today.getDay.toString();
						}
						
						paramDate = cYr + '-' + cMo + '-' + cDy + 'T23:59:59.000Z';
						//console.log(paramDate);

						var where = {
							'snippet.publishedAt' : {
								/* RDC 2015-02-18 : Replaced condition */
								//$in: [
								//	new RegExp(today.toYMD()),
								//	new RegExp(yesterday.toYMD()),
								//	new RegExp(minus2days.toYMD()),
								//	new RegExp(minus3days.toYMD())
								//]
								/* End */
							$lte : paramDate
							}
						};

						if(req.query.console && req.query.console !== 'all') {
							//console.log('Went here');
							where = {
								$and : [
									where,
									{
										'snippet.meta.tags' : {
											$in : ['anytv_console_'+req.query.console]
										}
									}
								]
							}
						}

						mongo.collection('videos')
							.find(where)
                                                                                                                           .limit( 54 )
							.sort({
								'snippet.publishedAt' : -1
							})
							.toArray(get_most_viewed);
					})
				.end();
		},
		get_most_viewed = function (err, result) {
			if(err) {
				return next(err);
			}

			var ids = result.map(function(e) {
				return e.snippet.resourceId.videoId;
			});

			mysql.open(config.mysql)
				.query('select count(comment_id) as comments, video_id from anytv_comments'
					+' where video_id in(\''+ids.join('\',\'')+'\')'
					+' group by video_id',
					[],
					function(e, rlt) {
						rlt.forEach(function(item, index) {
							var index = ids.indexOf(item.video_id);
							result[index].anytv_comment = item.comments
						});

						where = {};

						if(req.query.console) {
							where = {
								'snippet.meta.tags' : {
									$in : ['anytv_console_'+req.query.console]
								}
							}
						}

						data.latest_videos = result;
							mongo.collection('videos')
								.find(where)
								.sort({
									'snippet.meta.statistics.viewCount': -1
								})
								.limit(60)
								.toArray(get_featured_youtubers);
					})
				.end();
		},
		get_featured_youtubers = function (err, result) {
			if(err) {
				return next(err);
			}

			data.most_viewed = result;
			// get_recent_threads(null, {});
			mysql.open(config.mysql)
				.query(
					'select xf_user.user_id, xf_user.username \
					from xf_user \
					inner join anytv_user_featured on xf_user.user_id = anytv_user_featured.user_id \
					where anytv_user_featured.active = 1 \
					order by anytv_user_featured.priority asc',
					[],
					get_recent_threads
				).end();
		},
		get_recent_threads = function (err, result) {
			if(err) {
				return next(err);
			}

			data.featured_users = result;

			mysql.open(config.mysql)
					.query(
						'select * from xf_thread inner Join \
						xf_post on xf_post.thread_id = xf_thread.thread_id \
						group by xf_post.thread_id order by \
						xf_thread.post_date DESC limit 5',
						[],
						get_popular_threads
					).end();
		},
		get_popular_threads = function(err, result) {
			if(err) {
				return next(err);
			}

			data.recent_threads = result;
			mysql.open(config.mysql)
					.query(
						'select * from xf_thread inner Join \
						xf_post on xf_post.thread_id = xf_thread.thread_id \
						group by xf_post.thread_id order by view_count DESC limit 5',
						[],
						get_users
					).end();
		},
		get_users = function (err, result) {
			if(err) {
				return next(err);
			}

			delete data.countThreads;

			data.threads = result;
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
				return;
			}

			that(null, data);
		},
		send_response = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the index');
				return next(err);
			}

			delete data.featured_games_tags;
			delete data.games_tags;

			util.set_cache(cacheKey, result);

			res.send(result);
		},
		that = send_response;

	start();
};

exports.get_scrape = function (req, res, next) {
	var data = {},
		cacheKey = 'index.scrape',
		start = function () {
			cacheKey = req.params.twitch;
			var cache = util.get_cache(cacheKey);

			if(cache && typeof req.query.filter == 'undefined' && typeof req.query.console == 'undefined') {
				console.log('From Cache');
				return res.send(cache);
				return;
			}

			return curl.get
				.to('api.twitch.tv', 80, '/api/channels/'+req.params.twitch+'/panels')
				.send()
				.then(send_response);
		},
		send_response = function (err, result) {
			console.log('request sent', err, result);
			if(err) {
				return next(err);
			}

			util.set_cache(cacheKey, result);

			res.send(result);
		};
	start();
};

exports.flush_cache = function(req, res, next) {
	var message = 'Nope';
	if(req.query.flush == '1') {
		util.flush_cache();
		message = 'Flushed';
	}
	res.send({'message': message});
}
