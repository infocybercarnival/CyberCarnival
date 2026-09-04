const isGithubActions =
  process.env.GITHUB_ACTIONS === 'true' ||
  process.env.CI === 'true'

const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH ||
  (isGithubActions ? '/cybercarnival_demo' : '')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,

  ...(basePath ? { basePath } : {}),

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://cybercarnival.onrender.com/api/:path*',
      },
      {
        source: '/uploads/:path*',
        destination: 'https://cybercarnival.onrender.com/uploads/:path*',
      },
      {
        source: '/admin',
        destination: 'https://cybercarnival.onrender.com/admin/',
      },
      {
        source: '/admin/:path*',
        destination: 'https://cybercarnival.onrender.com/admin/:path*',
      },
      {
        source: '/coordinator',
        destination: 'https://cybercarnival.onrender.com/coordinator/',
      },
      {
        source: '/coordinator/:path*',
        destination: 'https://cybercarnival.onrender.com/coordinator/:path*',
      },
    ]
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },
}

export default nextConfig
