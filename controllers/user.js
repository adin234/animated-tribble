var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    mysql			= require(__dirname + '/../lib/mysql'),
    games 			= require(__dirname + '/games'),
    logger         	= require(__dirname + '/../lib/logger'),
    Q				= require('q'),
    mongo			= require(__dirname + '/../lib/mongoskin');
    login			= require(__dirname + '/login');


exports.fav_video = function(req, res, next) {
    var data = {},
        userId,
        videoId,
        start = function() {
            get_user_id();
        },
        get_user_id = function() {
        	login.get_user(req, {
        		status: function() {},
        		jsonp: function(result) {
        			console.log(result);
        			userId = result.user_id || false;
        			get_videos();
        		}
        	}, next);
        },
        get_videos = function() {
            videoId = req.params.videoId;
            if(!userId) {
                return next({message: 'user not logged in'});
            }

            add_fav(null);
        },
        add_fav = function(err) {
            mongo.collection('favorites')
                .update({ 'user_id' : userId },
                    {'$addToSet' : {"items" : videoId}},
                    {'upsert': true},
                    function(err, result) {
                        send_response(err, result);
                    });
        },
        send_response = function(err, result) {
            if(err) {
                return next(err);
            }

            res.send(result);
        };

    start();
};

exports.unfav_video = function(req, res, next) {
     var data = {},
     	userId,
     	videoId,
        start = function() {
            get_user_id();
        },
        get_user_id = function() {
        	login.get_user(req, {
        		status: function() {},
        		jsonp: function(result) {
        			console.log(result);
        			userId = result.user_id || false;
        			get_videos();
        		}
        	}, next);
        },
        get_videos = function() {
            videoId = req.params.videoId;
            if(!userId) {
                return next(err);
            }

            un_fav(null);
        },
        un_fav = function(err) {
            mongo.collection('favorites')
                .update({ 'user_id' : userId },
                    {'$pull' : {"items" : videoId}},
                    {'upsert': true},
                    function(err, result) {
                        send_response(err, result);
                    });
        },
        send_response = function(err, result) {
            if(err) {
                return next(err);
            }

            res.send(result);
        };

    start();
};

exports.get_favorites = function (req, res, next) {
	var data = {},
		userId,
		cacheKey = 'favorites.page',
		start = function () {
			get_user_id();
		},
		get_user_id = function() {
        	login.get_user(req, {
        		status: function() {},
        		jsonp: function(result) {
        			console.log(result);
        			userId = result.user_id || false;
        			get_fav();
        		}
        	}, next);
        },
        get_fav = function() {
			if(!userId) {
            	return send_response({'message': 'Not logged in.'});
            }
			cacheKey = cacheKey + userId;

			var cache = util.get_cache(cacheKey);

            if(cache && typeof req.query.filter == 'undefined'
            	&& typeof req.query.console == 'undefined'
            	&& typeof req.query.playlist == 'undefined') {
                console.log('From Cache');
                return res.send(cache);
            }

            get_favorites(null);
        },
		get_favorites = function (err, result) {
			if(err) {
				return next(err);
			}
			data.config = {};
			data.config.channel = {};
			data.config.playlist = {};

			return mongo.collection('favorites')
				.find({'user_id': userId})
				.toArray(get_videos);
		},
		get_videos = function (err, result) {
			if(err) {
				return next(err);
			}
			console.log(err, result);

			result = result[0] || {items: []};

			return mongo.collection('videos')
				.find({'snippet.resourceId.videoId': {$in: result.items}})
				.toArray(format_video);
		},
		format_video = function (err, result) {
			if(err) {
				return next(err);
			}
			data.videos = result;
			data.playlists = [];
			data.categories = [];
			return send_response(err, result);
		},
		send_response = function (err, result) {

			if(typeof cache =='undefined'
				&& typeof req.query.filter == 'undefined'
            	&& typeof req.query.console == 'undefined'
            	&& typeof req.query.playlist == 'undefined') {
				util.set_cache(cacheKey, data);
            }

			res.send(data);
		};

	start();
};

exports.get_user = function (req, res, next) {
	var data = {},
		user,
		cacheKey = 'index.user.'+req.params.id,
		start = function () {
			var cache = util.get_cache(cacheKey);

			if(cache && typeof req.query.filter == 'undefined' && typeof req.query.console == 'undefined') {
				console.log('From Cache');
				return res.send(cache);
			}

			if(global.cache && global.cache.user && global.cache.user[req.params.id]) {
				return send_response(null, global.cache.user[req.params.id]);
			}

			logger.log('info', 'Getting User');
			mysql.open(config.mysql)
				.query(
					'SELECT * FROM xf_user a '
					+'INNER JOIN xf_user_profile b on '
					+'a.user_id = b.user_id '
					+'where a.user_id = ? LIMIT 1',
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
				var index = new Buffer( item.field_id, 'binary' ).toString();
				if(index != 'refresh_token' && index != 'access_token') {
					custom_field_data[index] = item.field_value;
				}
			});

			custom_field_data['advertisement'] = ""
				+"<script async src=\"//pagead2.googlesyndication.com/pagead/js/adsbygoogle.js\"></script>"
				+"<!-- streamers adin -->"
				+"<ins class=\"adsbygoogle\""
				+"     style=\"display:inline-block;width:300px;height:250px\""
				+"     data-ad-client=\"ca-pub-6760947858944919\""
				+"     data-ad-slot=\"3023577588\"></ins>"
				+"<script>"
				+"(adsbygoogle = window.adsbygoogle || []).push({});"
				+"</script>";

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

			if(!global.cache) {
				global.cache = {};
			}

			if(!global.cache.user) {
				global.cache.user = {};
			}

			if(!global.cache.user[req.params.id]) {
				global.cache.user[req.params.id] = result[0];
			}

			util.set_cache(cacheKey, result);

			res.send(result);
		};

	start();
};

