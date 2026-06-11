import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getStreetViewUrl, hasStreetViewCoverage } from './services/streetview.js'
import { generateImage, ping } from './services/comfyui.js'

// Leaflet's default marker icons break with Vite — fix asset paths
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

// --- Map (Barcelona default) ---
const map = L.map('map').setView([41.385, 2.176], 14)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map)

// --- Elements ---
const svPreview   = document.getElementById('sv-preview')
const generateBtn = document.getElementById('generate-btn')
const promptEl    = document.getElementById('prompt')
const statusEl    = document.getElementById('status')
const resultEl    = document.getElementById('result')
const uploadInput = document.getElementById('upload-input')
const uploadLabel = document.getElementById('upload-label')
const connDot     = document.getElementById('conn-dot')
const connLabel   = document.getElementById('conn-label')
const connRetry   = document.getElementById('conn-retry')

// --- State ---
let currentSvUrl = null
let currentFile  = null
let marker = null

// --- Local file upload ---
uploadInput.addEventListener('change', () => {
  const file = uploadInput.files[0]
  if (!file) return

  currentFile = file
  currentSvUrl = null
  if (marker) { marker.remove(); marker = null }

  const objectUrl = URL.createObjectURL(file)
  svPreview.innerHTML = `<img src="${objectUrl}" alt="Uploaded image" />`
  uploadLabel.querySelector('span').textContent = file.name
  generateBtn.disabled = false
  statusEl.textContent = ''
  resultEl.innerHTML = ''
})

// --- Map click → street view preview ---
map.on('click', async ({ latlng: { lat, lng } }) => {
  if (marker) marker.remove()
  marker = L.marker([lat, lng]).addTo(map)

  svPreview.innerHTML = '<p class="hint">Checking coverage…</p>'
  generateBtn.disabled = true
  currentSvUrl = null
  currentFile = null
  uploadInput.value = ''
  uploadLabel.querySelector('span').textContent = 'or upload an image'
  statusEl.textContent = ''

  try {
    const hasCoverage = await hasStreetViewCoverage(lat, lng)
    if (!hasCoverage) {
      svPreview.innerHTML = '<p class="hint">No Street View coverage here.<br>Try another spot.</p>'
      return
    }
    currentSvUrl = getStreetViewUrl(lat, lng, { width: 640, height: 640 })
    svPreview.innerHTML = `<img src="${currentSvUrl}" alt="Street View" />`
    generateBtn.disabled = false
  } catch (err) {
    svPreview.innerHTML = `<p class="hint">Error: ${err.message}</p>`
  }
})

// --- Generate button ---
generateBtn.addEventListener('click', async () => {
  const source = currentFile ?? currentSvUrl
  if (!source) return

  generateBtn.disabled = true
  resultEl.innerHTML = ''
  statusEl.textContent = 'Uploading image…'

  try {
    const url = await generateImage(
      source,
      promptEl.value.trim(),
      (pct) => {
        statusEl.textContent = pct < 100 ? `Generating… ${Math.round(pct)}%` : 'Done!'
      }
    )
    resultEl.innerHTML = `<img src="${url}" alt="Generated" />`
    statusEl.textContent = 'Done!'
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`
  } finally {
    generateBtn.disabled = false
  }
})

// --- Connection badge ---
async function checkConnection() {
  connDot.className = ''
  connLabel.textContent = 'Checking ComfyUI…'
  try {
    const ok = await ping()
    connDot.className = ok ? 'ok' : 'err'
    connLabel.textContent = ok ? 'ComfyUI connected' : 'ComfyUI not reachable — is it running on :8188?'
  } catch {
    connDot.className = 'err'
    connLabel.textContent = 'ComfyUI not reachable — is it running on :8188?'
  }
}

connRetry.addEventListener('click', checkConnection)
checkConnection()
