import z from "zod";
import { createLogger } from "./logger";
import type { TransformService } from "./transformer/service";

const HOP_BY_HOP_HEADERS: ReadonlySet<string> = new Set<string>([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"host",
	"content-length",
]);

type ResponseCategory = "json" | "xml" | "html" | "yml" | "text" | "image" | "video" | "audio";
type DomainRuleKind = "exact" | "wildcard" | "regex";

const RESPONSE_CATEGORIES: readonly ResponseCategory[] = [
	"json",
	"xml",
	"html",
	"yml",
	"text",
	"image",
	"video",
	"audio",
] as const;

const DEFAULT_ALLOWED_RESPONSE_CATEGORIES: readonly ResponseCategory[] = [
	"json",
	"xml",
	"html",
	"yml",
	"text",
] as const;
const TRANSFORM_PARAM_KEYS: ReadonlySet<string> = new Set<string>([
	"type",
	"size",
	"width",
	"height",
	"w",
	"h",
	"quality",
	"fit",
	"position",
	"dpr",
	"background",
	"withoutEnlargement",
	"cropX",
	"cropY",
	"cropWidth",
	"cropHeight",
	"rotate",
	"flip",
	"flop",
	"blur",
	"sharpen",
	"grayscale",
	"modulateBrightness",
	"modulateSaturation",
	"modulateHue",
	"modulateLightness",
	"stripMetadata",
	"progressive",
	"animated",
	"page",
	"pages",
	"trim",
	"timeoutMs",
	"maxPixels",
	"effort",
	"lossless",
	"nearLossless",
	"alphaQuality",
	"chromaSubsampling",
	"compressionLevel",
	"palette",
	"interlace",
]);

const setParser = <T extends string>(value: string | null | undefined): Set<T> => {
	const parts = value?.split(",") ?? DEFAULT_ALLOWED_RESPONSE_CATEGORIES;
	return new Set(
		parts.map((part: string) => part.trim().toLowerCase()).filter((part: string) => part.length > 0),
	) as Set<T>;
};

const envSchema = z.object({
	ORIGIN_HOST: z.string().default("*"),
	ALLOWED_RESPONSE_CATEGORIES: z
		.string()
		.nullish()
		.pipe(z.preprocess(setParser, z.set(z.enum(RESPONSE_CATEGORIES))))
		.refine((valueSet) => valueSet.size > 0, { message: "ALLOWED_RESPONSE_CATEGORIES must be a non-empty set" }),
	DOMAIN_WHITELIST: z.string().nullish(),
	DOMAIN_BLACKLIST: z.string().nullish(),
});

const targetSchema = z
	.object({
		url: z.url().transform((value: string) => new URL(value)),
	})
	.loose();

type ParsedTarget = z.infer<typeof targetSchema>;

export interface ProxyEnvironment {
	readonly ORIGIN_HOST?: string;
	readonly ALLOWED_RESPONSE_CATEGORIES?: string;
	readonly DOMAIN_WHITELIST?: string;
	readonly DOMAIN_BLACKLIST?: string;
}

export interface ProxyDependencies {
	readonly transformService?: TransformService;
}

interface ProxyConfig {
	readonly originHost: string;
	readonly allowedResponseCategories: Set<ResponseCategory>;
	readonly domainWhitelist: readonly DomainRule[];
	readonly domainBlacklist: readonly DomainRule[];
}

interface DomainRule {
	readonly kind: DomainRuleKind;
	readonly source: string;
	readonly matcher: RegExp;
}

interface ProxyTarget {
	readonly sourceUrl: URL;
	readonly targetUrl: URL;
}

const getRuntimeEnvironment = (): Record<string, string | undefined> => {
	if (typeof process !== "undefined" && process.env) {
		return process.env as Record<string, string | undefined>;
	}
	return {};
};

const splitEnvArray = (value: string): readonly string[] => {
	return value
		.split(",")
		.map((entry: string) => entry.trim())
		.filter((entry: string) => entry.length > 0);
};

