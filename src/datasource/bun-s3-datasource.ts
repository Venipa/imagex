import type { DataSource, LoadedSource, SourceReference } from "../transformer/interfaces";

interface BunS3DataSourceOptions {
	readonly endpoint: string;
	readonly accessKeyId: string;
	readonly secretAccessKey: string;
	readonly bucket: string;
	readonly region?: string;
}

interface BunS3LikeClient {
	file(key: string): {
		exists(): Promise<boolean>;
		bytes(): Promise<Uint8Array>;
		type: string;
	};
}

const createS3Client = (options: BunS3DataSourceOptions): BunS3LikeClient => {
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

export class BunS3DataSource implements DataSource {
	private readonly client: BunS3LikeClient;

	public constructor(options: BunS3DataSourceOptions) {
		this.client = createS3Client(options);
	}

	public async load(reference: SourceReference): Promise<LoadedSource> {
		const file = this.client.file(reference.key);
		if (!(await file.exists())) {
			throw new Error(`S3 source does not exist: ${reference.key}`);
		}
		const bytes = await file.bytes();
		return {
			bytes,
			mimeType: file.type || "application/octet-stream",
		};
	}
}
