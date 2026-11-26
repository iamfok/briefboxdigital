// Security headers carried over from the old vercel.json, plus admin/portal rules.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://googleads.g.doubleclick.net https://www.googleadservices.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://formspree.io https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://*.doubleclick.net https://www.google.com https://www.facebook.com https://connect.facebook.net",
  "frame-src 'self' https://www.googletagmanager.com https://td.doubleclick.net https://calendar.google.com",
  "form-action 'self' https://formspree.io",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join('; ');

const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: csp }] : []),
];
const privateArea = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Cache-Control', value: 'no-store' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  trailingSlash: false,
  async rewrites() {
    // Play Store app (Trusted Web Activity) proof of ownership; values are set in Admin → Connection
    return [{ source: '/.well-known/assetlinks.json', destination: '/api/assetlinks' }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: security },
      { source: '/assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }] },
      { source: '/admin', headers: privateArea },
      { source: '/admin/:path*', headers: privateArea },
      { source: '/portal', headers: privateArea },
      { source: '/portal/:path*', headers: privateArea },
      { source: '/team', headers: privateArea },
      { source: '/team/:path*', headers: privateArea },
      { source: '/team-sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/team' }] },
      { source: '/api/:path*', headers: privateArea },
    ];
  },
};

export default nextConfig;

if (process.env.NODE_ENV === 'development') {
  try {
    const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare');
    initOpenNextCloudflareForDev();
  } catch (e) { /* not needed outside Cloudflare */ }
}
