import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getStreetViewUrl, hasStreetViewCoverage } from './services/streetview.js'
import { generateImage, ping } from './services/comfyui.js'

import markerIcon   from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

// ── Map ──────────────────────────────────────────────────────
const map = L.map('map', { zoomControl: false }).setView([41.385, 2.176], 14)
map.attributionControl.setPosition('bottomleft')

const tileLayers = {
  street:    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                { attribution: '© OpenStreetMap contributors', maxZoom: 19 }),
  light:     L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',    { attribution: '© OpenStreetMap, © CARTO', maxZoom: 19 }),
  dark:      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',     { attribution: '© OpenStreetMap, © CARTO', maxZoom: 19 }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri', maxZoom: 19 }),
}
let activeLayer = 'street'
tileLayers.street.addTo(map)

// ── Elements ─────────────────────────────────────────────────
const aiBtn       = document.getElementById('ai-btn')
const sidebar     = document.getElementById('sidebar')
const searchInput = document.getElementById('search-input')
const generateBtn    = document.getElementById('generate-btn')
const regenRow       = document.getElementById('regen-row')
const regenNextBtn   = document.getElementById('regen-next-btn')
const regenRandomBtn = document.getElementById('regen-random-btn')
const multLabel      = document.getElementById('mult-label')
const promptEl    = document.getElementById('prompt')
const statusEl    = document.getElementById('status')
const intensityEl = document.getElementById('intensity')
const connDot     = document.getElementById('conn-dot')

const uploadZone     = document.getElementById('upload-zone')
const uploadInput    = document.getElementById('upload-input')
const uploadEmpty    = document.getElementById('upload-empty')
const uploadLoaded   = document.getElementById('upload-loaded')
const uploadThumb    = document.getElementById('upload-thumb')
const uploadFilename = document.getElementById('upload-filename')
const uploadClear    = document.getElementById('upload-clear')

const resultCard    = document.getElementById('result-card')
const resultClose   = document.getElementById('result-close')
const resultExpand  = document.getElementById('result-expand')
const baContainer   = document.getElementById('ba-container')
const baBeforeWrap  = document.getElementById('ba-before-wrap')
const baBefore      = document.getElementById('ba-before')
const baAfter       = document.getElementById('ba-after')
const baHandle      = document.getElementById('ba-handle')
const baLoading     = document.getElementById('ba-loading')
const baProgress    = document.getElementById('ba-progress')

const downloadBtn     = document.getElementById('download-btn')
const downloadMenu    = document.getElementById('download-menu')
const dlOriginalBtn   = document.getElementById('dl-original')
const dlInpaintedBtn  = document.getElementById('dl-inpainted')
const dlFinalBtn      = document.getElementById('dl-final')
const shareBtn        = document.getElementById('share-btn')
const pinBtn          = document.getElementById('pin-btn')

const layersBtn   = document.getElementById('layers-btn')
const layersPanel = document.getElementById('layers-panel')
const zoomInBtn   = document.getElementById('zoom-in')
const zoomOutBtn  = document.getElementById('zoom-out')

// ── State ────────────────────────────────────────────────────
let currentSvUrl      = null
let currentFile       = null
let originalImageUrl  = null
let inpaintedImageUrl = null
let resultImageUrl    = null
let currentLatLng     = null
let marker            = null
const pinnedMarkers   = []

const BASE_SEED     = 5
let seedMultiplier  = 1

// slider state
let isSliding = false

// Street View orientation state
let svHeading = 0
let svPitch   = 0
let svFov     = 90
let isDraggingView = false
let viewDragStartX = 0
let viewDragStartY = 0
let viewDragStartH = 0
let viewDragStartP = 0
let svFovTimer = null

function refreshStreetView() {
  if (!currentLatLng) return
  const url = getStreetViewUrl(currentLatLng.lat, currentLatLng.lng, {
    width: 640, height: 640, heading: svHeading, pitch: svPitch, fov: svFov
  })
  currentSvUrl = url
  baBefore.src = url
}

// ── Sidebar toggle ───────────────────────────────────────────
aiBtn.classList.add('active')
aiBtn.addEventListener('click', () => {
  const nowHidden = sidebar.classList.toggle('hidden')
  aiBtn.classList.toggle('active', !nowHidden)
})

