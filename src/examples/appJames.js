// app.js — Main application orchestration

(async () => {

  // ---- INIT ----
  let characters = [];
  window._refImages = { building: null, character: null };

  Panels.init('classic');
  DefaultText.panels.forEach((prompt, i) => {
    Panels.updatePanel(`panel-${i + 1}`, { prompt });
  });
  document.getElementById('storyPrompt').value = DefaultText.story;
  document.getElementById('buildingPrompt').value = DefaultText.building;
  document.getElementById('characterPrompt').value = DefaultText.character;
  loadConfigIntoForm();
  checkConnections();
  initCharacters();
  LoRA.init();
  document.getElementById('fluxModelSelect').addEventListener('change', (e) => {
    const is9b = e.target.value === '9b';
    Config.setAll({
      fluxModel: is9b ? 'flux-2-klein-9b-fp8.safetensors'  : 'flux-2-klein-base-4b-fp8.safetensors',
      clipModel: is9b ? 'qwen_3_8b_fp8mixed.safetensors'   : 'qwen_3_4b_fp8_mixed.safetensors',
    });
  });
  Bubbles.init();

  document.getElementById('addLoraBtn').addEventListener('click', () => LoRA.add());

  // ---- REFERENCE IMAGE GENERATION ----
  document.getElementById('genBuildingBtn').addEventListener('click', async () => {
    const prompt = document.getElementById('buildingPrompt').value.trim()
      || DefaultText.building;
    const preview = document.getElementById('buildingPreview');
    preview.innerHTML = '<div class="ref-preview-loading"><div class="gris-spinner"></div></div>';
    try {
      const url = await ComfyUI.generateReference(prompt, null);
      window._refImages.building = url;
      preview.innerHTML = `<img src="${url}" alt="Building reference" />`;
    } catch(e) {
      preview.innerHTML = '<div class="ref-preview-empty">Error</div>';
      alert('Building generation error: ' + e.message);
    }
  });

  document.getElementById('genCharacterBtn').addEventListener('click', async () => {
    const prompt = document.getElementById('characterPrompt').value.trim()
      || DefaultText.character;
    const preview = document.getElementById('characterPreview');
    preview.innerHTML = '<div class="ref-preview-loading"><div class="gris-spinner"></div></div>';
    try {
      const url = await ComfyUI.generateReference(prompt, null);
      window._refImages.character = url;
      preview.innerHTML = `<img src="${url}" alt="Character reference" />`;
    } catch(e) {
      preview.innerHTML = '<div class="ref-preview-empty">Error</div>';
      alert('Character generation error: ' + e.message);
    }
  });

  // Periodic connection check
  setInterval(checkConnections, 15000);

  // ---- CONNECTION STATUS ----

  async function checkConnections() {
    const comfyDot = document.getElementById('comfyStatus');
    const lmDot    = document.getElementById('lmStatus');
    try {
      const ok = await ComfyUI.ping();
      comfyDot.className = 'status-dot ' + (ok ? 'online' : 'offline');
    } catch { comfyDot.className = 'status-dot offline'; }

    try {
      const ok = await LMStudio.ping();
      lmDot.className = 'status-dot ' + (ok ? 'online' : 'offline');
    } catch { lmDot.className = 'status-dot offline'; }
  }

  // ---- CONFIG MODAL ----

  document.getElementById('configBtn').addEventListener('click', () => {
    loadConfigIntoForm();
    document.getElementById('configModal').style.display = 'flex';
  });

  document.getElementById('closeConfigBtn').addEventListener('click', () => {
    saveConfigFromForm();
    document.getElementById('configModal').style.display = 'none';
  });

  document.getElementById('configModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('configModal')) {
      saveConfigFromForm();
      document.getElementById('configModal').style.display = 'none';
    }
  });

  // Live canvas background preview
  document.getElementById('canvasBgColor')?.addEventListener('input', e => {
    applyCanvasBg(e.target.value);
  });

  document.getElementById('testConnectionsBtn').addEventListener('click', async () => {
    saveConfigFromForm();
    const resultEl = document.getElementById('connectionTestResult');
    resultEl.style.display = 'block';
    resultEl.className = 'connection-result';
    resultEl.textContent = 'Testing…';

    let lines = [];
    try {
      const ok = await ComfyUI.ping();
      lines.push(`ComfyUI: ${ok ? '✓ Connected' : '✗ Not reachable'}`);
    } catch (e) { lines.push(`ComfyUI: ✗ Error — ${e.message}`); }

    try {
      const ok = await LMStudio.ping();
      lines.push(`LM Studio: ${ok ? '✓ Connected' : '✗ Not reachable'}`);
    } catch (e) { lines.push(`LM Studio: ✗ Error — ${e.message}`); }

    resultEl.textContent = lines.join('\n');
    resultEl.className = 'connection-result ' + (lines.every(l => l.includes('✓')) ? 'success' : 'error');
  });

  function applyCanvasBg(color) {
    const page = document.getElementById('comicPage');
    if (page) page.style.background = color;
  }

  function loadConfigIntoForm() {
    const cfg = Config.get();
    document.getElementById('comfyUrl').value  = cfg.comfyUrl;
    document.getElementById('fluxSteps').value = cfg.fluxSteps;
    document.getElementById('fluxCfg').value   = cfg.fluxCfg;
    document.getElementById('imgWidth').value  = cfg.imgWidth;
    document.getElementById('imgHeight').value = cfg.imgHeight;
    document.getElementById('lmUrl').value     = cfg.lmUrl;
    document.getElementById('lmModel').value   = cfg.lmModel;
    document.getElementById('lmTemp').value    = cfg.lmTemp;
    const bgPick = document.getElementById('canvasBgColor');
    if (bgPick) bgPick.value = cfg.canvasBgColor || '#ffffff';
    applyCanvasBg(cfg.canvasBgColor || '#ffffff');
    document.getElementById('fluxModelSelect').value =
      (cfg.fluxModel === 'flux-2-klein-9b-fp8.safetensors') ? '9b' : '4b';
  }

  function saveConfigFromForm() {
    Config.setAll({
      comfyUrl:   document.getElementById('comfyUrl').value.trim(),
      fluxSteps:  parseInt(document.getElementById('fluxSteps').value),
      fluxCfg:    parseFloat(document.getElementById('fluxCfg').value),
      imgWidth:   parseInt(document.getElementById('imgWidth').value),
      imgHeight:  parseInt(document.getElementById('imgHeight').value),
      lmUrl:      document.getElementById('lmUrl').value.trim(),
      lmModel:    document.getElementById('lmModel').value.trim(),
      lmTemp:      parseFloat(document.getElementById('lmTemp').value),
      canvasBgColor: document.getElementById('canvasBgColor')?.value || '#ffffff',
    });
    applyCanvasBg(document.getElementById('canvasBgColor')?.value || '#ffffff');
  }

  

  document.getElementById('applyNarrativeBtn').addEventListener('click', () => {
    const story = window._lastStory;
    if (!story) return;
    Panels.getActive().forEach((panel, i) => {
      const sp = story.panels[i];
      if (!sp) return;
      Panels.updatePanel(panel.id, {
        prompt: sp.scene,
        storyData: sp,
      });
    });
    // Select first panel
    const first = Panels.getActive()[0];
    if (first) Panels.selectPanel(first.id);
  });


  // ---- PANEL EDITOR EVENTS ----

  document.getElementById('panelPrompt').addEventListener('input', (e) => {
    const p = Panels.getSelected();
    if (!p) return;
    Panels.updatePanel(p.id, { expandedPrompt: e.target.value });
  });

  document.getElementById('panelNotes').addEventListener('input', (e) => {
    const p = Panels.getSelected();
    if (!p) return;
    Panels.updatePanel(p.id, { notes: e.target.value });
  });

  // Expand prompt with LLM
  document.getElementById('expandPromptBtn').addEventListener('click', async () => {
    const p = Panels.getSelected();
    if (!p) return;
    const panelPromptEl = document.getElementById('panelPrompt');
    const rawPrompt = panelPromptEl.value.trim() || DefaultText.panel;

    showLoading('Expanding prompt…');
    try {
      const style = getStyleLabel();
      const context = p.storyData ? p.storyData.dialogue_hint : '';
      const expanded = await LMStudio.expandImagePrompt(rawPrompt, style, context);
      Panels.updatePanel(p.id, { expandedPrompt: expanded });
      document.getElementById('panelPrompt').value = expanded;
    } catch(e) {
      alert('LM Studio error: ' + e.message);
    } finally {
      hideLoading();
    }
  });

  // Generate single panel image
  document.getElementById('generatePanelBtn').addEventListener('click', async () => {
    const p = Panels.getSelected();
    if (!p) return;
    await generatePanelImage(p.id);
  });

  document.getElementById('regeneratePanelBtn').addEventListener('click', async () => {
    const p = Panels.getSelected();
    if (!p) return;
    await generatePanelImage(p.id);
  });

  document.getElementById('clearPanelBtn').addEventListener('click', () => {
    const p = Panels.getSelected();
    if (!p) return;
    Panels.updatePanel(p.id, { prompt: '', expandedPrompt: '', imageUrl: null, bubbles: [], status: 'empty', storyData: null });
    document.getElementById('panelPrompt').value = '';
  });

  async function generatePanelImage(panelId, useRef) {
    const panel = Panels.getPanel(panelId);
    if (!panel) return;

    const prompt = panel.expandedPrompt || panel.prompt || (Panels.getSelected()?.id === panelId ? DefaultText.panel : '');
    if (!prompt) { alert(`Panel ${panel.number}: select the panel and add a prompt first.`); return; }

    Panels.updatePanel(panelId, { status: 'loading' });

    try {
      const useBuilding  = document.getElementById('useBuildingImage')?.checked;
      const useCharacter = document.getElementById('useCharacterImage')?.checked;
      const buildingUrl  = useBuilding  ? window._refImages?.building  : null;
      const characterUrl = useCharacter ? window._refImages?.character : null;
      console.log(`[Panel ${panel.number}] generating — prompt: "${prompt.slice(0,60)}…"`);
      console.log(`[Panel ${panel.number}] useBuilding=${useBuilding} buildingUrl=${buildingUrl}`);
      console.log(`[Panel ${panel.number}] useCharacter=${useCharacter} characterUrl=${characterUrl}`);
      const imgUrl = await ComfyUI.generateImage(prompt, (pct) => {
        Panels.setProgress(panelId, pct);
      }, buildingUrl, characterUrl);
      Panels.updatePanel(panelId, { status: 'generated', imageUrl: imgUrl });
    } catch(e) {
      Panels.updatePanel(panelId, { status: 'error' });
      alert(`ComfyUI error on Panel ${panel.number}: ${e.message}`);
    }
  }
  

  // ---- EXPORT ----

  document.getElementById('exportBtn').addEventListener('click', exportComic);

  function exportComic() {
    const page = document.getElementById('comicPage');
    const bubbleCanvas = document.getElementById('bubbleCanvas');
    
    Bubbles.hideControls();
    const wasSelected = Panels.getSelected()?.id || null;
    Panels.selectPanel(null);
    document.getElementById('loadingOverlay').style.display = 'none';

    // Move bubbleCanvas inside page
    const bubbleParent = bubbleCanvas.parentElement;
    const bubbleNextSibling = bubbleCanvas.nextSibling;
    const pageRect = page.getBoundingClientRect();
    bubbleCanvas.style.position = 'absolute';
    bubbleCanvas.style.left = '0';
    bubbleCanvas.style.top = '0';
    bubbleCanvas.style.width = '100%';
    bubbleCanvas.style.height = '100%';
    bubbleCanvas.style.transform = 'none';
    bubbleCanvas.style.overflow = 'visible';
    page.style.overflow = 'visible';
    page.appendChild(bubbleCanvas);

    const restore = () => {
      if (wasSelected) Panels.selectPanel(wasSelected);
      page.style.overflow = 'hidden';
      bubbleCanvas.style.position = 'fixed';
      bubbleCanvas.style.overflow = 'visible';
      Bubbles.renderAll();
      bubbleParent.insertBefore(bubbleCanvas, bubbleNextSibling);
      Bubbles.showControls();
    };

    setTimeout(() => {
      domtoimage.toPng(page, { 
        quality: 1,
        width: page.offsetWidth * 5,
        height: page.offsetHeight * 5,
        style: { transform: 'scale(5)', transformOrigin: 'top left' }
      })
      .then(dataUrl => {
        restore();
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'architectural-comics.png';
        a.click();
      })
      .catch(e => {
        restore();
        alert('Export error: ' + e.message);
      });
    }, 150);
  }

  function drawBubblesOnCanvas(ctx, panel, px, py, pw, ph) {
    panel.bubbles.forEach(b => {
      const bx = px + (b.x / 100) * pw;
      const by = py + (b.y / 100) * ph;
      const bw = (b.w / 100) * pw;
      const bh = (b.h / 100) * ph;

      ctx.save();
      ctx.fillStyle = b.type === 'shout' ? '#f5c842' : 'white';
      ctx.strokeStyle = '#1a1008';
      ctx.lineWidth = 2.5;

      if (b.type === 'caption') {
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
      } else {
        ctx.beginPath();
        ctx.ellipse(bx + bw/2, by + bh * 0.45, bw/2 * 0.95, bh * 0.43, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (b.type === 'speech') {
          ctx.beginPath();
          ctx.moveTo(bx + bw * 0.35, by + bh * 0.8);
          ctx.lineTo(bx + bw * 0.2, by + bh);
          ctx.lineTo(bx + bw * 0.55, by + bh * 0.8);
          ctx.fillStyle = 'white';
          ctx.fill();
          ctx.stroke();
        }
      }

      if (b.text) {
        ctx.fillStyle = '#1a1008';
        const fs = Math.max(10, Math.min(bw / 8, bh / 4, 16));
        ctx.font = `bold ${fs}px Bangers, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        wrapText(ctx, b.text, bx + bw / 2, by + bh * 0.42, bw * 0.85, fs * 1.3);
      }

      ctx.restore();
    });
  }

  function wrapText(ctx, text, cx, cy, maxW, lineH) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line); line = w;
      } else { line = test; }
    }
    if (line) lines.push(line);
    const totalH = lines.length * lineH;
    lines.forEach((l, i) => {
      ctx.fillText(l, cx, cy - totalH/2 + i * lineH + lineH/2);
    });
  }

  function downloadCanvas(canvas) {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'comicforge-page.png';
    a.click();
  }

  // ---- LOADING ----

  function showLoading(msg) {
    document.getElementById('loadingMsg').textContent = msg || 'Working…';
    document.getElementById('loadingOverlay').style.display = 'flex';
  }

  function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
  }

  // ---- CANVAS ZOOM ----
  const comicPage = document.getElementById('comicPage');
  let canvasScale = 1;

  document.getElementById('zoomInBtn').addEventListener('click', () => {
    canvasScale = Math.min(3, canvasScale + 0.15);
    window._canvasScale = canvasScale;
    comicPage.style.transform = `scale(${canvasScale})`;
    comicPage.style.transformOrigin = 'top center';
    Bubbles.renderAll();
  });

  document.getElementById('zoomOutBtn').addEventListener('click', () => {
    canvasScale = Math.max(0.3, canvasScale - 0.15);
    window._canvasScale = canvasScale;
    comicPage.style.transform = `scale(${canvasScale})`;
    comicPage.style.transformOrigin = 'top center';
    Bubbles.renderAll();
  });

  document.getElementById('zoomResetBtn').addEventListener('click', () => {
    canvasScale = 1;
    window._canvasScale = 1;
    comicPage.style.transform = 'scale(1)';
    Bubbles.renderAll();
  });

})();