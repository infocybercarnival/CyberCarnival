const isGithubActions = process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true'
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || (isGithubActions ? '/cybercarnival_demo' : '')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  ...(basePath ? { basePath } : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
