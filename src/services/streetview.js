import axios from 'axios'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY

/**
 * Returns a Street View Static image URL for the given coordinates.
 * The browser fetches the image directly — no proxy needed.
 * @param {number} lat
 * @param {number} lng
 * @param {object} options
 * @returns {string} image URL
 */
export function getStreetViewUrl(lat, lng, { width = 640, height = 640, fov = 90, heading = 0, pitch = 0 } = {}) {
  const params = new URLSearchParams({
    size: `${width}x${height}`,
    location: `${lat},${lng}`,
    fov,
    heading,
    pitch,
    key: API_KEY,
  })
  return `https://maps.googleapis.com/maps/api/streetview?${params}`
}

/**
 * Check if Street View coverage exists at the given coordinates.
 * @returns {Promise<boolean>}
 */
export async function hasStreetViewCoverage(lat, lng) {
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    key: API_KEY,
  })
  const { data } = await axios.get(`https://maps.googleapis.com/maps/api/streetview/metadata?${params}`)
  return data.status === 'OK'
}
