/**
 * script.js - Vista del Cliente (Totalmente Abierta, WebRTC en Vivo y Chat Público)
 */

const clientVideo = document.querySelector('#client-video');
const audioEnableButton = document.querySelector('#audio-enable-button');
const clientAudioIcon = document.querySelector('#client-audio-icon');
const clientAudioLabel = document.querySelector('#client-audio-label');
const clientStreamHeadline = document.querySelector('#client-stream-headline');
const clientStreamNote = document.querySelector('#client-stream-note');
const streamPlaceholder = document.querySelector('#stream-placeholder');
const streamStatus = document.querySelector('#stream-status');
const clientViewersCount = document.querySelector('#client-viewers-count');
const streamViewersCount = document.querySelector('#stream-viewers-count');
const clientIdentityTag = document.querySelector('#client-identity-tag');
const clientIdentityText = document.querySelector('#client-identity-text');

const chatList = document.querySelector('#client-chat-list');
const chatEmpty = document.querySelector('#client-chat-empty');
const chatForm = document.querySelector('#client-chat-form');
const chatInput = document.querySelector('#client-chat-input');
const chatSend = document.querySelector('#client-chat-send');
const chatStatus = document.querySelector('#client-chat-status');
const clientChatEmojiToggle = document.querySelector('#client-chat-emoji-toggle');
const clientChatEmojiPopover = document.querySelector('#client-chat-emoji-popover');
const clientQuickEmojis = document.querySelector('#client-quick-emojis');

// Identificador único persistente del dispositivo en localStorage
let deviceId = localStorage.getItem('ludito_device_id');
if (!deviceId) {
  deviceId = 'dev_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  localStorage.setItem('ludito_device_id', deviceId);
}

let clientEmojiPicker = null;
if (window.Ludito?.setupEmojiPicker && clientChatEmojiToggle && clientChatEmojiPopover && chatInput) {
  clientEmojiPicker = window.Ludito.setupEmojiPicker({
    toggleBtn: clientChatEmojiToggle,
    popover: clientChatEmojiPopover,
    input: chatInput,
    quickChipsContainer: clientQuickEmojis
  });
}

const voiceToggle = document.querySelector('#client-voice-toggle');
const voiceVolume = document.querySelector('#client-voice-volume');
const voiceVolumeValue = document.querySelector('#client-voice-volume-value');
const speechQueue = window.Ludito.createSpeechQueue();
const seenChatIds = new Set();
speechQueue.setEnabled(voiceToggle.checked);

let currentState = { events: [], round: 1, accepting: true, chat: [] };
let voicePreference = null;
let localVoiceVolume = Number(localStorage.getItem('ludito-client-voice-volume') ?? 1);
localVoiceVolume = Math.min(1, Math.max(0, Number.isFinite(localVoiceVolume) ? localVoiceVolume : 1));

function renderState(state, isLiveUpdate = false) {
  if (!state || typeof state !== 'object') return;

  const cached = window.Ludito?.getCachedState ? window.Ludito.getCachedState() : null;
  const incomingResetTs = Number(state.resetTimestamp || 0);
  const cachedResetTs = Number(cached?.resetTimestamp || 0);

  const isAuthorizedReset = incomingResetTs > cachedResetTs;
  if (!isAuthorizedReset && cached) {
    if ((!state.chat || state.chat.length === 0) && cached.chat && cached.chat.length > 0) {
      state.chat = cached.chat;
    }
  }

  currentState = state;
  if (window.Ludito?.saveCachedState) {
    window.Ludito.saveCachedState(state);
  }

  if (!state.chat || state.chat.length === 0) {
    seenChatIds.clear();
    speechQueue.clear();
  }
  voicePreference = state.voicePreference || null;
  speechQueue.setVoicePreference({ ...voicePreference, volume: localVoiceVolume });
  renderChat(state.chat || [], isLiveUpdate);
}