// ── Search ───────────────────────────────────────────────────
searchInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return
  const q = searchInput.value.trim()
  if (!q) return
  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`, { headers: { 'Accept-Language': 'en' } })
    const data = await res.json()
    if (data[0]) map.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 16)
  } catch {}
})

// ── Map click ────────────────────────────────────────────────
map.on('click', ({ latlng: { lat, lng } }) => pickLocation(lat, lng))

async function pickLocation(lat, lng) {
  if (marker) marker.remove()
  marker = L.marker([lat, lng]).addTo(map)
  currentLatLng = { lat, lng }
  svHeading = 0; svPitch = 0; svFov = 90

  currentSvUrl = null
  currentFile  = null
  resetUploadZone()
  generateBtn.disabled = true
  setStatus('Checking Street View coverage…')

  try {
    const ok = await hasStreetViewCoverage(lat, lng)
    if (!ok) {
      setStatus('No Street View here — upload an image instead')
      return
    }
    currentSvUrl = getStreetViewUrl(lat, lng, { width: 640, height: 640, heading: svHeading, pitch: svPitch, fov: svFov })
    showPreview(currentSvUrl)
    setStatus('Ready — hit Generate')
    generateBtn.disabled = false
  } catch (err) {
    setStatus(`Error: ${err.message}`)
  }
}

// ── Upload zone ──────────────────────────────────────────────
uploadZone.addEventListener('click', (e) => {
  if (e.target === uploadClear || uploadClear.contains(e.target)) return
  uploadInput.click()
})

uploadInput.addEventListener('change', () => {
  const file = uploadInput.files[0]
  if (!file) return
  applyFile(file)
})

uploadClear.addEventListener('click', (e) => {
  e.stopPropagation()
  currentFile  = null
  currentSvUrl = null
  currentLatLng = null
  if (marker) { marker.remove(); marker = null }
  resetUploadZone()
  resultCard.classList.add('hidden')
  generateBtn.disabled = true
  setStatus('')
})

// Drag & drop
uploadZone.addEventListener('dragover',  (e) => { e.preventDefault(); uploadZone.classList.add('drag-over') })
uploadZone.addEventListener('dragleave', ()  => uploadZone.classList.remove('drag-over'))
uploadZone.addEventListener('drop',      (e) => {
  e.preventDefault()
  uploadZone.classList.remove('drag-over')
  const file = e.dataTransfer.files[0]
  if (file && file.type.startsWith('image/')) applyFile(file)
})

function applyFile(file) {
  currentFile  = file
  currentSvUrl = null
  currentLatLng = null
  if (marker) { marker.remove(); marker = null }

  const objectUrl = URL.createObjectURL(file)
  originalImageUrl = objectUrl
  uploadThumb.src      = objectUrl
  uploadFilename.textContent = file.name
  uploadEmpty.classList.add('hidden')
  uploadLoaded.classList.remove('hidden')

  showPreview(objectUrl)
  setStatus('Ready — hit Generate')
  generateBtn.disabled = false
}

function resetUploadZone() {
  uploadEmpty.classList.remove('hidden')
  uploadLoaded.classList.add('hidden')
  uploadInput.value = ''
}

// ── Preview (before-only) ────────────────────────────────────
function showPreview(src) {
  baBefore.src = src
  baAfter.src  = ''
  resultCard.classList.remove('has-result', 'hidden')
  baLoading.classList.add('hidden')
  requestAnimationFrame(() => moveSlider(100))
}

// ── Map zoom buttons ──────────────────────────────────────────
zoomInBtn.addEventListener('click',  () => map.zoomIn())
zoomOutBtn.addEventListener('click', () => map.zoomOut())

// ── Layers ───────────────────────────────────────────────────
layersBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  layersPanel.classList.toggle('hidden')
  layersBtn.classList.toggle('active')
})

document.querySelectorAll('.layer-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.layer
    if (key === activeLayer) { layersPanel.classList.add('hidden'); layersBtn.classList.remove('active'); return }
    map.removeLayer(tileLayers[activeLayer])
    tileLayers[key].addTo(map)
    activeLayer = key
    document.querySelectorAll('.layer-opt').forEach(b => b.classList.toggle('active', b.dataset.layer === key))
    layersPanel.classList.add('hidden')
    layersBtn.classList.remove('active')
  })
})

document.addEventListener('click', (e) => {
  if (!layersPanel.classList.contains('hidden') && !layersBtn.contains(e.target) && !layersPanel.contains(e.target)) {
    layersPanel.classList.add('hidden')
    layersBtn.classList.remove('active')
  }
})

// ── Generate ─────────────────────────────────────────────────
generateBtn.addEventListener('click', () => {
  seedMultiplier = 1
  runGeneration(BASE_SEED)
})

regenNextBtn.addEventListener('click', () => {
  seedMultiplier++
  multLabel.textContent = seedMultiplier + 1
  runGeneration(BASE_SEED * seedMultiplier)
})

regenRandomBtn.addEventListener('click', () => {
  runGeneration(Math.floor(Math.random() * 2 ** 32))
})

async function runGeneration(seed) {
  const source = currentFile ?? currentSvUrl
  if (!source) return

  // Capture the street view URL at generation time so drag/pan/fov changes are included
  if (currentSvUrl) originalImageUrl = currentSvUrl

  const wasFromMap = !!currentSvUrl
  generateBtn.disabled   = true
  regenNextBtn.disabled  = true
  regenRandomBtn.disabled = true
  baLoading.classList.remove('hidden')
  baProgress.textContent = 'Uploading…'
  setStatus('Uploading image…')

  try {
    const { inpainted, final } = await generateImage(
      source,
      seed,
      (pct) => {
        const step  = pct <= 50 ? 'Inpainting' : 'Styling'
        const label = pct < 100 ? `${step}… ${Math.round(pct)}%` : 'Done!'
        baProgress.textContent = label
        setStatus(label)
      },
    )

    inpaintedImageUrl = inpainted
    resultImageUrl    = final
    baAfter.src       = final
    baLoading.classList.add('hidden')
    resultCard.classList.add('has-result')

    baBeforeWrap.classList.add('animating')
    requestAnimationFrame(() => {
      moveSlider(50)
      setTimeout(() => baBeforeWrap.classList.remove('animating'), 650)
    })

    regenRow.classList.remove('hidden')
    multLabel.textContent = seedMultiplier + 1
    downloadBtn.disabled  = false
    shareBtn.disabled     = false
    pinBtn.disabled       = !wasFromMap
    pinBtn.classList.remove('pinned')
    setStatus('Done!')
  } catch (err) {
    baLoading.classList.add('hidden')
    setStatus(`Error: ${err.message}`)
  } finally {
    generateBtn.disabled    = false
    regenNextBtn.disabled   = false
    regenRandomBtn.disabled = false
  }
}

// ── Result close / expand ─────────────────────────────────────
resultClose.addEventListener('click', () => resultCard.classList.add('hidden'))

resultExpand.addEventListener('click', () => {
  const expanded = resultCard.classList.toggle('expanded')
  resultExpand.title = expanded ? 'Collapse' : 'Expand'
  resultExpand.querySelector('svg').innerHTML = expanded
    ? '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>'
    : '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>'
})

resultCard.addEventListener('transitionend', (e) => {
  if (e.propertyName === 'width') moveSlider(sliderPct())
})

// ── Before / After slider ────────────────────────────────────
function moveSlider(pct) {
  baBeforeWrap.style.width = `${pct}%`
  baBefore.style.width     = `${baContainer.offsetWidth}px`
  baBefore.style.height    = `${baContainer.offsetHeight}px`
  baHandle.style.left      = `${pct}%`
}

function sliderPct() {
  return parseFloat(baBeforeWrap.style.width) || 50
}

function pctFromX(clientX) {
  const rect = baContainer.getBoundingClientRect()
  return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
}

function onBeforeSide(clientX) {
  const rect = baContainer.getBoundingClientRect()
  return (clientX - rect.left) / rect.width * 100 < sliderPct()
}

// Single mousedown listener on container — decides slider vs Street View rotation
baContainer.addEventListener('mousedown', (e) => {
  e.preventDefault()

  if (baHandle.contains(e.target)) {
    isSliding = true
  } else if (onBeforeSide(e.clientX) && currentLatLng) {
    isDraggingView = true
    viewDragStartX = e.clientX
    viewDragStartY = e.clientY
    viewDragStartH = svHeading
    viewDragStartP = svPitch
    baBeforeWrap.style.cursor = 'grabbing'
  }
})

document.addEventListener('mousemove', (e) => {
  if (isSliding) moveSlider(pctFromX(e.clientX))
  if (isDraggingView) {
    const dx = e.clientX - viewDragStartX
    const dy = e.clientY - viewDragStartY
    svHeading = (viewDragStartH - dx * 0.3 + 360) % 360
    svPitch   = Math.max(-90, Math.min(90, viewDragStartP + dy * 0.15))
  }
})

document.addEventListener('mouseup', () => {
  isSliding = false
  if (isDraggingView) {
    isDraggingView = false
    baBeforeWrap.style.cursor = ''
    refreshStreetView()
  }
})

// Touch equivalents
baContainer.addEventListener('touchstart', (e) => {
  if (baHandle.contains(e.target)) {
    isSliding = true
  } else if (onBeforeSide(e.touches[0].clientX) && currentLatLng) {
    isDraggingView = true
    viewDragStartX = e.touches[0].clientX
    viewDragStartY = e.touches[0].clientY
    viewDragStartH = svHeading
    viewDragStartP = svPitch
  }
}, { passive: true })

document.addEventListener('touchmove', (e) => {
  if (isSliding) moveSlider(pctFromX(e.touches[0].clientX))
  if (isDraggingView) {
    const dx = e.touches[0].clientX - viewDragStartX
    const dy = e.touches[0].clientY - viewDragStartY
    svHeading = (viewDragStartH - dx * 0.3 + 360) % 360
    svPitch   = Math.max(-90, Math.min(90, viewDragStartP + dy * 0.15))
  }
}, { passive: true })

document.addEventListener('touchend', () => {
  isSliding = false
  if (isDraggingView) {
    isDraggingView = false
    refreshStreetView()
  }
})

// ── Scroll to change FOV (before side only) ───────────────────
baContainer.addEventListener('wheel', (e) => {
  e.preventDefault()
  if (!onBeforeSide(e.clientX) || !currentLatLng) return
  svFov = Math.max(10, Math.min(120, svFov + (e.deltaY > 0 ? 5 : -5)))
  clearTimeout(svFovTimer)
  svFovTimer = setTimeout(refreshStreetView, 200)
}, { passive: false })

// ── Download dropdown ─────────────────────────────────────────
downloadBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  downloadMenu.classList.toggle('hidden')
})

document.addEventListener('click', () => downloadMenu.classList.add('hidden'))

async function downloadUrl(url, filename) {
  try {
    const res    = await fetch(url)
    const blob   = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl; a.download = filename; a.click()
    URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank')
  }
}

dlOriginalBtn.addEventListener('click', () => {
  downloadMenu.classList.add('hidden')
  if (originalImageUrl) downloadUrl(originalImageUrl, `vitruviews_original_${Date.now()}.jpg`)
})

dlInpaintedBtn.addEventListener('click', () => {
  downloadMenu.classList.add('hidden')
  if (inpaintedImageUrl) downloadUrl(inpaintedImageUrl, `vitruviews_inpainted_${Date.now()}.png`)
})

dlFinalBtn.addEventListener('click', () => {
  downloadMenu.classList.add('hidden')
  if (resultImageUrl) downloadUrl(resultImageUrl, `vitruviews_final_${Date.now()}.png`)
})

// ── Share (copy URL to clipboard) ────────────────────────────
shareBtn.addEventListener('click', async () => {
  if (!resultImageUrl) return
  try {
    const fullUrl = window.location.origin + resultImageUrl
    await navigator.clipboard.writeText(fullUrl)
    setStatus('Link copied to clipboard!')
    setTimeout(() => setStatus('Done!'), 2000)
  } catch {
    setStatus('Could not copy — try downloading instead')
  }
})

// ── Pin result to map ─────────────────────────────────────────
pinBtn.addEventListener('click', () => {
  if (!resultImageUrl || !currentLatLng) return

  const { lat, lng } = currentLatLng
  const pinIcon = L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;background:#0d9488;border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })

  const popup = L.popup({ maxWidth: 220, className: 'result-popup' }).setContent(
    `<img src="${resultImageUrl}" style="width:200px;border-radius:8px;display:block;" />`
  )
  const m = L.marker([lat, lng], { icon: pinIcon }).addTo(map).bindPopup(popup)
  pinnedMarkers.push(m)

  pinBtn.classList.add('pinned')
  setStatus('Result pinned to map!')
  setTimeout(() => setStatus('Done!'), 2000)
})

// ── Prompt builder ────────────────────────────────────────────
function buildPrompt() {
  const features = []
  if (document.getElementById('tog-pedestrian').checked) features.push('pedestrians, sidewalk')
  if (document.getElementById('tog-bike').checked)       features.push('cyclists, bike lane')
  if (document.getElementById('tog-tree').checked)       features.push('trees, greenery, vegetation')

  const v = parseInt(intensityEl.value)
  const intensity = v > 66 ? 'dramatic transformation' : v > 33 ? 'moderate transformation' : 'subtle transformation'

  return ['hen_lar_urban', features.join(', '), promptEl.value.trim(), intensity].filter(Boolean).join(', ')
}

// ── Status ───────────────────────────────────────────────────
function setStatus(msg) { statusEl.textContent = msg }

// ── Connection check ─────────────────────────────────────────
async function checkConnection() {
  try {
    const ok = await ping()
    connDot.className = ok ? 'ok' : 'err'
    if (!ok) setStatus('ComfyUI not reachable — is it running on :8188?')
  } catch {
    connDot.className = 'err'
    setStatus('ComfyUI not reachable — is it running on :8188?')
  }
}
checkConnection()
setInterval(checkConnection, 30000)
