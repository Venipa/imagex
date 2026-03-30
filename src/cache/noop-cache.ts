import type { BinaryCache, MetadataCache } from "../transformer/interfaces";

export class NoopMetadataCache implements MetadataCache {
	public async get(_key: string): Promise<string | null> {
		return null;
	}

	public async set(_key: string, _value: string, _ttlSeconds?: number): Promise<void> {}
}

export class NoopBinaryCache implements BinaryCache {
	public async get(_key: string): Promise<Uint8Array | null> {
		return null;
	}

	public async set(_key: string, _value: Uint8Array): Promise<void> {}
}
