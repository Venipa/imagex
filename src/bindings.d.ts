import type { KVNamespace } from "@cloudflare/workers-types";

declare global {
  interface Env {
    IMAGE_CACHE: KVNamespace;
    IMAGE_TRANSFORM: KVNamespace;
    HOSTNAMES?: string;
    ORIGIN_HOST?: string;
    ALLOWED_RESPONSE_CATEGORIES?: string;
    DOMAIN_WHITELIST?: string;
    DOMAIN_BLACKLIST?: string;
    IMAGE_CACHE_DIR?: string;
    IMAGE_TRANSFORM_DIR?: string;
    IMAGE_CACHE_TTL_SECONDS?: number;
    IMAGE_TRANSFORM_TTL_SECONDS?: number;
    IMAGE_TRANSFORM_DEFAULT_TYPE?: string;
    IMAGE_TRANSFORM_DEFAULT_QUALITY?: number;
    DATASOURCE_LOCAL_DIR?: string;
    DATASOURCE_ENABLE_S3?: boolean;
    S3_ENDPOINT?: string;
    S3_ACCESS_KEY_ID?: string;
    S3_SECRET_ACCESS_KEY?: string;
    S3_BUCKET?: string;
    S3_REGION?: string;
    SHARP_WASM?: WebAssembly.Module;
  }
}