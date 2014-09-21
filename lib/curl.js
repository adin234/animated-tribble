/**
	Curl.js

	@author	Raven Lagrimas
*/

var util	= require(__dirname + '/../helpers/util'),
	logger	= require(__dirname + '/logger'),
    http	= require('http'),
    https	= require('https'),

	Request = function (method) {
		this.method		= method;
		this.secure 	= false;
		this.started 	= false;
		this._raw 		= false;
		this.headers 	= {};

		this.to = function (host, port, path) {
			this.host = host;
			this.port = port;
			this.path = path;
			return this;
		};

		this.secured = function () {
			this.secure = true;
			return this;
		};

		this.add_header = function (key, value) {
			this.headers[key] = value;
			return this;
		};

		this.raw = function () {
			this._raw = true;
			return this;
		};

		this.then = function (cb) {
			if (!this.cb) {
				this.cb = cb;
			}
			else {
				this.fcb = cb;
			}

			!this.started && this.send();
			return this;
		};

		this.finally = function (cb) {
			this.fcb = cb;
			return this;
		};

		this.send = function (data) {
			var self = this,
				protocol,
				payload,
				req;

			this.started = true;

			if (this.method === 'GET') {
				this.path += (~this.path.indexOf('?') ? '&':'?') + util.stringify(data);
			}
			else {
				payload = util.stringify(data);
				this.headers['Content-Type'] = 'application/x-www-form-urlencoded';
				this.headers['Content-Length'] = payload.length;
			}

			if (!this._raw) {
				this.headers['Accept'] = 'application/json';
			}

			logger.log('debug', this.method, this.host, ':', this.port, this.path);

			if (payload) {
				logger.log('debug', 'data\n' + payload);
			}

			protocol = this.secure ? https : http;

			req = protocol.request({
				host: this.host,
				port: this.port,
				path: this.path,
				method: this.method,
				headers: this.headers
			}, function (response) {
				var s = '';

				response.setEncoding('utf8');

				response.on('data', function (chunk) {
					s += chunk;
				});

				response.on('end', function () {
					if (self._raw) {
						if (response.statusCode === 200) {
							logger.log('verbose', 'Response', response.statusCode);
							logger.log('silly', s);
							self.cb(null, s);
						}
						else {
							s.statusCode = response.statusCode;
							self.cb(s);
						}
					}
					else {
						logger.log('verbose', 'Response', response.statusCode);
						logger.log('silly', s);
						try {
							if (response.statusCode === 200) {
								self.cb(null, JSON.parse(s));
							}
							else {
								s = JSON.parse(s);
								s.statusCode = response.statusCode;
								self.cb(s);
							}
						}
						catch (e) {
							logger.log('error', 'JSON maybe invalid or there\'s a deeper error');
							console.log(e);
							logger.log('error', e);
							logger.log('debug', s);
							e.statusCode = response.statusCode;
							self.cb(e);
						}
					}
					self.fcb && self.fcb();
				});
			});

			req.on('error', function (err) {
				logger.log('error', 'Request error', err);
				self.cb(err);
				self.fcb && self.fcb();
			});

			if (this.method !== 'GET') {
				req.write(payload);
			}

			req.end();
			return this;
		};
	};

module.exports = {
	get : {
		to : function (host, port, path) {
			return new Request('GET').to(host, port, path);
		}
	},
	post : {
		to : function (host, port, path) {
			return new Request('POST').to(host, port, path);
		}
	},
	put : {
		to : function (host, port, path) {
			return new Request('PUT').to(host, port, path);
		}
	},
	delete : {
		to : function (host, port, path) {
			return new Request('DELETE').to(host, port, path);
		}
	},
	request : function (method) {
		this.to = function (host, port, path) {
			return new Request(method).to(host, port, path);
		};
		return this;
	}
};