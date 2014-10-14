var config          = require(__dirname + '/../config/config'),
    util            = require(__dirname + '/../helpers/util'),
    games           = require(__dirname + '/games'),
    mysql           = require(__dirname + '/../lib/mysql'),
    logger          = require(__dirname + '/../lib/logger'),
    curl            = require(__dirname + '/../lib/curl'),
    mongo           = require(__dirname + '/../lib/mongoskin');

exports.get_access = function(user, next) {
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
            refresh_token: user.refresh_token,
            grant_type: 'refresh_token'
        }).then(next);
};

exports.update_video = function(params, auth, next) {
    curl.put
        .to(
            'www.googleapis.com',
            443,
            '/youtube/v3/videos?part=snippet,status'
        )
        .json()
        .add_header('Authorization', auth)
        .secured()
        .send(params)
        .then(next);
};

exports.get_user_credentials = function(channel, next) {
     mysql.open(config.mysql)
        .query('SELECT token.user_id, token.field_value as refresh_token, channel.field_value as channel \
            FROM xf_user_field_value token \
            INNER JOIN xf_user_field_value channel \
            ON token.user_id = channel.user_id \
            WHERE token.field_id = "refresh_token" \
            AND channel.field_id = "youtube_id" \
            AND channel.field_value = ?',
            [channel],
            next)
        .end();
};

exports.get_suggestions = function(req, res, next) {
    var data = {},
        start = function() {
            //expects req.query.id
            send_response(null, 'adin');
        },
        send_response = function(err, result) {
            if(err) {
                return next(err);
            }

            //return array of suggested videos
            res.send(result);
        }

    start()''
};

