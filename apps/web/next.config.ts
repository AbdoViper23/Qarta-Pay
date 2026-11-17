import type { NextConfig } from 'next';

const config: NextConfig = {
  // The shared package is consumed as TypeScript source.
  transpilePackages: ['@qarta/shared'],
};

export default config;
