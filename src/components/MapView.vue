<template>
  <div ref="mapEl" class="map-container" />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useAppStore } from '../stores/app.js'

// Fix Leaflet's default marker icon paths broken by Vite bundling
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const store = useAppStore()
const mapEl = ref(null)
let map = null
let marker = null

onMounted(() => {
  map = L.map(mapEl.value, {
    center: [48.8566, 2.3522], // Paris as default
    zoom: 13,
    zoomControl: false,        // we'll add a custom toolbar later
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map)

  map.on('click', (e) => {
    const { lat, lng } = e.latlng
    store.setLocation(lat, lng)

    if (marker) {
      marker.setLatLng(e.latlng)
    } else {
      marker = L.marker(e.latlng).addTo(map)
    }

    marker.bindPopup(`${lat.toFixed(5)}, ${lng.toFixed(5)}`).openPopup()
  })
})

onUnmounted(() => {
  if (map) map.remove()
})

// Expose flyTo so parent can call it after a search result
function flyTo(lat, lng, zoom = 15) {
  map?.flyTo([lat, lng], zoom)
}
defineExpose({ flyTo })
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
}
</style>
