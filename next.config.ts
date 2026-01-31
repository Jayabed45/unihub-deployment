const nextConfig = {
  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://unihub-deployment-backend.onrender.com',
  },
  
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'unihub-deployment-backend.onrender.com',
      },
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },

  // Webpack configuration
  webpack: (config: { resolve: { fallback: any; }; module: { rules: { test: RegExp; loader: string; }[]; }; }, { isServer }: any) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        'mongodb-client-encryption': false,
        '@aws-sdk/credential-provider-imds': false,
      };

      // Exclude backend directory
      config.module.rules.push({
        test: /[\\/]backend[\\/].*\.(ts|js|tsx|jsx)$/,
        loader: 'null-loader',
      });
    }
    return config;
  },

  // External packages for server components
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // External packages to be treated as external
  serverExternalPackages: [
    'mongoose',
    'bcryptjs',
    'jsonwebtoken',
    'mongodb',
    'nodemailer',
    'exceljs'
  ],

  // React Strict Mode
  reactStrictMode: true,
};

module.exports = nextConfig;