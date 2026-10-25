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
net.connect = deny;
net.createConnection = deny;
net.Socket.prototype.connect = deny;
require('node:tls').connect = deny;
globalThis.fetch = async () => deny();
syncBuiltinESMExports();
