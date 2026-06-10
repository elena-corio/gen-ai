<script setup>
import AppHeader from './components/AppHeader.vue'
import MapView from './components/MapView.vue'
import StreetViewPanel from './components/StreetViewPanel.vue'

function onUseImage(url) {
  // will wire to ComfyUI panel later
  console.log('Street View image selected:', url)
}
</script>

<template>
  <AppHeader />
  <main class="app-main">
    <MapView />
    <StreetViewPanel @use-image="onUseImage" />
  </main>
</template>

<style>
.app-main {
  position: fixed;
  top: 48px;
  left: 0;
  right: 0;
  bottom: 0;
}
</style>