exports.get_youtuber_profile = function(req, res, next) {
	var data = {},
		cacheKey = 'index.profile.'+req.params.id,
		start = function() {
			var cache = util.get_cache(cacheKey);

            if(cache && typeof req.query.filter == 'undefined' && typeof req.query.console == 'undefined') {
                console.log('From Cache');
                return res.send(cache);
            }

			if(!(global.cache && global.cache.user && global.cache.user[req.params.id])) {
				return exports.get_user(req,  {
					send: function(data) {
						get_youtube(null, data);
					},
					status: function(code) {}
				}, next);
			}

			get_youtube(null, global.cache.user[req.params.id]);
		},
		get_youtube = function (err, result)  {
			if(err) {
				return next(err);
			}

			data.user = result;
			data.config = {
				channel : result.custom_fields.youtube_id,
				playlist: result.custom_fields.youtubeUploads.length
					? result.custom_fields.youtubeUploads
					: 'UU'+result.custom_fields.youtube_id.substr(2)
			};

			var promises = [];
			var deferred1 = Q.defer();
			exports.get_games_cast(req, {
				send: function(d) {
					data.games_cast = d;
					deferred1.resolve(d);
				},
				status: function(c){}
			}, next);
			promises.push(deferred1.promise);


			var deferred2 = Q.defer();
			exports.get_playlists(req, {
				send: function(d) {
					data.playlists = d;
					deferred2.resolve(d);
				},
				status: function(c){}
			}, next);
			promises.push(deferred2.promise);

			var deferred3 = Q.defer();
			exports.get_consoles(req, {
				send: function(d) {
					data.consoles = d;
					deferred3.resolve(d);
				},
				status: function(c){}
			}, next);
			promises.push(deferred3.promise);

			var link = function() {
				var deferred4 = Q.defer();
				exports.get_videos(req, {
					send: function(d) {
						data.videos = d;
						data.categories = [];
						send_response(err, data);
						deferred4.resolve(d);
					},
					status: function(c){}
				}, next);
			}

			Q.all(promises).then(link);
		},
		send_response = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the user');
				return next(err);
			}

			if(result.length === 0) {
				return res.status(500).send({message: 'user not found'});
			}

			util.set_cache(cacheKey, result);

			res.send(result);
		},
		respond = send_response;

	start();
};

exports.get_games_cast = function(req, res, next) {
	var data = {},
		start = function() {
			if(!(global.cache && global.cache.user && global.cache.user[req.params.id])) {
				return exports.get_user(req,  {
					send: function(data) {
						filter_values(null, data);
					},
					status: function(code) {}
				}, next);
			}

			filter_values(null, global.cache.user[req.params.id]);
		},
		filter_values = function(err, result) {
			req.query.filter = Object.keys(us.unserialize(result.custom_fields.gamesCast))
				.join(',');

			games.get_games(req, {
				send: function(result) {
					send_response(null, result);
				},
				status: function(c){}
			}, next);
		},
		send_response = function (err, result) {
			if(err) {
				return next(err);
			}

			res.send(result);
		};

	start();
};

exports.get_playlists = function(req, res, next) {
	var data = {},
		start= function() {
			mongo.collection('playlists')
				.find({
					user_id : parseInt(req.params.id)
				})
				.toArray(send_response);
		},
		send_response = function (err, result) {
			if(err) {
				return next(err);
			}

			res.send(result);
		};
	start();
};

exports.get_videos = function(req, res, next) {
	var data = {},
		start= function() {
			mongo.collection('videos')
				.find({
					user_id : parseInt(req.params.id)
				})
				.toArray(send_response);
		},
		send_response = function (err, result) {
			if(err) {
				return next(err);
			}

			res.send(result);
		};
	start();
};

exports.get_consoles = function(req, res, next) {
	var data = {},
		start = function() {
			if(!(global.cache && global.cache.user && global.cache.user[req.params.id])) {
				return exports.get_user(req,  {
					send: function(data) {
						filter_values(null, data);
					},
					status: function(code) {}
				}, next);
			}

			filter_values(null, global.cache.user[req.params.id]);
		},
		filter_values = function(err, result) {
			mysql.open(config.mysql)
				.query("select field_choices from xf_user_field \
					where field_id = 'navLinks';",
					[],
					format_buffer
				)
				.end()
		},
		format_buffer = function(err, result) {
			send_response(null, result);
		},
		send_response = function (err, result) {
			if(err) {
				return next(err);
			}

			var consoles = us.unserialize(new Buffer(result[0].field_choices, 'binary')
				.toString());

			consoles = Object.keys(consoles).map(function(item,i){
				return {
					id: item,
					name: consoles[item]
				}
			});

			res.send(consoles);
		};
	start();
};
