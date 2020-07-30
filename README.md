# rollup-plugin-ts-paths-resolve

Resolve tsconfig paths alias

```sh
yarn add -D rollup-plugin-ts-paths-resolve
```

rollup.config.js

```js

import tsPaths from "rollup-plugin-ts-paths-resolve";

export default {
  plugins: [
    tsPaths(),
    // you also need **@rollup/plugin-node-resolve** to handle non-alias
    nodeResolve(),
    commonjs(),
    ...
  ]
}
```
