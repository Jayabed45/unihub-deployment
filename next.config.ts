import { NextConfig } from "next";
import path from 'path';

const nextConfig: NextConfig = {
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

  // Webpack configuration to exclude backend from client-side build
  webpack: (config, { isServer }) => {
    // Exclude backend code from client-side bundle
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
        test: /backend\/.*\.(ts|js|tsx|jsx)$/,
        loader: 'null-loader',
      });
    }
    return config;
  },

  // Exclude backend dependencies from server components
  experimental: {
    serverComponentsExternalPackages: [
      'mongoose',
      'bcryptjs',
      'jsonwebtoken',
      'mongodb',
      'nodemailer',
      'exceljs'
    ],
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // React Strict Mode
  reactStrictMode: true,
};

export default nextConfig;