# rollup-plugin-ts-paths-resolve

A rollup plugin for resolving tsconfig-paths

```sh
yarn add -D rollup-plugin-ts-paths-resolve
```

rollup.config.js

```js

import tsPathsResolve from "rollup-plugin-ts-paths-resolve";

export default {
  plugins: [
    tsPathsResolve(),
    // nodeResolve(),
    commonjs(),
    ...
  ]
}
```
