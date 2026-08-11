import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // Clerk's middleware runs on the Edge runtime, and adding it made Next compile an Edge bundle for
  // instrumentation.ts too — which reaches scheduler -> db -> `pg`, a driver that needs fs, path and
  // stream. Node's built-ins do not exist on Edge, so the build failed on three unresolvable modules.
  //
  // The Edge copy never runs that code: register() returns immediately unless NEXT_RUNTIME is
  // "nodejs". Only the compile needs satisfying, so the built-ins are stubbed for the Edge pass alone.
  // The Node bundle is untouched and keeps the real driver, which is what the publish ticker uses.
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === "edge") {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false, path: false, stream: false, net: false, tls: false, dns: false, crypto: false,
        string_decoder: false, util: false, "util/types": false, buffer: false, events: false,
        assert: false, zlib: false, url: false, querystring: false, os: false, http: false,
        https: false, child_process: false, async_hooks: false, perf_hooks: false, vm: false,
      };
    }
    return config;
  },
};
export default nextConfig;
