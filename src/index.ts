import type { CompilerHost, CompilerOptions } from "typescript"
import {
	ModuleResolutionKind,
	sys,
	findConfigFile,
	readConfigFile,
	resolveModuleName,
	createCompilerHost,
} from "typescript"

import type { Plugin } from "rollup"
import fs from "fs"
import path from "path"

interface Mapping {
	wildcard: boolean
	alias: string
	pattern: RegExp
	targets: string[]
}

interface PluginOptions {
	tsConfigPath: string
	logLevel: "warn" | "debug" | "none"
}

export const tsPathsResolve: Plugin = ({
	tsConfigPath = process.env["TS_NODE_PROJECT"] || findConfigFile(".", sys.fileExists) || "tsconfig.json",
	logLevel = "warn",
}: Partial<PluginOptions> = {}) => {
	const pluginName = "ts-paths"
	const { compilerOptions } = getTsConfig(tsConfigPath)
	const baseUrl = path.resolve(path.dirname(tsConfigPath), compilerOptions.baseUrl)
	const mappings = createMappings(compilerOptions, pluginName, logLevel)
	const host = createCompilerHost(compilerOptions)
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
					importer,
					baseUrl,
					compilerOptions,
					host,
				})
				if (resolved) {
					if (logLevel === "debug") {
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
	const { config, error } = readConfigFile(configPath, sys.readFile)
	if (error) {
		throw new Error(error.messageText.toString())
	}
	let { compilerOptions } = config
	compilerOptions = compilerOptions || {}
	compilerOptions.baseUrl = compilerOptions.baseUrl || "."
	switch (String.prototype.toLocaleLowerCase(compilerOptions.moduleResolution)) {
		case "classic":
			compilerOptions.moduleResolution = ModuleResolutionKind.Classic
			break
		default:
			compilerOptions.moduleResolution = ModuleResolutionKind.NodeJs
			break
	}
	return { compilerOptions }
}

const createMappings = (
	compilerOptions: CompilerOptions,
	pluginName: string,
	logLevel: "warn" | "debug" | "none",
): Mapping[] => {
	const mappings: Mapping[] = []
	const paths = compilerOptions.paths || {}
	const escapeRegExp = (str: string) => str.replace(/[-\/\\^$*+?\.()[\]{}]/g, "\\$&")
	if (logLevel !== "none") {
		if (Object.keys(paths).length === 0) {
			console.log(`\x1b[1;33m(!) [${pluginName}]: typescript path alias are empty.\x1b[0m`)
		}
	}
	for (const alias of Object.keys(paths)) {
		if (alias === "*") {
			if (logLevel !== "none") {
				console.log(`\x1b[1;33m(!) [${pluginName}]: alias "*" is not accepted.\x1b[0m`)
			}
			continue
		}
		const wildcard = alias.indexOf("*") !== -1
		const excapedAlias = escapeRegExp(alias)
		const targets = paths[alias].filter(target => {
			if (target.startsWith("@types") || target.endsWith(".d.ts")) {
				if (logLevel === "debug") {
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
	if (logLevel === "debug") {
		for (const mapping of mappings) {
			console.log(`\x1b[36m[${pluginName}]\x1b[0m`, "pattern:", mapping.pattern, "targets:", mapping.targets)
		}
	}
	return mappings
}

const findMapping = ({
	mapping,
	source,
	importer,
	baseUrl,
	compilerOptions,
	host,
}: {
	mapping: Mapping
	source: string
	importer: string
	baseUrl: string
	compilerOptions: CompilerOptions
	host: CompilerHost
}) => {
	const match = source.match(mapping.pattern)
	if (!match) {
		return ""
	}
	for (const target of mapping.targets) {
		const newPath = mapping.wildcard ? target.replace("*", match[1]) : target
		const answer = path.resolve(baseUrl, newPath)
		const { resolvedModule } = resolveModuleName(answer, importer, compilerOptions, host)
		if (resolvedModule) {
			return resolvedModule.resolvedFileName
		}
		if (fs.existsSync(answer)) {
			return answer
		}
	}
	return ""
}

export default tsPathsResolve
