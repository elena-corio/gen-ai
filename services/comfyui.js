import inpaintingTemplate from '../FLUX1_inpainting.json'
import imageTemplate from '../FLUX2_image.json'

// Proxied through Vite's /comfyui → http://127.0.0.1:8188
const BASE = '/comfyui'

export async function generateImage(svImageUrl, seed, onProgress) {
  const filename = await uploadImage(svImageUrl)

  // Step 1: inpainting — SAM3 segments cars/asphalt and fills with prompt style
  const inpaintedUrl = await runInpainting(filename, seed, p => onProgress?.(p * 0.5))

  // Step 2: depth-conditioned stylisation on the inpainted result
  const final = await runImageWorkflow(inpaintedUrl, seed, p => onProgress?.(50 + p * 0.5))
  return { inpainted: inpaintedUrl, final }
}

async function runInpainting(filename, seed, onProgress) {
  const workflow = structuredClone(inpaintingTemplate)
  workflow['952'].inputs.image = filename
  workflow['1224'].inputs.value = seed

  const promptId = await queuePrompt(workflow)
  return pollForImage(promptId, '947', onProgress)
}

async function runImageWorkflow(inpaintedUrl, seed, onProgress) {
  const workflow = structuredClone(imageTemplate)
  workflow['556'].inputs.value = seed

  const filename = await uploadImage(inpaintedUrl)
  workflow['434'].inputs.image = filename

  const promptId = await queuePrompt(workflow)
  return pollForImage(promptId, '432', onProgress)
}

async function uploadImage(source) {
  let blob
  if (source instanceof Blob) {
    blob = source
  } else {
    const resp = await fetch(source)
    if (!resp.ok) throw new Error(`Failed to fetch street view image: ${resp.status}`)
    blob = await resp.blob()
  }

  const form = new FormData()
  form.append('image', blob, `input_${Date.now()}.jpg`)
  form.append('type', 'input')
  form.append('overwrite', 'true')

  let up
  try {
    up = await fetch(`${BASE}/upload/image`, { method: 'POST', body: form })
  } catch (e) {
    throw new Error(`Upload request failed (is ComfyUI running on :8188?): ${e.message}`)
  }
  if (!up.ok) {
    const txt = await up.text().catch(() => '')
    throw new Error(`ComfyUI upload failed ${up.status}: ${txt}`)
  }
  return (await up.json()).name
}

async function queuePrompt(workflow) {
  const resp = await fetch(`${BASE}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`ComfyUI queue error: ${resp.status} — ${txt}`)
  }
  return (await resp.json()).prompt_id
}

async function pollForImage(promptId, saveNodeId, onProgress) {
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 1000))
    const resp = await fetch(`${BASE}/history/${promptId}`)
    if (!resp.ok) continue

    const history = await resp.json()
    if (history[promptId]) {
      const images = history[promptId].outputs?.[saveNodeId]?.images
      if (images?.length > 0) {
        const img = images[0]
        onProgress?.(100)
        return `${BASE}/view?filename=${encodeURIComponent(img.filename)}&type=${img.type}&subfolder=${img.subfolder || ''}`
      }
    }
    onProgress?.(Math.min(90, (i / 30) * 100))
  }
  throw new Error('ComfyUI timed out')
}

export async function ping() {
  const resp = await fetch(`${BASE}/system_stats`, { signal: AbortSignal.timeout(3000) })
  return resp.ok
}