// Cargar y restaurar de INMEDIATO desde localStorage al abrir o recargar
try {
  const initialCached = window.Ludito?.getCachedState ? window.Ludito.getCachedState() : null;
  if (initialCached) {
    renderState(initialCached, false);
  }
} catch (_) {}

function renderChat(messages, isLiveUpdate) {
  chatList.replaceChildren(chatEmpty);
  chatEmpty.hidden = messages.length > 0;

  let recognizedMyName = null;

  messages.forEach((message) => {
    const isNew = !seenChatIds.has(message.id);
    if (isLiveUpdate && isNew && voiceToggle.checked) {
      speechQueue.speak(`${message.name} dice: ${message.text}`);
    }
    seenChatIds.add(message.id);

    // Si el mensaje es de este dispositivo y está registrado por el host, reconocer nombre
    if (message.senderId === deviceId && message.isRegistered) {
      recognizedMyName = message.name;
    }

    const row = document.createElement('article');
    row.className = isLiveUpdate && isNew ? 'client-chat-message is-incoming' : 'client-chat-message';
    row.dataset.msgId = message.id;

    const header = document.createElement('div');
    header.className = 'client-chat-message-header';

    const authorWrap = document.createElement('div');
    authorWrap.className = 'client-chat-author-wrap';

    const MARIO_PALETTE = ['#fed100', '#e52521', '#009fe3', '#00a844', '#9d4edd', '#ff6b35'];
    const nameContainer = document.createElement('strong');
    nameContainer.className = 'client-chat-author-name';
    nameContainer.setAttribute('translate', 'no');

    const rawName = (message.name && message.name.trim()) ? message.name.trim() : 'Invitado';
    if (message.color) {
      nameContainer.textContent = rawName;
      nameContainer.style.color = message.color;
      nameContainer.style.textShadow = `0 0 12px ${message.color}aa`;
    } else {
      Array.from(rawName).forEach((ch, idx) => {
        const span = document.createElement('span');
        span.textContent = ch;
        if (ch.trim()) {
          span.style.color = MARIO_PALETTE[idx % MARIO_PALETTE.length];
        } else {
          span.innerHTML = '&nbsp;';
        }
        nameContainer.append(span);
      });
    }
    authorWrap.append(nameContainer);

    const time = document.createElement('time');
    time.dateTime = message.timestamp;
    time.textContent = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(message.timestamp));

    const text = document.createElement('p');
    text.textContent = message.text;

    header.append(authorWrap, time);
    row.append(header, text);
    chatList.append(row);
  });

  // Actualizar indicador de identidad del usuario en la barra superior
  if (recognizedMyName && clientIdentityText && clientIdentityTag) {
    clientIdentityText.textContent = recognizedMyName;
    clientIdentityTag.classList.add('is-registered');
    clientIdentityTag.title = `Registrado como ${recognizedMyName}`;
  }

  chatList.scrollTo({ top: chatList.scrollHeight, behavior: 'smooth' });
}

// Envío libre de mensajes al chat público
chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  chatInput.disabled = true;
  chatSend.disabled = true;
  if (clientEmojiPicker) clientEmojiPicker.setEnabled(false);

  try {
    const currentName = clientIdentityText?.textContent || 'Invitado';
    await window.Ludito.sendChat(message, deviceId, currentName);
    chatInput.value = '';
    chatStatus.textContent = 'Mensaje enviado.';
  } catch (error) {
    chatStatus.textContent = error.message;
  } finally {
    chatInput.disabled = false;
    chatSend.disabled = false;
    if (clientEmojiPicker) clientEmojiPicker.setEnabled(true);
    chatInput.focus();
  }
});

window.Ludito.subscribe(renderState, (connected) => {
  if (!connected && streamStatus) streamStatus.textContent = 'Reconectando al servidor…';
});

voiceToggle.addEventListener('change', () => {
  speechQueue.setEnabled(voiceToggle.checked);
});

function renderClientVolume() {
  voiceVolume.value = String(localVoiceVolume);
  voiceVolumeValue.value = `${Math.round(localVoiceVolume * 100)}%`;
  voiceVolumeValue.textContent = `${Math.round(localVoiceVolume * 100)}%`;
}

