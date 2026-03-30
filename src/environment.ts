import z from "zod";

const outputTypes = ["jpg", "jpeg", "png", "gif", "webp", "avif"] as const;

const splitCsv = (value: string | undefined, fallbackValue: readonly string[]): readonly string[] => {
	if (!value) {
		return fallbackValue;
	}
	return value
		.split(",")
		.map((entry: string) => entry.trim())
		.filter((entry: string) => entry.length > 0);
};

const envSchema = z.object({
	PORT: z.coerce.number().default(3000),
	HOSTNAMES: z.string().default("*"),
	ORIGIN_HOST: z.string().default("*"),
	ALLOWED_RESPONSE_CATEGORIES: z.string().default("json,xml,html,yml,text,image"),
	DOMAIN_WHITELIST: z.string().default(""),
	DOMAIN_BLACKLIST: z.string().default(""),

	IMAGE_CACHE_DIR: z.string().default(".imagex/cache"),
	IMAGE_TRANSFORM_DIR: z.string().default(".imagex/transform"),
	IMAGE_CACHE_TTL_SECONDS: z.coerce.number().default(3600),
	IMAGE_TRANSFORM_TTL_SECONDS: z.coerce.number().default(3600),

	IMAGE_TRANSFORM_DEFAULT_TYPE: z.enum(outputTypes).default("webp"),
	IMAGE_TRANSFORM_DEFAULT_QUALITY: z.coerce.number().min(1).max(100).default(85),
	IMAGE_TRANSFORM_MAX_SCALE_MULTIPLIER: z.coerce.number().positive().default(1),

	DATASOURCE_ENABLE_S3: z
		.coerce.boolean()
		.default(false),
	S3_ENDPOINT: z.string().default(""),
	S3_ACCESS_KEY_ID: z.string().default(""),
	S3_SECRET_ACCESS_KEY: z.string().default(""),
	S3_BUCKET: z.string().default(""),
	S3_REGION: z.string().default(""),
	S3_TRANSFORM_CACHE_PREFIX: z.string().default(".imagex/transform"),

	REDIS_URL: z.string().default("redis://localhost:6379"),
	VERSION: z.string().default("unknown"),
}).loose();

export interface RuntimeEnvironment extends z.infer<typeof envSchema> {
	readonly hostnameList: readonly string[];
}

export const getRuntimeEnvironment = (
	partial: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): RuntimeEnvironment => {
	const parsed = envSchema.parse(partial);
	return {
		...parsed,
		hostnameList: splitCsv(parsed.HOSTNAMES, ["*"]),
	} as RuntimeEnvironment;
};