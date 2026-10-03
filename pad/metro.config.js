const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // Shares dependency-free modules (theme) with the Mac app in ../src. Don't import anything from there
  // that pulls in react-native: it would resolve against ../node_modules (react-native-macos).
  watchFolders: [path.resolve(__dirname, '../src')],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