voiceVolume.addEventListener('input', () => {
  localVoiceVolume = Number(voiceVolume.value);
  localStorage.setItem('ludito-client-voice-volume', String(localVoiceVolume));
  speechQueue.setVoicePreference({ ...voicePreference, volume: localVoiceVolume });
  renderClientVolume();
});

renderClientVolume();

// Receptor WebRTC en tiempo real para visualizar el Stage transmitido por el host
const streamReceiver = (window.LuditoWebRTC?.initWebRTCClient
  ? window.LuditoWebRTC.initWebRTCClient({
      videoElement: clientVideo,
      placeholderElement: streamPlaceholder,
      statusElement: streamStatus,
      headlineElement: clientStreamHeadline,
      noteElement: clientStreamNote,
      audioToggleButton: audioEnableButton,
      audioIcon: clientAudioIcon,
      audioLabel: clientAudioLabel,
      viewersCountElements: [clientViewersCount, streamViewersCount]
    })
  : window.Ludito.createStreamReceiver());

if (streamReceiver?.onViewersCount) {
  streamReceiver.onViewersCount((count) => {
    const c = Math.max(0, Number(count) || 0);
    [clientViewersCount, streamViewersCount].forEach((el) => {
      if (el) el.textContent = String(c);
    });
  });
}

Promise.all([window.Ludito.fetchConfig(), window.Ludito.fetchState()]).then(([config, state]) => {
  if (config.streamUrl) {
    clientVideo.src = config.streamUrl;
    clientVideo.addEventListener('playing', () => {
      streamPlaceholder.hidden = true;
      if (streamStatus) streamStatus.textContent = 'Señal en directo conectada';
    });
    clientVideo.addEventListener('error', () => {
      streamReceiver.requestStream();
    }, { once: true });
  } else {
    streamReceiver.requestStream();
  }
  renderState(state);
}).catch(() => {
  streamReceiver.requestStream();
  if (streamStatus) streamStatus.textContent = 'Conectado a la sala en directo';
});

// ============================================================================
// REPRODUCTOR FLOTANTE ARRASTRABLE (IN-APP PiP) Y PANTALLA COMPLETA
// ============================================================================
const streamFrame = document.querySelector('#stream-frame');
const streamAnchorPlaceholder = document.querySelector('#stream-anchor-placeholder');
const playerPipBtn = document.querySelector('#player-pip-btn');
const playerFullscreenBtn = document.querySelector('#player-fullscreen-btn');
const floatingDragBar = document.querySelector('#floating-drag-bar');
const floatingDockBtn = document.querySelector('#floating-dock-btn');

let isFloating = false;

function setFloatingMode(enable) {
  isFloating = Boolean(enable);
  if (!streamFrame) return;

  if (isFloating) {
    if (streamAnchorPlaceholder) {
      streamAnchorPlaceholder.hidden = false;
      const rect = streamFrame.getBoundingClientRect();
      streamAnchorPlaceholder.style.height = `${rect.height}px`;
    }
    streamFrame.classList.add('is-floating');
    if (floatingDragBar) floatingDragBar.hidden = false;

    // Posición inicial cómoda abajo a la derecha respetando el viewport
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const frameW = 165;
    const frameH = 293;
    const initialLeft = Math.max(10, viewportW - frameW - 20);
    const initialTop = Math.max(10, viewportH - frameH - 24);
    streamFrame.style.left = `${initialLeft}px`;
    streamFrame.style.top = `${initialTop}px`;
    streamFrame.style.bottom = 'auto';
    streamFrame.style.right = 'auto';
  } else {
    streamFrame.classList.remove('is-floating');
    streamFrame.classList.remove('is-dragging');
    if (streamAnchorPlaceholder) streamAnchorPlaceholder.hidden = true;
    if (floatingDragBar) floatingDragBar.hidden = true;
    streamFrame.style.left = '';
    streamFrame.style.top = '';
    streamFrame.style.bottom = '';
    streamFrame.style.right = '';
  }
}

