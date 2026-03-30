import { mkdir } from "node:fs/promises";
import { BunRedisMetadataCache } from "./cache/bun-redis-cache";
import { BunS3BinaryCache } from "./cache/bun-s3-binary-cache";
import { BunFileBinaryCache } from "./cache/file-cache";
import { NoopMetadataCache } from "./cache/noop-cache";
import { BunS3DataSource } from "./datasource/bun-s3-datasource";
import { HttpDataSource } from "./datasource/http-datasource";
import { SourceRouter } from "./datasource/source-router";
import { getRuntimeEnvironment } from "./environment";
import jobs from "./jobs";
import { logger } from "./logger";
import { proxyRequest } from "./proxy-handler";
import { BunSharpTransformer } from "./transformer/bun-sharp-transformer";
import { TransformService } from "./transformer/service";

const runtimeEnvironment = getRuntimeEnvironment();
const defaultPort = 3000;
const portFromEnvironment = Number.parseInt(process?.env?.PORT ?? "", 10) || runtimeEnvironment.PORT || defaultPort;
const startServer = async (): Promise<void> => {
	await mkdir(runtimeEnvironment.IMAGE_CACHE_DIR, { recursive: true });
	await mkdir(runtimeEnvironment.IMAGE_TRANSFORM_DIR, { recursive: true });

	const metadataCache = runtimeEnvironment.REDIS_URL
		? new BunRedisMetadataCache(runtimeEnvironment.REDIS_URL)
		: new NoopMetadataCache();
	if (runtimeEnvironment.REDIS_URL) {
		await metadataCache.set("imagex", runtimeEnvironment.VERSION);
	}
	const sourceRouter = new SourceRouter({
		httpDataSource: new HttpDataSource(),
		s3DataSource:
			runtimeEnvironment.DATASOURCE_ENABLE_S3 &&
			runtimeEnvironment.S3_ENDPOINT &&
			runtimeEnvironment.S3_ACCESS_KEY_ID &&
			runtimeEnvironment.S3_SECRET_ACCESS_KEY &&
			runtimeEnvironment.S3_BUCKET
				? new BunS3DataSource({
						endpoint: runtimeEnvironment.S3_ENDPOINT,
						accessKeyId: runtimeEnvironment.S3_ACCESS_KEY_ID,
						secretAccessKey: runtimeEnvironment.S3_SECRET_ACCESS_KEY,
						bucket: runtimeEnvironment.S3_BUCKET,
						region: runtimeEnvironment.S3_REGION,
					})
				: undefined,
		allowS3: runtimeEnvironment.DATASOURCE_ENABLE_S3,
	});

	const transformService = new TransformService({
		transformer: new BunSharpTransformer(runtimeEnvironment.IMAGE_TRANSFORM_MAX_SCALE_MULTIPLIER),
		sourceRouter,
		metadataCache,
		sourceCache: new BunFileBinaryCache(runtimeEnvironment.IMAGE_CACHE_DIR),
		transformCache:
			runtimeEnvironment.DATASOURCE_ENABLE_S3 &&
			runtimeEnvironment.S3_ENDPOINT &&
			runtimeEnvironment.S3_ACCESS_KEY_ID &&
			runtimeEnvironment.S3_SECRET_ACCESS_KEY &&
			runtimeEnvironment.S3_BUCKET
				? new BunS3BinaryCache({
						endpoint: runtimeEnvironment.S3_ENDPOINT,
						accessKeyId: runtimeEnvironment.S3_ACCESS_KEY_ID,
						secretAccessKey: runtimeEnvironment.S3_SECRET_ACCESS_KEY,
						bucket: runtimeEnvironment.S3_BUCKET,
						region: runtimeEnvironment.S3_REGION,
						prefix: runtimeEnvironment.S3_TRANSFORM_CACHE_PREFIX,
					})
				: new BunFileBinaryCache(runtimeEnvironment.IMAGE_TRANSFORM_DIR),
		allowedHostnames: runtimeEnvironment.hostnameList,
	});
	for (const job of jobs) {
		await Bun.cron.remove(job.name).catch(() => {});
		for await (const cron of [job.cron].flat()) {
			if (cron === "@now") {
				await import(job.script)
					.then((module) => {
						return module.default?.();
					})
					.catch((error) => {
						logger.child(job.name).error(`Error running job: ${error}`);
					});
				continue;
			}
			await Bun.cron(job.script, cron, job.name).then(() => {
				logger.child(job.name).info(`Job scheduled at ${cron}`);
			});
		}
	}

	const server = Bun.serve({
		port: portFromEnvironment,
		fetch(request: Request): Promise<Response> {
			return proxyRequest(
				request,
				{
					ORIGIN_HOST: runtimeEnvironment.ORIGIN_HOST,
					ALLOWED_RESPONSE_CATEGORIES: runtimeEnvironment.ALLOWED_RESPONSE_CATEGORIES,
					DOMAIN_WHITELIST: runtimeEnvironment.DOMAIN_WHITELIST,
					DOMAIN_BLACKLIST: runtimeEnvironment.DOMAIN_BLACKLIST,
				},
				{ transformService },
			);
		},
	});

	logger.child("server").info(`ImageX listening on http://localhost:${portFromEnvironment}`);
	if (typeof process !== "undefined") {
		const shutdown = async (signal: string): Promise<void> => {
			logger.child("shutdown").info(`${signal} received, shutting down...`);
			await server.stop();
			process.exit(0);
		};
		process.on("SIGINT", (): Promise<void> => shutdown("SIGINT"));
		process.on("SIGTERM", (): Promise<void> => shutdown("SIGTERM"));
	}
};

void startServer();
