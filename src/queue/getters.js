/*eslint-env node */
'use strict';

var _ = require('lodash');
var Job = require('./job');

module.exports = function(Queue){
 
  Queue.prototype.toPrefixedKey = function(queueType){
    if (queueType === "queued") {
      return this.keys["jobs"];
    }
    else {
      return [this.keyPrefix, queueType].join(':');
    }
  };

  Queue.prototype.getJob = function(jobId){
    return Job.fromId(this, jobId);
  };

  // Job counts by type
  // Queue#getJobCountByTypes('completed') => completed count
  // Queue#getJobCountByTypes('completed,failed') => completed + failed count
  // Queue#getJobCountByTypes('completed', 'failed') => completed + failed count
  // Queue#getJobCountByTypes('completed,queued', 'failed') => completed + queued + failed count
  Queue.prototype.getJobCountByTypes = function() {
    return this.getJobCounts.apply(this, arguments).then((result) => {
      return _.chain(result).values().sum().value();
    });
  };

  /**
   * Returns the job counts for each type specified or every list/set in the queue by default.
   *
   */
  Queue.prototype.getJobCounts = function(){
    const multi = this.client.multi();
    var types = parseTypeArg(arguments);//exa value: [ 'queued', 'running', 'completed', 'failed', 'timedout', 'ended' ]
    _.map(types, (type) => {
      const key = this.toPrefixedKey(type);
      multi["lrange"](key, 0, -1);
    });
    return multi.exec().then((res) => {
      var counts = {};
      res.forEach((res, index) => {
        const queueType = types[index];
        counts[queueType] = 0;
        const jobIds = res[1];
        jobIds.forEach(async (jobId) => {
          const job = await this.getJob(jobId);
          const belongs = await job.belongsToQueue(this.name);
          if (belongs) {
            counts[queueType]++;
          }
        });
      });
      return counts;
    });
  };

  Queue.prototype.getQueuedCount = function() {
    return this.getJobCountByTypes('queued');
  };

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


  Queue.prototype.getQueued = function(start, end){
    return this.getJobs('queued', start, end, false);
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

    start = _.isUndefined(start) ? 0 : start;
    end = _.isUndefined(end) ? -1 : end;

    const resultByType = _.map(parseTypeArg(types), (type) => {
      const key = this.toPrefixedKey(type);
      if(asc){
        return this.client.lrange(key, -(end + 1), -(start + 1)).then((result) => result.reverse());
      }
      else{
        return this.client.lrange(key, start, end);
      }
    });

    return Promise.all(resultByType).then((results) =>{
      return _.flatten(results);
    });
  };

  Queue.prototype.getJobs = function(types, start, end, asc){
    return this.getRanges(types, start, end, asc).then((jobIds) => {
      return Promise.all(jobIds.map(async (j) => {
        const job = await this.getJob(j);
        const belongs = await job.belongsToQueue(this.name);
        if (belongs) return job;
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

