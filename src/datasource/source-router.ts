import type { DataSource, LoadedSource, SourceReference } from "../transformer/interfaces";

export class SourceRouter {
	private readonly httpDataSource: DataSource;
	private readonly s3DataSource?: DataSource;
	private readonly allowS3: boolean;

	public constructor(config: {
		httpDataSource: DataSource;
		s3DataSource?: DataSource;
		allowS3: boolean;
	}) {
		this.httpDataSource = config.httpDataSource;
		this.s3DataSource = config.s3DataSource;
		this.allowS3 = config.allowS3;
	}

	public async loadSource(reference: SourceReference, signal?: AbortSignal): Promise<LoadedSource> {
		switch (reference.type) {
			case "http":
				return this.httpDataSource.load(reference, signal);
			case "s3":
				if (!this.allowS3 || !this.s3DataSource) {
					throw new Error("S3 datasource is not enabled in this runtime.");
				}
				return this.s3DataSource.load(reference, signal);
		}
	}
}
