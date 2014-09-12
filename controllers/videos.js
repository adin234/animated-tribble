var config          = require(__dirname + '/../config/config'),
    util            = require(__dirname + '/../helpers/util'),
    mysql           = require(__dirname + '/../lib/mysql'),
    curl            = require(__dirname + '/../lib/curl'),
    logger          = require(__dirname + '/../lib/logger')
    us              = require(__dirname + '/../lib/unserialize'),
    mongo           = require(__dirname + '/../lib/mongoskin');

exports.get_videos = function(req, res, next) {
    var data = {},
        user,
        limit,
        page,
        start = function () {
            logger.log('info', 'Getting Videos');
            limit   = parseInt(req.query.limit) || 25;
            page    = parseInt(req.query.page) || 1;
            skip    = (page - 1) * limit;

            get_videos();
        },
        get_videos = function() {
            return mongo.collection('videos')
                .find()
                .skip(skip)
                .limit(limit)
                .toArray(send_response);
        },
        send_response = function (err, result) {
            if (err) {
                logger.log('warn', 'Error getting videos');
                return next(err);
            }

            res.send(result);
        };

    start();
};
