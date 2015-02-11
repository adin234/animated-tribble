var config 			= require(__dirname + '/../config/config'),
    util			= require(__dirname + '/../helpers/util'),
    mysql			= require(__dirname + '/../lib/mysql'),
    curl			= require(__dirname + '/../lib/curl'),
    logger         	= require(__dirname + '/../lib/logger')
    us         		= require(__dirname + '/../lib/unserialize'),
    mongo			= require(__dirname + '/../lib/mongoskin');




 exports.get_event_details = function (req, res, next) {


 		start = function(){

 					mysql.open(config.mysql)
						.query(
								'select * from freedom_events'
						).end();	


 		}

 		start();
};




    