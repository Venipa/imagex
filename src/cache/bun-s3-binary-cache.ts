import type { StreamBinaryCache } from "../transformer/interfaces";

interface BunS3BinaryCacheOptions {
	readonly endpoint: string;
	readonly accessKeyId: string;
	readonly secretAccessKey: string;
	readonly bucket: string;
	readonly prefix?: string;
	readonly region?: string;
}

interface BunS3LikeFile {
	exists(): Promise<boolean>;
	bytes(): Promise<Uint8Array>;
	stream(): ReadableStream<Uint8Array>;
	write(data: unknown, options?: unknown): Promise<number>;
}

interface BunS3LikeClient {
	file(key: string): BunS3LikeFile;
}

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
		const file = this.client.file(this.resolveObjectKey(key));
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
		const file = this.client.file(this.resolveObjectKey(key));
		await file.write(new Response(value));
	}
}
