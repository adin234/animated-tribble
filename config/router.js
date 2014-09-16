var loc			= __dirname + '/../controllers/',
	index 		= require(loc + 'index'),
	user 		= require(loc + 'user'),
	games 		= require(loc + 'games'),
	news 		= require(loc + 'news'),
	shows 		= require(loc + 'shows'),
	youtubers 	= require(loc + 'youtubers'),
	streamers	= require(loc + 'streamers');

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
	router.get('/youtubers', youtubers.get_data);
	router.get('/games', games.get_games);
	router.get('/games/:gameid/videos', games.get_game_videos);
	router.get('/games/:gameid/playlists', games.get_game_playlists);
	router.get('/news', news.get_news);
	router.get('/shows', shows.get_shows);
	router.all('*', function (req, res) {
		res.status(404)
			.send({message : 'Nothing to do here.'});
	});

	return router;
};

