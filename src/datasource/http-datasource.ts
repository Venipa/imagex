import type { DataSource, LoadedSource, SourceReference } from "../transformer/interfaces";

const resolveContentType = (response: Response): string => {
	return response.headers.get("content-type") ?? "application/octet-stream";
};

export class HttpDataSource implements DataSource {
	public async load(reference: SourceReference, signal?: AbortSignal): Promise<LoadedSource> {
		const response = await fetch(reference.normalized, { signal, redirect: "follow" });
		if (!response.ok) {
			throw new Error(`Failed to fetch source image: ${response.status} ${response.statusText}`);
		}
		const bytes = new Uint8Array(await response.arrayBuffer());
		return {
			bytes,
			mimeType: resolveContentType(response),
			etag: response.headers.get("etag") ?? undefined,
			lastModified: response.headers.get("last-modified") ?? undefined,
		};
	}
}
