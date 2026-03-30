import { createStorage } from "unstorage";
import redisDriver from "unstorage/drivers/redis";
import type { MetadataCache } from "../transformer/interfaces";

export class BunRedisMetadataCache implements MetadataCache {
	private readonly storage: ReturnType<typeof createStorage>;

	public constructor(redisUrl: string, ttlSeconds = 3600) {
		this.storage = createStorage({
			driver: redisDriver({
				url: redisUrl,
				base: "imagex:metadata",
				ttl: ttlSeconds,
				preConnect: false,
			}),
		});
	}

	public async get(key: string): Promise<string | null> {
		return this.storage.getItem<string>(key);
	}

	public async set(key: string, value: string, ttlSeconds = 3600): Promise<void> {
		await this.storage.setItem(key, value, {
			ttl: ttlSeconds,
		});
	}
}
