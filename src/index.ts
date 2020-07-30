import { findConfigFile, sys } from "typescript"
import fs from "fs"
import path from "path"
import json5 from "json5"

import type { Plugin } from "rollup"
import type { CompilerOptions } from "typescript"

interface Mapping {
	wildcard: boolean
	alias: string
	pattern: RegExp
	targets: string[]
}

interface PluginOptions {
	tsConfigPath: string
	logLevel: "warn" | "debug" | "none"
	extensions: string[]
}

export const tsPathsResolve: Plugin = ({
	tsConfigPath = process.env["TS_NODE_PROJECT"] || findConfigFile(".", sys.fileExists) || "tsconfig.json",
	logLevel = "warn",
	extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"],
}: Partial<PluginOptions> = {}) => {
	const pluginName = "ts-paths"
	const escapeRegExp = (str: string) => str.replace(/[-\/\\^$*+?\.()[\]{}]/g, "\\$&")
	const { compilerOptions } = getTsConfig(tsConfigPath)
	let baseUrl = path.resolve(path.dirname(tsConfigPath), compilerOptions?.baseUrl || ".")
	const paths = compilerOptions.paths || {}
	const mappings: Mapping[] = []
	if (logLevel != "none") {
		if (Object.keys(paths).length === 0) {
			console.log(`\x1b[1;33m(!) [${pluginName}]: typescript path alias are empty.\x1b[0m`)
		}
	}
	for (const alias of Object.keys(paths)) {
		if (alias === "*") {
			if (logLevel != "none") {
				console.log(`\x1b[1;33m(!) [${pluginName}]: alias "*" is not accepted.\x1b[0m`)
			}
			continue
		}
		const wildcard = alias.indexOf("*") !== -1
		const excapedAlias = escapeRegExp(alias)
		const targets = paths[alias].filter(target => {
			if (target.startsWith("@types") || target.endsWith(".d.ts")) {
				if (logLevel != "none") {
					console.log(`\x1b[1;33m(!) [${pluginName}]: type defined ${target} is ignored.\x1b[0m`)
				}
				return false
			}
			return true
		})
		const pattern = wildcard
			? new RegExp(`^${excapedAlias.replace("\\*", "(.*)")}`)
			: new RegExp(`^${excapedAlias}$`)
		mappings.push({ wildcard, alias, pattern, targets })
	}
	if (logLevel == "debug") {
		for (const mapping of mappings) {
			console.log(`\x1b[36m[${pluginName}]\x1b[0m`, "pattern:", mapping.pattern, "targets:", mapping.targets)
		}
	}
	return {
		name: pluginName,
		resolveId: (source: string, importer: string) => {
			if (typeof importer === "undefined" || source.startsWith("\0") || mappings.length == 0) {
				return null
			}
			for (const mapping of mappings) {
				const resolved = findMapping({
					mapping,
					source,
					extensions,
					baseUrl,
				})
				if (resolved) {
					if (logLevel == "debug") {
						console.log(`\x1b[36m[${pluginName}]\x1b[0m`, source, "->", resolved)
					}
					return resolved
				}
			}
			return null
		},
	}
}

const getTsConfig = (configPath: string): { compilerOptions: CompilerOptions } => {
	const configJson = sys.readFile(configPath)
	if (!configJson) {
		throw Error(`config is not found: ${configPath}`)
	}
	return json5.parse(configJson)
}

const findMapping = ({
	mapping,
	source,
	extensions,
	baseUrl = ".",
}: {
	mapping: Mapping
	source: string
	extensions: string[]
	baseUrl: string
}) => {
	const match = source.match(mapping.pattern)
	if (!match) {
		return ""
	}
	for (const target of mapping.targets) {
		const newPath = mapping.wildcard ? target.replace("*", match[1]) : target
		const answer = path.resolve(baseUrl, newPath)
		if (fs.existsSync(answer)) {
			return answer
		}
		for (const ext of extensions) {
			if (fs.existsSync(answer + ext)) {
				return answer + ext
			}
		}
	}
	return ""
}

export default tsPathsResolve
