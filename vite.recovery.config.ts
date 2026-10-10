import vinext from "vinext";
import { defineConfig } from "vite";

// Independent hosting uses Tickminder's verified Google/password sessions.
// Do not load Sites local authentication, its manifest, or local .env secrets.
export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
  process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    envDir: false as const,
    plugins: [
      vinext(),
      cloudflare({
        configPath: "wrangler.recovery.json",
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
      }),
    ],
  };
});