async function toggleRealPictureInPicture() {
  const videoEl = clientVideo;
  if (!videoEl) return;

  // 1. Intentar Document Picture-in-Picture API (Ventana flotante fuera del navegador Chrome 111+)
  if ('documentPictureInPicture' in window) {
    try {
      if (window.documentPictureInPicture.window) {
        window.documentPictureInPicture.window.close();
        return;
      }
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 320,
        height: 568,
      });

      // Transferir estilos para que la ventana flotante conserve el diseño exacto
      [...document.styleSheets].forEach((styleSheet) => {
        try {
          if (styleSheet.href) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = styleSheet.href;
            pipWindow.document.head.appendChild(link);
          } else if (styleSheet.cssRules) {
            const style = document.createElement('style');
            [...styleSheet.cssRules].forEach((rule) => {
              style.appendChild(document.createTextNode(rule.cssText));
            });
            pipWindow.document.head.appendChild(style);
          }
        } catch (_) {}
      });

      const originalParent = streamFrame.parentNode;
      const originalNextSibling = streamFrame.nextSibling;

      pipWindow.document.body.style.margin = '0';
      pipWindow.document.body.style.background = '#0a0e12';
      pipWindow.document.body.style.display = 'flex';
      pipWindow.document.body.style.alignItems = 'center';
      pipWindow.document.body.style.justifyContent = 'center';
      pipWindow.document.body.appendChild(streamFrame);

      pipWindow.addEventListener('pagehide', () => {
        if (originalNextSibling) {
          originalParent.insertBefore(streamFrame, originalNextSibling);
        } else {
          originalParent.appendChild(streamFrame);
        }
      });
      return;
    } catch (err) {
      console.warn('Document Picture-in-Picture no disponible o denegado, intentando PiP de video:', err);
    }
  }

  // 2. PiP Nativo de Video HTML5 (Soporta Android Chrome y teléfonos móviles para flotar sobre WhatsApp, Facebook, etc.)
  if (document.pictureInPictureEnabled && typeof videoEl.requestPictureInPicture === 'function') {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoEl.requestPictureInPicture();
      }
      return;
    } catch (err) {
      console.warn('Video requestPictureInPicture falló, usando modo flotante en pantalla:', err);
    }
  }

  // 2b. Safari WebKit presentation mode (iOS Safari)
  if (typeof videoEl.webkitSetPresentationMode === 'function') {
    try {
      const targetMode = videoEl.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture';
      videoEl.webkitSetPresentationMode(targetMode);
      return;
    } catch (err) {
      console.warn('webkitSetPresentationMode falló:', err);
    }
  }

  // 3. Fallback: modo flotante arrastrable dentro de la pantalla
  setFloatingMode(!isFloating);
}

if (playerPipBtn) {
  playerPipBtn.addEventListener('click', () => {
    toggleRealPictureInPicture();
  });
}

if (floatingDockBtn) {
  floatingDockBtn.addEventListener('click', () => {
    setFloatingMode(false);
  });
}

// Lógica de arrastre libre con límites de pantalla (bounds checking)
let isDraggingPip = false;
let dragStartX = 0;
let dragStartY = 0;
let initialFrameLeft = 0;
let initialFrameTop = 0;

function startPipDrag(clientX, clientY) {
  if (!isFloating || !streamFrame) return;
  isDraggingPip = true;
  streamFrame.classList.add('is-dragging');

  const rect = streamFrame.getBoundingClientRect();
  dragStartX = clientX;
  dragStartY = clientY;
  initialFrameLeft = rect.left;
  initialFrameTop = rect.top;

  window.addEventListener('pointermove', onPipDragMove);
  window.addEventListener('pointerup', endPipDrag);
  window.addEventListener('touchmove', onPipTouchMove, { passive: false });
  window.addEventListener('touchend', endPipDrag);
}

