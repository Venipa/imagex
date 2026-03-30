import type { S3Client } from "bun";
import { logger } from "../logger";
import type { StreamBinaryCache } from "../transformer/interfaces";

interface BunS3BinaryCacheOptions {
	readonly endpoint: string;
	readonly accessKeyId: string;
	readonly secretAccessKey: string;
	readonly bucket: string;
	readonly prefix?: string;
	readonly region?: string;
}

interface BunS3LikeClient extends S3Client {}

const createS3Client = (options: BunS3BinaryCacheOptions): BunS3LikeClient => {
	const bunGlobal = globalThis as typeof globalThis & {
		Bun?: {
			S3Client: new (value: {
				accessKeyId: string;
				secretAccessKey: string;
				bucket: string;
				endpoint: string;
				region?: string;
			}) => BunS3LikeClient;
		};
	};
	const S3Client = bunGlobal.Bun?.S3Client;
	if (!S3Client) {
		throw new Error("Bun S3Client is not available in this runtime.");
	}
	return new S3Client({
		accessKeyId: options.accessKeyId,
		secretAccessKey: options.secretAccessKey,
		bucket: options.bucket,
		endpoint: options.endpoint,
		region: options.region,
	});
};

export class BunS3BinaryCache implements StreamBinaryCache {
	private readonly client: BunS3LikeClient;
	private readonly prefix: string;

	public constructor(options: BunS3BinaryCacheOptions) {
		this.client = createS3Client(options);
		this.prefix = options.prefix?.replace(/\/+$/, "") ?? ".imagex/transform";
	}

	private resolveObjectKey(key: string): string {
		return `${this.prefix}/${key}.bin`;
	}

	public async get(key: string): Promise<Uint8Array | null> {
		const file = this.client.file(this.resolveObjectKey(key));
		if (!(await file.exists())) {
			return null;
		}
		return file.bytes();
	}

	public async set(key: string, value: Uint8Array): Promise<void> {
		const file = this.client.file(this.resolveObjectKey(key), { acl: "private" });
		await file.write(value);
	}

	public async getStream(key: string): Promise<ReadableStream<Uint8Array> | null> {
		const file = this.client.file(this.resolveObjectKey(key));
		if (!(await file.exists())) {
			return null;
		}
		return file.stream();
	}

	public async setStream(key: string, value: ReadableStream<Uint8Array>, _contentType?: string): Promise<void> {
		const file = this.client.file(this.resolveObjectKey(key), { acl: "private" });
		await file.write(new Response(value));
	}
	public async list(): Promise<{ key: string; lastModified: string | null; size: number }[]> {
		const files = await this.client.list({ prefix: this.prefix });
		return (
			files.contents?.map((file) => ({
				key: file.key,
				lastModified: file.lastModified ?? null,
				size: file.size ?? 0,
			})) ?? []
		);
	}
	public async cleanup(beforeDate: Date): Promise<number> {
		const files = await this.list();
    let resultCount = 0;
		for (const file of files.filter((file) => file.lastModified && new Date(file.lastModified) < beforeDate)) {
			await this.delete(file.key).then(() => {
        resultCount++;
      }).catch(() => {});
		}
    return resultCount;
	}
	public async delete(...keys: string[]): Promise<void> {
		for (const key of keys) {
			try {
				await this.client.delete(key);
			} catch (error) {
				logger.error(`Failed to delete cache entry ${key}: ${error}`);
        throw error;
			}
		}
	}
  public async size(key: string): Promise<number> {
    return await this.client.size(this.resolveObjectKey(key));
  }
}
