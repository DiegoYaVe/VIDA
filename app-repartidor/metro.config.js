// Metro por defecto de Expo. En web, Zustand se resolvía a su build ESM, que
// usa import.meta y rompe el bundle; con estas condiciones toma el CommonJS.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.unstable_conditionNames = ['browser', 'require', 'react-native'];

module.exports = config;
