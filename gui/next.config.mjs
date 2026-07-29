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
  // Surface type and lint errors at build time rather than shipping them.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
