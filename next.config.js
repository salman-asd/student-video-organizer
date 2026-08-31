/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Thumbnails are always external URLs (YouTube, etc). No image uploads/storage.
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: 'platform-lookaside.fbsbx.com' },
      { protocol: 'https', hostname: '**' } // allow any external thumbnail host
    ]
  },
  // Netlify's Next.js runtime handles SSR/ISR; no special output target needed.
};

module.exports = nextConfig;
