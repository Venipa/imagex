import type { KVNamespace } from "@cloudflare/workers-types";
import { createStorage } from "unstorage";
import cloudflareKvBindingDriver from "unstorage/drivers/cloudflare-kv-binding";
import type { MetadataCache } from "../transformer/interfaces";

export class WorkerKvMetadataCache implements MetadataCache {
	private readonly storage: ReturnType<typeof createStorage>;

	public constructor(kv: KVNamespace) {
		this.storage = createStorage({
			driver: cloudflareKvBindingDriver({
				binding: kv,
				base: "imagex:metadata",
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
