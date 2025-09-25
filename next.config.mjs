/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/',
        destination: '/ricochet',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
