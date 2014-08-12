var loc			= __dirname + '/../controllers/',
	user 		= require(loc + 'user'),
	streamers	= require(loc + 'streamers');

module.exports	= function (router, logger) {

	router.del 	= router.delete;

	router.all('*', function (req, res, next) {
		logger.log('debug', '--REQUEST BODY--', req.body);
		logger.log('debug', '--REQUEST QUERY--', req.query);
		next();
	});

	router.get('/user/:id', user.get_user);
	router.get('/streamers', streamers.get_streamers);
	router.all('*', function (req, res) {
		res.status(404)
			.send({message : 'Nothing to do here.'});
	});

	return router;
};