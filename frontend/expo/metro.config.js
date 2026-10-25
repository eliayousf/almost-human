const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
// This repository has independent lockfiles, not a hoisted npm workspace.
// Watch the shared client and resolve its React/Convex imports to this app.
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, '../..')];
config.resolver.resolveRequest = (context, name, platform) => {
  const sharedRuntime = /^(react|react-dom|convex)(\/|$)|^@convex-dev\/auth(\/|$)/.test(name);
  return context.resolveRequest(sharedRuntime ? { ...context, originModulePath: path.join(__dirname, 'package.json') } : context, name, platform);
};
module.exports = config;
