var _ = require('lodash');
var utils = require('./utils');
var debuglog = require('debuglog')('jimmy');

var Job = function(queue, input){
  this.queue = queue;
  this.input = input;
  this.toKey = function(jobId) {
    return toKey(queue, jobId);
  }
};

function toKey(queue, jobId) {
  return [queue.keyPrefix, "job", jobId].join(':');
}

Job.fromId = function(queue, jobId){
  // jobId can be undefined if moveJob returns undefined
  if(!jobId) {
    return Promise.resolve();
  }
  return queue.client.hgetall(toKey(queue, jobId)).then(function(jobData){
    return utils.isEmpty(jobData) ? null : Job.fromJSON(queue, jobData);
  });
};

Job.prototype.getField = function(field) {
   return this.queue.client.hget(toKey(this.queue, this.id), field);
}

Job.prototype.update = function(input){
  return this.queue.client.hset(this.queue.toKey(this.id), 'input', JSON.stringify(input));
};

Job.prototype.toJSON = function(){
  return {
    id: this.id,
    queue: this.queue,//name of the queue the job was created in
    status: this.status,//current status of the job
    tags: this.tags,// list of tags (if any) assigned to this job at creation time
    created_at: this.created_at,//date/time this job was first created and queued
    started_at: this.started_at,//date/time this job was accepted by a client, and the job's status changed to running
    ended_at: this.ended_at,//date/time this job stopped running, whether due to successful completed, timing out, or failure
    last_heartbeat: this.last_heartbeat,//date/time the last heartbeat for this job was sent by the client executing it
    input: this.input || {},//the job's payload, sent by the client creating this job - this typically contains the data needed for a worker to execute the job
    output: this.output,//contains any information the client working on this job decides to store here, this might include the job's result, progress information, partial results, etc. - it can be set anytime the task is running
    timeout: this.timeout,//maximum execution time of the job before it's marked as timed out
    heartbeat_timeout: this.heartbeat_timeout,//maximum time without receiving a heartbeat before the job is marked as timed out
    expires_after: this.expires_after,// amount of time this job metadata will persist in Jimmy after the job reaches a final state (i.e. completed/failed/timed_out with no retries remaining)
    retries: this.retries,//number of times this job will automatically be requeued on failure
    retries_attempted: this.retries_attempted,//number of times this job has failed and been requeued
    retry_delays: this.retry_delays,//minimum amount of time to wait between each retry attempt
    ended: this.ended,// indicates whether the job is in a final state or not (i.e. completed, or failed/timed out with no retries remaining)
  };
};

Job.prototype.retry = function(){
  console.log("TO BE IMPLEMENTED");
  /*
  return scripts.reprocessJob(this, { state: 'failed' }).then(function(result) {
    if (result === 1) {
      return;
    } else if (result === 0) {
      throw new Error(errors.Messages.RETRY_JOB_NOT_EXIST);
    } else if (result === -1) {
      throw new Error(errors.Messages.RETRY_JOB_IS_LOCKED);
    } else if (result === -2) {
      throw new Error(errors.Messages.RETRY_JOB_NOT_FAILED);
    }
  });
  */
};

//It will loop through each of the states until it's returned otherwise returns onknown
Job.prototype.getState = function() {
 
  const fns = [
    { fn: 'isQueued', state: 'queued' },
    { fn: 'isRunning', state: 'running' },
    { fn: 'isCompleted', state: 'completed' },
    { fn: 'isFailed', state: 'failed' },
    { fn: 'isTimedOut', state: 'timedout' },
    { fn: 'isCancelled', state: 'cancelled' },
    { fn: 'isEnded', state: 'ended' },
  ];

  return _.reduce(fns, (state, fn) => {
    if(state){
      return state;
    }
    return this[fn.fn]().then((result) => {
      return result ? fn.state : null;
    });
  }, Promise.resolve([]));
};

Job.prototype.remove = function(){
  console.log("to be implemented");
};

//queued - set by the server when a job is first created and added to a queue
//running - set by the server when a worker picks up a job
//completed - set by the client to mark a job as successfully completed
//failed - set by the client to mark a job as having failed
//timed_out - set by the server when a job exceeds either its timeout or heartbeat_timeout
//cancelled - set by client to mark that a job has been cancelled

Job.prototype.isQueued = function() {
  return new Promise((resolve) => {
    this.getField("status").then((r) => {
      resolve(r === "queued");
    });
  });
};

Job.prototype.isRunning = function() {
  return new Promise((resolve) => {
    this.getField("status").then((r) => {
      resolve(r === "running");
    });
  });
};

Job.prototype.isCompleted = function() {
  return new Promise((resolve) => {
    this.getField("status").then((r) => {
      resolve(r === "completed");
    });
  });
};

Job.prototype.isFailed = function(){
  return new Promise((resolve) => {
    this.getField("status").then((r) => {
      resolve(r === "failed");
    });
  });
};

Job.prototype.isTimedOut = function(){
  return new Promise((resolve) => {
    this.getField("status").then((r) => {
      resolve(r === "timed_out");
    });
  });
};

Job.prototype.isCancelled = function(){
  return new Promise((resolve) => {
    this.getField("status").then((r) => {
      resolve(r === "cancelled");
    });
  });
};


Job.prototype.belongsToQueue = function(queueName) {
  return new Promise((resolve) => {
    this.getField("queue").then((r) => {
      resolve(r === queueName);
    });
  });
};

/**
 * Returns a promise the resolves when the job has finished. (completed or failed).
 */
// -----------------------------------------------------------------------------
// Private methods
// -----------------------------------------------------------------------------

Job.prototype._isInList = function(list) {
  console.log(this.queue.isInList(list));
};


Job.fromJSON = function(queue, json){

  var job = new Job(queue, json);

  job.id = json.id;
  job.queue_name = json.queue;
  job.status = json.status;
  if (json.tags) job.tags = getJsonValue(json.tags);
  job.created_at = json.created_at;
  job.started_at = json.started_at;
  job.ended_at = json.ended_at;
  if (json.last_heartbeat) job.last_heartbeat = json.last_heartbeat;
  if(typeof json.input === 'string'){
    job.input = getJsonValue(json.input);
  }
  if(typeof json.output === 'string'){
    job.output = getJsonValue(json.output);
  }
  if (json.timeout) job.timeout = json.timeout;
  if (json.heartbeat_timeout) job.timeout = json.heartbeat_timeout;
  if (json.expires_after) job.expires_after = json.expires_after;
  job.retries = parseInt(json.retries || 0);
  job.retries_attempted = parseInt(json.retries_attempted || 0);
  if (json.retry_delays) job.retry_delays = json.retry_delays;
  if (json.ended) job.ended = json.ended;

  return job;
};

function getJsonValue(_value){
  var value = utils.tryCatch(JSON.parse, JSON, [_value]);
  if(value !== utils.errorObject){
    return value;
  }else{
    debuglog('corrupted output: ' + _value, value);
  }
}

module.exports = Job;