const escapeRegExp = (value: string): string => {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const parseRegexRule = (value: string): RegExp => {
	const lastSlashIndex = value.lastIndexOf("/");
	if (!value.startsWith("/") || lastSlashIndex <= 0) {
		throw new Error('Invalid regex domain rule. Expected format "/pattern/flags".');
	}
	return new RegExp(value.slice(1, lastSlashIndex), value.slice(lastSlashIndex + 1));
};

const createDomainRule = (rawRule: string): DomainRule => {
	const source = rawRule.trim();
	if (source.length === 0) {
		throw new Error("Domain rule cannot be empty.");
	}
	if (source.startsWith("/")) {
		return { kind: "regex", source, matcher: parseRegexRule(source) };
	}
	const normalizedSource = source.toLowerCase();
	if (normalizedSource.includes("*")) {
		return {
			kind: "wildcard",
			source,
			matcher: new RegExp(`^${escapeRegExp(normalizedSource).replace(/\\\*/g, ".*")}$`, "i"),
		};
	}
	return { kind: "exact", source, matcher: new RegExp(`^${escapeRegExp(normalizedSource)}$`, "i") };
};

const parseDomainRules = (value: string | null | undefined): readonly DomainRule[] => {
	if (!value) {
		return [];
	}
	return splitEnvArray(value).map((rule: string) => createDomainRule(rule));
};

const resolveConfig = (environment: ProxyEnvironment): ProxyConfig => {
	const parsedEnvironment = envSchema.parse({ ...getRuntimeEnvironment(), ...environment });
	return {
		originHost: parsedEnvironment.ORIGIN_HOST,
		allowedResponseCategories: parsedEnvironment.ALLOWED_RESPONSE_CATEGORIES,
		domainWhitelist: parseDomainRules(parsedEnvironment.DOMAIN_WHITELIST),
		domainBlacklist: parseDomainRules(parsedEnvironment.DOMAIN_BLACKLIST),
	};
};

const getErrorMessage = (error: unknown): string => {
	return error instanceof Error && error.message ? error.message : "Unknown error";
};

const getRequestOrigin = (request: Request, originHost: string): string => {
	const origin = request.headers.get("origin");
	try {
		if (!origin) {
			return new URL(request.url).origin ?? originHost;
		}
		return origin.startsWith("http") ? origin : `https://${origin}`;
	} catch {
		return originHost;
	}
};

const createCorsHeaders = (request: Request, originHost: string): Headers => {
	const headers = new Headers();
	const requestOrigin = getRequestOrigin(request, originHost);
	headers.set(
		"access-control-allow-origin",
		originHost === "*" && !requestOrigin ? "*" : (requestOrigin ?? originHost),
	);
	headers.set("access-control-allow-methods", "*");
	headers.set("access-control-allow-headers", "*");
	headers.set("access-control-max-age", "86400");
	return headers;
};

const createErrorResponse = (request: Request, status: number, message: string, originHost: string): Response => {
	const headers = createCorsHeaders(request, originHost);
	headers.set("content-type", "text/plain; charset=utf-8");
	headers.set("x-content-type-options", "nosniff");
	return new Response(message, { status, headers });
};

const parseTarget = (request: Request): ProxyTarget => {
	const sourceUrl = new URL(request.url);
	const { url: targetUrl, ...searchParams }: ParsedTarget = targetSchema.parse(
		Object.fromEntries(sourceUrl.searchParams.entries()),
	);
	Object.entries(searchParams).forEach(([key, value]): void => {
		targetUrl.searchParams.append(key, String(value));
	});
	return { sourceUrl, targetUrl };
};

const buildUpstreamHeaders = (request: Request): Headers => {
	const headers = new Headers();
	request.headers.forEach((value: string, key: string): void => {
		if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
			headers.set(key, value);
		}
	});
	return headers;
};

const parseMimeType = (contentTypeHeader: string | null): string => {
	return (contentTypeHeader?.split(";")[0] ?? "").trim().toLowerCase();
};

const resolveResponseCategory = (mimeType: string): ResponseCategory | null => {
	if (!mimeType) return null;
	if (mimeType.startsWith("video/")) return "video";
	if (mimeType.startsWith("audio/")) return "audio";
	if (mimeType.startsWith("image/")) return "image";
	if (mimeType === "text/html" || mimeType === "application/xhtml+xml") return "html";
	if (mimeType === "application/json" || mimeType === "text/json" || mimeType.endsWith("+json")) return "json";
	if (mimeType === "application/xml" || mimeType === "text/xml" || mimeType.endsWith("+xml")) return "xml";
	if (
		mimeType === "text/yaml" ||
		mimeType === "text/x-yaml" ||
		mimeType === "application/yaml" ||
		mimeType === "application/x-yaml"
	) {
		return "yml";
	}
	if (mimeType.startsWith("text/")) return "text";
	return null;
};

const copyProxyHeaders = (upstreamResponse: Response, responseHeaders: Headers): void => {
	upstreamResponse.headers.forEach((value: string, key: string): void => {
		if (!key.toLowerCase().startsWith("access-control-")) {
			responseHeaders.set(key, value);
		}
	});
};

const buildCorsResponse = async (
	upstreamResponse: Response,
	request: Request,
	originHost: string,
	allowedResponseCategories: ReadonlySet<ResponseCategory>,
): Promise<Response> => {
	const isNoBodyResponse = request.method === "HEAD" || [101, 103, 204, 205].includes(upstreamResponse.status);
	if (isNoBodyResponse) {
		const responseHeaders = new Headers();
		copyProxyHeaders(upstreamResponse, responseHeaders);
		const corsHeaders = createCorsHeaders(request, originHost);
		corsHeaders.forEach((value: string, key: string): void => {
			responseHeaders.set(key, value);
		});
		return new Response(null, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: responseHeaders,
		});
	}

	const mimeType = parseMimeType(upstreamResponse.headers.get("content-type"));
	const responseCategory = resolveResponseCategory(mimeType);
	if (!responseCategory) {
		return createErrorResponse(request, 415, `Blocked upstream content-type: ${mimeType || "unknown"}`, originHost);
	}
	if (!allowedResponseCategories.has(responseCategory)) {
		return createErrorResponse(request, 415, `Response type "${responseCategory}" is not allowed`, originHost);
	}
	const responseHeaders = new Headers();
	copyProxyHeaders(upstreamResponse, responseHeaders);
	let responseBody: ReadableStream<Uint8Array> | string | null = upstreamResponse.body;
	if (!["image", "video", "audio"].includes(responseCategory)) {
		responseBody = await upstreamResponse.text();
		responseHeaders.set("content-type", "text/plain; charset=utf-8");
		responseHeaders.delete("content-length");
		responseHeaders.delete("content-encoding");
		responseHeaders.delete("accept-ranges");
		responseHeaders.delete("content-range");
		responseHeaders.set("x-content-type-options", "nosniff");
	}
	const corsHeaders = createCorsHeaders(request, originHost);
	corsHeaders.forEach((value: string, key: string): void => {
		responseHeaders.set(key, value);
	});
	return new Response(responseBody, {
		status: upstreamResponse.status,
		statusText: upstreamResponse.statusText,
		headers: responseHeaders,
	});
};

