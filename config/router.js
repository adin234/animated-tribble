var loc			= __dirname + '/../controllers/',
	index 		= require(loc + 'index'),
	user 		= require(loc + 'user'),
	games 		= require(loc + 'games'),
	streamers	= require(loc + 'streamers'),
	playlist 	= require(loc + 'playlist'),
	videos 		= require(loc + 'videos');

module.exports	= function (router, logger) {

	router.del 	= router.delete;

	router.all('*', function (req, res, next) {
		res.setHeader('Access-Control-Allow-Origin', '*');
		logger.log('debug', '--REQUEST BODY--', req.body);
		logger.log('debug', '--REQUEST QUERY--', req.query);
		if(req.query.bust === 1) {
			process.cache = {};
		}
		next();
	});

	router.get('/index', index.get_index);
	router.get('/user/:id', user.get_user);
	router.get('/streamers', streamers.get_streamers);
	router.get('/games', games.get_games);
	router.get('/games/:gameid/videos', games.get_game_videos);
	router.get('/games/:gameid/playlists', games.get_game_playlists);
	router.get('/shows/playlists', playlist.get_show_playlists);
	router.get('/shows/playlists/:playlistid/videos', playlist.get_show_playlist_videos);
	router.get('/shows/videos', videos.get_videos);
	router.all('*', function (req, res) {
		res.status(404)
			.send({message : 'Nothing to do here.'});
	});

	return router;
};

