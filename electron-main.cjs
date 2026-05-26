const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  await import(pathToFileURL(path.join(__dirname, 'electron-main.js')).href);
})();

module.exports = {};
