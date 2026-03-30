import { BunS3BinaryCache } from "../cache/bun-s3-binary-cache";
import { getRuntimeEnvironment } from "../environment";
import { createLogger } from "../logger";

const logger = createLogger("cleanup-transform-cache");
export default async function cleanupTransformCache() {
  const runtimeEnvironment = getRuntimeEnvironment();
  if (!runtimeEnvironment.DATASOURCE_ENABLE_S3) return;
  const beforeDate = new Date(Date.now() - runtimeEnvironment.IMAGE_TRANSFORM_TTL_SECONDS * 1000);
  logger.info(`Cleaning up transform cache before ${beforeDate}`);
  const transformCache = new BunS3BinaryCache({
    endpoint: runtimeEnvironment.S3_ENDPOINT,
    accessKeyId: runtimeEnvironment.S3_ACCESS_KEY_ID,
    secretAccessKey: runtimeEnvironment.S3_SECRET_ACCESS_KEY,
    bucket: runtimeEnvironment.S3_BUCKET,
    region: runtimeEnvironment.S3_REGION,
    prefix: runtimeEnvironment.S3_TRANSFORM_CACHE_PREFIX,
  });
  const resultCount = await transformCache.cleanup(beforeDate);
  logger.info(`Cleaned up transform cache before ${beforeDate} with ${resultCount} results`);
}