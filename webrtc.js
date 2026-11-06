/**
 * webrtc.js - Manejador de recepción de flujo de video/audio mediante WebRTC
 *
 * Escucha la señal transmitida por el Administrador (OBS Virtual Camera o Compartir Pantalla)
 * utilizando RTCPeerConnection y servidores STUN públicos, sin solicitar jamás acceso
 * a la cámara o micrófono del participante/cliente.
 */

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

function getSignalingWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/stream-ws`;
}

/**
 * Crea una instancia del receptor WebRTC para escuchar la señal del administrador.
 */
export function createWebRTCReceiver() {
  let ws = null;
  const viewerId = crypto.randomUUID();
  let pc = null;
  let pendingCandidates = [];
  let isRemoteDescSet = false;
  let currentRemoteStream = null;

  let onStreamCb = null;
  let onStatusCb = null;
  let onStreamEndedCb = null;
  let onErrorCb = null;
  let onViewersCountCb = null;

  function connectSignaling() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      ws = new WebSocket(getSignalingWsUrl());
    } catch (err) {
      console.warn('Error al conectar WebSocket de señalización:', err);
      setTimeout(connectSignaling, 3000);
      return;
    }

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'register-viewer',
        viewerId
      }));
    });

    ws.addEventListener('message', async (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'host-stream-status') {
          if (onStatusCb) onStatusCb(msg);
          if (msg.isLive) {
            requestStreamFromHost();
          } else {
            closePeerConnection();
            currentRemoteStream = null;
            if (onStreamEndedCb) onStreamEndedCb();
          }
        } else if (msg.type === 'offer') {
          await handleOffer(msg.sdp);
        } else if (msg.type === 'viewers-count') {
          if (onViewersCountCb) onViewersCountCb(msg.count ?? 0);
        } else if (msg.type === 'candidate') {
          if (pc && pc.signalingState !== 'closed' && msg.candidate) {
            if (isRemoteDescSet) {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch((err) => {
                console.warn('Error al aplicar candidato ICE recibido:', err);
              });
            } else {
              pendingCandidates.push(msg.candidate);
            }
          }
        }
      } catch (err) {
        console.error('Error procesando mensaje de señalización en webrtc.js:', err);
      }
    });

    ws.addEventListener('close', () => {
      setTimeout(connectSignaling, 2500);
    });

    ws.addEventListener('error', (err) => {
      if (onErrorCb) onErrorCb(err);
    });
  }

  function closePeerConnection() {
    if (pc) {
      try {
        pc.close();
      } catch (_) {}
      pc = null;
    }
    pendingCandidates = [];
    isRemoteDescSet = false;
  }

  async function handleOffer(sdp) {
    closePeerConnection();

    pc = new RTCPeerConnection(RTC_CONFIG);

    // Solicitar explícitamente recepción de video y audio en la oferta/respuesta
    try {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    } catch (_) {}

    // Escuchar la pista entrante de video/audio del administrador
    pc.addEventListener('track', (event) => {
      if (event.streams && event.streams[0]) {
        currentRemoteStream = event.streams[0];
        if (onStreamCb) onStreamCb(event.streams[0]);
      } else {
        if (!currentRemoteStream) currentRemoteStream = new MediaStream();
        currentRemoteStream.addTrack(event.track);
        if (onStreamCb) onStreamCb(currentRemoteStream);
      }
    });

    // Enviar candidatos ICE generados por el receptor al host
    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'candidate',
          target: 'host',
          viewerId,
          candidate: event.candidate
        }));
      }
    });

    // Estado de conexión WebRTC
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn('Conexión WebRTC desconectada o fallida, solicitando reconexión...');
        setTimeout(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            requestStreamFromHost();
          }
        }, 1500);
      }
    });

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      isRemoteDescSet = true;

      // Despachar candidatos ICE que llegaron antes del SDP remoto
      while (pendingCandidates.length > 0) {
        const candidate = pendingCandidates.shift();
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'answer',
          viewerId,
          sdp: answer
        }));
      }
    } catch (err) {
      console.error('Error al responder a la oferta WebRTC en webrtc.js:', err);
      closePeerConnection();
    }
  }

  function requestStreamFromHost() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'request-stream',
        viewerId
      }));
    }
  }

  // Sincronización periódica por HTTP como respaldo
  const syncInterval = setInterval(async () => {
    try {
      const response = await fetch('/api/stream/status');
      if (response.ok) {
        const status = await response.json();
        if (onStatusCb) onStatusCb(status);
        if (onViewersCountCb && typeof status.viewersCount === 'number') {
          onViewersCountCb(status.viewersCount);
        }
        if (status.isLive && (!currentRemoteStream || !pc)) {
          requestStreamFromHost();
        }
      }
    } catch (_) {}
  }, 4000);

  connectSignaling();

  return {
    onStream(cb) {
      onStreamCb = cb;
      if (currentRemoteStream) cb(currentRemoteStream);
    },
    onStatus(cb) {
      onStatusCb = cb;
    },
    onViewersCount(cb) {
      onViewersCountCb = cb;
    },
    onStreamEnded(cb) {
      onStreamEndedCb = cb;
    },
    onError(cb) {
      onErrorCb = cb;
    },
    requestStream: requestStreamFromHost,
    destroy() {
      clearInterval(syncInterval);
      closePeerConnection();
      if (ws) {
        ws.close();
        ws = null;
      }
    }
  };
}

/**
 * Inicializa automáticamente la conexión WebRTC vinculada a los elementos DOM del cliente.
 */
export function initWebRTCClient({
  videoElement,
  placeholderElement,
  statusElement,
  headlineElement,
  noteElement,
  retryButton,
  audioToggleButton,
  audioIcon,
  audioLabel,
  viewersCountElement,
  viewersCountElements
}) {
  if (!videoElement) {
    console.error('initWebRTCClient: Se requiere un videoElement');
    return null;
  }

  // Persistencia del estado de audio en localStorage
  const AUDIO_ACTIVE_KEY = 'ludito-audio-active';
  const savedAudioPref = localStorage.getItem(AUDIO_ACTIVE_KEY);
  const initialWantsAudio = savedAudioPref === 'true';

  // Asegurar que el elemento de video tenga los atributos requeridos para autoplay en móviles
  videoElement.muted = !initialWantsAudio;
  videoElement.playsInline = true;
  videoElement.autoplay = true;

  function updateAudioUI() {
    const isMuted = videoElement.muted || videoElement.volume === 0;
    if (audioIcon) audioIcon.textContent = isMuted ? '🔇' : '🔊';
    if (audioLabel) audioLabel.textContent = isMuted ? 'Activar sonido' : 'Silenciar';
    if (audioToggleButton) audioToggleButton.classList.toggle('unmuted', !isMuted);
  }

  if (audioToggleButton) {
    audioToggleButton.addEventListener('click', async () => {
      if (videoElement.muted) {
        videoElement.muted = false;
        localStorage.setItem(AUDIO_ACTIVE_KEY, 'true');
        try {
          await videoElement.play();
        } catch (_) {
          videoElement.muted = true;
          localStorage.setItem(AUDIO_ACTIVE_KEY, 'false');
        }
      } else {
        videoElement.muted = true;
        localStorage.setItem(AUDIO_ACTIVE_KEY, 'false');
      }
      updateAudioUI();
    });
  }

  videoElement.addEventListener('volumechange', updateAudioUI);
  updateAudioUI();

  const receiver = createWebRTCReceiver();

  receiver.onStream((remoteStream) => {
    videoElement.srcObject = remoteStream;
    const userWantsAudio = localStorage.getItem(AUDIO_ACTIVE_KEY) === 'true';
    videoElement.muted = !userWantsAudio;

    const startPlayback = () => {
      videoElement.play().catch(async (err) => {
        console.warn('Reproducción con audio bloqueada por política de navegador:', err);
        // Si el navegador bloqueó el autoplay con sonido, reproducir temporalmente silenciado
        if (!videoElement.muted) {
          videoElement.muted = true;
          updateAudioUI();
          try {
            await videoElement.play();
          } catch (_) {}

          // Al primer gesto del usuario en la pantalla, restaurar el sonido automáticamente
          const unlockAudio = async () => {
            if (localStorage.getItem(AUDIO_ACTIVE_KEY) === 'true') {
              videoElement.muted = false;
              updateAudioUI();
              try { await videoElement.play(); } catch (_) {}
            }
            window.removeEventListener('pointerdown', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
          };
          window.addEventListener('pointerdown', unlockAudio, { once: true });
          window.addEventListener('touchstart', unlockAudio, { once: true });
          window.addEventListener('keydown', unlockAudio, { once: true });
        } else if (retryButton) {
          retryButton.hidden = false;
        }
      });
    };

    startPlayback();

    if (placeholderElement) placeholderElement.hidden = true;
    if (statusElement) statusElement.textContent = 'En vivo · Señal del Administrador';
    if (retryButton) retryButton.hidden = true;
    updateAudioUI();
  });

  receiver.onStatus((status) => {
    if (status.isLive) {
      const modeText = status.source === 'screen' ? 'Host transmitiendo pantalla' : 'Host transmitiendo escena';
      if (statusElement) statusElement.textContent = modeText;
      if (headlineElement) headlineElement.textContent = 'EN VIVO';
      if (noteElement) noteElement.textContent = 'Conectando con la señal en vivo del host…';
    } else {
      // No cortar el srcObject si ya hay señal activa para evitar parpadeos negros
      if (!videoElement.srcObject || videoElement.paused) {
        if (placeholderElement) placeholderElement.hidden = false;
        if (statusElement) statusElement.textContent = 'OFFLINE · En espera';
        if (headlineElement) headlineElement.textContent = 'OFFLINE';
        if (noteElement) noteElement.textContent = 'En breve iniciamos nuestra primera ronda';
      }
    }
  });

  receiver.onStreamEnded(() => {
    videoElement.srcObject = null;
    if (placeholderElement) placeholderElement.hidden = false;
    if (statusElement) statusElement.textContent = 'OFFLINE · En espera';
    if (headlineElement) headlineElement.textContent = 'OFFLINE';
    if (noteElement) noteElement.textContent = 'En breve iniciamos nuestra primera ronda';
    if (retryButton) retryButton.hidden = true;
  });

  if (retryButton) {
    retryButton.addEventListener('click', () => {
      retryButton.textContent = 'Reconectando…';
      receiver.requestStream();
      setTimeout(() => {
        retryButton.textContent = 'Reconectar señal';
      }, 2000);
    });
  }

  // Actualizar contador de espectadores en el cliente
  const countEls = [];
  if (viewersCountElement) countEls.push(viewersCountElement);
  if (Array.isArray(viewersCountElements)) countEls.push(...viewersCountElements);

  if (countEls.length > 0) {
    receiver.onViewersCount((count) => {
      const c = Math.max(0, Number(count) || 0);
      countEls.forEach((el) => {
        if (!el) return;
        el.textContent = String(c);
        const container = el.closest('.client-viewers-badge, .stream-viewers-tag') || el.parentElement;
        const label = container?.querySelector('.viewers-label');
        if (label) {
          label.textContent = c === 1 ? 'espectador' : 'espectadores';
        }
      });
    });
  }

  return receiver;
}

// Compatibilidad con entorno global (Receptor pasivo exclusivo sin acceso a cámara local)
if (typeof window !== 'undefined') {
  window.LuditoWebRTC = {
    createWebRTCReceiver,
    initWebRTCClient
  };
}
