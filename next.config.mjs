/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/',
        destination: '/ricochet',
        // Temporary (307) so browsers don't cache it if a landing page is added at / later
        permanent: false,
      },
    ]
  },
};

export default nextConfig;