const isDomainMatched = (domain: string, rules: readonly DomainRule[]): boolean => {
	return rules.some((rule: DomainRule): boolean => rule.matcher.test(domain));
};

const validateDomainPolicy = (
	targetUrl: URL,
	domainWhitelist: readonly DomainRule[],
	domainBlacklist: readonly DomainRule[],
): string | null => {
	const targetDomain = targetUrl.hostname.toLowerCase();
	if (isDomainMatched(targetDomain, domainBlacklist)) {
		return `Target domain "${targetDomain}" is blocked by DOMAIN_BLACKLIST`;
	}
	if (domainWhitelist.length > 0 && !isDomainMatched(targetDomain, domainWhitelist)) {
		return `Target domain "${targetDomain}" is not allowed by DOMAIN_WHITELIST`;
	}
	return null;
};

const shouldUseTransformPath = (request: Request): boolean => {
	const requestUrl = new URL(request.url);
	if (request.method !== "GET") {
		return false;
	}
	if (!requestUrl.searchParams.has("url")) {
		return false;
	}
	if (requestUrl.searchParams.size <= 1 && !requestUrl.searchParams.has("type")) requestUrl.searchParams.set("type", "webp");
	const keys = Array.from(  requestUrl.searchParams.keys());

	return keys.findIndex((key: string) => key !== "url" && TRANSFORM_PARAM_KEYS.has(key)) !== -1;
};

const logger = createLogger("ProxyHandler");

export const proxyRequest = async (
	request: Request,
	environment: ProxyEnvironment = {},
	dependencies: ProxyDependencies = {},
): Promise<Response> => {
	let originHostForError = "*";
	try {
		const { originHost, allowedResponseCategories, domainWhitelist, domainBlacklist } = resolveConfig(environment);
		originHostForError = originHost;
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: createCorsHeaders(request, originHost) });
		}

		if (dependencies.transformService && shouldUseTransformPath(request)) {
			logger.debug("Transforming request", { request: request.url });
			const transformed = await dependencies.transformService.transformRequest(request);
			logger.debug("Transformed response", { response: transformed.response.headers });
			if (transformed.sourceUrl) {
				const domainPolicyError = validateDomainPolicy(transformed.sourceUrl, domainWhitelist, domainBlacklist);
				if (domainPolicyError) {
					return createErrorResponse(request, 403, domainPolicyError, originHost);
				}
			}
			const headers = new Headers(transformed.response.headers);
			const corsHeaders = createCorsHeaders(request, originHost);
			corsHeaders.forEach((value: string, key: string): void => {
				headers.set(key, value);
			});
			return new Response(transformed.response.body, {
				status: transformed.response.status,
				statusText: transformed.response.statusText,
				headers,
			});
		}

		const { targetUrl } = parseTarget(request);
		const domainPolicyError = validateDomainPolicy(targetUrl, domainWhitelist, domainBlacklist);
		if (domainPolicyError) {
			return createErrorResponse(request, 403, domainPolicyError, originHost);
		}

		let upstreamResponse: Response;
		try {
			upstreamResponse = await fetch(targetUrl, {
				method: request.method,
				headers: buildUpstreamHeaders(request),
				body: !["GET", "HEAD"].includes(request.method) ? request.body : undefined,
				redirect: "follow",
				signal: request.signal,
			});
		} catch (error: unknown) {
			return createErrorResponse(request, 502, `Upstream request failed: ${getErrorMessage(error)}`, originHost);
		}
		return await buildCorsResponse(upstreamResponse, request, originHost, allowedResponseCategories);
	} catch (error: unknown) {
		if (error instanceof z.ZodError) {
			return createErrorResponse(
				request,
				400,
				`Invalid request: ${error.issues.map((issue: z.ZodIssue) => `${issue.path.join(".")}: ${issue.message}`).join("\n")}`,
				originHostForError,
			);
		}
		if (error instanceof Error) {
      logger.error("Invalid proxy configuration", { error });
			return createErrorResponse(request, 400, `Invalid proxy configuration: ${error.message}`, originHostForError);
		}
		return createErrorResponse(request, 500, `Proxy internal error: ${String(error)}`, originHostForError);
	}
};
