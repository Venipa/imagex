# imagex [![Docker](https://github.com/Venipa/imagex/actions/workflows/release.yml/badge.svg)](https://github.com/Venipa/imagex/actions/workflows/release.yml)

`imagex` is a self-hostable image proxy and transformer built with Bun.

## What it does

- Proxies upstream resources through `?url=...`
- Transforms images with Sharp-compatible options (`type`, `width`, `height`, `quality`, etc.)
- Uses filesystem cache directories by default:
  - `.imagex/cache` (source cache)
  - `.imagex/transform` (transform cache)
- Supports datasource loading from:
  - `http(s)` URLs
  - `s3://` paths (Bun runtime only, source loading)
- Uses Redis (via unstorage) for metadata cache
- Supports S3-backed transform object cache on Bun

## API

### Transform route

Use the root endpoint with query parameters:

```bash
curl "http://localhost:3000/?url=https://github.com/venipa.png&type=webp&width=200&height=200"
```

Required:
- `url` (must be an absolute `http://` or `https://` URL)

Common transform params:
- `type` (`jpg|jpeg|png|webp|avif|gif`, default `webp`)
- `width` or `w`
- `height` or `h`
- `size` (`WIDTHxHEIGHT`)
- `quality` (`1-100`)
- `fit`, `position`
- `dpr`
- `withoutEnlargement`
- `rotate`, `flip`, `flop`
- `blur`, `sharpen`, `grayscale`
- `stripMetadata`
- `effort`, `lossless`, `nearLossless`

If only `width` or only `height` is provided, the other dimension is calculated using source aspect ratio.

### Health route (Bun runtime)



Returns JSON with:
- overall status
- Redis status
- S3 status (`ok`, `error`, or `skipped` when S3 cache is disabled)

## Caching behavior

- Transform cache key is based on:
  - source identity
  - normalized transform options signature
- Changing any transform option creates a different cache key and a new transform cache item.
- With S3 transform cache enabled on Bun:
  - on hit: stream cached object from S3
  - on miss: generate transform, stream to client, and upload to S3

## Run locally

```bash
bun install
bun run dev
```

## Docker

```bash
docker run --rm -p 3000:3000 ghcr.io/venipa/imagex:latest
```

For full environment wiring (Redis, optional S3), use `docker-compose.yml`.

## Cloudflare Worker

```bash
bun run wrangler:dev
```

Worker entry is `src/worker.ts` and uses KV bindings for metadata cache.

## Environment variables

Core:
- `PORT` (default `3000`)
- `HOSTNAMES` (allowed transform target hostnames, default `*`)
- `ORIGIN_HOST` (CORS origin host, default `*`)
- `ALLOWED_RESPONSE_CATEGORIES` (proxy-mode categories, default `json,xml,html,yml,text,image`)
- `DOMAIN_WHITELIST`
- `DOMAIN_BLACKLIST`

Cache and transform:
- `IMAGE_CACHE_DIR` (default `.imagex/cache`)
- `IMAGE_TRANSFORM_DIR` (default `.imagex/transform`)
- `IMAGE_CACHE_TTL_SECONDS` (default `3600`)
- `IMAGE_TRANSFORM_TTL_SECONDS` (default `3600`)
- `IMAGE_TRANSFORM_DEFAULT_TYPE` (default `webp`)
- `IMAGE_TRANSFORM_DEFAULT_QUALITY` (default `85`)
- `IMAGE_TRANSFORM_MAX_SCALE_MULTIPLIER` (default `1`)

Datasource:
- `DATASOURCE_ENABLE_S3` (default `false`)
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `S3_REGION`
- `S3_TRANSFORM_CACHE_PREFIX` (default `.imagex/transform`)

Metadata cache:
- `REDIS_URL` (default `redis://localhost:6379`)

Build info:
- `VERSION` (default `unknown`)

## Scripts

- `bun run dev` – start Bun server in watch mode
- `bun run start` – start Bun server
- `bun run build` – build Bun binary
- `bun run wrangler:dev` – run Worker locally
- `bun run typecheck` – TypeScript typecheck
