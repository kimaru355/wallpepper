const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
const core = path.resolve(__dirname, '../../packages/core');

// Share the platform-independent logic with the desktop app.
config.watchFolders = [...(config.watchFolders ?? []), core];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@wallpepper/core': path.join(core, 'src'),
};
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
