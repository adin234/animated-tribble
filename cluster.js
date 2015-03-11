var cluster = require("cluster");

if (cluster.isMaster) {
	if (!process.argv[2]) {
		console.log('Script to cluster is missing');
	}

	console.log(new Date);
    var numCPUs = require("os").cpus().length;
    while (numCPUs--) {
        cluster.fork();
    }

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
}
else {
	require(__dirname + '/' + process.argv[2]);
}

cluster.on('exit', function (worker) {
	cluster.fork();
	console.log(new Date);
	console.log('Someone died T_T');
});

