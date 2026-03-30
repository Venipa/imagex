import type { KVNamespace } from "@cloudflare/workers-types";
import sharpWasmModule from "@img/sharp-wasm32";
import { NoopBinaryCache } from "./cache/noop-cache";
import { WorkerKvMetadataCache } from "./cache/worker-kv-cache";
import { HttpDataSource } from "./datasource/http-datasource";
import { SourceRouter } from "./datasource/source-router";
import { type ProxyEnvironment, proxyRequest } from "./proxy-handler";
import { TransformService } from "./transformer/service";
import { WorkerSharpWasmTransformer } from "./transformer/worker-sharp-wasm-transformer";

interface WorkerEnvironment extends ProxyEnvironment {
	readonly IMAGE_CACHE: KVNamespace;
	readonly HOSTNAMES?: string;
	readonly IMAGE_TRANSFORM_MAX_SCALE_MULTIPLIER?: string;
	readonly SHARP_WASM?: WebAssembly.Module;
}

const splitHostnames = (value: string | undefined): readonly string[] => {
	if (!value) {
		return ["*"];
	}
	return value
		.split(",")
		.map((entry: string) => entry.trim())
		.filter((entry: string) => entry.length > 0);
};

const worker = {
	fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
		const maxScaleMultiplier = Number.parseFloat(env.IMAGE_TRANSFORM_MAX_SCALE_MULTIPLIER ?? "1");
		const transformService = new TransformService({
			transformer: new WorkerSharpWasmTransformer(
				sharpWasmModule as WebAssembly.Module,
				Number.isFinite(maxScaleMultiplier) && maxScaleMultiplier > 0 ? maxScaleMultiplier : 1,
			),
			sourceRouter: new SourceRouter({
				httpDataSource: new HttpDataSource(),
				allowS3: false,
			}),
			metadataCache: new WorkerKvMetadataCache(env.IMAGE_CACHE),
			sourceCache: new NoopBinaryCache(),
			transformCache: new NoopBinaryCache(),
			allowedHostnames: splitHostnames(env.HOSTNAMES),
		});
		return proxyRequest(request, env, { transformService });
	},
};

export default worker;
