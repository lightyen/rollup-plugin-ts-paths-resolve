import type { Plugin } from "rollup"

interface TsPathsResolveOpitons {
	tsConfigPath: string
	logLevel: "warn" | "debug" | "none"
	extensions: string[]
}

export function tsPathsResolve(options?: Partial<TsPathsResolveOpitons>): Plugin
export default tsPathsResolve
