<script setup>
import AppHeader from './components/AppHeader.vue'
import MapView from './components/MapView.vue'
</script>

<template>
  <AppHeader />
  <main class="app-main">
    <MapView />
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
