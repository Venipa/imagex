import sharp from "sharp";
import type { ImageTransformer, TransformOptions, TransformResult } from "./interfaces";

const outputContentTypes: Record<TransformOptions["type"], string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	avif: "image/avif",
	gif: "image/gif",
};

const normalizeResize = (options: TransformOptions): { width?: number; height?: number } => {
	const dpr = options.dpr ?? 1;
	const width = options.width ? Math.round(options.width * dpr) : undefined;
	const height = options.height ? Math.round(options.height * dpr) : undefined;
	return { width, height };
};

const clampByScale = (requested: number | undefined, source: number | undefined, maxScaleMultiplier: number): number | undefined => {
	if (!requested || !source) {
		return requested;
	}
	const maxAllowed = Math.max(1, Math.round(source * maxScaleMultiplier));
	return Math.min(requested, maxAllowed);
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

export class BunSharpTransformer implements ImageTransformer {
	private readonly maxScaleMultiplier: number;

	public constructor(maxScaleMultiplier = 1) {
		this.maxScaleMultiplier = maxScaleMultiplier;
	}

	public async transform(inputBytes: Uint8Array, options: TransformOptions): Promise<TransformResult> {

		const metadataPipeline = sharp(inputBytes, {
			pages: options.pages,
			page: options.page,
			animated: options.animated,
			limitInputPixels: options.maxPixels,
		});
		const sourceMetadata = (await metadataPipeline.metadata()) as { width?: number; height?: number };

		let pipeline = sharp(inputBytes, {
			pages: options.pages,
			page: options.page,
			animated: options.animated,
			limitInputPixels: options.maxPixels,
		});

		if (options.rotate != null) {
			pipeline = pipeline.rotate(options.rotate);
		}
		if (options.flip) {
			pipeline = pipeline.flip();
		}
		if (options.flop) {
			pipeline = pipeline.flop();
		}
		if (options.crop) {
			pipeline = pipeline.extract({
				left: options.crop.x,
				top: options.crop.y,
				width: options.crop.width,
				height: options.crop.height,
			});
		}
		if (options.trim != null) {
			pipeline = typeof options.trim === "number" ? pipeline.trim({ threshold: options.trim }) : pipeline.trim();
		}

		const { width, height } = normalizeResize(options);
		const clampedWidth = clampByScale(width, sourceMetadata.width, this.maxScaleMultiplier);
		const clampedHeight = clampByScale(height, sourceMetadata.height, this.maxScaleMultiplier);
		const resolvedDimensions = resolveAspectRatioDimensions(
			clampedWidth,
			clampedHeight,
			sourceMetadata.width,
			sourceMetadata.height,
		);
		if (resolvedDimensions.width || resolvedDimensions.height) {
			pipeline = pipeline.resize({
				width: resolvedDimensions.width,
				height: resolvedDimensions.height,
				fit: options.fit,
				position: options.position,
				withoutEnlargement: options.withoutEnlargement,
				background: options.background,
			});
		}
		if (options.blur != null) {
			pipeline = pipeline.blur(options.blur);
		}
		if (options.sharpen != null) {
			pipeline = pipeline.sharpen(options.sharpen);
		}
		if (options.grayscale) {
			pipeline = pipeline.grayscale();
		}
		if (options.modulate) {
			pipeline = pipeline.modulate(options.modulate as unknown as Record<string, unknown>);
		}
		if (options.stripMetadata === false) {
			pipeline = pipeline.withMetadata();
		}

		switch (options.type) {
			case "jpg":
			case "jpeg":
				pipeline = pipeline.jpeg({
					quality: options.quality,
					progressive: options.progressive ?? options.interlace,
					chromaSubsampling: options.chromaSubsampling,
					mozjpeg: options.effort != null ? options.effort > 5 : undefined,
				});
				break;
			case "png":
				pipeline = pipeline.png({
					quality: options.quality,
					progressive: options.progressive ?? options.interlace,
					compressionLevel: options.compressionLevel,
					palette: options.palette,
				});
				break;
			case "webp":
				pipeline = pipeline.webp({
					quality: options.quality,
					effort: options.effort,
					lossless: options.lossless,
					nearLossless: options.nearLossless,
					alphaQuality: options.alphaQuality,
				});
				break;
			case "avif":
				pipeline = pipeline.avif({
					quality: options.quality,
					effort: options.effort,
					lossless: options.lossless,
					chromaSubsampling: options.chromaSubsampling,
				});
				break;
			case "gif":
				pipeline = pipeline.gif({
					effort: options.effort,
					interFrameMaxError: options.quality ? Math.max(0, 100 - options.quality) : undefined,
				});
				break;
		}

		const outputBuffer = options.timeoutMs
			? await Promise.race([
					pipeline.toBuffer(),
					new Promise<Buffer>((_resolve, reject): void => {
						setTimeout(() => reject(new Error("Transform timeout exceeded.")), options.timeoutMs);
					}),
				])
			: await pipeline.toBuffer();

		return {
			bytes: new Uint8Array(outputBuffer),
			contentType: outputContentTypes[options.type],
		};
	}
}
