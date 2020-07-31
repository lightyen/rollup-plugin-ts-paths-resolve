import type { CompilerHost, CompilerOptions } from "typescript"
import {
	ModuleResolutionKind,
	sys,
	findConfigFile,
	readConfigFile,
	resolveModuleName,
	createCompilerHost,
} from "typescript"

import type { Plugin, ResolveIdResult } from "rollup"
import fs from "fs"
import path from "path"
import nodeResolve from "@rollup/plugin-node-resolve"

interface Mapping {
	alias: {
		source: string
		wildcard: boolean
		pattern: RegExp
	}
	targets: string[]
}

interface Fallback {
	resolveId?: (source: string, importer?: string) => Promise<ResolveIdResult> | ResolveIdResult
}

interface PluginOptions {
	tsConfigPath: string
	logLevel: "warn" | "debug" | "none"
	fallback: Fallback
}

export const tsPathsResolve: Plugin = ({
	tsConfigPath = process.env["TS_NODE_PROJECT"] || findConfigFile(".", sys.fileExists) || "tsconfig.json",
	logLevel = "warn",
	fallback = nodeResolve(),
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
				const [resolved, nodeModules] = findMapping({
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
					if (nodeModules) {
						return fallback.resolveId(resolved, importer)
					}
					return resolved
				}
			}
			return fallback.resolveId(source, importer)
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
	switch (String.prototype.toLocaleLowerCase.call(compilerOptions.moduleResolution)) {
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
	const escapeRegExp = (str: string) => str.replace(/[-\/\\^$*+?\.()[\]{}]/g, "\\$&")
	const mappings: Mapping[] = []
	const paths = compilerOptions.paths || {}

	if (logLevel !== "none" && Object.keys(paths).length === 0) {
		console.log(`\x1b[1;33m(!) [${pluginName}]: typescript path alias are empty.\x1b[0m`)
	}

	for (const alias of Object.keys(paths)) {
		const wildcard = alias.indexOf("*") !== -1
		const targets = paths[alias].filter(target => {
			if (target.indexOf("@types") || target.endsWith(".d.ts")) {
				if (logLevel === "debug") {
					console.log(`\x1b[1;33m(!) [${pluginName}]: type defined ${target} is ignored.\x1b[0m`)
				}
				return false
			}
			return true
		})
		if (alias === "*") {
			mappings.push({ alias: { source: alias, wildcard, pattern: /(.*)/ }, targets })
			continue
		}
		const excapedAlias = escapeRegExp(alias)
		const pattern = wildcard
			? new RegExp(`^${excapedAlias.replace("\\*", "(.*)")}`)
			: new RegExp(`^${excapedAlias}$`)
		mappings.push({ alias: { source: alias, wildcard, pattern }, targets })
	}

	if (logLevel === "debug") {
		for (const mapping of mappings) {
			console.log(
				`\x1b[36m[${pluginName}]\x1b[0m`,
				"pattern:",
				mapping.alias.pattern,
				"targets:",
				mapping.targets,
			)
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
}): [string, boolean] => {
	const match = source.match(mapping.alias.pattern)
	if (!match) {
		return ["", false]
	}
	for (const target of mapping.targets) {
		let predicted = target
		if (mapping.alias.wildcard) {
			predicted = target.replace("*", match[1])
		}
		const answer = path.resolve(baseUrl, predicted)
		if (answer.indexOf("node_modules/") != -1) {
			return [answer, true]
		}
		const { resolvedModule } = resolveModuleName(answer, importer, compilerOptions, host)
		if (resolvedModule) {
			return [resolvedModule.resolvedFileName, false]
		}
		if (fs.existsSync(answer)) {
			return [answer, false]
		}
	}
	return ["", false]
}

export default tsPathsResolve
