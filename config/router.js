var loc = __dirname + '/../controllers/',
    index = require(loc + 'index'),
    user = require(loc + 'user'),
    games = require(loc + 'games'),
    login = require(loc + 'login'),
    news = require(loc + 'news'),
    shows = require(loc + 'shows'),
    youtubers = require(loc + 'youtubers'),
    freedom_activities = require(loc + 'freedom_activities'),
    streamers = require(loc + 'streamers'),
    csrf = require('csurf');
// arrowchat = require(loc + 'arrowchat');

module.exports = function(router, logger) {

    csrfProtection = csrf({
        cookie: true
    });

    router.del = router.delete;

    router.all('*', function(req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        logger.log('debug', '--REQUEST BODY--', req.body);
        logger.log('debug', '--REQUEST QUERY--', req.query);
        process.cache = process.cache || {};
        if (req.query.bust === 1) {
            process.cache = {};
        }
        console.log(process.cache);
        next();
    });

    router.get('/authenticate', login.authenticate);
    router.post('/login', login.login);
    router.get('/logged_user', login.get_user);
    router.get('/lan_party', youtubers.get_lan_party);
    router.get('/freedom_activities', youtubers.get_freedom_activities);
    router.get('/freedom_events', freedom_activities.get_events);
    router.get('/freedom_events/search/:keyword', freedom_activities.search_events);
    router.post('/freedom_events/add', freedom_activities.add_event);
    router.get('/freedom_events/delete/:id', freedom_activities.delete_event);
    router.get('/freedom_events/checkAdmin', csrfProtection, freedom_activities.get_admin_users);
    router.get('/freedom_events/validate', freedom_activities.get_token);
    //router.post('/freedom_events/update', freedom_activities.update_event);
    /* RDC 2015-02-20 */
    router.get('/gamesperconsole', index.getGamesPerConsole);
    /* End */
    router.get('/get_views/:twitch', streamers.get_views); -
    router.get('/get_hitbox_views/:hitbox', streamers.get_hitbox_views); -
    router.get('/index', index.get_index); -
    router.get('/flush', index.flush_cache);
    router.get('/scrape/:twitch', index.get_scrape);
    router.get('/user/:id', user.get_user);
    router.get('/streamers', streamers.get_streamers);
    router.get('/streamers/youtube', streamers.get_youtube_streamers);
    router.get('/streamers/hitbox', streamers.get_hitbox_streamers);
    router.get('/streamersdata', streamers.get_streamers_data);
    router.get('/streaming/:twitch/:youtube', streamers.get_is_streaming);
    router.get('/youtubers', youtubers.get_data);
    router.get('/youtubers/video', youtubers.get_youtubers);
    router.get('/youtubers/videos/:id/comment', youtubers.get_comments);
    router.post('/youtubers/videos/:id/comment', youtubers.post_comment);
    router.get('/youtubers/videos/:id/comment/:comment_id/delete', youtubers.delete_comment);
    router.get('/youtubers/search', youtubers.search);
    router.get('/youtubers/search_youtubers', youtubers.search_youtubers);
    router.get('/game/:gameid', games.get_game_data);
    router.get('/gamesdata', games.get_games_data);
    router.get('/games', games.get_games);
    router.get('/games/:gameid/videos', games.get_game_videos);
    router.get('/games/:gameid/playlists', games.get_game_playlists);
    router.get('/news', news.get_news);
    router.get('/shows', shows.get_shows);
    router.get('/favorites', user.get_favorites);
    router.get('/favorite-ids', user.get_favorite_ids);
    router.get('/fav/:videoId', user.fav_video);
    router.get('/unfav/:videoId', user.unfav_video);
    router.get('/user/personal/:id', user.get_youtuber_profile);
    router.get('/get_location', login.get_location);
    router.get('/earnings', login.get_earnings);
    router.get('/loaderio-37804bf004f92d92a8319891ded25d31.html', function(req, res, next) {
        res.send('loaderio-37804bf004f92d92a8319891ded25d31');
    });
    router.get('/loaderio-37804bf004f92d92a8319891ded25d31.txt', function(req, res, next) {
        res.send('loaderio-37804bf004f92d92a8319891ded25d31');
    });

    // router.post('/send_message', arrowchat.send_message);

    router.get('/vid_suggestions', youtubers.get_suggestions);
    router.post('/batch/update', youtubers.update_videos);
    router.all('*', function(req, res) {
        res.status(404)
            .send({
                message: 'Nothing to do here.'
            });
    });

    return router;
};
