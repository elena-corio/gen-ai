<template>
  <header class="app-header">
    <button class="btn-icon sidebar-toggle" @click="store.toggleSidebar()" title="Toggle sidebar">
      ☰
    </button>
    <span class="app-title">Vitruviews</span>
    <div class="header-spacer" />
  </header>
</template>

<script setup>
import { useAppStore } from '../stores/app.js'
const store = useAppStore()
</script>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  background: #ffffff;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 12px;
  z-index: 1000;
  box-shadow: var(--shadow-sm);
  border-bottom: 1px solid var(--color-border);
}

.app-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-accent);
  letter-spacing: -0.02em;
}

.header-spacer {
  flex: 1;
}
</style>
