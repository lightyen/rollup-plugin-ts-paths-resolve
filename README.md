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
  ]
}
```

## Options

### tsConfigPath _(string)_

Specify set where your TypeScript configuration file.

If not set:

- use Environment variable **TS_NODE_PROJECT**
- or search tsconfig.json in current working directory.

### logLevel _("warn" | "debug" | "none") (default: "warn")_

Log level when the plugin is running.

## reference

- https://www.typescriptlang.org/docs/handbook/module-resolution.html#path-mapping
