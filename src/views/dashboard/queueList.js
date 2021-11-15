async function handler(req, res) {
  const {Queues} = req.app.locals;
  const queues = Queues.list();
  const info = await Queues.info();
  return res.render('dashboard/templates/queueList', { queues, info});
}

module.exports = handler;
