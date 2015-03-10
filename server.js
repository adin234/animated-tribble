var express = require('express'),
    config = require(__dirname + '/config/config'),
    logger = require(__dirname + '/lib/logger'),
    http = require('http'),
    cookieParser = require('cookie-parser'),
    app = express();

http.globalAgent.maxSockets = 30;

logger.log('info', 'Initializing HckrStats back end on', process.env['NODE_ENV'], 'mode');

app.disable('x-powered-by');

logger.log('verbose', 'Binding external middlewares');
app.use(require('morgan')('dev', {
    format: 'dev',
    immediate: true
}));
app.use(require('morgan')('dev', {
    format: 'dev'
}));
app.use(require('method-override')());
app.use(require('body-parser').json());
app.use(require('body-parser').urlencoded({
    extended: true
}));
app.use(require('response-time')());
app.use(require('compression')());
app.use(cookieParser());
logger.log('verbose', 'Binding custom middlewares');
app.use(require(__dirname + '/config/router')(express.Router(), logger));
app.use(require(__dirname + '/lib/error_handler')());

app.listen(config.port);
logger.log('info', 'Server listening on port', config.port);

var io = require('socket.io').listen(3001),
    streamers_controller = require(__dirname + '/controllers/streamers'),
    streamers_old = {
        twitch: [],
        youtube: [],
        hitbox: []
    },
    streamers_new = {
        twitch: [],
        youtube: [],
        hitbox: []
    };

io.on('connection', function (socket) {
    socket.emit('message', {
        'streamers': streamers_old
    });
});

var check_streamers = function () {
    streamers_controller.get_streamers({
        query: {}
    }, {
        send: function (result) {
            streamers_new.twitch = result.streamers;

            streamers_controller.get_youtube_streamers({
                query: {}
            }, {
                send: function (result) {
                    streamers_new.youtube = result.streamers;

                    streamers_controller.get_hitbox_streamers({
                        query: {}
                    }, {
                        send: function (result) {
                            streamers_new.hitbox = result.streamers;

                            var checker = {
                                old_streamers: [],
                                new_streamers: []
                            };

                            streamers_new.twitch.forEach(function (item) {
                                checker.new_streamers.push('TW' + item.twitch
                                    .channel
                                    .name
                                    .toLowerCase());
                            });

                            streamers_new.hitbox.forEach(function (item) {
                                checker.new_streamers.push('HB' + item.hitbox
                                    .livestream[
                                        0].channel.user_name
                                    .toLowerCase());
                            });

                            streamers_new.youtube.forEach(function (item) {
                                checker.new_streamers.push('YT' + item.youtube
                                    .id);
                            });

                            streamers_old.twitch.forEach(function (item) {
                                checker.old_streamers.push('TW' + item.twitch
                                    .channel
                                    .name
                                    .toLowerCase());
                            });

                            streamers_old.hitbox.forEach(function (item) {
                                checker.old_streamers.push('HB' + item.hitbox
                                    .livestream[
                                        0].channel.user_name
                                    .toLowerCase());
                            });

                            streamers_old.youtube.forEach(function (item) {
                                checker.old_streamers.push('YT' + item.youtube
                                    .id);
                            });

                            var filtered = checker.new_streamers.filter(
                                function (n) {
                                    return checker.old_streamers.indexOf(n) !=
                                        -1;
                                });

                            console.log(filtered.length, checker.new_streamers.length);

                            if (filtered.length !== checker.new_streamers.length ||
                                checker.new_streamers.length <
                                checker.old_streamers.length) {
                                io.sockets.emit('message', {'streamers':streamers_new});
                            }

                            streamers_old = JSON.parse(JSON.stringify(
                                streamers_new));
                        }
                    }, function (err) {
                        console.log('error i socket', err);
                    })
                }
            }, function (err) {
                console.log('error i socket', err);
            });
        }
    }, function (err) {
        console.log('error i socket', err);
    });
};

setInterval(function () {
    check_streamers();
}, 10000);

module.exports = app;

Date.prototype.toYMD = Date_toYMD;

function Date_toYMD() {
    var year, month, day;
    year = String(this.getFullYear());
    month = String(this.getMonth() + 1);
    if (month.length == 1) {
        month = "0" + month;
    }
    day = String(this.getDate());
    if (day.length == 1) {
        day = "0" + day;
    }
    return year + "-" + month + "-" + day;
}

