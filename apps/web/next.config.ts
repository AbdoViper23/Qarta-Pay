import type { NextConfig } from 'next';

const config: NextConfig = {
  // The shared package is consumed as TypeScript source.
  transpilePackages: ['@qarta/shared'],
  // Do not generate an AGENTS.md file in the repo.
  agentRules: false,
};

export default config;
