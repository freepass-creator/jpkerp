/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // LAN IP에서 dev 서버 접근 허용 (폰 테스트용)
  allowedDevOrigins: ['192.168.45.231'],
};

export default nextConfig;
