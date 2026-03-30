declare module "@img/sharp-wasm32" {
	const sharp: (input: Uint8Array, options?: Record<string, unknown>) => {
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
	export default sharp;
}
