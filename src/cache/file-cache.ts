import type { BinaryCache } from "../transformer/interfaces";

const toHex = (value: string): string => {
	return Buffer.from(value).toString("hex");
};

export class BunFileBinaryCache implements BinaryCache {
	private readonly baseDir: string;

	public constructor(baseDir: string) {
		this.baseDir = baseDir;
	}

	private getPath(key: string): string {
		return `${this.baseDir}/${toHex(key)}.bin`;
	}

	public async get(key: string): Promise<Uint8Array | null> {
		const path = this.getPath(key);
		const file = Bun.file(path);
		if (!(await file.exists())) {
			return null;
		}
		const bytes = await file.bytes();
		return new Uint8Array(bytes);
	}

	public async set(key: string, value: Uint8Array): Promise<void> {
		await Bun.write(this.getPath(key), value);
	}
}
