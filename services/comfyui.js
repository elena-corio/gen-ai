import workflowTemplate from '../FLUX1_image.json'

// Proxied through Vite's /comfyui → http://127.0.0.1:8188
const BASE = '/comfyui'

export async function generateImage(svImageUrl, prompt, onProgress) {
  const workflow = structuredClone(workflowTemplate)

  workflow['807'].inputs.value = prompt
  workflow['945'].inputs.value = Math.floor(Math.random() * 2 ** 32)

  const filename = await uploadImage(svImageUrl)
  workflow['805'].inputs.image = filename

  const promptId = await queuePrompt(workflow)
  return pollForImage(promptId, onProgress)
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

async function pollForImage(promptId, onProgress) {
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 1000))
    const resp = await fetch(`${BASE}/history/${promptId}`)
    if (!resp.ok) continue

    const history = await resp.json()
    if (history[promptId]) {
      const outputs = history[promptId].outputs
      for (const nodeId in outputs) {
        const images = outputs[nodeId].images
        if (images?.length > 0) {
          const img = images[0]
          onProgress?.(100)
          return `${BASE}/view?filename=${encodeURIComponent(img.filename)}&type=${img.type}&subfolder=${img.subfolder || ''}`
        }
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
