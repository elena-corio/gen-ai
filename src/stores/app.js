import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    sidebarOpen: true,
    selectedLocation: null,   // { lat, lng }
    streetViewImage: null,    // URL string
    streetViewLoading: false,
    comfyResult: null,        // URL string from ComfyUI
    comfyLoading: false,
  }),
  actions: {
    setLocation(lat, lng) {
      this.selectedLocation = { lat, lng }
    },
    setStreetViewImage(url) {
      this.streetViewImage = url
    },
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen
    },
  },
})