function onPipDragMove(e) {
  if (!isDraggingPip || !streamFrame) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  movePipTo(initialFrameLeft + dx, initialFrameTop + dy);
}

function onPipTouchMove(e) {
  if (!isDraggingPip || !streamFrame || !e.touches[0]) return;
  e.preventDefault();
  const touch = e.touches[0];
  const dx = touch.clientX - dragStartX;
  const dy = touch.clientY - dragStartY;
  movePipTo(initialFrameLeft + dx, initialFrameTop + dy);
}

function movePipTo(targetLeft, targetTop) {
  const rect = streamFrame.getBoundingClientRect();
  const maxLeft = Math.max(0, window.innerWidth - rect.width - 8);
  const maxTop = Math.max(0, window.innerHeight - rect.height - 8);

  const clampedLeft = Math.max(8, Math.min(maxLeft, targetLeft));
  const clampedTop = Math.max(8, Math.min(maxTop, targetTop));

  streamFrame.style.left = `${clampedLeft}px`;
  streamFrame.style.top = `${clampedTop}px`;
}

function endPipDrag() {
  if (!isDraggingPip) return;
  isDraggingPip = false;
  if (streamFrame) streamFrame.classList.remove('is-dragging');
  window.removeEventListener('pointermove', onPipDragMove);
  window.removeEventListener('pointerup', endPipDrag);
  window.removeEventListener('touchmove', onPipTouchMove);
  window.removeEventListener('touchend', endPipDrag);
}

if (floatingDragBar) {
  floatingDragBar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#floating-dock-btn')) return;
    startPipDrag(e.clientX, e.clientY);
  });

  floatingDragBar.addEventListener('touchstart', (e) => {
    if (e.target.closest('#floating-dock-btn') || !e.touches[0]) return;
    const touch = e.touches[0];
    startPipDrag(touch.clientX, touch.clientY);
  });
}

// Pantalla completa (Fullscreen API)
if (playerFullscreenBtn && streamFrame) {
  playerFullscreenBtn.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (streamFrame.requestFullscreen) {
          await streamFrame.requestFullscreen();
        } else if (streamFrame.webkitRequestFullscreen) {
          await streamFrame.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Error al alternar pantalla completa:', err);
    }
  });

  const onFullChange = () => {
    const isFull = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    playerFullscreenBtn.classList.toggle('is-fullscreen', isFull);
    const icon = playerFullscreenBtn.querySelector('.fullscreen-icon');
    if (icon) icon.textContent = isFull ? '✕' : '⛶';
  };

  document.addEventListener('fullscreenchange', onFullChange);
  document.addEventListener('webkitfullscreenchange', onFullChange);
}

// Acceso secreto de administrador (CTRL + SHIFT + P)
window.addEventListener('keydown', (event) => {
  const isCtrlOrCmd = event.ctrlKey || event.metaKey;
  const isShift = event.shiftKey;
  const isP = event.key === 'p' || event.key === 'P' || event.code === 'KeyP';

  if (isCtrlOrCmd && isShift && isP) {
    event.preventDefault();
    window.location.href = '/admin.html';
  }
});

// ============================================================================
// VIDEO DE FONDO OFFLINE EN BUCLE
// ============================================================================
const clientOfflineVideo = document.querySelector('#client-offline-video');
if (clientOfflineVideo) {
  const tryPlayOffline = () => {
    if (!streamPlaceholder || !streamPlaceholder.hidden) {
      clientOfflineVideo.play().catch(() => {});
    }
  };
  tryPlayOffline();
  window.addEventListener('pointerdown', tryPlayOffline, { once: true });
  window.addEventListener('touchstart', tryPlayOffline, { once: true });

  if (window.MutationObserver && streamPlaceholder) {
    const observer = new MutationObserver(() => {
      if (streamPlaceholder.hidden) {
        clientOfflineVideo.pause();
      } else {
        clientOfflineVideo.play().catch(() => {});
      }
    });
    observer.observe(streamPlaceholder, { attributes: true, attributeFilter: ['hidden'] });
  }
}


