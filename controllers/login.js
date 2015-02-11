var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    mysql			= require(__dirname + '/../lib/mysql'),
    curl			= require('cuddle'),
    logger         	= require(__dirname + '/../lib/logger')
    us         		= require(__dirname + '/../lib/unserialize'),
    mongo			= require(__dirname + '/../lib/mongoskin'),
    get_access = function(next) {
		    curl.post
		        .to(
		            'accounts.google.com',
		            443,
		            '/o/oauth2/token'
		        )
		        .secured()
		        .send({
		            client_id: config.earnings.client_id,
		            client_secret: config.earnings.client_secret,
		            refresh_token: config.earnings.refresh_token,
		            grant_type: 'refresh_token'
		        }).then(next);
		};;



exports.login = function (req, res, next) {
	var data = {},
		user,
		start = function () {
			curl.post
				.to(config.community.url, 80, '/zh/api/index.php?oauth/token')
				.send({
					username: 	req.body.username,
					password: 	req.body.password,
					client_id:	config.community.key,
					grant_type:	'password'
				}).then(get_user_data);
		},
		get_user_data = function (err, result) {
			var tosend;
			if(err) {
				return next('Invalid Login');
			}

			data.access = result;

			tosend = {
				'users/me': null,
				'oauth_token': result.access_token
			}

			curl.get
				.to(config.community.url, 80, '/zh/api/index.php')
				.send(tosend)
				.then(send_response);
		},
		send_response = function (err, result) {
			if(err) {
				next(err);
			}
			var hashed = util.hash(data.access.access_token);
			console.log(result);
			data.user = result.user;
			process.cache['access'] = process.cache['access'] || {};
			process.cache['access'][hashed] = data;
			result.user.access_code = hashed;

			util.save_access(data, function(err, _result) {
				if(err) {
					return next(err);
				}

				res.send(result.user);
			}, next);
		};
	start();
};

exports.get_earnings = function (req, res, next) {
	var data= {},
		start = function() {
			var cookie = req.cookies.xf_session || '';

			mysql.open(config.mysql)
				.query(
					'select session_data from xf_session where session_id = ?',
					[cookie],
					format_session)
				.end();

		},
		format_session = function(err, result) {
			console.log(result);
			if(err) {
				return next(err);
			}

			if(result.length < 1) {
				logger.log('debug', 'Session not found');
				return send_response(null, result);
			}
			var buffer = new Buffer( result[0].session_data, 'binary' ).toString();
			var replaced = buffer.replace(new RegExp('s:2:\"ip";s:4:\".*?\"', 'i'), 's:2:\"ip";s:4:"˱*]"');

			var session = us.unserialize(replaced);

			if(session.anytv_error) {
				session = us.unserialize(buffer);
			}

			console.log('anytvsession ',config.community.url, 80, '/zh/api/index.php?users/'+session.user_id+'|');
			var send_data= {};
			send_data['users/'+session.user_id] = null;
			curl.get
				.to(config.community.url, 80, '/zh/api/index.php')
				.send(send_data).then(_get_access);

		},
		_get_access = function(err, result) {
			if (err) {
				console.log(err.toString());
				logger.log('warn', 'Error getting the session');
				return res.jsonp({message: 'Not logged in.'});
			}

			if(!result.user) {
				return next('no valid session');
			}

			data = {
				access_code : '',
				links: {
					avatar: result.user.links.avatar,
					detail: result.user.links.detail,
				},
				user_id: result.user.user_id,
				username: result.user.username
			};


			mongo.collection('access_token')
				.findOne({
					'user.user_id': result.user.user_id
				}, function(err, _result) {
					if(err) {
						return next(err);
					}

					if(!_result) {
						data.access_code = result.user.access_code = util.hash(util.random_string(5)+'thisisnotarealaccesstoken');
						util.save_access(result, function(err, result) {
							if(err) {
								return next(err);
							}

							get_earning(null, data);
						}, next);

						return;
					}

					data.access_code = _result.user.access_code || '';

					get_earning(null, data);
				})
		},
		get_earning = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the session');
				return next(err);
			}

			get_access(function(err, result) {
				curl.get
					.to('content.googleapis.com', 443, '/adsense/v1.4/accounts/pub-6760947858944919/reports?'
						+'endDate='+moment().format('YYYY-MM-DD')
						+'&startDate='+moment('2015-01-01').format('YYYY-MM-DD')
						+'&metric=EARNINGS&metric=CLICKS&metric=PAGE_VIEWS&dimension=URL_CHANNEL_ID'
						+'&sort=-EARNINGS')
					.secured()
					.add_header('Authorization', result.token_type+' '+result.access_token)
					.send()
					.then(send_response);
			});
		},
		send_response = function (err, result) {
			if (err) {
				console.log(err);
				return res.status(400).jsonp(err);
			}

			for(var i in result.rows) {
				user_id = result.rows[i][0].split('user=')[1];
				console.log(user_id, data.user_id);
				if(user_id == data.user_id) {
					return res.jsonp(result.rows[i]);
				}
			}

			res.status(400).jsonp('user not found');
		};

	start();
}

