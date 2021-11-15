const _ = require('lodash');
const Jimmy = require('./queue');
const path = require('path');
const fetch = require('node-fetch');
const debuglog = require('debuglog')('jimmy');

class Queues {
  constructor(config) {
    this._queues = {};

    this.setConfig(config);
  }

  list() {
    return this._config.queues;
  }

  setConfig(config) {
    this._config = config;
  }

  async get(queueName, queueHost) {
    const queueConfig = _.find(this._config.queues, {
      name: queueName,
      hostId: queueHost
    });
    
    if (!queueConfig) return null;

    if (this._queues[queueHost] && this._queues[queueHost][queueName]) {
      return this._queues[queueHost][queueName];
    }

    const { type, name, port, host, db, password, prefix, url } = queueConfig;

    const options = {
      client_url: this.client_url(), 
      prefix,
      redis: url || { port, host, db, password }
    };

    const queue = new Jimmy(name, options);

    this._queues[queueHost] = this._queues[queueHost] || {};
    this._queues[queueHost][queueName] = queue;

    return queue;
  }

  client_url(path = "") {
    const {host, port} = this._config.client;
    return `http://${host}:${port}/${path}`;
  }

  info() {
    const url = this.client_url("info");
    debuglog(`fetching from ${url}`);
    return fetch(url)
      .then(async (resp) => {
        const json = await resp.json();
        return json;
      });
  }
}

module.exports = Queues;
