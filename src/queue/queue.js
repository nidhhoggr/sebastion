const  redis = require('ioredis');
const  _ = require('lodash');
const  util = require('util');
const url = require('url');
const Job = require('./job');
const semver = require('semver');
const debuglog = require('debuglog')('jimmy');
const uuid = require('uuid');

const MINIMUM_REDIS_VERSION = '2.8.18';

const Queue = function Queue(name, url, opts){
  if(!(this instanceof Queue)){
    return new Queue(name, url, opts);
  }

  if(_.isString(url)){
    opts = _.extend({}, {
      redis: redisOptsFromUrl(url)
    }, opts);
  }else{
    opts = url;
  }

  opts = _.cloneDeep(opts || {});

  if(opts && !_.isObject(opts)){
    throw Error('Options must be a valid object');
  }

  if(opts.limiter){
    this.limiter = opts.limiter;
  }

  this.name = name;
  this.token = uuid();

  opts.redis = opts.redis || {};

  _.defaults(opts.redis, {
    port: 6379,
    host: '127.0.0.1',
    db: opts.redis.db || opts.redis.DB,
    retryStrategy: function (times) {
      return Math.min(Math.exp(times), 20000);
    }
  });

  this.keyPrefix = opts.redis.keyPrefix || opts.prefix || 'jimmy';
  //
  // We cannot use ioredis keyPrefix feature since we
  // create keys dynamically in lua scripts.
  //
  delete opts.redis.keyPrefix;

  this.clients = [];
  var lazyClient = redisClientGetter(this, opts, function (type, client) {
    // bubble up Redis error events
    if (type === 'client') {
      debuglog(name + ' queue ready');
    }
  });

  Object.defineProperties(this, {
    client: {
      get: lazyClient('client')
    },
  });

  if (opts.skipVersionCheck !== true) {
    console.log("calling getRedisVersion");
    getRedisVersion(this.client).then((version) => {
      if (semver.lt(version, MINIMUM_REDIS_VERSION)){
        this.emit('error', new Error('Redis version needs to be greater than ' + MINIMUM_REDIS_VERSION + '. Current: ' + version));
      }
    }).catch(function(/*err*/){
      // Ignore this error.
    });
  }

  this.handlers = {};

  this.settings = opts.settings;
  this.client_url = opts.client_url;
  this.keys = {};
  
  _.each([
    '',
    'jobs'
  ], (key) => {
    this.keys[key] = this.toKey(key);
  });
};

function redisClientGetter(queue, options, initCallback) {
  var createClient = _.isFunction(options.createClient)
    ? options.createClient
    : function(type, config) { return new redis(config); };

  var connections = {};

  return function (type) {
    return function() { // getter function
      if (connections[type] != null) return connections[type];
      var client = connections[type] = createClient(type, options.redis);
      queue.clients.push(client);
      return initCallback(type, client), client;
    };
  };
}

function redisOptsFromUrl(urlString){
  var redisOpts = {};
  try {
    var redisUrl = url.parse(urlString);
    redisOpts.port = redisUrl.port || 6379;
    redisOpts.host = redisUrl.hostname;
    if (redisUrl.auth) {
      redisOpts.password = redisUrl.auth.split(':')[1];
    }
  } catch (e) {
    throw new Error(e.message);
  }
  return redisOpts;
}

require('./getters')(Queue);

Queue.prototype.isReady = function(){
  return this._initializing.then(() => this);
};

Queue.prototype.disconnect = function(){
  // TODO: Only quit clients that we "own".
  var clients = this.clients.filter(function(client){
    return client.status !== 'end';
  });

  var ended = new Promise(function(resolve, reject){
    var resolver = _.after(clients.length, resolve);
    clients.forEach(function(client){
      client.once('end', resolver);
      client.once('error', reject);
    });
  });

  return Promise.all(clients.map(function(client){
    // We do not wait for quit and hope ioredis will eventually quit or timeout.
    // In any case, no further cmds will be accepted by this client.
    return client.quit().catch(function(err){
      if(err.message !== 'Connection is closed.'){
        throw err;
      }
    }).timeout(500).catch(function(){
      client.disconnect();
    });
  })).then(function(){
    if(clients.length){
      return ended;
    }
  }, function(err){
    console.error(err);
  });
};

Queue.prototype.toKey = function(postfix){
  if (postfix) {
    return [this.keyPrefix, "queue", this.name, postfix].join(':');
  }
  else {
    return [this.keyPrefix, "queue", this.name].join(':');
  }
};


//
// Private local functions
//

function getRedisVersion(client){
  return client.info().then(function(doc){
    var prefix = 'redis_version:';
    var lines = doc.split('\r\n');
    for(var i = 0; i < lines.length; i++){
      if(lines[i].indexOf(prefix) === 0){
        return lines[i].substr(prefix.length);
      }
    }
  });
};

module.exports = Queue;
