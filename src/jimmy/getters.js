/*eslint-env node */
'use strict';

var _ = require('lodash');
var Job = require('./job');

module.exports = function(Queue){
 
  Queue.prototype.toPrefixedKey = function(queueType){
      return [this.keyPrefix, queueType].join(':');
  };

  Queue.prototype.getJob = function(jobId){
    return Job.fromId(this, jobId);
  };

  Queue.prototype._commandByType = function(types, count, callback) {
    var _this = this;

    return _.map(types, function(type) {
      
      var key = _this.toPrefixedKey(type);
      //the following lists are maintained in ocypod
      //limbo ( used to keep jobs in the transition state between `queued` and `running`)
      //running
      //failed
      //timedout
      //ended (contains failed and timedout and compltedkeys)
      //completed
      switch(type) {
        //case 'queued':
        case 'limbo':
        case 'running':
        case 'failed':
        case 'timedout':
        case 'completed':
        case 'ended':
          return callback(key, count ? 'llen' : 'lrange');
      }
    });
  };

  /**
    Returns the number of jobs queued to be processed.
  */
  Queue.prototype.count = function(){
    //the number of jobs to be processed will simply be those either timedout our queued but not running. This mean everything inside of ended
    //that would be the equivelant of intersecting queue:jobs and ended
    //and then subtracting that from queue:jobs
    return this.getJobCountByTypes('wait', 'paused', 'delayed');
  };

  // Job counts by type
  // Queue#getJobCountByTypes('completed') => completed count
  // Queue#getJobCountByTypes('completed,failed') => completed + failed count
  // Queue#getJobCountByTypes('completed', 'failed') => completed + failed count
  // Queue#getJobCountByTypes('completed,queued', 'failed') => completed + queued + failed count
  Queue.prototype.getJobCountByTypes = function() {
    return this.getJobCounts.apply(this, arguments).then(function(result){
      return _.chain(result).values().sum().value();
    });
  };

  /**
   * Returns the job counts for each type specified or every list/set in the queue by default.
   *
   */
  Queue.prototype.getJobCounts = function(){
    var multi = this.client.multi();
    var types = parseTypeArg(arguments);//exa value: [ 'queued', 'running', 'completed', 'failed', 'timedout', 'ended' ]
    this._commandByType(types, true, function(key, command){
      console.log("HERE", key, command);
      multi[command](key);
    });

    return multi.exec().then(function(res){
      var counts = {};
      res.forEach(function(res, index){
        counts[types[index]] = res[1] || 0;
      });
      return counts;
    });
  };

/**
  case 'limbo':
  case 'running':
  case 'failed':
  case 'timedout':
  case 'completed':
  case 'ended':
*/
  Queue.prototype.getRunningCount = function() {
    return this.getJobCountByTypes('running');
  };

  Queue.prototype.getFailedCount = function() {
    return this.getJobCountByTypes('failed');
  };

  Queue.prototype.getTimedOutCount = function() {
    return this.getJobCountByTypes('timedout');
  };

  Queue.prototype.getCompletedCount = function() {
    return this.getJobCountByTypes('completed');
  };

  Queue.prototype.getEndedCount = function() {
    return this.getJobCountByTypes('ended');
  };

  Queue.prototype.getQueuedCount = function() {
    console.log("TODO");
  };

  Queue.prototype.getQueued = function(start, end){
    console.log("TODO");
  };

  Queue.prototype.getRunning = function(start, end){
    return this.getJobs('running', start, end, false);
  };

  Queue.prototype.getFailed = function(start, end){
    return this.getJobs('failed', start, end, false);
  };

  function getTimedout(start, end){
    return this.getJobs('timedout', start, end, false);
  };
 
  Queue.prototype.getTimedout = getTimedout;
  Queue.prototype.getTimedOut = getTimedout;

  Queue.prototype.getCompleted = function(start, end){
    return this.getJobs('completed', start, end, false);
  };

  Queue.prototype.getEnded = function(start, end){
    return this.getJobs('ended', start, end, false);
  };

  Queue.prototype.isInList = function(list, jobId) {
    //todo implement using LPOS > v6.0.5
    this.getJobs(list, 0, -1, false).then((jobs) => jobs.includes(jobId));
  };

  Queue.prototype.getRanges = function(types, start, end, asc){
    var _this = this;

    start = _.isUndefined(start) ? 0 : start;
    end = _.isUndefined(end) ? -1 : end;

    var resultByType = _this._commandByType(parseTypeArg(types), false, function(key, command){
      switch(command){
        case 'lrange':
          if(asc){
            return _this.client.lrange(key, -(end + 1), -(start + 1)).then(function(result){
              return result.reverse();
            });
          }else{
            return _this.client.lrange(key, start, end);
          }
      }
    });

    return Promise.all(resultByType).then(function(results){
      return _.flatten(results);
    });
  };

  Queue.prototype.getJobs = function(types, start, end, asc){
    var _this = this;
    return this.getRanges(types, start, end, asc).then(function(jobIds){
      return Promise.all(jobIds.map((j) => {
        return _this.getJob(j);
      }));
    });
  };
};

function parseTypeArg(args) {
  var types = _.chain([]).concat(args).join(',').split(/\s*,\s*/g).compact().value();

  return types.length
    ? types
    : ['queued', 'running', 'completed', 'failed', 'timedout', 'ended'];
}

