import type { Plugin, ResolveIdResult } from "rollup"
import ts from "typescript"
import path from "path"
import fs from "fs"
import nodeResolve from "@rollup/plugin-node-resolve"
interface Mapping {
	alias: {
		wildcard: boolean
		pattern: string
		prefix: string
		suffix: string
	}
	targets: string[]
}

interface Fallback {
	resolveId?: (source: string, importer?: string) => Promise<ResolveIdResult> | ResolveIdResult
}

type LogLevel = "warn" | "debug" | "none"

interface PluginOptions {
	tsConfigPath: string
	logLevel: LogLevel
	fallback: Fallback
}

export const tsPathsResolve: Plugin = ({
	tsConfigPath = process.env["TS_NODE_PROJECT"] || ts.findConfigFile(".", ts.sys.fileExists) || "tsconfig.json",
	logLevel = "warn",
	fallback = nodeResolve({ extensions: [".mjs", ".js", ".json", ".node", ".jsx", ".ts", ".tsx"] }) as unknown as Fallback,
}: Partial<PluginOptions> = {}) => {
	const pluginName = "ts-paths"
	const compilerOptions = getTsConfig(tsConfigPath, logLevel, pluginName)
	const mappings = createMappings(compilerOptions, logLevel, pluginName)
	return {
		name: pluginName,
		resolveId: (request: string, importer: string) => {
			if (typeof importer === "undefined" || request.startsWith("\0")) {
				return null
			}
			const [resolved, nodeModules] = findResolve({
				compilerOptions,
				mappings,
				request,
				importer,
			})
			if (resolved) {
				if (logLevel === "debug") {
					console.log(formatLog("info", pluginName, `${request} -> ${resolved}`))
				}
				if (nodeModules) {
					return fallback.resolveId(resolved, importer)
				}
				return resolved
			}
			return fallback.resolveId(request, importer)
		},
	}
}

function formatLog(level: "error" | "warn" | "info", name: string, value: unknown) {
	switch (level) {
		case "error":
			return `\x1b[1;31m(!) [${name}]: ${value}\x1b[0m`
		case "warn":
			return `\x1b[1;33m(!) [${name}]: ${value}\x1b[0m`
		default:
			return `\x1b[1;34m(!) [${name}]: ${value}\x1b[0m`
	}
}

const getTsConfig = (tsConfigPath: string, logLevel: LogLevel, pluginName: string) => {
	const { error, config } = ts.readConfigFile(tsConfigPath, ts.sys.readFile)
	if (error) {
		throw new Error(formatLog("error", pluginName, error.messageText))
	}
	let { errors, options: compilerOptions } = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(tsConfigPath))
	if (errors.length > 0) {
		throw new Error(formatLog("error", pluginName, errors.map(err => err.messageText.toString()).join("\n")))
	}
	if (!compilerOptions) {
		throw new Error(formatLog("error", pluginName, "'compilerOptions' is gone."))
	}
	if (!compilerOptions.baseUrl) {
		throw new Error(
			formatLog(
				"error",
				pluginName,
				"Option 'compilerOptions.paths' cannot be used without specifying 'compilerOptions.baseUrl' option.",
			),
		)
	}
	if (!compilerOptions.paths || Object.keys(compilerOptions.paths).length === 0) {
		compilerOptions.paths = {}
		logLevel != "none" && console.warn(formatLog("warn", pluginName, "typescript compilerOptions.paths are empty."))
	}
	return compilerOptions
}

const createMappings = (
	compilerOptions: ts.CompilerOptions,
	logLevel: "warn" | "debug" | "none",
	pluginName: string,
): Mapping[] => {
	const countWildcard = (value: string) => value.match(/\*/g)?.length
	const valid = (value: string) => /(\*|\/\*|\/\*\/)/.test(value)

	const mappings: Mapping[] = []
	for (const pattern of Object.keys(compilerOptions.paths)) {
		if (countWildcard(pattern) > 1) {
			logLevel != "none" &&
				console.warn(
					formatLog("warn", pluginName, `path pattern '${pattern}' can have at most one '*' character.`),
				)
			continue
		}
		const wildcard = pattern.indexOf("*")
		if (wildcard !== -1 && !valid(pattern)) {
			logLevel != "none" && console.warn(formatLog("warn", pluginName, `path pattern '${pattern}' is not valid.`))
			continue
		}
		const targets = compilerOptions.paths[pattern].filter(target => {
			const wildcard = target.indexOf("*")
			if (wildcard !== -1 && !valid(target)) {
				logLevel != "none" &&
					console.warn(formatLog("warn", pluginName, `target pattern '${target}' is not valid`))
				return false
			}
			if (target.indexOf("@types") !== -1 || target.endsWith(".d.ts")) {
				logLevel != "none" && console.warn(formatLog("warn", pluginName, `type defined ${target} is ignored.`))
				return false
			}
			return true
		})
		if (targets.length == 0) {
			continue
		}
		if (pattern === "*") {
			mappings.push({ alias: { wildcard: true, pattern, prefix: "", suffix: "" }, targets })
			continue
		}
		mappings.push({
			alias: {
				wildcard: wildcard !== -1,
				pattern,
				prefix: pattern.substr(0, wildcard),
				suffix: pattern.substr(wildcard + 1),
			},
			targets,
		})
	}

	if (logLevel === "debug") {
		for (const mapping of mappings) {
			console.log(
				formatLog("info", pluginName, `pattern: '${mapping.alias.pattern}' targets: '${mapping.targets}'`),
			)
		}
	}
	return mappings
}

const findResolve = ({
	mappings,
	request,
	importer,
	compilerOptions,
}: {
	compilerOptions: ts.CompilerOptions
	mappings: Mapping[]
	request: string
	importer: string
}): [string, boolean] => {
	let longestMatchedPrefixLength = 0
	let matched: Mapping = undefined
	for (const mapping of mappings) {
		const { wildcard, prefix, suffix, pattern: source } = mapping.alias
		if (
			wildcard &&
			request.length >= prefix.length + suffix.length &&
			request.startsWith(prefix) &&
			request.endsWith(suffix)
		) {
			if (longestMatchedPrefixLength < prefix.length) {
				longestMatchedPrefixLength = prefix.length
				matched = mapping
			}
		} else if (request === source) {
			matched = mapping
			break
		}
	}

	if (!matched) {
		return ["", false]
	}

	const matchedWildcard = request.substr(matched.alias.prefix.length, request.length - matched.alias.suffix.length)

	for (const target of matched.targets) {
		let predicted = target
		if (matched.alias.wildcard) {
			predicted = target.replace("*", matchedWildcard)
		}
		const answer = path.resolve(compilerOptions.baseUrl, predicted)
		if (answer.indexOf("node_modules/") != -1) {
			return [answer, true]
		}
		// NOTE: resolve module path with typescript API
		const result = ts.resolveModuleName(answer, importer, compilerOptions, ts.sys)
		if (result?.resolvedModule) {
			return [result.resolvedModule.resolvedFileName, false]
		}
		// NOTE: For those are not modules, ex: css, fonts...etc.
		if (fs.existsSync(answer)) {
			return [answer, false]
		}
	}

	return ["", false]
}

export default tsPathsResolve
