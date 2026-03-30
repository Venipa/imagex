import z from "zod";
import type {
    SourceReference,
    TransformCrop,
    TransformFit,
    TransformModulate,
    TransformOptions,
    TransformOutputType,
    TransformPosition,
} from "./interfaces";

const fitValues: readonly TransformFit[] = ["cover", "contain", "fill", "inside", "outside"];
const positionValues: readonly TransformPosition[] = [
	"center",
	"top",
	"right top",
	"right",
	"right bottom",
	"bottom",
	"left bottom",
	"left",
	"left top",
	"entropy",
	"attention",
];
const outputTypes: readonly TransformOutputType[] = ["jpg", "jpeg", "png", "webp", "avif", "gif"];

const toBoolean = (value: string | null | undefined): boolean | undefined => {
	if (value == null) {
		return undefined;
	}
	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) {
		return true;
	}
	if (["0", "false", "no", "off"].includes(normalized)) {
		return false;
	}
	return undefined;
};

const toNumber = (value: string | null | undefined): number | undefined => {
	if (value == null || value.trim() === "") {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const parseSize = (value: string | null | undefined): { width?: number; height?: number } => {
	if (!value) {
		return {};
	}
	const [widthRaw, heightRaw] = value.toLowerCase().split("x");
	return {
		width: toNumber(widthRaw),
		height: toNumber(heightRaw),
	};
};

const resolveSourceFromRequest = (requestUrl: URL): string | null => {
	const sourceFromQuery = requestUrl.searchParams.get("url");
	return sourceFromQuery && sourceFromQuery.length > 0 ? sourceFromQuery : null;
};

const normalizeSource = (source: string): SourceReference => {
	if (source.startsWith("http://") || source.startsWith("https://")) {
		const parsed = new URL(source);
		return {
			original: source,
			normalized: parsed.toString(),
			type: "http",
			key: parsed.toString(),
		};
	}
	if (source.startsWith("s3://")) {
		return {
			original: source,
			normalized: source,
			type: "s3",
			key: source.replace(/^s3:\/\//, ""),
		};
	}
	throw new Error('Source must be an absolute URL starting with "http://" or "https://".');
};

const requestSchema = z.object({
	type: z.enum(outputTypes).default("webp"),
	width: z.number().int().positive().optional(),
	height: z.number().int().positive().optional(),
	quality: z.number().int().min(1).max(100).optional(),
	fit: z.enum(fitValues).optional(),
	position: z.enum(positionValues).optional(),
	dpr: z.number().positive().optional(),
	background: z.string().optional(),
	withoutEnlargement: z.boolean().optional(),
	rotate: z.number().optional(),
	flip: z.boolean().optional(),
	flop: z.boolean().optional(),
	blur: z.number().min(0.3).optional(),
	sharpen: z.number().min(0).optional(),
	grayscale: z.boolean().optional(),
	stripMetadata: z.boolean().optional(),
	progressive: z.boolean().optional(),
	animated: z.boolean().optional(),
	page: z.number().int().min(0).optional(),
	pages: z.number().int().positive().optional(),
	trim: z.union([z.number().min(0), z.boolean()]).optional(),
	timeoutMs: z.number().int().positive().optional(),
	maxPixels: z.number().int().positive().optional(),
	effort: z.number().int().min(0).max(10).optional(),
	lossless: z.boolean().optional(),
	nearLossless: z.boolean().optional(),
	alphaQuality: z.number().int().min(1).max(100).optional(),
	chromaSubsampling: z.string().optional(),
	compressionLevel: z.number().int().min(0).max(9).optional(),
	palette: z.boolean().optional(),
	interlace: z.boolean().optional(),
	cropX: z.number().int().min(0).optional(),
	cropY: z.number().int().min(0).optional(),
	cropWidth: z.number().int().positive().optional(),
	cropHeight: z.number().int().positive().optional(),
	modulateBrightness: z.number().optional(),
	modulateSaturation: z.number().optional(),
	modulateHue: z.number().optional(),
	modulateLightness: z.number().optional(),
});

interface ParsedTransformQuery {
	readonly source: SourceReference;
	readonly options: TransformOptions;
}

const buildCrop = (
	x: number | undefined,
	y: number | undefined,
	width: number | undefined,
	height: number | undefined,
): TransformCrop | undefined => {
	if ([x, y, width, height].some((value) => value == null)) {
		return undefined;
	}
	return {
		x: x as number,
		y: y as number,
		width: width as number,
		height: height as number,
	};
};

const buildModulate = (
	brightness: number | undefined,
	saturation: number | undefined,
	hue: number | undefined,
	lightness: number | undefined,
): TransformModulate | undefined => {
	if ([brightness, saturation, hue, lightness].every((value) => value == null)) {
		return undefined;
	}
	return {
		brightness,
		saturation,
		hue,
		lightness,
	};
};

export const parseTransformRequest = (request: Request): ParsedTransformQuery => {
	const requestUrl = new URL(request.url);
	const rawSource = resolveSourceFromRequest(requestUrl);
	if (!rawSource) {
		throw new Error('Missing "url" query parameter.');
	}

	const sizeParams = parseSize(requestUrl.searchParams.get("size"));
	const widthFromQuery = toNumber(requestUrl.searchParams.get("width"));
	const heightFromQuery = toNumber(requestUrl.searchParams.get("height"));
	const parsed = requestSchema.parse({
		type: requestUrl.searchParams.get("type") ?? undefined,
		width: widthFromQuery ?? toNumber(requestUrl.searchParams.get("w")) ?? sizeParams.width,
		height: heightFromQuery ?? toNumber(requestUrl.searchParams.get("h")) ?? sizeParams.height,
		quality: toNumber(requestUrl.searchParams.get("quality")),
		fit: requestUrl.searchParams.get("fit") ?? undefined,
		position: requestUrl.searchParams.get("position") ?? undefined,
		dpr: toNumber(requestUrl.searchParams.get("dpr")),
		background: requestUrl.searchParams.get("background") ?? undefined,
		withoutEnlargement: toBoolean(requestUrl.searchParams.get("withoutEnlargement")),
		rotate: toNumber(requestUrl.searchParams.get("rotate")),
		flip: toBoolean(requestUrl.searchParams.get("flip")),
		flop: toBoolean(requestUrl.searchParams.get("flop")),
		blur: toNumber(requestUrl.searchParams.get("blur")),
		sharpen: toNumber(requestUrl.searchParams.get("sharpen")),
		grayscale: toBoolean(requestUrl.searchParams.get("grayscale")),
		stripMetadata: toBoolean(requestUrl.searchParams.get("stripMetadata")),
		progressive: toBoolean(requestUrl.searchParams.get("progressive")),
		animated: toBoolean(requestUrl.searchParams.get("animated")),
		page: toNumber(requestUrl.searchParams.get("page")),
		pages: toNumber(requestUrl.searchParams.get("pages")),
		trim: toNumber(requestUrl.searchParams.get("trim")) ?? toBoolean(requestUrl.searchParams.get("trim")),
		timeoutMs: toNumber(requestUrl.searchParams.get("timeoutMs")),
		maxPixels: toNumber(requestUrl.searchParams.get("maxPixels")),
		effort: toNumber(requestUrl.searchParams.get("effort")),
		lossless: toBoolean(requestUrl.searchParams.get("lossless")),
		nearLossless: toBoolean(requestUrl.searchParams.get("nearLossless")),
		alphaQuality: toNumber(requestUrl.searchParams.get("alphaQuality")),
		chromaSubsampling: requestUrl.searchParams.get("chromaSubsampling") ?? undefined,
		compressionLevel: toNumber(requestUrl.searchParams.get("compressionLevel")),
		palette: toBoolean(requestUrl.searchParams.get("palette")),
		interlace: toBoolean(requestUrl.searchParams.get("interlace")),
		cropX: toNumber(requestUrl.searchParams.get("cropX")),
		cropY: toNumber(requestUrl.searchParams.get("cropY")),
		cropWidth: toNumber(requestUrl.searchParams.get("cropWidth")),
		cropHeight: toNumber(requestUrl.searchParams.get("cropHeight")),
		modulateBrightness: toNumber(requestUrl.searchParams.get("modulateBrightness")),
		modulateSaturation: toNumber(requestUrl.searchParams.get("modulateSaturation")),
		modulateHue: toNumber(requestUrl.searchParams.get("modulateHue")),
		modulateLightness: toNumber(requestUrl.searchParams.get("modulateLightness")),
	});

	const crop = buildCrop(parsed.cropX, parsed.cropY, parsed.cropWidth, parsed.cropHeight);
	const modulate = buildModulate(
		parsed.modulateBrightness,
		parsed.modulateSaturation,
		parsed.modulateHue,
		parsed.modulateLightness,
	);

	return {
		source: normalizeSource(rawSource),
		options: {
			type: parsed.type,
			width: parsed.width,
			height: parsed.height,
			quality: parsed.quality,
			fit: parsed.fit,
			position: parsed.position,
			dpr: parsed.dpr,
			background: parsed.background,
			withoutEnlargement: parsed.withoutEnlargement,
			crop,
			rotate: parsed.rotate,
			flip: parsed.flip,
			flop: parsed.flop,
			blur: parsed.blur,
			sharpen: parsed.sharpen,
			grayscale: parsed.grayscale,
			modulate,
			stripMetadata: parsed.stripMetadata,
			progressive: parsed.progressive,
			animated: parsed.animated,
			page: parsed.page,
			pages: parsed.pages,
			trim: parsed.trim,
			timeoutMs: parsed.timeoutMs,
			maxPixels: parsed.maxPixels,
			effort: parsed.effort,
			lossless: parsed.lossless,
			nearLossless: parsed.nearLossless,
			alphaQuality: parsed.alphaQuality,
			chromaSubsampling: parsed.chromaSubsampling,
			compressionLevel: parsed.compressionLevel,
			palette: parsed.palette,
			interlace: parsed.interlace,
		},
	};
};
