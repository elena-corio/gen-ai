<template>
  <div v-if="store.selectedLocation" class="sv-panel" :class="{ minimized }">
    <div class="sv-header">
      <span class="sv-title">Street View</span>
      <div class="sv-coords" v-if="store.selectedLocation">
        {{ store.selectedLocation.lat.toFixed(4) }}, {{ store.selectedLocation.lng.toFixed(4) }}
      </div>
      <div class="sv-actions">
        <button class="btn-icon" @click="minimized = !minimized" :title="minimized ? 'Expand' : 'Minimize'">
          {{ minimized ? '▲' : '▼' }}
        </button>
        <button class="btn-icon" @click="store.selectedLocation = null" title="Close">✕</button>
      </div>
    </div>

    <div v-show="!minimized" class="sv-body">
      <!-- Image + overlay controls -->
      <div class="sv-image-wrap">
        <div v-if="loading" class="sv-placeholder">Loading…</div>
        <div v-else-if="noCoverage" class="sv-placeholder sv-no-coverage">
          No Street View coverage here.<br />Try a different location.
        </div>
        <template v-else-if="imageUrl">
          <img
            :src="imageUrl"
            alt="Street View"
            class="sv-image"
            :class="{ dragging: isDragging }"
            @mousedown="onDragStart"
            @wheel.prevent="onWheel"
            draggable="false"
          />
        </template>
      </div>

      <!-- Use image button -->
      <button
        v-if="imageUrl && !noCoverage"
        class="btn-primary sv-use-btn"
        @click="$emit('use-image', imageUrl)"
      >
        Use this image →
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app.js'
import { getStreetViewUrl, hasStreetViewCoverage } from '../services/streetview.js'

defineEmits(['use-image'])

const store = useAppStore()
const minimized = ref(false)
const loading = ref(false)
const noCoverage = ref(false)
const imageUrl = ref(null)
const heading = ref(0)
const pitch = ref(0)
const fov = ref(90)

// Drag-to-pan
const isDragging = ref(false)
let dragStart = null
const HEADING_SENSITIVITY = 0.3  // degrees per pixel
const PITCH_SENSITIVITY = 0.2

function onDragStart(e) {
  isDragging.value = true
  dragStart = { x: e.clientX, y: e.clientY, heading: heading.value, pitch: pitch.value }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e) {
  if (!isDragging.value || !dragStart) return
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  heading.value = ((dragStart.heading - dx * HEADING_SENSITIVITY) % 360 + 360) % 360
  pitch.value = Math.max(-90, Math.min(90, dragStart.pitch + dy * PITCH_SENSITIVITY))
}

function onDragEnd() {
  if (!isDragging.value) return
  isDragging.value = false
  dragStart = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  refresh()
}

function onWheel(e) {
  adjustFov(e.deltaY > 0 ? 10 : -10)
}

onUnmounted(() => {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
})

watch(
  () => store.selectedLocation,
  async (loc) => {
    if (!loc) { imageUrl.value = null; return }
    await load(loc.lat, loc.lng)
  }
)

async function load(lat, lng) {
  loading.value = true
  noCoverage.value = false
  imageUrl.value = null
  try {
    const ok = await hasStreetViewCoverage(lat, lng)
    if (!ok) { noCoverage.value = true; return }
    imageUrl.value = getStreetViewUrl(lat, lng, { heading: heading.value, pitch: pitch.value, fov: fov.value })
    store.setStreetViewImage(imageUrl.value)
  } finally {
    loading.value = false
  }
}

function refresh() {
  if (!store.selectedLocation) return
  imageUrl.value = getStreetViewUrl(
    store.selectedLocation.lat,
    store.selectedLocation.lng,
    { heading: heading.value, pitch: pitch.value, fov: fov.value }
  )
  store.setStreetViewImage(imageUrl.value)
}

function adjustHeading(delta) {
  heading.value = ((heading.value + delta) % 360 + 360) % 360
  refresh()
}

function adjustPitch(delta) {
  pitch.value = Math.max(-90, Math.min(90, pitch.value + delta))
  refresh()
}

function adjustFov(delta) {
  fov.value = Math.max(20, Math.min(120, fov.value + delta))
  refresh()
}
</script>

<style scoped>
.sv-panel {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 440px;
  z-index: 800;
  padding: 0;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.sv-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}
.sv-title { font-weight: 600; font-size: 13px; color: #111827; }
.sv-coords { flex: 1; font-size: 11px; color: #6b7280; }
.sv-actions { display: flex; gap: 4px; }

.sv-body { padding: 12px; display: flex; flex-direction: column; gap: 12px; background: #ffffff; }

/* Image container — all overlays are positioned inside this */
.sv-image-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1/1;
  background: #f3f4f6;
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sv-image { width: 100%; height: 100%; object-fit: cover; display: block; cursor: grab; user-select: none; }
.sv-image.dragging { cursor: grabbing; }

.sv-placeholder { color: #6b7280; font-size: 13px; text-align: center; padding: 16px; }
.sv-no-coverage { color: #f38ba8; }

/* Arrow nav — 3×3 grid centered bottom-left */
.sv-nav {
  position: absolute;
  bottom: 12px;
  left: 12px;
}
.sv-nav-grid {
  display: grid;
  grid-template-columns: repeat(3, 32px);
  grid-template-rows: repeat(3, 32px);
  gap: 3px;
}
.sv-center-dot {
  background: rgba(255,255,255,0.35);
  border-radius: 50%;
  width: 10px;
  height: 10px;
  margin: auto;
}

/* Zoom buttons — stacked bottom-right */
.sv-zoom {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* Shared arrow button style */
.sv-arrow {
  width: 32px;
  height: 32px;
  padding: 0;
  font-size: 13px;
  line-height: 1;
  background: rgba(255,255,255,0.72);
  color: #1a1a1a;
  border: none;
  border-radius: var(--radius-sm);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s, transform 0.1s;
}
.sv-arrow:hover  { background: rgba(255,255,255,0.92); }
.sv-arrow:active { transform: scale(0.9); }

/* Compass top-right */
.sv-compass {
  position: absolute;
  top: 10px;
  right: 10px;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));
}

.sv-use-btn { width: 100%; }
</style>
