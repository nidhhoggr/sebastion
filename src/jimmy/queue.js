'use strict';

var redis = require('ioredis');

var _ = require('lodash');

var util = require('util');
var url = require('url');
var Job = require('./job');

var semver = require('semver');
var debuglog = require('debuglog')('jimmy');
var uuid = require('uuid');


var MINIMUM_REDIS_VERSION = '2.8.18';

var Queue = function Queue(name, url, opts){
  var _this = this;
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

  this.keyPrefix = opts.redis.keyPrefix || opts.prefix || 'ocypod';

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
    //
    // Queue client (used to add jobs, pause queues, etc);
    //
    client: {
      get: lazyClient('client')
    },
    //
    // Event subscriber client (receive messages from other instance of the queue)
    //
    eclient: {
      get: lazyClient('subscriber')
    },
    bclient: {
      get: lazyClient('bclient')
    }
  });

  console.log(opts);
  if (opts.skipVersionCheck !== true) {
    console.log("calling getRedisVersion");
    getRedisVersion(this.client).then(function(version){
      if (semver.lt(version, MINIMUM_REDIS_VERSION)){
        _this.emit('error', new Error('Redis version needs to be greater than ' + MINIMUM_REDIS_VERSION + '. Current: ' + version));
      }
    }).catch(function(/*err*/){
      // Ignore this error.
    });
  }

  this.handlers = {};

  this.settings = opts.settings;

  var keys = {};
  _.each([
    '',
    'jobs'], function(key){
    keys[key] = _this.toKey(key);
  });
  this.keys = keys;
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

//
// Extend Queue with "aspects"
//
require('./getters')(Queue);


Queue.prototype.isReady = function(){
  var _this = this;
  return this._initializing.then(function(){
    return _this;
  });
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

Queue.prototype.toKey = function(queueType){
  return [this.keyPrefix, "queue", this.name].join(':');
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
