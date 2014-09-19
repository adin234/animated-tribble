var config          = require(__dirname + '/../config/config'),
    util            = require(__dirname + '/../helpers/util'),
    mysql           = require(__dirname + '/../lib/mysql'),
    logger          = require(__dirname + '/../lib/logger'),
    mongo           = require(__dirname + '/../lib/mongoskin');

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

            return mysql.open(config.mysql)
                .query(
                    "SELECT user_id FROM xf_user WHERE user_id IN ("
                    +" SELECT user_id FROM xf_user_field_value WHERE field_id = 'youtube_id' AND field_value IS NOT NULL and field_value <> '')"
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
                    return element.snippet.channelId == userChannelIndex[key].youtube_id;
                });

                userChannelIndex[key]['video'] = videos[0];
                userChannelIndex[key]['user_id'] = userChannelIndex[key]['userId'];
                delete userChannelIndex[key]['userId'];
                users.push(userChannelIndex[key]);
            };

            data.youtubers = users;

            res.send(null, data);
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
        start = function () {
            get_youtubers(null, []);
        },
        get_youtubers = function(err, result) {
            return exports.get_youtubers(req, {
                send: function(err, result) {
                    data.youtubers = result.youtubers;
                    get_popular_youtubers(null, []);
                }
            }, next);
        },
        get_popular_youtubers = function(err, result) {
            req.query.order = 'popularity';

            return exports.get_youtubers(req, {
                send: function(err, result) {
                    data.popular_youtubers = result.youtubers;
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
                    +" SELECT user_id FROM xf_user_field_value WHERE field_id = 'youtube_id' AND field_value IS NOT NULL and field_value <> '')"
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

            mysql.open(config.mysql)
                .query(
                    'SELECT user_id, field_value as youtube_id FROM xf_user_field_value WHERE field_id = \'youtube_id\' AND user_id IN ('+ids.join(',')+')',
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
                    return element.snippet.channelId == userChannelIndex[key].youtube_id;
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

exports.post_comment = function (res, req, next) {
    var data = {},
        start = function (err, next) {
            send_response(null, req.query);
        },
        send_response = function (err, result) {
            if(err) {
                return next(err);
            }

            res.send(result);
        };

    start();
};
