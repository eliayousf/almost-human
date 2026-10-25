// Guard verification processes against accidental service calls. This is a
// test guard, not an OS sandbox. Tests can still install their own fetch mocks.
const { syncBuiltinESMExports } = require('node:module');
const deny = () => { throw new Error('Judging checks forbid network calls; use a test mock.'); };
for (const name of ['node:http', 'node:https']) {
  const module = require(name);
  module.request = deny;
  module.get = deny;
}
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const connect = net.connect;
const socketConnect = net.Socket.prototype.connect;
// Metro's 2g logger uses one named Unix-domain socket in the OS temp directory.
// Permit only that inherited logger endpoint, never TCP or arbitrary sockets.
const loggerIpc = args => {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first && typeof first === 'object' && ('host' in first || 'port' in first)) return false;
  const target = typeof first === 'string' ? first : first?.path;
  return typeof target === 'string' && target === process.env.__eventLogIpc
    && path.dirname(target) === os.tmpdir()
    && /^event-log-[A-Za-z0-9-]+\.sock$/.test(path.basename(target));
};
net.connect = net.createConnection = function (...args) {
  if (!loggerIpc(args)) return deny();
  return connect.apply(this, args);
};
net.Socket.prototype.connect = function (...args) {
  if (!loggerIpc(args)) return deny();
  return socketConnect.apply(this, args);
};
require('node:tls').connect = deny;
globalThis.fetch = async () => deny();
syncBuiltinESMExports();
