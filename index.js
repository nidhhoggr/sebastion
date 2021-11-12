const express = require('express');
const path = require('path');
const Sebastion = require('./src/app');
const routes = require('./src/views/routes');

function run(config, listenOpts = {}) {
  const {app, Queues} = Sebastion();

  if (config) Queues.setConfig(config);

  app.locals.basePath = listenOpts.basePath || app.locals.basePath;

  app.use(app.locals.basePath, express.static(path.join(__dirname, 'public')));
  app.use(app.locals.basePath, routes);

  const port = listenOpts.port || 3020;
  if (!listenOpts.disableListen) {
    app.listen(port, () => console.log(`Sebastion is running on port ${port}`));
  }

  return app;
}

if (require.main === module) run();

module.exports = run;
