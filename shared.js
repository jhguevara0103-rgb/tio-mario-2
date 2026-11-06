(() => {
  const ADMIN_TOKEN_KEY = 'ludito-admin-session-token';
  const ADMIN_LAST_ACTIVE_KEY = 'ludito-admin-last-active';
  const ADMIN_INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutos de inactividad admin

  // Persistencia de sesión de participante (2 a 3 horas de inactividad)
  const PARTICIPANT_TOKEN_KEY = 'ludito-participant-token';
  const PARTICIPANT_USER_KEY = 'ludito-participant-user';
  const PARTICIPANT_PIN_KEY = 'ludito-participant-pin';
  const PARTICIPANT_LAST_ACTIVE_KEY = 'ludito-participant-last-active';
  const PARTICIPANT_INACTIVITY_LIMIT = 3 * 60 * 60 * 1000; // 3 horas de inactividad

  function recordAdminActivity() {
    try {
      localStorage.setItem(ADMIN_LAST_ACTIVE_KEY, String(Date.now()));
    } catch (_) {}
  }

  function readSavedAdminToken() {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  }

  function recordParticipantActivity() {
    try {
      localStorage.setItem(PARTICIPANT_LAST_ACTIVE_KEY, String(Date.now()));
    } catch (_) {}
  }

  function readSavedParticipantToken() {
    return localStorage.getItem(PARTICIPANT_TOKEN_KEY) || sessionStorage.getItem(PARTICIPANT_TOKEN_KEY) || '';
  }

  function clearParticipantSession() {
    try {
      localStorage.removeItem(PARTICIPANT_TOKEN_KEY);
      localStorage.removeItem(PARTICIPANT_USER_KEY);
      localStorage.removeItem(PARTICIPANT_PIN_KEY);
      localStorage.removeItem(PARTICIPANT_LAST_ACTIVE_KEY);
      sessionStorage.removeItem(PARTICIPANT_TOKEN_KEY);
      sessionStorage.removeItem(PARTICIPANT_USER_KEY);
      sessionStorage.removeItem(PARTICIPANT_PIN_KEY);
    } catch (_) {}
  }

  let token = (window.location.pathname.endsWith('/admin.html') || window.location.pathname.endsWith('/database.html'))
    ? readSavedAdminToken()
    : readSavedParticipantToken();
  let eventSource = null;

  async function request(path, options = {}) {
    if (!token) {
      if (window.location.pathname.endsWith('/admin.html') || window.location.pathname.endsWith('/database.html')) {
        token = readSavedAdminToken();
      } else {
        token = readSavedParticipantToken();
      }
    }
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);
    return payload;
  }

  async function authenticate(pin) {
    const result = await request('/api/auth', { method: 'POST', body: JSON.stringify({ pin }) });
    token = result.token;
    try {
      localStorage.setItem(PARTICIPANT_TOKEN_KEY, token);
      localStorage.setItem(PARTICIPANT_USER_KEY, result.user);
      localStorage.setItem(PARTICIPANT_PIN_KEY, result.pin || pin);
      localStorage.setItem(PARTICIPANT_LAST_ACTIVE_KEY, String(Date.now()));
      sessionStorage.setItem(PARTICIPANT_TOKEN_KEY, token);
      sessionStorage.setItem(PARTICIPANT_USER_KEY, result.user);
    } catch (_) {}
    return result;
  }

  async function restoreParticipantSession() {
    const savedToken = readSavedParticipantToken();
    if (!savedToken) return null;

    const lastActive = Number(localStorage.getItem(PARTICIPANT_LAST_ACTIVE_KEY) || 0);
    // Si han pasado más de 3 horas (2 a 3 horas de inactividad solicitadas)
    if (lastActive > 0 && (Date.now() - lastActive > PARTICIPANT_INACTIVITY_LIMIT)) {
      clearParticipantSession();
      token = '';
      return null;
    }

    token = savedToken;
    try {
      const session = await request('/api/session');
      if (session.role !== 'client') throw new Error('Invalid client session');
      recordParticipantActivity();
      return {
        ...session,
        token: savedToken,
        user: session.user || localStorage.getItem(PARTICIPANT_USER_KEY) || '',
        pin: localStorage.getItem(PARTICIPANT_PIN_KEY) || ''
      };
    } catch {
      clearParticipantSession();
      token = '';
      return null;
    }
  }

  async function authenticateAdmin(password) {
    const result = await request('/api/admin/auth', { method: 'POST', body: JSON.stringify({ password }) });
    token = result.token;
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    recordAdminActivity();
    return result;
  }

  async function restoreAdminSession() {
    token = readSavedAdminToken();
    if (!token) return null;

    const lastActive = Number(localStorage.getItem(ADMIN_LAST_ACTIVE_KEY) || 0);
    // Si han pasado más de 10 minutos de inactividad, se exige la contraseña nuevamente
    if (lastActive > 0 && (Date.now() - lastActive > ADMIN_INACTIVITY_LIMIT)) {
      logout();
      return null;
    }

    try {
      const session = await request('/api/admin/session');
      if (session.role !== 'host') throw new Error('Invalid host session');
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      recordAdminActivity();
      return session;
    } catch {
      logout();
      return null;
    }
  }

  // Persistencia Absoluta en localStorage (Chat, Pedidos VAR, Rondas)
  const STATE_CACHE_KEY = 'ludito-cached-live-state';

  function getCachedState() {
    try {
      const data = localStorage.getItem(STATE_CACHE_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        return {
          events: Array.isArray(parsed.events) ? parsed.events : [],
          chat: Array.isArray(parsed.chat) ? parsed.chat : [],
          voicePreference: parsed.voicePreference || null,
          round: Number.isInteger(parsed.round) && parsed.round > 0 ? parsed.round : 1,
          accepting: parsed.accepting !== false,
          roundCapacity: typeof parsed.roundCapacity === 'number' ? parsed.roundCapacity : null,
          resetTimestamp: typeof parsed.resetTimestamp === 'number' ? parsed.resetTimestamp : 0
        };
      }
    } catch (_) {}
    return null;
  }

  function saveCachedState(state) {
    if (!state || typeof state !== 'object') return;
    try {
      const payload = {
        events: Array.isArray(state.events) ? state.events : [],
        chat: Array.isArray(state.chat) ? state.chat : [],
        voicePreference: state.voicePreference || null,
        round: Number.isInteger(state.round) && state.round > 0 ? state.round : 1,
        accepting: state.accepting !== false,
        roundCapacity: typeof state.roundCapacity === 'number' ? state.roundCapacity : null,
        resetTimestamp: typeof state.resetTimestamp === 'number' ? state.resetTimestamp : 0,
        cachedAt: Date.now()
      };
      localStorage.setItem(STATE_CACHE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function clearCachedState() {
    try {
      localStorage.removeItem(STATE_CACHE_KEY);
    } catch (_) {}
  }

  async function fetchConfig() {
    return request('/api/config');
  }

  async function fetchState() {
    try {
      const liveState = await request('/api/state');
      saveCachedState(liveState);
      return liveState;
    } catch (err) {
      const cached = getCachedState();
      if (cached) return cached;
      throw err;
    }
  }

  function subscribe(onState, onConnection = () => {}) {
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/api/events');
    eventSource.addEventListener('open', () => onConnection(true));
    eventSource.addEventListener('error', () => onConnection(false));
    eventSource.addEventListener('snapshot', (event) => {
      try {
        const data = JSON.parse(event.data);
        saveCachedState(data);
        onState(data, false);
      } catch { /* Ignore malformed event payloads. */ }
    });
    eventSource.addEventListener('state', (event) => {
      try {
        const data = JSON.parse(event.data);
        saveCachedState(data);
        onState(data, true);
      } catch { /* Ignore malformed event payloads. */ }
    });
    return () => eventSource?.close();
  }

  async function submitOrder(items) {
    return request('/api/orders', { method: 'POST', body: JSON.stringify({ items }) });
  }

  async function toggleRound() {
    return request('/api/rounds/toggle', { method: 'POST', body: '{}' });
  }

  async function setRoundCapacity(capacity) {
    return request('/api/rounds/capacity', { method: 'POST', body: JSON.stringify({ capacity }) });
  }

  async function resetLiveState() {
    return request('/api/admin/reset-live', { method: 'POST', body: '{}' });
  }

  async function clearChat() {
    return request('/api/admin/clear-chat', { method: 'POST', body: '{}' });
  }

  async function sendChat(message, senderId, senderName) {
    return request('/api/chat', { method: 'POST', body: JSON.stringify({ message, senderId, senderName }) });
  }

  async function saveVoicePreference(preference) {
    return request('/api/voice', { method: 'POST', body: JSON.stringify({ preference }) });
  }

  function getSpanishVoices() {
    if (!('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices().filter((voice) => /^es([_-]|$)/i.test(voice.lang));
  }

  function onSpanishVoicesChanged(callback) {
    if (!('speechSynthesis' in window)) {
      callback([]);
      return () => {};
    }
    const refresh = () => callback(getSpanishVoices());
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    refresh();
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh);
  }

  function createSpeechQueue({ maxQueued = 40 } = {}) {
    const queue = [];
    let speaking = false;
    let enabled = true;
    let generation = 0;
    let voicePreference = { voiceURI: '', lang: 'es-MX', name: '', volume: 1 };

    function resolveVoice() {
      const voices = getSpanishVoices();
      if (voicePreference.voiceURI) {
        const exactVoice = voices.find((voice) => voice.voiceURI === voicePreference.voiceURI);
        if (exactVoice) return exactVoice;
      }
      const preferredLanguage = (voicePreference.lang || 'es-MX').toLowerCase();
      return voices.find((voice) => voice.lang.toLowerCase() === preferredLanguage)
        || voices.find((voice) => voice.lang.toLowerCase().startsWith(preferredLanguage.split(/[-_]/)[0]))
        || voices[0]
        || null;
    }

    function playNext() {
      if (speaking || queue.length === 0 || !('speechSynthesis' in window)) return;
      const text = queue.shift();
      const utterance = new SpeechSynthesisUtterance(text);
      const utteranceGeneration = generation;
      const voice = resolveVoice();
      utterance.lang = voice?.lang || voicePreference.lang || 'es-MX';
      if (voice) utterance.voice = voice;
      utterance.volume = Math.min(1, Math.max(0, Number(voicePreference.volume ?? 1)));
      utterance.rate = 0.96;
      utterance.pitch = 1;
      utterance.onend = () => {
        if (utteranceGeneration !== generation) return;
        speaking = false;
        playNext();
      };
      utterance.onerror = () => {
        if (utteranceGeneration !== generation) return;
        speaking = false;
        playNext();
      };
      speaking = true;
      window.speechSynthesis.speak(utterance);
    }

    return {
      setVoicePreference(preference) {
        voicePreference = preference && typeof preference === 'object'
          ? { voiceURI: preference.voiceURI || '', lang: preference.lang || 'es-MX', name: preference.name || '', volume: Math.min(1, Math.max(0, Number(preference.volume ?? 1))) }
          : { voiceURI: '', lang: 'es-MX', name: '', volume: 1 };
      },
      speak(text) {
        if (!enabled || !('speechSynthesis' in window)) return false;
        if (queue.length >= maxQueued) queue.shift();
        queue.push(text);
        playNext();
        return true;
      },
      setEnabled(value) {
        enabled = Boolean(value);
        if (!enabled) this.clear();
      },
      clear() {
        generation += 1;
        queue.length = 0;
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        speaking = false;
      }
    };
  }

  const EMOJI_CATEGORIES = [
    {
      id: 'faces',
      name: 'Caritas',
      icon: '😀',
      emojis: [
        '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
        '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😋', '😛',
        '😜', '🤪', '🤩', '😎', '🥳', '😏', '🤔', '🤫', '🤭', '🫢',
        '🫡', '😬', '🤤', '🤠', '🤓', '🧐', '😴', '😱', '🤯', '😭',
        '🥺', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '💩', '🤡'
      ]
    },
    {
      id: 'gestures',
      name: 'Gestos',
      icon: '👋',
      emojis: [
        '👍', '👎', '👏', '🙌', '👐', '🤝', '👊', '✊', '🤛', '🤜',
        '✌️', '🤞', '🤟', '🤘', '🤙', '🖐️', '✋', '👋', '🙏', '💪',
        '🖕', '✍️', '💅', '👀', '👁️', '👄', '🫦', '🧠', '👑', '🦾',
        '🫂', '🗣️', '👣', '👂', '👃', '✨', '⚡', '🔥', '💯', '💥'
      ]
    },
    {
      id: 'animals',
      name: 'Animales',
      icon: '🐾',
      emojis: [
        '🔥', '✨', '⚡', '💥', '⭐', '🌟', '💫', '☄️', '🍄', '🌱',
        '🍀', '🌸', '🌹', '🌻', '🦁', '🐯', '🐶', '🐱', '🐵', '🦊',
        '🐻', '🐼', '🐨', '🦅', '🦉', '🐲', '🐉', '🦖', '🦈', '🐍',
        '🦋', '🐝', '🐢', '🐙', '🐬', '🦩', '🦄', '🐎', '🦓', '🐘'
      ]
    },
    {
      id: 'food',
      name: 'Comida',
      icon: '🍕',
      emojis: [
        '🍕', '🍔', '🍟', '🌭', '🍿', '🥓', '🌮', '🌯', '🍣', '🍱',
        '🍜', '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭', '🍓',
        '🍉', '🍌', '🍎', '🥑', '🍺', '🍻', '🥂', '🍷', '🍹', '☕',
        '🥤', '🧋', '🧀', '🍗', '🥪', '🥨', '🥐', '🥞', '🧇', '🍦'
      ]
    },
    {
      id: 'objects',
      name: 'Juegos',
      icon: '🎮',
      emojis: [
        '🎮', '🕹️', '🎲', '🎯', '🏆', '🥇', '🥈', '🥉', '🏎️', '🚀',
        '💰', '💎', '🎁', '🎟️', '🎪', '🎤', '🎧', '🎸', '🥁', '📢',
        '🔔', '⏱️', '⏳', '💣', '🪄', '🛡️', '⚔️', '🗝️', '🔑', '🏷️',
        '⚽', '🏀', '🎾', '🥊', '🛹', '🎳', '🎱', '🎴', '🧩', '🃏'
      ]
    },
    {
      id: 'symbols',
      name: 'Símbolos',
      icon: '⭐',
      emojis: [
        '🔴', '🟣', '🟡', '🔵', '🟢', '🟠', '⚪', '⚫', '🟤',
        '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖',
        '💯', '💢', '💥', '💫', '💬', '🗯️', '💭', '✔️', '✅', '❌',
        '❗', '❓', '👑', '🏁', '🚩', '🇲🇽', '🇨🇱', '🇦🇷', '🇨🇴', '🇪🇸'
      ]
    }
  ];

  function setupEmojiPicker({ toggleBtn, popover, input, quickChipsContainer }) {
    if (!toggleBtn || !popover || !input) return null;

    let activeCategoryIndex = 0;
    let searchQuery = '';

    function renderPopoverContent() {
      popover.replaceChildren();

      // Top bar: Search input + Close button
      const searchRow = document.createElement('div');
      searchRow.className = 'chat-emoji-search-row';

      const searchInput = document.createElement('input');
      searchInput.type = 'search';
      searchInput.className = 'chat-emoji-search';
      searchInput.placeholder = 'Buscar emoji (ej: fuego, estrella, risa)…';
      searchInput.value = searchQuery;
      searchInput.autocomplete = 'off';
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        renderGrid();
      });

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'chat-emoji-close';
      closeBtn.setAttribute('aria-label', 'Cerrar panel de emoticones');
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closePopover();
      });

      searchRow.append(searchInput, closeBtn);

      // Header with Category Tabs
      const tabsWrap = document.createElement('div');
      tabsWrap.className = 'chat-emoji-tabs';
      tabsWrap.setAttribute('role', 'tablist');

      EMOJI_CATEGORIES.forEach((cat, idx) => {
        const tabBtn = document.createElement('button');
        tabBtn.type = 'button';
        tabBtn.className = `chat-emoji-tab ${idx === activeCategoryIndex && !searchQuery ? 'active' : ''}`;
        tabBtn.setAttribute('role', 'tab');
        tabBtn.setAttribute('aria-selected', String(idx === activeCategoryIndex));
        tabBtn.title = cat.name;
        tabBtn.innerHTML = `<span class="emoji-tab-icon">${cat.icon}</span> <span class="emoji-tab-name">${cat.name}</span>`;
        tabBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          searchQuery = '';
          searchInput.value = '';
          activeCategoryIndex = idx;
          renderPopoverContent();
        });
        tabsWrap.append(tabBtn);
      });

      // Emoji Grid container
      const grid = document.createElement('div');
      grid.className = 'chat-emoji-grid';
      grid.setAttribute('role', 'tabpanel');

      function renderGrid() {
        grid.replaceChildren();
        let emojisToShow = [];
        if (searchQuery) {
          // Flatten all categories and filter
          const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
          emojisToShow = Array.from(new Set(all));
        } else {
          emojisToShow = EMOJI_CATEGORIES[activeCategoryIndex].emojis;
        }

        emojisToShow.forEach((emoji) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'chat-emoji-item';
          btn.textContent = emoji;
          btn.setAttribute('aria-label', `Insertar emoticón ${emoji}`);
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            insertEmoji(emoji);
          });
          grid.append(btn);
        });
      }

      renderGrid();
      popover.append(searchRow, tabsWrap, grid);
      setTimeout(() => searchInput.focus(), 60);
    }

    function insertEmoji(emoji) {
      if (input.disabled) return;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const val = input.value;
      input.value = val.substring(0, start) + emoji + val.substring(end);
      const nextPos = start + emoji.length;
      input.setSelectionRange(nextPos, nextPos);
      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function openPopover() {
      if (toggleBtn.disabled) return;
      renderPopoverContent();
      popover.hidden = false;
      toggleBtn.classList.add('active');
      toggleBtn.setAttribute('aria-expanded', 'true');
    }

    function closePopover() {
      popover.hidden = true;
      toggleBtn.classList.remove('active');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }

    function togglePopover() {
      if (popover.hidden) {
        openPopover();
      } else {
        closePopover();
      }
    }

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePopover();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!popover.hidden && !popover.contains(e.target) && !toggleBtn.contains(e.target)) {
        closePopover();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !popover.hidden) {
        closePopover();
      }
    });

    // Quick chips event listener
    if (quickChipsContainer) {
      quickChipsContainer.querySelectorAll('.quick-emoji-chip').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.preventDefault();
          const emoji = chip.dataset.emoji || chip.textContent.trim();
          insertEmoji(emoji);
        });
      });
    }

    return {
      open: openPopover,
      close: closePopover,
      insertEmoji,
      setEnabled(enabled) {
        toggleBtn.disabled = !enabled;
        if (quickChipsContainer) {
          quickChipsContainer.querySelectorAll('.quick-emoji-chip').forEach((chip) => {
            chip.disabled = !enabled;
          });
        }
        if (!enabled) {
          closePopover();
        }
      }
    };
  }

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  function getStreamWsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/stream-ws`;
  }

  function createStreamBroadcaster() {
    let ws = null;
    let localStream = null;
    let currentSource = 'none';
    const peerMap = new Map(); // viewerId -> { pc, pendingCandidates: [], isRemoteDescSet: boolean }
    let viewersCountCallback = null;
    let isLive = false;

    function connectWs() {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      ws = new WebSocket(getStreamWsUrl());

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register-host',
          isLive,
          source: currentSource
        }));
      });

      ws.addEventListener('message', async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'request-stream') {
            if (localStream) {
              await setupPeerConnectionForViewer(msg.viewerId);
            }
          } else if (msg.type === 'answer') {
            const entry = peerMap.get(msg.viewerId);
            if (entry && entry.pc.signalingState !== 'closed') {
              await entry.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              entry.isRemoteDescSet = true;
              while (entry.pendingCandidates.length > 0) {
                const c = entry.pendingCandidates.shift();
                await entry.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
              }
            }
          } else if (msg.type === 'candidate') {
            const entry = peerMap.get(msg.viewerId);
            if (entry && entry.pc.signalingState !== 'closed' && msg.candidate) {
              if (entry.isRemoteDescSet) {
                await entry.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
              } else {
                entry.pendingCandidates.push(msg.candidate);
              }
            }
          } else if (msg.type === 'viewer-disconnected') {
            const entry = peerMap.get(msg.viewerId);
            if (entry) {
              entry.pc.close();
              peerMap.delete(msg.viewerId);
            }
          } else if (msg.type === 'viewers-count') {
            if (viewersCountCallback) {
              viewersCountCallback(msg.count || 0);
            }
          }
        } catch (err) {
          console.error('Broadcaster ws message error:', err);
        }
      });

      ws.addEventListener('close', () => {
        setTimeout(connectWs, 2500);
      });
    }

    async function setupPeerConnectionForViewer(viewerId) {
      if (!localStream) return;
      const oldEntry = peerMap.get(viewerId);
      if (oldEntry) oldEntry.pc.close();

      const pc = new RTCPeerConnection(RTC_CONFIG);
      const entry = {
        pc,
        pendingCandidates: [],
        isRemoteDescSet: false
      };
      peerMap.set(viewerId, entry);

      localStream.getTracks().forEach((track) => {
        if (track.kind === 'video') {
          try {
            if ('contentHint' in track) track.contentHint = 'detail';
          } catch (_) {}
        }
        const sender = pc.addTrack(track, localStream);
        if (track.kind === 'video') {
          try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = 4500000;
            params.encodings[0].maxFramerate = 30;
            params.encodings[0].scaleResolutionDownBy = 1.0;
            if ('degradationPreference' in params) {
              params.degradationPreference = 'maintain-resolution';
            }
            sender.setParameters(params).catch(() => {});
          } catch (_) {}
        }
      });

      pc.addEventListener('icecandidate', (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'candidate',
            viewerId,
            candidate: event.candidate
          }));
        }
      });

      function optimizeSdpForBroadcast(rawSdp) {
        if (!rawSdp) return rawSdp;
        let sdp = rawSdp.replace(/a=fmtp:(\d+) (.*)/g, (match, pt, params) => {
          if (rawSdp.includes(`a=rtpmap:${pt} opus/48000/2`)) {
            if (!params.includes('stereo=')) {
              return `a=fmtp:${pt} ${params};stereo=1;sprop-stereo=1;maxaveragebitrate=160000;cbr=1`;
            }
          }
          return match;
        });

        if (sdp.includes('m=video') && !sdp.includes('b=AS:')) {
          sdp = sdp.replace(/(m=video[^\r\n]*[\r\n]+)/, '$1b=AS:4500\r\nb=TIAS:4500000\r\n');
        }
        return sdp;
      }

      const offer = await pc.createOffer();
      const enhancedSdp = optimizeSdpForBroadcast(offer.sdp);
      const enhancedOffer = new RTCSessionDescription({
        type: offer.type,
        sdp: enhancedSdp
      });
      await pc.setLocalDescription(enhancedOffer);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'offer',
          viewerId,
          sdp: enhancedOffer
        }));
      }
    }

    connectWs();

    return {
      attachStream(stream, sourceName = 'obs') {
        localStream = stream;
        currentSource = sourceName;
        isLive = true;

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'host-stream-started',
            source: sourceName
          }));
        }

        for (const viewerId of peerMap.keys()) {
          setupPeerConnectionForViewer(viewerId).catch(console.error);
        }
      },
      stopStream() {
        isLive = false;
        currentSource = 'none';

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'host-stream-stopped'
          }));
        }

        for (const entry of peerMap.values()) {
          entry.pc.close();
        }
        peerMap.clear();

        if (localStream) {
          localStream.getTracks().forEach((track) => track.stop());
          localStream = null;
        }
      },
      onViewersCount(cb) {
        viewersCountCallback = cb;
      },
      isLive() {
        return isLive;
      }
    };
  }

  function createStreamReceiver() {
    let ws = null;
    const viewerId = crypto.randomUUID();
    let pc = null;
    let pendingCandidates = [];
    let isRemoteDescSet = false;
    let streamCallback = null;
    let statusCallback = null;
    let streamEndedCallback = null;
    let viewersCountCallback = null;
    let currentRemoteStream = null;

    function connectWs() {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      ws = new WebSocket(getStreamWsUrl());

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
            if (statusCallback) statusCallback(msg);
            if (msg.isLive) {
              requestStream();
            } else {
              if (pc) {
                pc.close();
                pc = null;
              }
              currentRemoteStream = null;
              if (streamEndedCallback) streamEndedCallback();
            }
          } else if (msg.type === 'viewers-count') {
            if (viewersCountCallback) viewersCountCallback(msg.count ?? 0);
          } else if (msg.type === 'offer') {
            await handleOffer(msg.sdp);
          } else if (msg.type === 'candidate') {
            if (pc && pc.signalingState !== 'closed' && msg.candidate) {
              if (isRemoteDescSet) {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
              } else {
                pendingCandidates.push(msg.candidate);
              }
            }
          }
        } catch (err) {
          console.error('Receiver ws message error:', err);
        }
      });

      ws.addEventListener('close', () => {
        setTimeout(connectWs, 2500);
      });
    }

    async function handleOffer(sdp) {
      if (pc) {
        pc.close();
      }

      pendingCandidates = [];
      isRemoteDescSet = false;
      pc = new RTCPeerConnection(RTC_CONFIG);

      try {
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
      } catch (_) {}

      pc.addEventListener('track', (event) => {
        if (event.streams && event.streams[0]) {
          currentRemoteStream = event.streams[0];
          if (streamCallback) streamCallback(event.streams[0]);
        } else {
          if (!currentRemoteStream) currentRemoteStream = new MediaStream();
          currentRemoteStream.addTrack(event.track);
          if (streamCallback) streamCallback(currentRemoteStream);
        }
      });

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

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      isRemoteDescSet = true;
      while (pendingCandidates.length > 0) {
        const c = pendingCandidates.shift();
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
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
    }

    function requestStream() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'request-stream',
          viewerId
        }));
      }
    }

    // Periodic HTTP sync check
    setInterval(async () => {
      try {
        const res = await fetch('/api/stream/status');
        if (res.ok) {
          const status = await res.json();
          if (statusCallback) statusCallback(status);
          if (viewersCountCallback && typeof status.viewersCount === 'number') {
            viewersCountCallback(status.viewersCount);
          }
          if (status.isLive && (!currentRemoteStream || !pc)) {
            requestStream();
          }
        }
      } catch (_) {}
    }, 4000);

    connectWs();

    return {
      onStream(cb) {
        streamCallback = cb;
        if (currentRemoteStream) cb(currentRemoteStream);
      },
      onStatus(cb) {
        statusCallback = cb;
      },
      onViewersCount(cb) {
        viewersCountCallback = cb;
      },
      onStreamEnded(cb) {
        streamEndedCallback = cb;
      },
      requestStream
    };
  }

  async function fetchParticipants() {
    return request('/api/participants');
  }

  async function addParticipant(data) {
    return request('/api/admin/participants', { method: 'POST', body: JSON.stringify(data) });
  }

  async function updateParticipant(id, data) {
    return request(`/api/admin/participants/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async function deleteParticipant(id) {
    return request(`/api/admin/participants/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function deleteChatMessage(id) {
    return request(`/api/admin/chat/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function blockUser(data) {
    return request('/api/admin/users/block', { method: 'POST', body: JSON.stringify(data) });
  }

  async function fetchBlockedUsers() {
    return request('/api/admin/users/blocked');
  }

  async function unblockUser(data) {
    return request('/api/admin/users/unblock', { method: 'POST', body: JSON.stringify(data) });
  }

  async function fetchClientViewConfig() {
    try {
      const res = await request('/api/client-view-config');
      if (res) {
        try {
          localStorage.setItem('ludito_client_view_config', JSON.stringify(res));
        } catch (_) {}
        return res;
      }
    } catch (_) {
      try {
        const cached = localStorage.getItem('ludito_client_view_config');
        if (cached) return JSON.parse(cached);
      } catch (_) {}
    }
    return null;
  }

  async function saveClientViewConfig(config) {
    try {
      localStorage.setItem('ludito_client_view_config', JSON.stringify(config));
    } catch (_) {}
    return request('/api/admin/client-view-config', { method: 'POST', body: JSON.stringify(config) });
  }

  function logout() {
    token = '';
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    try {
      localStorage.removeItem(ADMIN_LAST_ACTIVE_KEY);
    } catch (_) {}
    clearParticipantSession();
  }

  function setupAdminInactivityMonitor(onTimeout) {
    let lastThrottledTime = 0;
    const registerInteraction = () => {
      const now = Date.now();
      if (now - lastThrottledTime > 3000) {
        lastThrottledTime = now;
        recordAdminActivity();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((evt) => {
      window.addEventListener(evt, registerInteraction, { passive: true });
    });

    const interval = setInterval(() => {
      const savedToken = readSavedAdminToken();
      if (!savedToken) return;
      const lastActive = Number(localStorage.getItem(ADMIN_LAST_ACTIVE_KEY) || 0);
      if (lastActive > 0 && (Date.now() - lastActive > ADMIN_INACTIVITY_LIMIT)) {
        token = '';
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        if (onTimeout) onTimeout();
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      events.forEach((evt) => {
        window.removeEventListener(evt, registerInteraction);
      });
    };
  }

  // ============================================================================
  // CLICK AUDIO FEEDBACK (Efecto de sonido corto y sutil al presionar botones)
  // ============================================================================
  let audioCtx = null;
  let lastClickSoundTime = 0;

  function playClickSound() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - lastClickSoundTime < 35) return; // Evita saturación y doble clic simultáneo
    lastClickSoundTime = now;

    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;
      if (!audioCtx) {
        audioCtx = new AudioCtxClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      // Click sutil y limpio estilo interruptor táctil suave (540Hz decae a 240Hz en 22ms)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(540, t);
      osc.frequency.exponentialRampToValueAtTime(240, t + 0.022);

      // Ganancia atenuada para evitar saturación o distorsión (pico suave en 0.05 con decaimiento)
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(t);
      osc.stop(t + 0.028);
    } catch (_) {
      // Ignorar si el navegador o dispositivo no permite audio en este instante
    }
  }

  // Delegación global: reproduce click audio feedback al presionar botones interactivos
  if (typeof document !== 'undefined') {
    const triggerClickAudio = (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      const interactiveEl = target.closest(
        'button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"], .quick-emoji-chip, .chat-emoji-item, .order-item, .chip-choice, .pill-btn, .tab-btn'
      );
      if (interactiveEl && !interactiveEl.disabled && !interactiveEl.getAttribute('aria-disabled')) {
        playClickSound();
      }
    };

    // Usamos pointerdown para retroalimentación táctil/auditiva inmediata sin retrasos
    document.addEventListener('pointerdown', triggerClickAudio, { capture: true, passive: true });
  }

  window.Ludito = {
    authenticate,
    authenticateAdmin,
    restoreAdminSession,
    restoreParticipantSession,
    recordParticipantActivity,
    clearParticipantSession,
    recordAdminActivity,
    setupAdminInactivityMonitor,
    fetchConfig,
    fetchState,
    subscribe,
    submitOrder,
    toggleRound,
    setRoundCapacity,
    resetLiveState,
    clearChat,
    sendChat,
    saveVoicePreference,
    getSpanishVoices,
    onSpanishVoicesChanged,
    createSpeechQueue,
    setupEmojiPicker,
    createStreamBroadcaster,
    createStreamReceiver,
    fetchParticipants,
    addParticipant,
    updateParticipant,
    deleteParticipant,
    deleteChatMessage,
    blockUser,
    fetchBlockedUsers,
    unblockUser,
    fetchClientViewConfig,
    saveClientViewConfig,
    getCachedState,
    saveCachedState,
    clearCachedState,
    playClickSound,
    logout
  };
})();