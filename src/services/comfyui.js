import axios from 'axios'

const COMFYUI_BASE = import.meta.env.VITE_COMFYUI_URL || 'http://127.0.0.1:8188'

/**
 * Queue a prompt on ComfyUI and return the prompt_id.
 * @param {object} workflow  - ComfyUI API workflow JSON
 * @returns {Promise<string>} prompt_id
 */
export async function queuePrompt(workflow) {
  const response = await axios.post(`${COMFYUI_BASE}/prompt`, {
    prompt: workflow,
  })
  return response.data.prompt_id
}

/**
 * Poll until the prompt is done, then return the first output image URL.
 * @param {string} promptId
 * @param {number} intervalMs
 * @returns {Promise<string>} full URL to the output image
 */
export async function waitForResult(promptId, intervalMs = 1000) {
  while (true) {
    const { data } = await axios.get(`${COMFYUI_BASE}/history/${promptId}`)
    if (data[promptId]) {
      const outputs = data[promptId].outputs
      for (const nodeId of Object.keys(outputs)) {
        const images = outputs[nodeId].images
        if (images && images.length > 0) {
          const img = images[0]
          return `${COMFYUI_BASE}/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`
        }
      }
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
}

/**
 * Build a minimal img2img + LoRA workflow stub.
 * Replace node IDs to match your actual ComfyUI workflow export.
 * @param {string} imageUrl  - source image URL (street view JPEG)
 * @param {string} loraName  - LoRA filename as known by ComfyUI
 * @param {string} prompt    - positive text prompt
 */
export function buildWorkflow(imageUrl, loraName, prompt) {
  // This is a placeholder structure — export your real workflow from ComfyUI
  // and replace the contents of this function.
  return {
    "1": {
      "class_type": "LoadImageFromURL",
      "inputs": { "url": imageUrl }
    },
    "2": {
      "class_type": "LoraLoader",
      "inputs": { "lora_name": loraName, "strength_model": 0.8, "strength_clip": 0.8, "model": ["3", 0], "clip": ["3", 1] }
    },
    "3": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": { "ckpt_name": "v1-5-pruned-emaonly.ckpt" }
    },
    "4": {
      "class_type": "CLIPTextEncode",
      "inputs": { "text": prompt, "clip": ["2", 1] }
    },
    "5": {
      "class_type": "CLIPTextEncode",
      "inputs": { "text": "blurry, low quality", "clip": ["2", 1] }
    },
    "6": {
      "class_type": "KSampler",
      "inputs": {
        "model": ["2", 0], "positive": ["4", 0], "negative": ["5", 0],
        "latent_image": ["1", 0], "seed": 42, "steps": 20,
        "cfg": 7, "sampler_name": "euler", "scheduler": "normal", "denoise": 0.75
      }
    },
    "7": {
      "class_type": "VAEDecode",
      "inputs": { "samples": ["6", 0], "vae": ["3", 2] }
    },
    "8": {
      "class_type": "SaveImage",
      "inputs": { "images": ["7", 0], "filename_prefix": "genai_" }
    }
  }
}