exports.update_videos = function(req, res, next) {
    var data = {},
        start = function() {
            var videos = req.body.vids.split(',').map(function(e) {
                return mongo.toId(e.trim());
            });

            var x = mongo.collection('videos')
                .find({
                    '_id': {
                        '$in' : videos
                    }
                })
                .toArray(set_tags);
        },
        set_tags = function(err, result) {
            var fail = 0;
            if(err) {
                return next(err);
            }

            result.map(function(item, i) {
                exports.get_user_credentials(item['snippet']['channelId'], 
                    function(err, result) {
                        if(err) {
                            return next(err);
                        }

                        exports.get_access(result[0], function(err, result) {
                            if(err) {
                                console.log('err '+err);
                                return next(err);
                            }
                            var send = {};
                            send.snippet = {};
                            send.id = item.snippet.resourceId.videoId;
                            send.snippet.title = item.snippet.title;
                            send.snippet.categoryId = item.snippet.categoryId || 22;
                            send.snippet.tags = item.snippet.meta.tags.filter(function(item) {
                                return !(~item.indexOf('anytv_'));
                            }).concat(req.body.tags.split(','));

                            exports.update_video(send, 
                                'Bearer '+result['access_token'],
                                function(err, result) { 
                                    if(err) { 
                                        console.log(++fail+'. has an error on '+item.snippet.title);
                                    }

                                    console.log(item._id+' successfully saved '+item.snippet.title);
                                }
                            );

                            mongo.collection('videos')
                                .update({ '_id' : mongo.toId(item._id) }, 
                                    {'$set' : {"snippet.meta.tags" : send.snippet.tags}},
                                    function(err, result) {
                                        console.log('saved with '+err);
                                    });
                        });
                    }
                )
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

exports.get_data = function (req, res, next) {
    var data = {},
        $options,
        date,
        users,
        userChannelIndex = {},
        limit,
        page,
        cacheKey = 'youtubers.data',
        start = function () {
            limit   = parseInt(req.query.limit) || 25;
            page    = req.query.page || 1;
            cons = req.query.console || '';
            console.log(cons);
            cacheKey = cacheKey+page+cons;

            var cache = util.get_cache(cacheKey);

            if(cache && typeof req.query.filter == 'undefined') {
                console.log('From Cache');
                return res.send(cache);
            }

            get_youtubers(null, []);
        },
        get_youtubers = function(err, result) {
            return exports.get_youtubers(req, {
                send: function(result) {
                    data.youtubers = result;
                    get_popular_youtubers(null, []);
                }
            }, next);
        },
        get_popular_youtubers = function(err, result) {
            req.query.order = 'popularity';

            return exports.get_youtubers(req, {
                send: function(result) {
                    data.popular_youtubers = result;
                    get_featured_games(null, []);
                }
            }, next);
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

            util.set_cache(cacheKey, result);

            res.send(result);
        };

    start();
}

exports.get_youtubers = function (req, res, next) {
    var data = {},
        users,
        userChannelIndex = {},
        limit,
        page,
        start = function () {
            if(global.cache && global.cache.user && global.cache.user[req.params.id]) {
                return send_response(null, global.cache.user[req.params.id]);
            }

            logger.log('info', 'Getting Youtubers');
            limit   = req.query.limit || 25;
            page    = req.query.page || 1;

            mysql.open(config.mysql)
                .query(
                    "SELECT * FROM xf_user WHERE user_id IN ("
                    +" SELECT user_id FROM xf_user_field_value WHERE field_id = 'youtube_id' \
                    AND field_value IS NOT NULL and field_value <> '')"
                    +" LIMIT "+limit
                    +" OFFSET "+(page - 1)*limit,
                    [req.params.id],
                    get_youtube_id
                ).end();
        },
        get_youtube_id = function(err, result) {
            if (err) {
                logger.log('warn', 'Error getting the user');
                return next(err);
            }

            if(result.length === 0) {
                logger.log('warn', 'user does not exist');
                return send_response({message: "User does not exist"});
            }

            var ids = [];

            result.forEach(function(item, i) {
                ids.push(item.user_id);
            });

            var order_by = req.query.order || 'userId';

            mysql.open(config.mysql)
                .query(
                    'SELECT user_id userId, ('
                    +'select count(*) as popularity '
                    +'from xf_user_follow where follow_user_id = userId'
                    +') popularity, field_value as youtube_id '
                    +' FROM xf_user_field_value'
                    +' WHERE field_id = \'youtube_id\' AND user_id IN ('+ids.join(',')+')'
                    +' ORDER BY '+order_by+' desc',
                    [],
                    get_youtubers_video
                ).end();
        },
        get_youtubers_video = function(err, result) {
            if (err) {
                return next(err);
            }

            var channels = [];

            result.forEach(function(item, i) {
                userChannelIndex[item.youtube_id] = item;
                channels.push(item.youtube_id);
            });

            var find_params = {
                'snippet.channelId' : {
                    '$in' : channels
                }
            };

            var x = mongo.collection('videos')
                .find(find_params)
                .toArray(bind_video);
        },
        bind_video = function(err, result) {
            var previous_youtube_id = '';

            users = [];

            for(var key in userChannelIndex) {
                var videos = result.filter(function(element) {
                    return element.snippet.channelId
                        == userChannelIndex[key].youtube_id;
                });

                    userChannelIndex[key]['video'] = videos[0];
                    users.push(userChannelIndex[key])
            };

            return send_response(null, users);
        },
        send_response = function (err, result) {
            if (err) {
                logger.log('warn', 'Error getting the youtubers');
                return next(err);
            }

            res.send(result);
        };;
    start();
};

exports.post_comment = function (req, res, next) {
    var data = {},
        start = function (err, next) {
            if(!req.body.user_id == process.cache.access[req.body.access_token]
                .user.user_id) {
                send_response('invalid token', []);
            }

            mysql.open(config.mysql)
                .query(
                    'INSERT INTO anytv_comments VALUES(NULL, ?, ?, ?, ?, ?)',
                    [   req.body.user_id, req.body.username,
                        req.params.id, req.body.message,
                        parseInt((+new Date)/1000)],
                    create_notification
                ).end();
        },
        create_notification = function (err, result) {
            if(err) {
                return next(err);
            }

            mysql.open(config.mysql)
                .query(
                    'INSERT INTO xf_news_feed VALUES(NULL, ?, ?, \
                        \'anytv-comment\', ?, \'insert\', ?, "")',
                    [   req.body.user_id, req.body.username,
                        req.params.id, parseInt((+new Date)/1000)],
                    send_response
                ).end();
        },
        send_response = function (err, result) {
            if(err) {
                return next(err);
            }

            res.send(result);
        };

    start();
};

exports.get_comments = function (req, res, next) {
    var data = {},
        cacheKey = 'youtubers.user.'+req.params.id,
        start = function (err, next) {
            var cache = util.get_cache(cacheKey);

            if(cache && typeof req.query.filter == 'undefined' && typeof req.query.console == 'undefined') {
                console.log('From Cache');
                return res.send(cache);
            }

            mysql.open(config.mysql)
                .query(
                    'SELECT * FROM anytv_comments WHERE video_id = ? \
                    ORDER BY comment_id DESC',
                    [req.params.id],
                    send_response
                ).end();
        },
        send_response = function (err, result) {
            if(err) {
                return next(err);
            }

            util.set_cache(cacheKey, result);
            res.send(result);
        };
    start();
};
