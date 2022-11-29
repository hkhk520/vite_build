import path from 'path'
const { defineConfig } = require('vite')

module.exports = defineConfig({
  build: {
    // target:['edge90','chrome90','firefox90','safari15'],
    // target: 'es2015',
    lib: {
      entry: path.resolve(__dirname, 'src/sdk/sdk.js'),
      name: 'sdk',
      fileName: (format) => `sdk.${format}.js`
    }
  }
});