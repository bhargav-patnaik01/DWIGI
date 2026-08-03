/**
 * Next.js is used purely as a static site generator here. There is no server,
 * no API route, and no server component doing data work — the host shell is
 * Electron and the data source is the local filesystem.
 *
 * `output: 'export'` makes that explicit and prevents anyone from later adding
 * a route handler that would quietly introduce a backend the architecture
 * forbids.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Emits `dashboard/index.html` rather than `dashboard.html`, which the
  // `app://` protocol handler resolves by directory.
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  /*
   * No framework chrome, ever.
   *
   * The static export carries no dev indicator, so this changes nothing about
   * what ships. It matters during `npm run dev`, where the build-activity badge
   * floats over the running desktop app — and a Next.js logo sitting in the
   * corner of D.W.I.G.I is exactly the "this is a Next.js project" tell this
   * application should never give.
   */
  devIndicators: false,
  // Surface type and lint errors at build time rather than shipping them.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
