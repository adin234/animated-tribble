var config = require(__dirname + '/../config/config'),
    logger = require(__dirname + '/../lib/logger'),
    mongo = require(__dirname + '/../lib/mongoskin'),
    mysql = require(__dirname + '/../lib/mysql'),
    bodyParser = require('body-parser');



exports.get_admin_users = function (req, res, next) {
    start = function () {

            if (typeof req.cookies.user === 'undefined') {
                return res.send('not logged in');
            }


            var admin_group = 3;
            var user_id = JSON.parse(req.cookies.user)
                .user_id;

            mysql.open(config.mysql)
                .query(

                    'select * from xf_user where user_id = ? AND (user_group_id = ? or secondary_group_ids = ?)', [
                        user_id, admin_group, admin_group
                    ],

                    function (err, result) {
                        result.forEach(function (item) {
                            if (item.user_id === user_id) {
                                templating();
                            }
                        });

                        if (err) {
                            res.send('Not an admin');
                        }
                    }
                )
                .end();

        },

        templating = function () {
            "use strict";
            var html = [];

            html.push('<div id="add_event_header"> Add Event </div>');
            html.push('<div id="addForm"><form>');
            html.push(
                '<p id="e_title">Title</p> <input type="text" name="event_name" placeholder="Event Title" id="event_name" required>'
            );
            html.push(
                '<p id="e_s_date">Start Date</p> <input type = "date" name = "event_start_date"' +
                'placeholder = "Event Start Date"' +
                'id = "event_start_date" required>'
            );
            html.push(
                '<p id="e_e_date">End Date</p> <input type="date"' +
                'name="event_end_date" placeholder="Event End Date"' +
                ' id="event_end_date" required>'
            );
            html.push(
                '<p id="s_time">Start Time</p> <input type="time"' +
                ' name="event_start_time"' +
                'placeholder="Event Start Time" id="event_start_time" required>'
            );
            html.push(
                '<p id="e_time">End Time</p> <input type="time"' +
                'name="event_end_time"' +
                'placeholder="Event End Time" id="event_end_time" required>'
            );
            html.push('<p id="e_desc">Event Description</p>');

            html.push(
                '<textarea id="event_desc" name="event_desc" placeholder="Event Description"></textarea>'
            );
            html.push('<button onclick="add_event()">ADD EVENT</button>');
            html.push('<input type=hidden>');


            res.send(html);
            return html;
        };


    start();
};


exports.get_events = function (req, res, next) {

    start = function () {
            var freedom_events = mongo.collection('fa_events');
            if (freedom_events) {
                // var x = freedom_events.find().toArray(send_response);
                // console.log(x);
                return freedom_events.find()
                    .toArray(send_response);



            }
            else {
                send_response(true, null);
            }
        },
        send_response = function (err, result) {
            if (err) {
                logger.log('warn', 'Error getting freedom events');
                return next(err);
            }

            res.send(result);
        };

    start();
};

exports.search_events = function (req, res, next) {

    start = function () {
            var keyword = req.params.keyword
            var freedom_events = mongo.collection('fa_events');
            if (freedom_events) {
                return freedom_events.find({
                        name: keyword
                    })
                    .toArray(send_response);
            }
            else {
                send_response(true, null);
            }
        },
        send_response = function (err, result) {
            if (err) {
                logger.log('warn', 'Error searching freedom events');
                return next(err);
            }

            res.send(result);
        };

    start();
};

exports.add_event = function (req, res, next) {


    start = function () {
            var freedom_events = mongo.collection('fa_events');
            if (freedom_events) {
                freedom_events.insert(req.body, {}, function () {
                    send_response(false, 'event added');
                });
            }
            else {
                send_response(true, null);
            }
        },
        send_response = function (err, result) {
            if (err) {
                logger.log('warn', 'Error adding freedom event');
                return next(err);
            }

            res.send(result);
        };


    start();
};

exports.delete_event = function (req, res, next) {

    start = function () {
            var id = req.params.id
            var freedom_events = mongo.collection('fa_events');
            if (freedom_events) {
                freedom_events.removeById(id, function () {
                    send_response(false, 'event deleted');
                });
            }
            else {
                send_response(true, null);
            }
        },
        send_response = function (err, result) {
            if (err) {
                logger.log('warn', 'Error deleting freedom event');
                return next(err);
            }

            res.send(result);
        };

    start();

};

exports.event_update = function (req, res) {



    start = function () {
            var freedom_events = mongo.collection('fa_events');
            if (freedom_events) {
                freedom_events.update(req.body, {}, function () {
                    send_response(false, 'event updated');
                });
            }
            else {
                send_response(true, null);
            }
        },
        send_response = function (err, result) {
            if (err) {
                logger.log('warn', 'Error updating freedom event');
                return next(err);
            }

            res.send(result);
        };

    start();
};

