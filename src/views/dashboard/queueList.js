function handler(req, res) {
  const {Queues} = req.app.locals;
  const queues = Queues.list();
  console.log("src/server/views/dashboard/queueList.js", queues);
  return res.render('dashboard/templates/queueList', { queues });
}

module.exports = handler;
