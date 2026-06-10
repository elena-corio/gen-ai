// config.js — Persistent configuration via localStorage

const Config = (() => {
  const DEFAULTS = {
    comfyUrl:   'http://127.0.0.1:8188',
    fluxModel:  'flux-2-klein-base-4b-fp8.safetensors',
    clipModel:  'qwen_3_4b_fp8_mixed.safetensors',
    vaeModel:   'flux2-vae.safetensors',
    fluxSteps:  20,
    fluxCfg:    1,
    imgWidth:   1024,
    imgHeight:  1024,
    lmUrl:      'http://127.0.0.1:1234',
    lmModel:    'local-model',
    lmTemp:     0.8,
  };

  function load() {
    try {
      const stored = localStorage.getItem('comicforge_config');
      return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : { ...DEFAULTS };
    } catch { return { ...DEFAULTS }; }
  }

  function save(cfg) {
    localStorage.setItem('comicforge_config', JSON.stringify(cfg));
  }

  function get() { return load(); }
  function set(key, val) { const cfg = load(); cfg[key] = val; save(cfg); }
  function setAll(obj) { save({ ...load(), ...obj }); }

  return { get, set, setAll, DEFAULTS };
})();
