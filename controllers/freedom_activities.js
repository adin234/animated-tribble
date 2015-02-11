var logger = require(__dirname + '/../lib/logger')
      mongo = require(__dirname + '/../lib/mongoskin');

exports.get_events = function (req, res, next) {
	
    start = function () {
        var freedom_events = mongo.collection('fa_events');
        if(freedom_events){
            return freedom_events.find().toArray(send_response);
        }else{
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

exports.add_event = function (req, res, next) {
	
    start = function () {
        var freedom_events = mongo.collection('fa_events');
        if(freedom_events){
            freedom_events.insert(req.body, {}, function(){
                send_response(false, 'event added');
            });
        }else{
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
        if(freedom_events){
            freedom_events.removeById(id, function(){
                send_response(false, 'event deleted');
            });
        }else{
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

exports.update_event = function (req, res, next) {
	
    start = function () {
        var freedom_events = mongo.collection('fa_events');
        if(freedom_events){
            freedom_events.update(req.body, {}, function(){
                send_response(false, 'event updated');
            });
        }else{
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