exports.authenticate = function (req, res, next) {
	util.get_access(req.query, function(err, result) {
		if(err) {
			return next({
				status: '500',
				code: 'user_not_authenticated',
				message: 'Invalid Access Token Supplied'
			});
		}

		return res.send({
			status: '200',
			code: 'user_authenticated',
			message: 'Successfully authenticated user'
		});
	});
};

exports.get_location = function(req, res, next) {
	var data= {},
		start = function() {
			if(!req.query.link || !~req.query.link.indexOf('.gl')) {
				return res.send(req.query.link);
			}

			var end = req.query.link.split('.gl'),
				host = (end[0]+'.gl').replace(/https?:\/\//, ''),
				link = end[1];


			console.log('start', req.query.link, host, link);
			return data.request = curl.get
				.to(host, 80, link)
				.raw()
				.set_allowable([200,301,304])
				.send({
				}).then(show_location);
		},
		show_location = function(err, result) {
			if(err) {
				return next(err);
			}

			var location 	= data.request.response_headers.location,
				end			= location.split('/zh'),
				host		= end[0].replace(/https?:\/\//, ''),
				link		= ('/zh'+end[1]).split('?'),
				send		= link[1],
				tosend		= {};

			link = link[0];
			tosend[send] = null;

			console.log('show location', req.query.link, host, link, tosend);
			if(link === '/zhundefined') {
				return res.send('http://'+host);
			}

			return data.request = curl.get
				.to(host, 80, link)
				.raw()
				.set_allowable([200,301,304])
				.send(tosend)
				.then(show_data);
		}
		show_data = function(err, result) {
			if(err
				&& (
					err.statusCode != 200
					&& err.statusCode != 301
					&& err.statusCode != 304
				)
			) {
				return next(err);
			}

			if(!res._headerSent)
			return res.send((data.request && data.request.response_headers && data.request.response_headers.location )
				|| req.query.link );
		};
	start();
};

exports.get_user = function(req, res, next) {
	var data = {},
		start = function() {
			var cookie = req.cookies.xf_session || '';

			mysql.open(config.mysql)
				.query(
					'select session_data from xf_session where session_id = ?',
					[cookie],
					format_session)
				.end();

		},
		format_session = function(err, result) {
			console.log(result);
			if(err) {
				return next(err);
			}

			if(result.length < 1) {
				logger.log('debug', 'Session not found');
				return send_response(null, result);
			}
			var buffer = new Buffer( result[0].session_data, 'binary' ).toString();
			var replaced = buffer.replace(new RegExp('s:2:\"ip";s:4:\".*?\"', 'i'), 's:2:\"ip";s:4:"˱*]"');

			var session = us.unserialize(replaced);

			if(session.anytv_error) {
				session = us.unserialize(buffer);
			}

			console.log('anytvsession ',config.community.url, 80, '/zh/api/index.php?users/'+session.user_id+'|');
			curl.get
				.to(config.community.url, 80, '/zh/api/index.php?users/'+session.user_id)
				.send().then(get_access);

		},
		get_access = function(err, result) {
			if (err) {
				console.log(err);
				logger.log('warn', 'Error getting the session');
				return res.jsonp({message: 'Not logged in.'});
			}

			if(!result.user) {
				return next('no valid session');
			}

			var data = {
				access_code : '',
				links: {
					avatar: result.user.links.avatar,
					detail: result.user.links.detail,
				},
				user_id: result.user.user_id,
				username: result.user.username
			};


			mongo.collection('access_token')
				.findOne({
					'user.user_id': result.user.user_id
				}, function(err, _result) {
					if(err) {
						return next(err);
					}

					if(!_result) {
						data.access_code = result.user.access_code = util.hash(util.random_string(5)+'thisisnotarealaccesstoken');
						util.save_access(result, function(err, result) {
							if(err) {
								return next(err);
							}

							res.jsonp(data);
						}, next);

						return;
					}

					data.access_code = _result.user.access_code || '';

					res.jsonp(data);
				})
		},
		send_response = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting the session');
				return next(err);
			}

			res.jsonp(result);
		};
	start();
}
