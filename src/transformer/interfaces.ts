export type TransformOutputType = "jpg" | "jpeg" | "png" | "webp" | "avif" | "gif";

export type TransformFit = "cover" | "contain" | "fill" | "inside" | "outside";

export type TransformPosition =
	| "center"
	| "top"
	| "right top"
	| "right"
	| "right bottom"
	| "bottom"
	| "left bottom"
	| "left"
	| "left top"
	| "entropy"
	| "attention";

export interface TransformCrop {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface TransformModulate {
	readonly brightness?: number;
	readonly saturation?: number;
	readonly hue?: number;
	readonly lightness?: number;
}

export interface TransformOptions {
	readonly type: TransformOutputType;
	readonly width?: number;
	readonly height?: number;
	readonly quality?: number;
	readonly fit?: TransformFit;
	readonly position?: TransformPosition;
	readonly dpr?: number;
	readonly background?: string;
	readonly withoutEnlargement?: boolean;
	readonly crop?: TransformCrop;
	readonly rotate?: number;
	readonly flip?: boolean;
	readonly flop?: boolean;
	readonly blur?: number;
	readonly sharpen?: number;
	readonly grayscale?: boolean;
	readonly modulate?: TransformModulate;
	readonly stripMetadata?: boolean;
	readonly progressive?: boolean;
	readonly animated?: boolean;
	readonly page?: number;
	readonly pages?: number;
	readonly trim?: number | boolean;
	readonly timeoutMs?: number;
	readonly maxPixels?: number;
	readonly effort?: number;
	readonly lossless?: boolean;
	readonly nearLossless?: boolean;
	readonly alphaQuality?: number;
	readonly chromaSubsampling?: string;
	readonly compressionLevel?: number;
	readonly palette?: boolean;
	readonly interlace?: boolean;
}

export type DataSourceType = "http" | "s3";

export interface SourceReference {
	readonly original: string;
	readonly normalized: string;
	readonly type: DataSourceType;
	readonly key: string;
}

export interface LoadedSource {
	readonly bytes: Uint8Array;
	readonly mimeType: string;
	readonly etag?: string;
	readonly lastModified?: string;
}

export interface DataSource {
	load(reference: SourceReference, signal?: AbortSignal): Promise<LoadedSource>;
}

export interface TransformResult {
	readonly bytes: Uint8Array;
	readonly contentType: string;
}

export interface ImageTransformer {
	transform(inputBytes: Uint8Array, options: TransformOptions): Promise<TransformResult>;
}

export interface MetadataCache {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}

export interface BinaryCache {
	get(key: string): Promise<Uint8Array | null>;
	set(key: string, value: Uint8Array): Promise<void>;
}

export interface StreamBinaryCache extends BinaryCache {
	getStream(key: string): Promise<ReadableStream<Uint8Array> | null>;
	setStream(key: string, value: ReadableStream<Uint8Array>, contentType?: string): Promise<void>;
}
