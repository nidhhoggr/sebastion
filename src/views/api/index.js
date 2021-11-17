const router = require('express').Router();

const jobRetry = require('./jobRetry');
const jobRemove = require('./jobRemove');
const jobFail = require('./jobFail');
const jobComplete = require('./jobComplete');
const jobCancel = require('./jobCancel');
const jobFetch = require('./jobFetch');

const bulkJobsRemove = require('./bulkJobsRemove');
const bulkJobsRetry = require('./bulkJobsRetry');

router.post('/queue/:queueHost/:queueName/job/bulk', bulkJobsRemove);
router.patch('/queue/:queueHost/:queueName/job/bulk', bulkJobsRetry);
router.patch('/queue/:queueHost/:queueName/job/:id/retry', jobRetry);
router.patch('/queue/:queueHost/:queueName/job/:id/fail', jobFail);
router.patch('/queue/:queueHost/:queueName/job/:id/cancel', jobCancel);
router.patch('/queue/:queueHost/:queueName/job/:id/complete', jobComplete);
router.get('/queue/:queueHost/:queueName/job/:id/fetch', jobFetch);
router.delete('/queue/:queueHost/:queueName/job/:id', jobRemove);

module.exports = router;
