const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY

// All requests go through Vite's /sv-proxy to avoid CORS — both display and blob fetch.
const BASE = '/sv-proxy/maps/api/streetview'

export function getStreetViewUrl(lat, lng, { width = 640, height = 640, fov = 90, heading = 0, pitch = 0 } = {}) {
  const params = new URLSearchParams({
    size: `${width}x${height}`,
    location: `${lat},${lng}`,
    fov,
    heading,
    pitch,
    key: API_KEY,
  })
  return `${BASE}?${params}`
}

export async function hasStreetViewCoverage(lat, lng) {
  const params = new URLSearchParams({ location: `${lat},${lng}`, key: API_KEY })
  const resp = await fetch(`${BASE}/metadata?${params}`)
  if (!resp.ok) throw new Error(`Coverage check failed: ${resp.status}`)
  const data = await resp.json()
  return data.status === 'OK'
}
