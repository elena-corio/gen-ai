import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getStreetViewUrl, hasStreetViewCoverage } from './services/streetview.js'
import { generateImage, ping, INPAINTING_STEPS, IMAGE_STEPS } from './services/comfyui.js'

const tealMarkerIcon = L.divIcon({
  className: '',
  html: `<svg width="24" height="36" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z" fill="#0d9488"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  iconSize:   [24, 36],
  iconAnchor: [12, 36],
  popupAnchor:[0, -36],
})

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
const generateLabel  = document.getElementById('generate-label')
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
const dlSpecsBtn      = document.getElementById('dl-specs')
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
let currentPinnedEntry = null

const BASE_SEED = 5
let hasGenerated = false
let lastGenMeta = null

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
  marker = L.marker([lat, lng], { icon: tealMarkerIcon }).addTo(map)
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
    hasGenerated = false
    generateLabel.textContent = 'Generate'
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
  disableDownloadMenu()
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
  hasGenerated = false
  generateLabel.textContent = 'Generate'
  generateBtn.disabled = false
}

function resetUploadZone() {
  uploadEmpty.classList.remove('hidden')
  uploadLoaded.classList.add('hidden')
  uploadInput.value = ''
}

// ── Download menu helpers ─────────────────────────────────────
function enableDownloadMenu(full = false) {
  downloadBtn.disabled      = false
  dlInpaintedBtn.disabled   = !full
  dlFinalBtn.disabled       = !full
  dlSpecsBtn.disabled       = !full
}

function disableDownloadMenu() {
  downloadBtn.disabled      = true
  dlInpaintedBtn.disabled   = true
  dlFinalBtn.disabled       = true
  dlSpecsBtn.disabled       = true
}

// ── Preview (before-only) ────────────────────────────────────
function showPreview(src) {
  baBefore.src = src
  baAfter.src  = ''
  resultCard.classList.remove('has-result', 'hidden')
  baLoading.classList.add('hidden')
  inpaintedImageUrl = null
  resultImageUrl    = null
  lastGenMeta       = null
  enableDownloadMenu(false)
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

// ── Generate / Regenerate ─────────────────────────────────────
generateBtn.addEventListener('click', () => {
  runGeneration(hasGenerated ? Math.floor(Math.random() * 2 ** 32) : BASE_SEED)
})

async function runGeneration(seed) {
  const source = currentFile ?? currentSvUrl
  if (!source) return

  // Capture the street view URL at generation time so drag/pan/fov changes are included
  if (currentSvUrl) originalImageUrl = currentSvUrl

  const wasFromMap = !!currentSvUrl
  generateBtn.disabled = true
  baLoading.classList.remove('hidden')
  baProgress.textContent = 'Uploading…'
  setStatus('Uploading image…')

  const inpaintingPrompt = buildInpaintingPrompt()
  const imagePrompt      = buildImagePrompt()

  try {
    const { inpainted, final } = await generateImage(
      source,
      seed,
      inpaintingPrompt,
      imagePrompt,
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

    lastGenMeta = {
      date:              new Date(),
      latLng:            currentLatLng ? { ...currentLatLng } : null,
      seed,
      inpaintingPrompt,
      imagePrompt,
    }

    baBeforeWrap.classList.add('animating')
    requestAnimationFrame(() => {
      moveSlider(50)
      setTimeout(() => baBeforeWrap.classList.remove('animating'), 650)
    })

    hasGenerated = true
    generateLabel.textContent = 'Regenerate'
    enableDownloadMenu(true)
    shareBtn.disabled     = false
    currentPinnedEntry = null
    resetPinBtn()
    pinBtn.disabled       = !wasFromMap
    setStatus('Done!')
  } catch (err) {
    baLoading.classList.add('hidden')
    setStatus(`Error: ${err.message}`)
  } finally {
    generateBtn.disabled = false
  }
}

function resetPinBtn() {
  pinBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>Pin`
  pinBtn.classList.remove('pinned')
}

// ── Result close / expand ─────────────────────────────────────
resultClose.addEventListener('click', () => {
  resultCard.classList.add('hidden')
  if (currentPinnedEntry) {
    currentPinnedEntry = null
    resetPinBtn()
    pinBtn.disabled = true
  }
})

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
  const src = originalImageUrl ?? currentSvUrl
  if (src) downloadUrl(src, `vitruviews_original_${Date.now()}.jpg`)
})

dlInpaintedBtn.addEventListener('click', () => {
  downloadMenu.classList.add('hidden')
  if (inpaintedImageUrl) downloadUrl(inpaintedImageUrl, `vitruviews_inpainted_${Date.now()}.png`)
})

dlFinalBtn.addEventListener('click', () => {
  downloadMenu.classList.add('hidden')
  if (resultImageUrl) downloadUrl(resultImageUrl, `vitruviews_final_${Date.now()}.png`)
})

