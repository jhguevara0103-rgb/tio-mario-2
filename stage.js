/**
 * stage.js - Estudio de Composición de Escenas Web con Recorte Manual (Alt) y Audio Nativo
 */

export function initStage({ streamBroadcaster, getLocalStream }) {
  const canvas = document.querySelector('#stage-canvas');
  const overlay = document.querySelector('#stage-interactive-overlay');
  const wrapper = document.querySelector('#stage-wrapper');
  if (!canvas || !overlay || !wrapper) return null;

  const ctx = canvas.getContext('2d', { alpha: false });
  const VIRTUAL_W = 1080;
  const VIRTUAL_H = 1920;

  // Controles
  const broadcastToggle = document.querySelector('#stage-broadcast-toggle');
  const broadcastLabel = document.querySelector('#stage-broadcast-label');
  const resetBtn = document.querySelector('#stage-reset-btn');

  // Capas
  const layersListEl = document.querySelector('#stage-layers-list');
  const btnAddSource = document.querySelector('#stage-btn-add-source');
  const layerFitBtn = document.querySelector('#stage-layer-fit');
  const layerCenterBtn = document.querySelector('#stage-layer-center');
  const layerUpBtn = document.querySelector('#stage-layer-up');
  const layerDownBtn = document.querySelector('#stage-layer-down');
  const layerDupBtn = document.querySelector('#stage-layer-dup');
  const layerDelBtn = document.querySelector('#stage-layer-del');

  // Modal selector de fuentes
  const modalBackdrop = document.querySelector('#stage-source-modal');
  const modalCloseBtn = document.querySelector('#stage-source-modal-close');
  const modalCancelBtn = document.querySelector('#stage-source-modal-cancel');
  const modalAddScreen = document.querySelector('#modal-add-screen');
  const modalAddMic = document.querySelector('#modal-add-mic');
  const modalAddLogo = document.querySelector('#modal-add-logo');
  const modalAddFrame = document.querySelector('#modal-add-frame');
  const modalAddText = document.querySelector('#modal-add-text');
  const modalAddBanners = document.querySelector('#modal-add-banners');
  const modalUploadInput = document.querySelector('#stage-modal-upload-input');

  // Modal selector de Banners de Jugador y Fondos Temáticos
  const bannersModalBackdrop = document.querySelector('#stage-banners-modal');
  const bannersModalCloseBtn = document.querySelector('#stage-banners-modal-close');
  const bannersModalCancelBtn = document.querySelector('#stage-banners-modal-cancel');

  // Modal selector de micrófono / dispositivo de audio
  const micModalBackdrop = document.querySelector('#stage-mic-modal');
  const micModalCloseBtn = document.querySelector('#stage-mic-modal-close');
  const micModalCancelBtn = document.querySelector('#stage-mic-modal-cancel');
  const micSelect = document.querySelector('#stage-mic-select');
  const micStatusText = document.querySelector('#stage-mic-status-text');
  const micConfirmBtn = document.querySelector('#stage-mic-confirm-btn');

  // Modal selector de Clave Croma (Chroma Key)
  const chromaModalBackdrop = document.querySelector('#stage-chroma-modal');
  const chromaCloseBtn = document.querySelector('#stage-chroma-close');
  const chromaCancelBtn = document.querySelector('#stage-chroma-cancel');
  const chromaApplyBtn = document.querySelector('#stage-chroma-apply');
  const chromaEnableToggle = document.querySelector('#chroma-enable-toggle');
  const chromaColorPicker = document.querySelector('#chroma-color-picker');
  const chromaHexInput = document.querySelector('#chroma-hex-input');
  const chromaToleranceSlider = document.querySelector('#chroma-tolerance-slider');
  const chromaToleranceVal = document.querySelector('#chroma-tolerance-val');
  const chromaSoftnessSlider = document.querySelector('#chroma-softness-slider');
  const chromaSoftnessVal = document.querySelector('#chroma-softness-val');
  let currentChromaLayer = null;

  // Canvas y contexto offscreen para procesamiento en tiempo real de Clave Croma
  const chromaCanvas = document.createElement('canvas');
  const chromaCtx = chromaCanvas.getContext('2d', { willReadFrequently: true });

  function hexToRgb(hex) {
    let c = (hex || '#00ff00').replace('#', '').trim();
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    const num = parseInt(c, 16) || 0;
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  // Indicadores
  const guideX = document.querySelector('#stage-guide-x');
  const guideY = document.querySelector('#stage-guide-y');
  const selectedNameEl = document.querySelector('#stage-selected-name');
  const selectedCoordsEl = document.querySelector('#stage-selected-coords');

  let isStageBroadcasting = false;
  let stageStream = null;
  let selectedLayerId = null;
  let isAltKeyPressed = false;
  let isStageEditable = true;

  // Detección global de tecla Alt para modo recorte
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt' || e.altKey) {
      isAltKeyPressed = true;
      updateCropVisualState();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' || !e.altKey) {
      isAltKeyPressed = false;
      updateCropVisualState();
    }
  });

  function updateCropVisualState() {
    const activeBox = overlay.querySelector('.stage-layer-box.is-selected');
    if (!activeBox) return;
    activeBox.classList.toggle('is-cropping', isAltKeyPressed);
  }

  // Mezclador de audio nativo (Web Audio API)
  let audioCtx = null;
  let audioDestinationNode = null;
  const activeAudioSourceNodes = new Map();

  function initAudioMixer() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      audioCtx = new AudioContextClass();
      audioDestinationNode = audioCtx.createMediaStreamDestination();
    } catch (e) {
      console.warn('No se pudo inicializar AudioContext para Stage:', e);
    }
  }

  function updateAudioMixerConnections() {
    if (!audioCtx || !audioDestinationNode) return;

    layers.forEach((layer) => {
      const hasAudioTrack = Boolean(layer.stream && layer.stream.getAudioTracks().length > 0);
      if (hasAudioTrack && layer.hasAudio) {
        let entry = activeAudioSourceNodes.get(layer.id);
        const targetVol = (layer.visible && !layer.muted) ? (layer.volume !== undefined ? layer.volume : 1.0) : 0;

        if (!entry) {
          try {
            const sourceNode = audioCtx.createMediaStreamSource(layer.stream);
            const gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(targetVol, audioCtx.currentTime);
            sourceNode.connect(gainNode);
            gainNode.connect(audioDestinationNode);
            entry = { sourceNode, gainNode };
            activeAudioSourceNodes.set(layer.id, entry);
          } catch (e) {
            console.warn(`No se pudo conectar audio de capa ${layer.id}:`, e);
          }
        } else {
          try {
            entry.gainNode.gain.setValueAtTime(targetVol, audioCtx.currentTime);
          } catch (_) {}
        }
      } else {
        if (activeAudioSourceNodes.has(layer.id)) {
          const entry = activeAudioSourceNodes.get(layer.id);
          try {
            if (entry.gainNode) entry.gainNode.disconnect();
            if (entry.sourceNode) entry.sourceNode.disconnect();
          } catch (_) {}
          activeAudioSourceNodes.delete(layer.id);
        }
      }
    });

    const localStream = getLocalStream ? getLocalStream() : null;
    if (localStream && localStream.getAudioTracks().length > 0) {
      if (!activeAudioSourceNodes.has('master-local-camera')) {
        try {
          const camNode = audioCtx.createMediaStreamSource(localStream);
          const camGain = audioCtx.createGain();
          camGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
          camNode.connect(camGain);
          camGain.connect(audioDestinationNode);
          activeAudioSourceNodes.set('master-local-camera', { sourceNode: camNode, gainNode: camGain });
        } catch (_) {}
      }
    } else {
      if (activeAudioSourceNodes.has('master-local-camera')) {
        try {
          const entry = activeAudioSourceNodes.get('master-local-camera');
          if (entry?.gainNode) entry.gainNode.disconnect();
          if (entry?.sourceNode) entry.sourceNode.disconnect();
        } catch (_) {}
        activeAudioSourceNodes.delete('master-local-camera');
      }
    }
  }

  // Cache de imágenes
  const imageCache = new Map();
  function preloadImage(url) {
    if (!url) return null;
    if (imageCache.has(url)) return imageCache.get(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    imageCache.set(url, img);
    return img;
  }

  preloadImage('./media/logo-el-tio-mario.png');
  preloadImage('./media/fondo-escenario-mario.jpg');
  preloadImage('./media/banner-jugador-amarillo.png');
  preloadImage('./media/banner-jugador-rojo.png');
  preloadImage('./media/banner-jugador-verde.png');
  preloadImage('./media/banner-jugador-celeste.png');
  preloadImage('./media/banner-jugador-morado.png');
  preloadImage('./media/banner-jugador-naranja.png');

  // Capas iniciales del escenario
  let layers = [
    {
      id: 'layer-welcome-bg',
      name: '🖼️ Fondo del Escenario',
      type: 'image',
      src: './media/fondo-escenario-mario.jpg',
      x: 0,
      y: 0,
      width: 1080,
      height: 1920,
      cropLeft: 0,
      cropRight: 0,
      cropTop: 0,
      cropBottom: 0,
      zIndex: 1,
      visible: true,
      locked: false,
      opacity: 0.95
    },
    {
      id: 'layer-logo',
      name: '🏷️ Logo El Tío Mario',
      type: 'image',
      src: './media/logo-el-tio-mario.png',
      x: 290,
      y: 80,
      width: 500,
      height: 180,
      cropLeft: 0,
      cropRight: 0,
      cropTop: 0,
      cropBottom: 0,
      zIndex: 2,
      visible: true,
      locked: false,
      opacity: 1
    }
  ];

  function getScale() {
    const rect = wrapper.getBoundingClientRect();
    return {
      scaleX: VIRTUAL_W / (rect.width || 1),
      scaleY: VIRTUAL_H / (rect.height || 1),
      width: rect.width,
      height: rect.height
    };
  }

  function getSelectedLayer() {
    return layers.find((l) => l.id === selectedLayerId) || null;
  }

  function processChromaKey(offCtx, w, h, layer) {
    if (w <= 0 || h <= 0) return;
    try {
      const imgData = offCtx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const rgb = hexToRgb(layer.chromaColor || '#00ff00');
      const tol = ((Number(layer.chromaTolerance ?? 35)) / 100) * 440;
      const soft = ((Number(layer.chromaSoftness ?? 12)) / 100) * 200;

      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const dr = r - rgb.r;
        const dg = g - rgb.g;
        const db = b - rgb.b;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);

        if (dist < tol) {
          data[i + 3] = 0;
        } else if (dist < tol + soft && soft > 0) {
          const factor = (dist - tol) / soft;
          data[i + 3] = Math.round(a * factor);
        }
      }
      offCtx.putImageData(imgData, 0, 0);
    } catch (_) {}
  }

  // ============================================================================
  // RENDER LOOP DEL CANVAS (60 FPS) CON ESCALADO, RECORTE Y CLAVE CROMA
  // ============================================================================
  function renderCanvas() {
    ctx.fillStyle = '#06090d';
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

    const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);

    for (const layer of sorted) {
      if (!layer.visible) continue;
      if (layer.type === 'mic') continue; // Las fuentes de micrófono solo procesan audio en el mixer
      ctx.save();
      ctx.globalAlpha = layer.opacity ?? 1;

      const cL = Math.max(0, Math.min(0.95, Number(layer.cropLeft || 0)));
      const cR = Math.max(0, Math.min(0.95 - cL, Number(layer.cropRight || 0)));
      const cT = Math.max(0, Math.min(0.95, Number(layer.cropTop || 0)));
      const cB = Math.max(0, Math.min(0.95 - cT, Number(layer.cropBottom || 0)));

      const dx = layer.x;
      const dy = layer.y;
      const dw = Math.max(1, layer.width);
      const dh = Math.max(1, layer.height);
      const useChroma = Boolean(layer.chromaKey);

      if (layer.type === 'screen' || layer.type === 'video' || layer.type === 'obs') {
        const videoEl = layer.videoEl;
        if (videoEl && videoEl.readyState >= 2) {
          const vw = videoEl.videoWidth || 1920;
          const vh = videoEl.videoHeight || 1080;

          const sx = cL * vw;
          const sy = cT * vh;
          const sw = Math.max(1, (1 - cL - cR) * vw);
          const sh = Math.max(1, (1 - cT - cB) * vh);

          if (useChroma) {
            chromaCanvas.width = dw;
            chromaCanvas.height = dh;
            chromaCtx.clearRect(0, 0, dw, dh);
            chromaCtx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, dw, dh);
            processChromaKey(chromaCtx, dw, dh, layer);
            ctx.drawImage(chromaCanvas, dx, dy);
          } else {
            ctx.drawImage(videoEl, sx, sy, sw, sh, dx, dy, dw, dh);
          }
        } else {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(dx, dy, dw, dh);
          ctx.fillStyle = '#94a3b8';
          ctx.font = 'bold 28px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(layer.name, dx + dw / 2, dy + dh / 2);
        }
      } else if (layer.type === 'image' || layer.type === 'frame') {
        const img = preloadImage(layer.src);
        if (img && img.complete && img.naturalWidth > 0) {
          const nw = img.naturalWidth;
          const nh = img.naturalHeight;

          const sx = cL * nw;
          const sy = cT * nh;
          const sw = Math.max(1, (1 - cL - cR) * nw);
          const sh = Math.max(1, (1 - cT - cB) * nh);

          if (useChroma) {
            chromaCanvas.width = dw;
            chromaCanvas.height = dh;
            chromaCtx.clearRect(0, 0, dw, dh);
            chromaCtx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
            processChromaKey(chromaCtx, dw, dh, layer);
            ctx.drawImage(chromaCanvas, dx, dy);
          } else {
            ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
          }
        }
      } else if (layer.type === 'text') {
        ctx.fillStyle = layer.bgColor || '#e52521';
        ctx.beginPath();
        ctx.roundRect(dx, dy, dw, dh, 14);
        ctx.fill();

        ctx.fillStyle = layer.textColor || '#ffffff';
        ctx.font = `900 ${layer.fontSize || 36}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 8;
        ctx.fillText(layer.text || '', dx + dw / 2, dy + dh / 2);
      }

      ctx.restore();
    }

    requestAnimationFrame(renderCanvas);
  }

  requestAnimationFrame(renderCanvas);

  // ============================================================================
  // AJUSTES RÁPIDOS AL ESCENARIO: FIT (AJUSTAR) Y CENTER (CENTRAR)
  // ============================================================================
  function fitLayerToScene(layer) {
    if (!layer || layer.locked || layer.type === 'mic') return;
    const currentW = Math.max(1, layer.width);
    const currentH = Math.max(1, layer.height);
    const aspect = currentW / currentH;
    const stageAspect = VIRTUAL_W / VIRTUAL_H; // 1080 / 1920 = 0.5625

    let newW, newH;
    if (aspect > stageAspect) {
      newW = VIRTUAL_W;
      newH = Math.round(VIRTUAL_W / aspect);
    } else {
      newH = VIRTUAL_H;
      newW = Math.round(VIRTUAL_H * aspect);
    }

    layer.width = newW;
    layer.height = newH;
    layer.x = Math.round((VIRTUAL_W - newW) / 2);
    layer.y = Math.round((VIRTUAL_H - newH) / 2);

    updateOverlay();
    updateFooterInfo();
  }

  function centerLayerInScene(layer) {
    if (!layer || layer.locked || layer.type === 'mic') return;
    layer.x = Math.round((VIRTUAL_W - layer.width) / 2);
    layer.y = Math.round((VIRTUAL_H - layer.height) / 2);

    updateOverlay();
    updateFooterInfo();
  }

  if (layerFitBtn) {
    layerFitBtn.addEventListener('click', () => {
      fitLayerToScene(getSelectedLayer());
    });
  }

  if (layerCenterBtn) {
    layerCenterBtn.addEventListener('click', () => {
      centerLayerInScene(getSelectedLayer());
    });
  }

  // ============================================================================
  // OVERLAY INTERACTIVO: SELECCIÓN, ARRASTRE, REDIMENSIÓN Y RECORTE CON ALT
  // ============================================================================
  function updateOverlay() {
    overlay.replaceChildren();
    if (!isStageEditable) {
      return;
    }
    const scale = getScale();

    layers.forEach((layer) => {
      if (!layer.visible) return;
      if (layer.type === 'mic') return; // Capas de solo audio
      const isSelected = layer.id === selectedLayerId;
      const box = document.createElement('div');
      box.className = `stage-layer-box${isSelected ? ' is-selected' : ''}${layer.locked ? ' is-locked' : ''}${isSelected && isAltKeyPressed ? ' is-cropping' : ''}`;
      box.dataset.layerId = layer.id;

      const left = layer.x / scale.scaleX;
      const top = layer.y / scale.scaleY;
      const width = Math.max(20, layer.width) / scale.scaleX;
      const height = Math.max(20, layer.height) / scale.scaleY;

      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;

      box.addEventListener('pointerdown', (e) => {
        if (e.target.classList.contains('stage-handle') || e.target.closest('.stage-floating-toolbar')) return;
        e.stopPropagation();
        selectedLayerId = layer.id;
        updateOverlay();
        renderLayersList();
        updateFooterInfo();
        if (layer.locked) return;
        startDrag(e, layer);
      });

      if (isSelected && !layer.locked) {
        // Barra flotante de controles rápidos directamente sobre la fuente seleccionada
        const floatToolbar = document.createElement('div');
        floatToolbar.className = 'stage-floating-toolbar';
        floatToolbar.innerHTML = `
          <button type="button" class="stage-floating-btn" data-act="fit" title="Ajustar al tamaño de la escena">⛶</button>
          <button type="button" class="stage-floating-btn" data-act="center" title="Centrar en la escena">✛</button>
        `;

        floatToolbar.querySelector('[data-act="fit"]').addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          fitLayerToScene(layer);
        });

        floatToolbar.querySelector('[data-act="center"]').addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          centerLayerInScene(layer);
        });

        box.append(floatToolbar);

        // 8 Puntos de control (esquinas y laterales) para redimensión y recorte con Alt
        ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach((dir) => {
          const handle = document.createElement('div');
          handle.className = `stage-handle ${dir}`;
          handle.dataset.dir = dir;
          handle.title = 'Arrastra para redimensionar (Mantén presionado Alt para recortar)';
          handle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            startResizeOrCrop(e, layer, dir);
          });
          box.append(handle);
        });
      }

      overlay.append(box);
    });

    renderLayersList();
    updateFooterInfo();
    updateLayerToolButtons();
  }

  // ============================================================================
  // ARRASTRE LIBRE (DRAG)
  // ============================================================================
  function startDrag(e, layer) {
    e.preventDefault();
    const scale = getScale();
    const startPointerX = e.clientX;
    const startPointerY = e.clientY;
    const origX = layer.x;
    const origY = layer.y;

    function onPointerMove(moveEvent) {
      const dx = (moveEvent.clientX - startPointerX) * scale.scaleX;
      const dy = (moveEvent.clientY - startPointerY) * scale.scaleY;
      let newX = Math.round(origX + dx);
      let newY = Math.round(origY + dy);

      const centerX = newX + layer.width / 2;
      if (Math.abs(centerX - VIRTUAL_W / 2) < 20) {
        newX = Math.round(VIRTUAL_W / 2 - layer.width / 2);
        if (guideX) guideX.hidden = false;
      } else if (guideX) {
        guideX.hidden = true;
      }

      const centerY = newY + layer.height / 2;
      if (Math.abs(centerY - VIRTUAL_H / 2) < 20) {
        newY = Math.round(VIRTUAL_H / 2 - layer.height / 2);
        if (guideY) guideY.hidden = false;
      } else if (guideY) {
        guideY.hidden = true;
      }

      layer.x = newX;
      layer.y = newY;
      updateBoxPositionOnly(layer);
      updateFooterInfo();
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (guideX) guideX.hidden = true;
      if (guideY) guideY.hidden = true;
      updateOverlay();
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  // ============================================================================
  // REDIMENSIÓN NORMAL O RECORTE MANUAL CON ALT (OBS-STYLE CROP)
  // ============================================================================
  function startResizeOrCrop(e, layer, dir) {
    e.preventDefault();
    const scale = getScale();
    const startPointerX = e.clientX;
    const startPointerY = e.clientY;

    const isCropAction = Boolean(e.altKey || isAltKeyPressed);

    const origX = layer.x;
    const origY = layer.y;
    const origW = layer.width;
    const origH = layer.height;

    const origCL = layer.cropLeft || 0;
    const origCR = layer.cropRight || 0;
    const origCT = layer.cropTop || 0;
    const origCB = layer.cropBottom || 0;

    const uncroppedStageW = origW / Math.max(0.05, 1 - origCL - origCR);
    const uncroppedStageH = origH / Math.max(0.05, 1 - origCT - origCB);

    function onPointerMove(moveEvent) {
      const dx = (moveEvent.clientX - startPointerX) * scale.scaleX;
      const dy = (moveEvent.clientY - startPointerY) * scale.scaleY;

      if (isCropAction || moveEvent.altKey || isAltKeyPressed) {
        // MODO RECORTE MANUAL CON LA TECLA ALT
        if (dir.includes('e')) {
          const newCR = Math.max(0, Math.min(0.95 - origCL, origCR - (dx / uncroppedStageW)));
          layer.cropRight = newCR;
          layer.width = Math.max(20, Math.round(uncroppedStageW * (1 - origCL - newCR)));
        }
        if (dir.includes('w')) {
          const rightPin = origX + origW;
          const newCL = Math.max(0, Math.min(0.95 - origCR, origCL + (dx / uncroppedStageW)));
          layer.cropLeft = newCL;
          const newW = Math.max(20, Math.round(uncroppedStageW * (1 - newCL - origCR)));
          layer.width = newW;
          layer.x = Math.round(rightPin - newW);
        }
        if (dir.includes('s')) {
          const newCB = Math.max(0, Math.min(0.95 - origCT, origCB - (dy / uncroppedStageH)));
          layer.cropBottom = newCB;
          layer.height = Math.max(20, Math.round(uncroppedStageH * (1 - origCT - newCB)));
        }
        if (dir.includes('n')) {
          const bottomPin = origY + origH;
          const newCT = Math.max(0, Math.min(0.95 - origCB, origCT + (dy / uncroppedStageH)));
          layer.cropTop = newCT;
          const newH = Math.max(20, Math.round(uncroppedStageH * (1 - newCT - origCB)));
          layer.height = newH;
          layer.y = Math.round(bottomPin - newH);
        }
      } else {
        // MODO REDIMENSIÓN ESTÁNDAR
        // - Tiradores laterales (n, s, e, w): cambio libre independiente de alto o ancho
        // - Cuatro esquinas (nw, ne, se, sw): bloqueo estricto de aspect-ratio proporcional
        const isCorner = ['nw', 'ne', 'se', 'sw'].includes(dir);
        let newX = origX;
        let newY = origY;
        let newW = origW;
        let newH = origH;

        if (isCorner) {
          const aspect = origW / Math.max(1, origH);

          if (dir === 'se') {
            // Esquina inferior derecha: el origen (nw) queda fijo
            const delta = (dx + dy * aspect) / 2;
            newW = Math.max(30, Math.round(origW + delta));
            newH = Math.max(20, Math.round(newW / aspect));
          } else if (dir === 'sw') {
            // Esquina inferior izquierda: la esquina superior derecha (ne) queda fija
            const delta = (-dx + dy * aspect) / 2;
            newW = Math.max(30, Math.round(origW + delta));
            newH = Math.max(20, Math.round(newW / aspect));
            newX = origX + (origW - newW);
          } else if (dir === 'ne') {
            // Esquina superior derecha: la esquina inferior izquierda (sw) queda fija
            const delta = (dx - dy * aspect) / 2;
            newW = Math.max(30, Math.round(origW + delta));
            newH = Math.max(20, Math.round(newW / aspect));
            newY = origY + (origH - newH);
          } else if (dir === 'nw') {
            // Esquina superior izquierda: la esquina inferior derecha (se) queda fija
            const delta = (-dx - dy * aspect) / 2;
            newW = Math.max(30, Math.round(origW + delta));
            newH = Math.max(20, Math.round(newW / aspect));
            newX = origX + (origW - newW);
            newY = origY + (origH - newH);
          }
        } else {
          // Tiradores laterales independientes (n, s, e, w)
          if (dir === 'e') {
            newW = Math.max(30, origW + dx);
          } else if (dir === 'w') {
            const potW = Math.max(30, origW - dx);
            newX = origX + (origW - potW);
            newW = potW;
          } else if (dir === 's') {
            newH = Math.max(20, origH + dy);
          } else if (dir === 'n') {
            const potH = Math.max(20, origH - dy);
            newY = origY + (origH - potH);
            newH = potH;
          }
        }

        layer.x = Math.round(newX);
        layer.y = Math.round(newY);
        layer.width = Math.round(newW);
        layer.height = Math.round(newH);
      }

      updateBoxPositionOnly(layer);
      updateFooterInfo();
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      updateOverlay();
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function updateBoxPositionOnly(layer) {
    const box = overlay.querySelector(`[data-layer-id="${layer.id}"]`);
    if (!box) return;
    const scale = getScale();

    box.style.left = `${layer.x / scale.scaleX}px`;
    box.style.top = `${layer.y / scale.scaleY}px`;
    box.style.width = `${Math.max(20, layer.width) / scale.scaleX}px`;
    box.style.height = `${Math.max(20, layer.height) / scale.scaleY}px`;
  }

  function updateFooterInfo() {
    const selected = getSelectedLayer();
    if (!selected) {
      if (selectedNameEl) selectedNameEl.textContent = 'Ninguna capa seleccionada (Lienzo limpio)';
      if (selectedCoordsEl) selectedCoordsEl.textContent = 'Haz clic en una capa para editarla o recortarla';
      return;
    }
    if (selected.type === 'mic') {
      if (selectedNameEl) selectedNameEl.textContent = selected.name;
      if (selectedCoordsEl) {
        const vol = selected.muted ? 0 : Math.round((selected.volume !== undefined ? selected.volume : 1) * 100);
        selectedCoordsEl.textContent = `🎙️ Entrada de Audio Activa | Vol: ${vol}% ${selected.muted ? '(Silenciado)' : '(Transmitiendo en Vivo)'}`;
      }
      return;
    }
    const cL = Math.round((selected.cropLeft || 0) * 100);
    const cR = Math.round((selected.cropRight || 0) * 100);
    const cT = Math.round((selected.cropTop || 0) * 100);
    const cB = Math.round((selected.cropBottom || 0) * 100);
    const cropTotal = cL + cR + cT + cB;
    const cropInfo = cropTotal > 0 ? ` (Recorte: L:${cL}% R:${cR}% T:${cT}% B:${cB}%)` : '';
    if (selectedNameEl) selectedNameEl.textContent = selected.name;
    if (selectedCoordsEl) {
      selectedCoordsEl.textContent = `X: ${selected.x}, Y: ${selected.y} | ${selected.width}×${selected.height}${cropInfo}`;
    }
  }

  function updateLayerToolButtons() {
    const selected = getSelectedLayer();
    const hasSelection = Boolean(selected && !selected.locked && selected.type !== 'mic');
    if (layerFitBtn) layerFitBtn.disabled = !hasSelection;
    if (layerCenterBtn) layerCenterBtn.disabled = !hasSelection;
    if (layerUpBtn) layerUpBtn.disabled = !selected;
    if (layerDownBtn) layerDownBtn.disabled = !selected;
    if (layerDupBtn) layerDupBtn.disabled = !selected || selected.type === 'mic';
    if (layerDelBtn) layerDelBtn.disabled = !selected || layers.length <= 1;
  }

  // ============================================================================
  // LISTA DE CAPAS EN LA CONSOLA DERECHA
  // ============================================================================
  function renderLayersList() {
    if (!layersListEl) return;
    layersListEl.replaceChildren();

    if (layers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'stage-layers-empty';
      empty.textContent = 'No hay capas. Usa "➕ Agregar Fuente" para añadir una.';
      layersListEl.append(empty);
      return;
    }

    const sortedDesc = [...layers].sort((a, b) => b.zIndex - a.zIndex);

    sortedDesc.forEach((layer) => {
      const item = document.createElement('div');
      item.className = `stage-layer-item${layer.id === selectedLayerId ? ' active' : ''}`;

      const info = document.createElement('div');
      info.className = 'layer-item-info';

      const icon = document.createElement('span');
      icon.className = 'layer-item-icon';
      icon.textContent = layer.type === 'mic' ? '🎤'
        : layer.type === 'screen' ? '🖥️'
        : layer.type === 'image' ? '🖼️'
        : layer.type === 'frame' ? '✨'
        : '🔤';

      const textWrap = document.createElement('div');
      textWrap.className = 'layer-item-text-wrap';

      const nameRow = document.createElement('div');
      nameRow.className = 'layer-item-name-row';
      nameRow.style.display = 'flex';
      nameRow.style.alignItems = 'center';
      nameRow.style.gap = '6px';

      const name = document.createElement('span');
      name.className = 'layer-item-name';
      name.textContent = layer.name;

      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'layer-rename-btn';
      renameBtn.title = `Renombrar "${layer.name}"`;
      renameBtn.textContent = '✏️';
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newName = prompt(`Renombrar capa "${layer.name}":`, layer.name);
        if (newName && newName.trim() && newName.trim() !== layer.name) {
          layer.name = newName.trim();
          renderLayersList();
          updateFooterInfo();
        }
      });

      nameRow.append(name, renameBtn);
      textWrap.append(nameRow);

      if (layer.hasAudio) {
        const isMic = layer.type === 'mic';
        const audioBadge = document.createElement('span');
        audioBadge.className = isMic ? 'layer-audio-badge mic' : 'layer-audio-badge';
        audioBadge.textContent = isMic ? '🎙️ Micrófono en Vivo' : '🔊 Audio Nativo';
        textWrap.append(audioBadge);

        // Control independiente de volumen y silencio para el micrófono o audio de pantalla
        const volRow = document.createElement('div');
        volRow.className = 'layer-mic-volume-row';

        const isCurrentlyMuted = Boolean(layer.muted);
        const currentVol = layer.volume !== undefined ? layer.volume : 1;

        const muteBtn = document.createElement('button');
        muteBtn.type = 'button';
        muteBtn.className = 'layer-mic-mute-btn';
        muteBtn.textContent = isCurrentlyMuted ? '🔇' : (isMic ? '🎙️' : '🔊');
        muteBtn.title = isCurrentlyMuted ? 'Activar audio' : 'Silenciar audio';

        const volVal = document.createElement('span');
        volVal.className = 'layer-mic-volume-val';
        volVal.textContent = isCurrentlyMuted ? '0%' : `${Math.round(currentVol * 100)}%`;

        const volSlider = document.createElement('input');
        volSlider.type = 'range';
        volSlider.className = 'layer-mic-volume-slider';
        volSlider.min = '0';
        volSlider.max = '1';
        volSlider.step = '0.05';
        volSlider.value = String(isCurrentlyMuted ? 0 : currentVol);
        volSlider.title = 'Ajustar volumen';

        muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          layer.muted = !layer.muted;
          muteBtn.textContent = layer.muted ? '🔇' : (isMic ? '🎙️' : '🔊');
          muteBtn.title = layer.muted ? 'Activar audio' : 'Silenciar audio';
          volVal.textContent = layer.muted ? '0%' : `${Math.round((layer.volume ?? 1) * 100)}%`;
          volSlider.value = String(layer.muted ? 0 : (layer.volume ?? 1));
          updateAudioMixerConnections();
          updateFooterInfo();
        });

        volSlider.addEventListener('input', (e) => {
          e.stopPropagation();
          const val = Number(volSlider.value);
          layer.volume = val;
          if (val === 0) {
            layer.muted = true;
          } else {
            layer.muted = false;
          }
          muteBtn.textContent = layer.muted ? '🔇' : (isMic ? '🎙️' : '🔊');
          volVal.textContent = `${Math.round(val * 100)}%`;
          updateAudioMixerConnections();
          updateFooterInfo();
        });
        volSlider.addEventListener('click', (e) => e.stopPropagation());

        volRow.append(muteBtn, volSlider, volVal);
        textWrap.append(volRow);
      }

      info.append(icon, textWrap);

      const actions = document.createElement('div');
      actions.className = 'layer-item-actions';

      if (layer.type !== 'mic') {
        const chromaBtn = document.createElement('button');
        chromaBtn.type = 'button';
        chromaBtn.className = `layer-action-icon-btn chroma-btn${layer.chromaKey ? ' chroma-active' : ''}`;
        chromaBtn.title = layer.chromaKey ? '🎭 Clave Croma Activa (Clic para ajustar)' : '🎭 Configurar Clave Croma (Fondo transparente)';
        chromaBtn.textContent = '🎭';
        chromaBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openChromaModal(layer);
        });
        actions.append(chromaBtn);
      }

      const visBtn = document.createElement('button');
      visBtn.type = 'button';
      visBtn.className = `layer-action-icon-btn${layer.visible ? '' : ' is-hidden'}`;
      visBtn.title = layer.visible ? 'Ocultar / Desactivar' : 'Mostrar / Activar';
      visBtn.textContent = layer.visible ? '👁️' : '🚫';
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        updateAudioMixerConnections();
        updateOverlay();
        renderLayersList();
      });

      const lockBtn = document.createElement('button');
      lockBtn.type = 'button';
      lockBtn.className = `layer-action-icon-btn${layer.locked ? ' is-locked' : ''}`;
      lockBtn.title = layer.locked ? 'Desbloquear posición' : 'Bloquear posición';
      lockBtn.textContent = layer.locked ? '🔒' : '🔓';
      if (layer.type === 'mic') {
        lockBtn.disabled = true;
        lockBtn.style.opacity = '0.4';
      } else {
        lockBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          layer.locked = !layer.locked;
          updateOverlay();
          renderLayersList();
        });
      }

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'layer-action-icon-btn';
      delBtn.title = 'Eliminar capa';
      delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeLayer(layer.id);
      });

      actions.append(visBtn, lockBtn, delBtn);
      item.append(info, actions);
      item.addEventListener('click', () => {
        selectedLayerId = layer.id;
        updateOverlay();
      });

      layersListEl.append(item);
    });
  }

  function openChromaModal(layer) {
    if (!chromaModalBackdrop || !layer) return;
    currentChromaLayer = layer;
    if (chromaEnableToggle) chromaEnableToggle.checked = Boolean(layer.chromaKey);
    const color = layer.chromaColor || '#00ff00';
    if (chromaColorPicker) chromaColorPicker.value = color;
    if (chromaHexInput) chromaHexInput.value = color;
    const tol = layer.chromaTolerance ?? 35;
    if (chromaToleranceSlider) chromaToleranceSlider.value = String(tol);
    if (chromaToleranceVal) chromaToleranceVal.textContent = `${tol}%`;
    const soft = layer.chromaSoftness ?? 12;
    if (chromaSoftnessSlider) chromaSoftnessSlider.value = String(soft);
    if (chromaSoftnessVal) chromaSoftnessVal.textContent = `${soft}%`;
    chromaModalBackdrop.hidden = false;
  }

  function closeChromaModal() {
    if (chromaModalBackdrop) chromaModalBackdrop.hidden = true;
    currentChromaLayer = null;
    renderLayersList();
  }

  if (chromaCloseBtn) chromaCloseBtn.addEventListener('click', closeChromaModal);
  if (chromaCancelBtn) chromaCancelBtn.addEventListener('click', closeChromaModal);
  if (chromaApplyBtn) chromaApplyBtn.addEventListener('click', closeChromaModal);
  if (chromaModalBackdrop) {
    chromaModalBackdrop.addEventListener('click', (e) => {
      if (e.target === chromaModalBackdrop) closeChromaModal();
    });
  }

  if (chromaEnableToggle) {
    chromaEnableToggle.addEventListener('change', () => {
      if (!currentChromaLayer) return;
      currentChromaLayer.chromaKey = chromaEnableToggle.checked;
      renderLayersList();
    });
  }

  if (chromaColorPicker) {
    chromaColorPicker.addEventListener('input', () => {
      if (!currentChromaLayer) return;
      const val = chromaColorPicker.value;
      if (chromaHexInput) chromaHexInput.value = val;
      currentChromaLayer.chromaColor = val;
    });
  }

  if (chromaHexInput) {
    chromaHexInput.addEventListener('input', () => {
      if (!currentChromaLayer) return;
      let val = chromaHexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        if (chromaColorPicker) chromaColorPicker.value = val;
        currentChromaLayer.chromaColor = val;
      }
    });
  }

  document.querySelectorAll('.chroma-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!currentChromaLayer) return;
      const color = btn.dataset.color || '#00ff00';
      if (chromaColorPicker) chromaColorPicker.value = color;
      if (chromaHexInput) chromaHexInput.value = color;
      currentChromaLayer.chromaColor = color;
      currentChromaLayer.chromaKey = true;
      if (chromaEnableToggle) chromaEnableToggle.checked = true;
      renderLayersList();
    });
  });

  if (chromaToleranceSlider) {
    chromaToleranceSlider.addEventListener('input', () => {
      if (!currentChromaLayer) return;
      const tol = Number(chromaToleranceSlider.value);
      currentChromaLayer.chromaTolerance = tol;
      if (chromaToleranceVal) chromaToleranceVal.textContent = `${tol}%`;
    });
  }

  if (chromaSoftnessSlider) {
    chromaSoftnessSlider.addEventListener('input', () => {
      if (!currentChromaLayer) return;
      const soft = Number(chromaSoftnessSlider.value);
      currentChromaLayer.chromaSoftness = soft;
      if (chromaSoftnessVal) chromaSoftnessVal.textContent = `${soft}%`;
    });
  }

  function removeLayer(layerId) {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return;

    if (layer.stream) {
      try {
        layer.stream.getTracks().forEach((t) => t.stop());
      } catch (_) {}
    }

    if (activeAudioSourceNodes.has(layerId)) {
      const entry = activeAudioSourceNodes.get(layerId);
      try {
        if (entry?.gainNode) entry.gainNode.disconnect();
        if (entry?.sourceNode) entry.sourceNode.disconnect();
      } catch (_) {}
      activeAudioSourceNodes.delete(layerId);
    }

    layers = layers.filter((l) => l.id !== layerId);
    if (selectedLayerId === layerId) {
      selectedLayerId = layers[0]?.id || null;
    }
    updateAudioMixerConnections();
    updateOverlay();
  }

  function reindexLayers() {
    layers.forEach((l, idx) => {
      l.zIndex = idx + 1;
    });
  }

  if (layerUpBtn) {
    layerUpBtn.addEventListener('click', () => {
      const idx = layers.findIndex((l) => l.id === selectedLayerId);
      if (idx === -1 || idx === layers.length - 1) return;
      const temp = layers[idx];
      layers[idx] = layers[idx + 1];
      layers[idx + 1] = temp;
      reindexLayers();
      updateOverlay();
    });
  }

  if (layerDownBtn) {
    layerDownBtn.addEventListener('click', () => {
      const idx = layers.findIndex((l) => l.id === selectedLayerId);
      if (idx <= 0) return;
      const temp = layers[idx];
      layers[idx] = layers[idx - 1];
      layers[idx - 1] = temp;
      reindexLayers();
      updateOverlay();
    });
  }

  if (layerDupBtn) {
    layerDupBtn.addEventListener('click', () => {
      const sel = getSelectedLayer();
      if (!sel) return;
      const clone = {
        ...sel,
        id: `layer-clone-${Date.now()}`,
        name: `${sel.name} (Copia)`,
        x: Math.min(VIRTUAL_W - sel.width, sel.x + 40),
        y: Math.min(VIRTUAL_H - sel.height, sel.y + 40),
        zIndex: layers.length + 1
      };
      layers.push(clone);
      selectedLayerId = clone.id;
      updateOverlay();
    });
  }

  if (layerDelBtn) {
    layerDelBtn.addEventListener('click', () => {
      if (selectedLayerId) removeLayer(selectedLayerId);
    });
  }

  // ============================================================================
  // SELECTOR DINÁMICO DE FUENTES CON MODAL (+)
  // ============================================================================
  function openSourceModal() {
    if (modalBackdrop) modalBackdrop.hidden = false;
  }

  function closeSourceModal() {
    if (modalBackdrop) modalBackdrop.hidden = true;
  }

  if (btnAddSource) btnAddSource.addEventListener('click', openSourceModal);
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeSourceModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeSourceModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeSourceModal();
    });
  }

  // Opción 1: Capturar Ventana / Pantalla / Pestaña con Audio Nativo
  if (modalAddScreen) {
    modalAddScreen.addEventListener('click', async () => {
      closeSourceModal();
      if (!navigator.mediaDevices?.getDisplayMedia) {
        alert('Tu navegador no soporta la captura de ventanas con getDisplayMedia.');
        return;
      }

      try {
        const displayOpts = {
          video: {
            cursor: 'always',
            frameRate: { ideal: 30, max: 60 }
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            suppressLocalAudioPlayback: false
          },
          systemAudio: 'include',
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'include'
        };

        let stream = null;
        try {
          stream = await navigator.mediaDevices.getDisplayMedia(displayOpts);
        } catch {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        }

        const videoTrack = stream.getVideoTracks()[0];
        const audioTracks = stream.getAudioTracks();
        const hasAudio = audioTracks.length > 0;
        const windowLabel = videoTrack?.label || 'Ventana Aplicación';

        const videoEl = document.createElement('video');
        videoEl.playsInline = true;
        videoEl.muted = true;
        videoEl.autoplay = true;
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => {});

        videoTrack.addEventListener('ended', () => {
          console.log(`Captura finalizada: ${windowLabel}`);
        });

        const newLayer = {
          id: `layer-screen-${Date.now()}`,
          name: `🖥️ ${windowLabel.length > 20 ? windowLabel.slice(0, 18) + '…' : windowLabel}`,
          type: 'screen',
          stream,
          videoEl,
          hasAudio,
          x: 40,
          y: 200,
          width: 1000,
          height: 600,
          cropLeft: 0,
          cropRight: 0,
          cropTop: 0,
          cropBottom: 0,
          zIndex: layers.length + 1,
          visible: true,
          locked: false,
          opacity: 1
        };

        layers.push(newLayer);
        selectedLayerId = newLayer.id;

        initAudioMixer();
        updateAudioMixerConnections();
        updateOverlay();
      } catch (err) {
        if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
          console.error('Error al capturar ventana:', err);
        }
      }
    });
  }

  // Opción 2: Cargar Imagen Local
  if (modalUploadInput) {
    modalUploadInput.addEventListener('change', () => {
      const file = modalUploadInput.files?.[0];
      if (!file) return;
      closeSourceModal();

      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result;
        if (!src) return;

        const img = new Image();
        img.onload = () => {
          let w = img.naturalWidth || 600;
          let h = img.naturalHeight || 600;
          const maxW = 850;
          if (w > maxW) {
            h = Math.round((h / w) * maxW);
            w = maxW;
          }

          const layer = {
            id: `layer-upload-${Date.now()}`,
            name: `🖼️ ${file.name.slice(0, 20)}`,
            type: 'image',
            src,
            x: Math.round((VIRTUAL_W - w) / 2),
            y: 350,
            width: w,
            height: h,
            cropLeft: 0,
            cropRight: 0,
            cropTop: 0,
            cropBottom: 0,
            zIndex: layers.length + 1,
            visible: true,
            locked: false,
            opacity: 1
          };

          layers.push(layer);
          selectedLayerId = layer.id;
          updateOverlay();
          modalUploadInput.value = '';
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
  }

  // Opción 3: Logo Oficial El Tío Mario
  if (modalAddLogo) {
    modalAddLogo.addEventListener('click', () => {
      closeSourceModal();
      const layer = {
        id: `layer-logo-${Date.now()}`,
        name: '🏷️ Logo El Tío Mario',
        type: 'image',
        src: './media/logo-el-tio-mario.png',
        x: 290,
        y: 80,
        width: 500,
        height: 180,
        cropLeft: 0,
        cropRight: 0,
        cropTop: 0,
        cropBottom: 0,
        zIndex: layers.length + 1,
        visible: true,
        locked: false,
        opacity: 1
      };
      layers.push(layer);
      selectedLayerId = layer.id;
      updateOverlay();
    });
  }

  // Opción 4: Marco Mágico
  if (modalAddFrame) {
    modalAddFrame.addEventListener('click', () => {
      closeSourceModal();
      const layer = {
        id: `layer-frame-${Date.now()}`,
        name: '✨ Marco Mágico del Tablero',
        type: 'frame',
        src: './media/fondo-escenario-mario.jpg',
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
        cropLeft: 0,
        cropRight: 0,
        cropTop: 0,
        cropBottom: 0,
        zIndex: layers.length + 1,
        visible: true,
        locked: false,
        opacity: 0.85
      };
      layers.push(layer);
      selectedLayerId = layer.id;
      updateOverlay();
    });
  }

  // Opción 5: Rótulo / Texto de Anuncio
  if (modalAddText) {
    modalAddText.addEventListener('click', () => {
      closeSourceModal();
      const userText = window.prompt('Escribe el texto para el rótulo:', '¡GRAN TRANSMISIÓN EN DIRECTO!');
      if (!userText || !userText.trim()) return;

      const layer = {
        id: `layer-text-${Date.now()}`,
        name: `🔤 ${userText.trim().slice(0, 18)}`,
        type: 'text',
        text: userText.trim().toUpperCase(),
        textColor: '#ffffff',
        bgColor: '#e52521',
        fontSize: 38,
        x: 80,
        y: 1750,
        width: 920,
        height: 90,
        cropLeft: 0,
        cropRight: 0,
        cropTop: 0,
        cropBottom: 0,
        zIndex: layers.length + 1,
        visible: true,
        locked: false,
        opacity: 1
      };
      layers.push(layer);
      selectedLayerId = layer.id;
      updateOverlay();
    });
  }

  // ============================================================================
  // OPCIÓN 7: BANNERS DE JUGADOR Y RECURSOS MULTIMEDIA MARIO
  // ============================================================================
  function closeBannersModal() {
    if (bannersModalBackdrop) bannersModalBackdrop.hidden = true;
  }

  if (modalAddBanners) {
    modalAddBanners.addEventListener('click', () => {
      closeSourceModal();
      if (bannersModalBackdrop) bannersModalBackdrop.hidden = false;
    });
  }

  if (bannersModalCloseBtn) bannersModalCloseBtn.addEventListener('click', closeBannersModal);
  if (bannersModalCancelBtn) bannersModalCancelBtn.addEventListener('click', closeBannersModal);
  if (bannersModalBackdrop) {
    bannersModalBackdrop.addEventListener('click', (e) => {
      if (e.target === bannersModalBackdrop) closeBannersModal();
    });
  }

  const BANNER_ASSETS = {
    amarillo: { name: '🟡 Banner Jugador (Amarillo)', src: './media/banner-jugador-amarillo.png', w: 600, h: 190 },
    rojo: { name: '🔴 Banner Jugador (Rojo)', src: './media/banner-jugador-rojo.png', w: 600, h: 190 },
    verde: { name: '🟢 Banner Jugador (Verde)', src: './media/banner-jugador-verde.png', w: 600, h: 190 },
    celeste: { name: '🔵 Banner Jugador (Celeste)', src: './media/banner-jugador-celeste.png', w: 600, h: 190 },
    morado: { name: '🟣 Banner Jugador (Morado)', src: './media/banner-jugador-morado.png', w: 600, h: 190 },
    naranja: { name: '🟠 Banner Jugador (Naranja)', src: './media/banner-jugador-naranja.png', w: 600, h: 190 }
  };

  document.querySelectorAll('.stage-banner-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bannerKey = btn.dataset.banner;
      const info = BANNER_ASSETS[bannerKey];
      if (!info) return;
      closeBannersModal();

      const layer = {
        id: `layer-banner-${bannerKey}-${Date.now()}`,
        name: info.name,
        type: 'image',
        src: info.src,
        x: Math.round((VIRTUAL_W - info.w) / 2),
        y: 1550,
        width: info.w,
        height: info.h,
        cropLeft: 0,
        cropRight: 0,
        cropTop: 0,
        cropBottom: 0,
        zIndex: layers.length + 1,
        visible: true,
        locked: false,
        opacity: 1
      };
      layers.push(layer);
      selectedLayerId = layer.id;
      updateOverlay();
    });
  });

  // ============================================================================
  // OPCIÓN 6: AÑADIR MICRÓFONO / DISPOSITIVO DE AUDIO LOCAL
  // ============================================================================
  function openMicModal() {
    if (micModalBackdrop) micModalBackdrop.hidden = false;
    populateAudioInputDevices();
  }

  function closeMicModal() {
    if (micModalBackdrop) micModalBackdrop.hidden = true;
  }

  if (modalAddMic) {
    modalAddMic.addEventListener('click', () => {
      closeSourceModal();
      openMicModal();
    });
  }

  if (micModalCloseBtn) micModalCloseBtn.addEventListener('click', closeMicModal);
  if (micModalCancelBtn) micModalCancelBtn.addEventListener('click', closeMicModal);
  if (micModalBackdrop) {
    micModalBackdrop.addEventListener('click', (e) => {
      if (e.target === micModalBackdrop) closeMicModal();
    });
  }

  async function populateAudioInputDevices() {
    if (!micSelect) return;
    micSelect.replaceChildren();

    const loadingOpt = document.createElement('option');
    loadingOpt.value = '';
    loadingOpt.textContent = 'Consultando micrófonos del sistema…';
    micSelect.append(loadingOpt);
    micSelect.disabled = true;
    if (micConfirmBtn) micConfirmBtn.disabled = true;
    if (micStatusText) micStatusText.textContent = 'Detectando entradas de audio…';

    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('navigator.mediaDevices no disponible');
      }

      let devices = await navigator.mediaDevices.enumerateDevices();
      let audioInputs = devices.filter((d) => d.kind === 'audioinput');

      // Si las etiquetas vienen vacías, solicitar permiso momentáneo para desbloquear nombres reales
      if (audioInputs.length === 0 || audioInputs.some((d) => !d.label)) {
        if (micStatusText) micStatusText.textContent = 'Solicitando acceso para listar dispositivos de audio…';
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          tempStream.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
          audioInputs = devices.filter((d) => d.kind === 'audioinput');
        } catch (permErr) {
          console.warn('Permiso previo para micrófono no otorgado:', permErr);
        }
      }

      micSelect.replaceChildren();

      if (audioInputs.length === 0) {
        const defOpt = document.createElement('option');
        defOpt.value = 'default';
        defOpt.textContent = 'Micrófono predeterminado del sistema';
        micSelect.append(defOpt);
        if (micStatusText) micStatusText.textContent = 'Se conectará con el micrófono por defecto del sistema';
      } else {
        audioInputs.forEach((device, index) => {
          const opt = document.createElement('option');
          opt.value = device.deviceId;
          opt.textContent = device.label || `Micrófono ${index + 1} (${device.deviceId ? device.deviceId.slice(0, 8) + '…' : 'Predeterminado'})`;
          micSelect.append(opt);
        });
        if (micStatusText) micStatusText.textContent = `${audioInputs.length} micrófono(s) detectado(s)`;
      }

      micSelect.disabled = false;
      if (micConfirmBtn) micConfirmBtn.disabled = false;
    } catch (err) {
      console.warn('Error al enumerar micrófonos:', err);
      micSelect.replaceChildren();
      const defOpt = document.createElement('option');
      defOpt.value = 'default';
      defOpt.textContent = 'Micrófono predeterminado del sistema';
      micSelect.append(defOpt);
      micSelect.disabled = false;
      if (micConfirmBtn) micConfirmBtn.disabled = false;
      if (micStatusText) micStatusText.textContent = 'Listo para conectar';
    }
  }

  if (micConfirmBtn) {
    micConfirmBtn.addEventListener('click', async () => {
      if (micConfirmBtn.disabled) return;
      micConfirmBtn.disabled = true;
      if (micStatusText) micStatusText.textContent = 'Conectando con el dispositivo…';

      try {
        const selectedDeviceId = micSelect?.value || '';
        const selectedOpt = micSelect?.options[micSelect.selectedIndex];
        const deviceName = selectedOpt?.textContent || 'Micrófono en Vivo';

        const audioConstraints = selectedDeviceId && selectedDeviceId !== 'default'
          ? {
              deviceId: { exact: selectedDeviceId },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          : {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            };

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false
        });

        initAudioMixer();

        const micLayer = {
          id: `layer-mic-${Date.now()}`,
          name: `🎤 ${deviceName.length > 22 ? deviceName.slice(0, 20) + '…' : deviceName}`,
          type: 'mic',
          stream,
          hasAudio: true,
          volume: 1.0,
          muted: false,
          deviceId: selectedDeviceId,
          zIndex: layers.length + 1,
          visible: true,
          locked: true,
          width: 0,
          height: 0,
          x: 0,
          y: 0
        };

        layers.push(micLayer);
        selectedLayerId = micLayer.id;
        updateAudioMixerConnections();
        closeMicModal();
        renderLayersList();
        updateFooterInfo();
        updateOverlay();
      } catch (err) {
        console.error('Error al capturar el micrófono:', err);
        if (micStatusText) micStatusText.textContent = `Error: ${err.message || 'No se pudo conectar el micrófono'}`;
        micConfirmBtn.disabled = false;
      }
    });
  }

  // Restablecer escena inicial
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      layers.forEach((l) => {
        if (l.stream) {
          try { l.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
        }
      });

      layers = [
        {
          id: 'layer-welcome-bg',
          name: '🖼️ Fondo del Escenario',
          type: 'image',
          src: './media/fondo-escenario-mario.jpg',
          x: 0,
          y: 0,
          width: 1080,
          height: 1920,
          cropLeft: 0,
          cropRight: 0,
          cropTop: 0,
          cropBottom: 0,
          zIndex: 1,
          visible: true,
          locked: false,
          opacity: 0.95
        },
        {
          id: 'layer-logo',
          name: '🏷️ Logo El Tío Mario',
          type: 'image',
          src: './media/logo-el-tio-mario.png',
          x: 290,
          y: 80,
          width: 500,
          height: 180,
          cropLeft: 0,
          cropRight: 0,
          cropTop: 0,
          cropBottom: 0,
          zIndex: 2,
          visible: true,
          locked: false,
          opacity: 1
        }
      ];
      selectedLayerId = 'layer-welcome-bg';
      updateAudioMixerConnections();
      updateOverlay();
    });
  }

  // ============================================================================
  // EMISIÓN WEBRTC DEL ESCENARIO COMPUESTO CON AUDIO MEZCLADO
  // ============================================================================
  if (broadcastToggle) {
    broadcastToggle.addEventListener('click', () => {
      isStageBroadcasting = !isStageBroadcasting;
      broadcastToggle.classList.toggle('is-active', isStageBroadcasting);

      if (isStageBroadcasting) {
        broadcastLabel.textContent = '🟢 Emitiendo en Vivo (Clic para Detener)';

        initAudioMixer();
        updateAudioMixerConnections();

        if (!stageStream) {
          stageStream = canvas.captureStream(30);
        }

        if (audioDestinationNode && audioDestinationNode.stream.getAudioTracks().length > 0) {
          const mixedTrack = audioDestinationNode.stream.getAudioTracks()[0];
          const existing = stageStream.getAudioTracks();
          existing.forEach((t) => stageStream.removeTrack(t));
          stageStream.addTrack(mixedTrack);
        }

        streamBroadcaster.attachStream(stageStream, 'stage-composer');
      } else {
        broadcastLabel.textContent = '🔴 Emitir en Vivo a Clientes';
        streamBroadcaster.stopStream();
      }
    });
  }

  function setEditable(editable) {
    isStageEditable = Boolean(editable);
    wrapper.classList.toggle('is-locked', !isStageEditable);
    if (!isStageEditable) {
      overlay.replaceChildren();
      if (selectedCoordsEl) {
        selectedCoordsEl.textContent = '🔒 Escenario protegido · Modo solo lectura';
      }
    } else {
      updateOverlay();
    }
  }

  function deselectAllLayers() {
    selectedLayerId = null;
    updateOverlay();
    renderLayersList();
    updateFooterInfo();
    updateLayerToolButtons();
  }

  // Deseleccionar al hacer clic en área vacía del lienzo (fuera de las capas activas)
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) {
      deselectAllLayers();
    }
  });

  wrapper.addEventListener('pointerdown', (e) => {
    if (e.target === wrapper || e.target === canvas) {
      deselectAllLayers();
    }
  });

  const deselectBtn = document.querySelector('#stage-btn-deselect');
  if (deselectBtn) {
    deselectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deselectAllLayers();
    });
  }

  selectedLayerId = null; // Inicia con el lienzo totalmente limpio, sin marcos ni tiradores azules
  updateOverlay();
  window.addEventListener('resize', () => updateOverlay());

  return {
    updateOverlay,
    setEditable,
    isBroadcastingStage: () => isStageBroadcasting,
    getStageStream: () => stageStream
  };
}
