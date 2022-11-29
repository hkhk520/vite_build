# vite_build
vite打包SDK的配置项目

### vite.config.js 配置

```js
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
```

### package.json 配置

```js
"files": [
    "dist"
  ],
  "main": "./dist/sdk.umd.js",
  "module": "./dist/sdk.es.js",
  "exports": {
    ".": {
      "import": "./dist/sdk.es.js",
      "require": "./dist/sdk.umd.js"
    }
  },
```

### 需要安装相关依赖
```js
{
  "name": "kai",
  "version": "1.0.0",
  "description": "",
  "files": [
    "dist"
  ],
  "main": "./dist/sdk.umd.js",
  "module": "./dist/sdk.es.js",
  "exports": {
    ".": {
      "import": "./dist/sdk.es.js",
      "require": "./dist/sdk.umd.js"
    }
  },
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "dev": "vite",
    "build": "vite build"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "@vueuse/core": "^9.5.0",
    "axios": "^1.1.3",
    "dayjs": "^1.11.6",
    "md5": "^2.3.0",
    "qs": "^6.11.0",
    "terser": "^5.15.1",
    "vue": "^3.2.41"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^3.2.0",
    "vite": "^3.2.0"
  }
}
```
