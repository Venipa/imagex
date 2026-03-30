type BunCronJob = {
  name: string;
  cron: string;
  script: string;
}


export default [
  {
    name: "cleanup_cache_transform",
    cron: "@midnight",
    script: "./jobs/cleanup-transform-cache.ts",
  }
] as const satisfies BunCronJob[];
