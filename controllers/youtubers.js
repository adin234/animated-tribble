var config          = require(__dirname + '/../config/config'),
    util            = require(__dirname + '/../helpers/util'),
    mysql           = require(__dirname + '/../lib/mysql'),
    logger          = require(__dirname + '/../lib/logger'),
    mongo           = require(__dirname + '/../lib/mongoskin');

exports.get_youtubers = function (req, res, next) {
    var data = {},
        users,
        userChannelIndex = {},
        start = function () {
            if(global.cache && global.cache.user && global.cache.user[req.params.id]) {
                return send_response(null, global.cache.user[req.params.id]);
            }

            logger.log('info', 'Getting Youtubers');
            mysql.open(config.mysql)
                .query(
                    "SELECT * FROM xf_user WHERE user_id IN ("
                    +"    SELECT user_id FROM xf_user_field_value WHERE field_id = 'youtube_id' AND field_value IS NOT NULL and field_value <> '')"
                    +" LIMIT 60",
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
                    'SELECT user_id, field_value as youtube_id FROM cxf_user_field_value WHERE field_id = \'youtube_id\' AND user_id IN ('+ids.join(',')+')',
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

