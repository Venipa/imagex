import type { ImageTransformer, TransformOptions, TransformResult } from "./interfaces";

const outputContentTypes: Record<TransformOptions["type"], string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	avif: "image/avif",
	gif: "image/gif",
};

type SharpWasmModule = {
	default: (
		input: Uint8Array,
		options?: Record<string, unknown>,
	) => {
		metadata?(): Promise<{ width?: number; height?: number }>;
		resize(options: Record<string, unknown>): unknown;
		rotate(value?: number): unknown;
		flip(): unknown;
		flop(): unknown;
		blur(value?: number): unknown;
		sharpen(value?: number): unknown;
		grayscale(): unknown;
		modulate(value: Record<string, unknown>): unknown;
		jpeg(value?: Record<string, unknown>): unknown;
		png(value?: Record<string, unknown>): unknown;
		webp(value?: Record<string, unknown>): unknown;
		avif(value?: Record<string, unknown>): unknown;
		gif(value?: Record<string, unknown>): unknown;
		toBuffer(): Promise<Uint8Array>;
	};
};

const resolveAspectRatioDimensions = (
	width: number | undefined,
	height: number | undefined,
	sourceWidth: number | undefined,
	sourceHeight: number | undefined,
): { width?: number; height?: number } => {
	if (!sourceWidth || !sourceHeight) {
		return { width, height };
	}
	if (width && !height) {
		return {
			width,
			height: Math.max(1, Math.round((width * sourceHeight) / sourceWidth)),
		};
	}
	if (height && !width) {
		return {
			width: Math.max(1, Math.round((height * sourceWidth) / sourceHeight)),
			height,
		};
	}
	return { width, height };
};

export class WorkerSharpWasmTransformer<T extends WebAssembly.Module> implements ImageTransformer {
	private readonly sharpWasm: T;
	private readonly maxScaleMultiplier: number;

	public constructor(sharpWasm: T, maxScaleMultiplier = 1) {
		this.sharpWasm = sharpWasm;
		this.maxScaleMultiplier = maxScaleMultiplier;
	}

	public async transform(inputBytes: Uint8Array, options: TransformOptions): Promise<TransformResult> {
		const sharp = await WebAssembly.instantiate(this.sharpWasm)
			.then((m) => m as unknown as SharpWasmModule)
			.then((m) => m.default);
		// Experimental mode: applies best-effort options supported by WASM build.
		const width = options.width && options.dpr ? Math.round(options.width * options.dpr) : options.width;
		const height = options.height && options.dpr ? Math.round(options.height * options.dpr) : options.height;
		let pipeline = sharp(inputBytes, {
			animated: options.animated,
			pages: options.pages,
			page: options.page,
			limitInputPixels: options.maxPixels,
		});
		const metadata = pipeline.metadata ? await pipeline.metadata() : {};
		const maxWidth = metadata.width ? Math.max(1, Math.round(metadata.width * this.maxScaleMultiplier)) : undefined;
		const maxHeight = metadata.height ? Math.max(1, Math.round(metadata.height * this.maxScaleMultiplier)) : undefined;
		const clampedWidth = maxWidth && width ? Math.min(width, maxWidth) : width;
		const clampedHeight = maxHeight && height ? Math.min(height, maxHeight) : height;
		const resolvedDimensions = resolveAspectRatioDimensions(clampedWidth, clampedHeight, metadata.width, metadata.height);

		if (resolvedDimensions.width || resolvedDimensions.height) {
			pipeline = pipeline.resize({
				width: resolvedDimensions.width,
				height: resolvedDimensions.height,
				fit: options.fit,
				position: options.position,
				withoutEnlargement: options.withoutEnlargement,
				background: options.background,
			}) as typeof pipeline;
		}
		if (options.rotate != null) {
			pipeline = pipeline.rotate(options.rotate) as typeof pipeline;
		}
		if (options.flip) {
			pipeline = pipeline.flip() as typeof pipeline;
		}
		if (options.flop) {
			pipeline = pipeline.flop() as typeof pipeline;
		}
		if (options.blur != null) {
			pipeline = pipeline.blur(options.blur) as typeof pipeline;
		}
		if (options.sharpen != null) {
			pipeline = pipeline.sharpen(options.sharpen) as typeof pipeline;
		}
		if (options.grayscale) {
			pipeline = pipeline.grayscale() as typeof pipeline;
		}
		if (options.modulate) {
			pipeline = pipeline.modulate(options.modulate as unknown as Record<string, unknown>) as typeof pipeline;
		}

		switch (options.type) {
			case "jpg":
			case "jpeg":
				pipeline = pipeline.jpeg({ quality: options.quality }) as typeof pipeline;
				break;
			case "png":
				pipeline = pipeline.png({ quality: options.quality }) as typeof pipeline;
				break;
			case "webp":
				pipeline = pipeline.webp({ quality: options.quality, effort: options.effort }) as typeof pipeline;
				break;
			case "avif":
				pipeline = pipeline.avif({ quality: options.quality, effort: options.effort }) as typeof pipeline;
				break;
			case "gif":
				pipeline = pipeline.gif({ effort: options.effort }) as typeof pipeline;
				break;
		}

		const outputBuffer = options.timeoutMs
			? await Promise.race([
					pipeline.toBuffer(),
					new Promise<Uint8Array>((_resolve, reject): void => {
						setTimeout(() => reject(new Error("Transform timeout exceeded.")), options.timeoutMs);
					}),
				])
			: await pipeline.toBuffer();

		return {
			bytes: outputBuffer,
			contentType: outputContentTypes[options.type],
		};
	}
}
