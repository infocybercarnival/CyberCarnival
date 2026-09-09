// Replace only the getApiUrl() function in frontend/lib/api.ts with this.
// It avoids hard-coding Render, while keeping local development working.

export function getApiUrl(): string {
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim()

  if (configuredApiUrl) {
    return configuredApiUrl.replace(/\/+$/, '')
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://127.0.0.1:5000'
    }

    // Office-server / same-origin fallback.
    return window.location.origin
  }

  return ''
}
