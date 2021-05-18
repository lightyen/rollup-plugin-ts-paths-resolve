# rollup-plugin-ts-paths-resolve

A rollup plugin for resolving tsconfig-paths

```sh
yarn add -D rollup-plugin-ts-paths-resolve
```

rollup.config.js

```js

import commonjs from "@rollup/plugin-commonjs"
// import nodeResolve from "@rollup/plugin-node-resolve";
import tsPathsResolve from "rollup-plugin-ts-paths-resolve";

export default {
  plugins: [
	// nodeResolve(),
    tsPathsResolve(),
    commonjs(),
  ]
}
```

Example tsconfig.json

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "node",
    "target": "esnext",
    "lib": ["esnext", "dom", "dom.iterable"],
    "types": ["react", "webpack-env"],
    "baseUrl": ".",
    "paths": {
      "~/*": ["./*"]
    }
  }
}
```

Then you can import alias instead of annoying path

```js
// import App from "../../../../App"
import App from "~/App"

...

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
- https://github.com/microsoft/TypeScript/issues/5039
