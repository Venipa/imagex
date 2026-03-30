import { createLogger } from "../logger";
import type { SourceRouter } from "../datasource/source-router";
import type { BinaryCache, ImageTransformer, MetadataCache, StreamBinaryCache } from "./interfaces";
import { parseTransformRequest } from "./request-schema";

interface TransformServiceConfig {
	readonly transformer: ImageTransformer;
	readonly sourceRouter: SourceRouter;
	readonly metadataCache: MetadataCache;
	readonly sourceCache: BinaryCache;
	readonly transformCache: BinaryCache;
	readonly allowedHostnames: readonly string[];
}

interface TransformedResponse {
	readonly response: Response;
	readonly sourceUrl: URL | null;
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
interface JsonObject {
	readonly [key: string]: JsonValue;
}

const logger = createLogger("TransformService");

const getCacheKey = (value: string): string => {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = (hash * 16777619) >>> 0;
	}
	return `k${hash.toString(16)}`;
};

const isObject = (value: unknown): value is Record<string, unknown> => {
	return typeof value === "object" && value !== null && !Array.isArray(value);
};

const toStableJsonValue = (value: unknown): JsonValue | undefined => {
	if (value === undefined) {
		return undefined;
	}
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}
	if (Array.isArray(value)) {
		const normalizedArray = value
			.map((entry: unknown) => toStableJsonValue(entry))
			.filter((entry: JsonValue | undefined): entry is JsonValue => entry !== undefined);
		return normalizedArray;
	}
	if (!isObject(value)) {
		return String(value);
	}
	const sortedKeys = Object.keys(value).sort((leftKey: string, rightKey: string) => leftKey.localeCompare(rightKey));
	const normalizedObject: Record<string, JsonValue> = {};
	for (const key of sortedKeys) {
		const nestedValue = toStableJsonValue(value[key]);
		if (nestedValue === undefined) {
			continue;
		}
		normalizedObject[key] = nestedValue;
	}
	return normalizedObject;
};

const buildTransformSignature = (options: unknown): string => {
	return JSON.stringify(toStableJsonValue(options) ?? {});
};

const normalizeAllowedHostnames = (value: readonly string[]): readonly string[] => {
	return value.map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length > 0);
};

const isHostnameAllowed = (allowedHostnames: readonly string[], hostname: string): boolean => {
	if (allowedHostnames.includes("*")) {
		return true;
	}
	return allowedHostnames.includes(hostname.toLowerCase());
};

const isStreamBinaryCache = (cache: BinaryCache): cache is StreamBinaryCache => {
	const candidate = cache as Partial<StreamBinaryCache>;
	return typeof candidate.getStream === "function" && typeof candidate.setStream === "function";
};

export class TransformService {
	private readonly transformer: ImageTransformer;
	private readonly sourceRouter: SourceRouter;
	private readonly metadataCache: MetadataCache;
	private readonly sourceCache: BinaryCache;
	private readonly transformCache: BinaryCache;
	private readonly allowedHostnames: readonly string[];

	public constructor(config: TransformServiceConfig) {
		this.transformer = config.transformer;
		this.sourceRouter = config.sourceRouter;
		this.metadataCache = config.metadataCache;
		this.sourceCache = config.sourceCache;
		this.transformCache = config.transformCache;
		this.allowedHostnames = normalizeAllowedHostnames(config.allowedHostnames);
	}

	public async transformRequest(request: Request): Promise<TransformedResponse> {
		const parsed = parseTransformRequest(request);
		const sourceUrl = parsed.source.type === "http" ? new URL(parsed.source.normalized) : null;
		if (sourceUrl && !isHostnameAllowed(this.allowedHostnames, sourceUrl.hostname)) {
			throw new Error(`Hostname "${sourceUrl.hostname}" is not allowed for transform.`);
		}

		const optionsWithDefault = {
			...parsed.options,
			type: parsed.options.type ?? "webp",
		};
		const transformSignature = buildTransformSignature(optionsWithDefault);
		const sourceCacheKey = getCacheKey(`source:${parsed.source.key}`);
		const transformCacheKey = getCacheKey(`transform:${parsed.source.key}:${transformSignature}`);
		const streamTransformCache = isStreamBinaryCache(this.transformCache) ? this.transformCache : null;

		if (streamTransformCache) {
			try {
				const cachedStream = await streamTransformCache.getStream(transformCacheKey);
				if (cachedStream) {
					return {
						sourceUrl,
						response: new Response(cachedStream, {
							headers: {
								"content-type": this.getContentType(optionsWithDefault.type),
								"x-imagex-cache": "transform-hit",
							},
						}),
					};
				}
			} catch (error: unknown) {
				logger.warn("S3 stream cache read failed, continuing with transform", {
					error: error instanceof Error ? error.message : String(error),
					transformCacheKey,
				});
			}
		}

		if (!streamTransformCache) {
			try {
				const cachedTransform = await this.transformCache.get(transformCacheKey);
				if (cachedTransform) {
					return {
						sourceUrl,
						response: new Response(cachedTransform.buffer, {
							headers: {
								"content-type": this.getContentType(optionsWithDefault.type),
								"x-imagex-cache": "transform-hit",
							},
						}),
					};
				}
			} catch (error: unknown) {
				logger.warn("Transform cache read failed, continuing with transform", {
					error: error instanceof Error ? error.message : String(error),
					transformCacheKey,
				});
			}
		}

		const sourceBytesFromCache = await this.sourceCache.get(sourceCacheKey);
		const sourceLoaded =
			sourceBytesFromCache ??
			(
				await this.sourceRouter.loadSource(parsed.source, request.signal)
			).bytes;

		if (!sourceBytesFromCache) {
			await this.sourceCache.set(sourceCacheKey, sourceLoaded);
		}

		const transformed = await this.transformer.transform(sourceLoaded, optionsWithDefault);
		if (streamTransformCache) {
			const outputStream = new Response(transformed.bytes.buffer).body;
			if (outputStream) {
				const [userStream, s3Stream] = outputStream.tee();
				void streamTransformCache.setStream(transformCacheKey, s3Stream, transformed.contentType).catch((error: unknown) => {
					logger.warn("S3 stream cache write failed", {
						error: error instanceof Error ? error.message : String(error),
						transformCacheKey,
					});
				});
				await this.metadataCache.set(
					`meta:${transformCacheKey}`,
					JSON.stringify({
						source: parsed.source.normalized,
						transformSignature,
						type: optionsWithDefault.type,
						contentType: transformed.contentType,
						updatedAt: new Date().toISOString(),
					}),
				);
				return {
					sourceUrl,
					response: new Response(userStream, {
						headers: {
							"content-type": transformed.contentType,
							"x-imagex-cache": "miss",
						},
					}),
				};
			}
		}

		await this.transformCache.set(transformCacheKey, transformed.bytes);
		await this.metadataCache.set(
			`meta:${transformCacheKey}`,
			JSON.stringify({
				source: parsed.source.normalized,
				transformSignature,
				type: optionsWithDefault.type,
				contentType: transformed.contentType,
				updatedAt: new Date().toISOString(),
			}),
		);

		return {
			sourceUrl,
			response: new Response(transformed.bytes.buffer, {
				headers: {
					"content-type": transformed.contentType,
					"x-imagex-cache": "miss",
				},
			}),
		};
	}

	private getContentType(type: string): string {
		switch (type) {
			case "jpg":
			case "jpeg":
				return "image/jpeg";
			case "png":
				return "image/png";
			case "webp":
				return "image/webp";
			case "avif":
				return "image/avif";
			case "gif":
				return "image/gif";
			default:
				return "application/octet-stream";
		}
	}
}
