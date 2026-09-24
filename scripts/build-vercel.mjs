// Builds the Vercel deployment as prebuilt output (Build Output API v3), then
// `vercel deploy --prebuilt` uploads it as-is:
//   static/            the web app (apps/web/dist), SPA-routed
//   functions/server   the Hono server (apps/server/src/vercel.ts), bundled
//                      into one file so no workspace resolution happens on Vercel
// The web build reads apps/web/.env.production; the function's environment
// comes from the Vercel project's env vars at runtime.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// grammy's Node shim pairs the `abort-controller` polyfill with node-fetch.
// Bundled, those requests never settle, and Node's own fetch rejects the
// polyfilled signal — so hand grammy Node's built-ins, which it only needs
// on older runtimes anyway.
const grammyNativeShim = {
  name: "grammy-native-shim",
  setup(b) {
    b.onResolve({ filter: /\/shim\.node(\.js)?$/ }, (args) =>
      args.importer.includes("/grammy/")
        ? { path: "grammy-shim", namespace: "grammy-shim" }
        : undefined,
    );
    b.onLoad({ filter: /.*/, namespace: "grammy-shim" }, () => ({
      contents:
        "export const AbortController = globalThis.AbortController; export const fetch = globalThis.fetch;",
      loader: "js",
    }));
  },
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".vercel/output");
const fn = join(out, "functions/server.func");

rmSync(out, { recursive: true, force: true });

execFileSync("pnpm", ["--filter", "@liftledger/web", "build"], { cwd: root, stdio: "inherit" });
cpSync(join(root, "apps/web/dist"), join(out, "static"), { recursive: true });

mkdirSync(fn, { recursive: true });
await build({
  entryPoints: [join(root, "apps/server/src/vercel.ts")],
  outfile: join(fn, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // CommonJS dependencies still call `require` for Node builtins.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  // Optional native speedups some websocket code probes for.
  external: ["bufferutil", "utf-8-validate"],
  plugins: [grammyNativeShim],
  logLevel: "info",
});
writeFileSync(
  join(fn, ".vc-config.json"),
  JSON.stringify({
    runtime: "nodejs22.x",
    handler: "index.mjs",
    launcherType: "Nodejs",
    shouldAddHelpers: false,
    supportsResponseStreaming: true,
    maxDuration: 300,
  }),
);

writeFileSync(
  join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/(api|ingest|telegram|cron)(/.*)?$", dest: "/server" },
        { src: "^/healthz$", dest: "/server" },
        { handle: "filesystem" },
        // A stale tab asking for last deploy's chunk should fail loudly, not
        // get index.html back as JavaScript.
        { src: "^/assets/.*$", status: 404 },
        { src: "^/.*$", dest: "/index.html" },
      ],
      // Hobby plans allow one run a day; the dashboard syncs on open too.
      crons: [{ path: "/cron/daily", schedule: "0 9 * * *" }],
    },
    null,
    2,
  ),
);

console.log(`\nBuilt ${out}`);
