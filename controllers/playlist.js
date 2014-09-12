var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    mysql			= require(__dirname + '/../lib/mysql'),
    curl			= require(__dirname + '/../lib/curl'),
    logger         	= require(__dirname + '/../lib/logger')
    us         		= require(__dirname + '/../lib/unserialize'),
    mongo			= require(__dirname + '/../lib/mongoskin');

exports.get_show_playlists = function(req, res, next) {
	var data = {},
		user,
		limit,
		page,
		start = function () {
			logger.log('info', 'Getting All Shows Playlists');
			limit 	= parseInt(req.query.limit) || 25;
			page 	= parseInt(req.query.page) || 1;
			skip 	= (page - 1) * limit;

			get_playlists();
		},
		get_playlists = function() {
			return mongo.collection('showsPlaylists')
				.find()
				.skip(skip)
				.limit(limit)
				.toArray(send_response);
		},
		send_response = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting playlists');
				return next(err);
			}

			res.send(result);
		};

	start();
};


exports.get_show_playlist_videos = function(req, res, next) {
	var data = {},
		user,
		limit,
		page,
		start = function () {
			logger.log('info', 'Getting showsPlaylist Videos');
			limit 	= parseInt(req.query.limit) || 25;
			page 	= parseInt(req.query.page) || 1;
			skip 	= (page - 1) * limit;

			get_playlist_videos();
		},
		get_playlist_videos = function() {
			return mongo.collection('videos')
					.find({
						"snippet.playlistId" : req.params.playlistid
					})
					.skip(skip)
					.limit(limit)
					.toArray(send_response);
		},
		send_response = function (err, result) {
			if (err) {
				logger.log('warn', 'Error getting playlists');
				return next(err);
			}

			res.send(result);
		};

	start();
}
