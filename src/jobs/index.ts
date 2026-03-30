import type { CronWithAutocomplete } from "bun";

type BunCronValue = CronWithAutocomplete | "@now";
type BunCronJobCron = BunCronValue | BunCronValue[];
type BunCronJob = {
  name: string;
  cron: BunCronJobCron;
  script: string;
}


export default [
  {
    name: "cleanup_cache_transform",
    cron: ["@midnight", "@now"],
    script: "./jobs/cleanup-transform-cache.ts",
  }
] as const satisfies BunCronJob[];