dlSpecsBtn.addEventListener('click', () => {
  downloadMenu.classList.add('hidden')
  if (!lastGenMeta) return
  const { date, latLng, seed, inpaintingPrompt, imagePrompt } = lastGenMeta
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const lines = [
    'vitru.views — Generation Specifications',
    fmt.format(date),
    '',
    latLng
      ? `Location\n  Latitude   ${latLng.lat.toFixed(6)}\n  Longitude  ${latLng.lng.toFixed(6)}`
      : 'Location\n  Uploaded image',
    '',
    'Inpainting · FLUX.1',
    `  Prompt  ${inpaintingPrompt}`,
    `  Seed    ${seed}`,
    `  Steps   ${INPAINTING_STEPS}`,
    '',
    'Image · FLUX.2',
    `  Prompt  ${imagePrompt}`,
    `  Seed    ${seed}`,
    `  Steps   ${IMAGE_STEPS}`,
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `vitruviews_specs_${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(url)
})

// ── Share ─────────────────────────────────────────────────────
shareBtn.addEventListener('click', async () => {
  if (!resultImageUrl) return
  try {
    const res  = await fetch(resultImageUrl)
    const blob = await res.blob()
    const file = new File([blob], `vitruviews_${Date.now()}.png`, { type: 'image/png' })

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: 'vitru.views', files: [file] })
      setStatus('Shared!')
    } else {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setStatus('Image copied to clipboard!')
      setTimeout(() => setStatus('Done!'), 2000)
    }
  } catch (err) {
    if (err?.name !== 'AbortError') setStatus('Could not share — try downloading instead')
  }
})

// ── Pin result to map ─────────────────────────────────────────
pinBtn.addEventListener('click', () => {
  if (currentPinnedEntry) {
    currentPinnedEntry.marker.remove()
    const idx = pinnedMarkers.indexOf(currentPinnedEntry)
    if (idx !== -1) pinnedMarkers.splice(idx, 1)
    currentPinnedEntry = null
    resultCard.classList.add('hidden')
    resetPinBtn()
    pinBtn.disabled = true
    setStatus('Pin removed')
    setTimeout(() => setStatus(''), 2000)
    return
  }

  if (!resultImageUrl || !currentLatLng) return

  const { lat, lng } = currentLatLng
  const snapOriginal = originalImageUrl
  const snapResult   = resultImageUrl

  const pinIcon = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:72px;height:72px;">
      <div class="pin-thumb" style="
        position:relative;
        width:100%;height:100%;
        border:3px solid white;border-radius:6px;
        box-shadow:0 2px 8px rgba(0,0,0,0.35);
        background:url('${snapResult}') center/cover;
        cursor:pointer;
        overflow:hidden;
      ">
        <div class="pin-expand-icon">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </div>
      </div>
    </div>`,
    iconSize:   [72, 72],
    iconAnchor: [36, 72],
  })

  const m = L.marker([lat, lng], { icon: pinIcon }).addTo(map)
  const entry = { marker: m, lat, lng, originalUrl: snapOriginal, resultUrl: snapResult }
  pinnedMarkers.push(entry)

  const el = m.getElement()
  el.querySelector('.pin-thumb').addEventListener('click', (e) => {
    L.DomEvent.stopPropagation(e)
    baBefore.src = entry.originalUrl
    baAfter.src  = entry.resultUrl
    resultCard.classList.remove('has-result', 'hidden', 'expanded')
    void resultCard.offsetWidth
    resultCard.classList.add('has-result')
    requestAnimationFrame(() => moveSlider(50))
    resultImageUrl    = entry.resultUrl
    originalImageUrl  = entry.originalUrl
    currentPinnedEntry = entry
    enableDownloadMenu(true)
    shareBtn.disabled    = false
    pinBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>Delete`
    pinBtn.disabled = false
    pinBtn.classList.remove('pinned')
  })

  currentPinnedEntry = entry
  pinBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>Delete`
  pinBtn.classList.remove('pinned')
  setStatus('Result pinned to map!')
  setTimeout(() => setStatus('Done!'), 2000)
})

// ── Sky selector ─────────────────────────────────────────────
const skyOpts = document.querySelectorAll('.sky-opt')
skyOpts.forEach(btn => {
  btn.addEventListener('click', () => {
    skyOpts.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
  })
})

// ── Prompt builders ───────────────────────────────────────────
const SKY_MAP = {
  clear:  'clear sky',
  clouds: 'blue sky, white clouds',
  warm:   'natural warm light',
}
const SUFFIX = 'NO TEXT, NO WATERMARKS, NO CARS, NO DERFORMED HUMAN ANATOMY.'

function buildInpaintingPrompt() {
  const features = []
  if (document.getElementById('tog-pedestrian').checked) features.push('pedestrians, sidewalk')
  if (document.getElementById('tog-bike').checked)       features.push('cyclists, bike lane')
  if (document.getElementById('tog-greenery').checked)   features.push('trees, greenery, vegetation')
  const middle = [...features, 'urban, modern, community oriented'].join(', ')
  return `hen_lar_urban, ${middle}, ${SUFFIX}`
}

function buildImagePrompt() {
  const active = document.querySelector('.sky-opt.active')
  const sky = active ? (SKY_MAP[active.dataset.sky] ?? '') : ''
  const core = 'Restyle this to an architectural render, remove wires, do not change image composition, daytime, shadows'
  return `hen_lar_urban, ${sky}, ${core}, ${SUFFIX}`
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
