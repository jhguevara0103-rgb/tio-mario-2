/**
 * admin.js - Estudio de Composición de Escenas Web (Control de Host)
 */

import { initStage } from './stage.js';

const hostLogin = document.querySelector('#host-login');
const hostLayout = document.querySelector('#host-layout');
const hostLoginForm = document.querySelector('#host-login-form');
const hostPassword = document.querySelector('#host-password');
const hostLoginError = document.querySelector('#host-login-error');
const hostSession = document.querySelector('#host-session');
const resetButton = document.querySelector('#host-reset-button');
const resetStatus = document.querySelector('#host-reset-status');
const resetModal = document.querySelector('#reset-confirm-modal');
const resetCancel = document.querySelector('#reset-modal-cancel');
const resetConfirm = document.querySelector('#reset-modal-confirm');

const viewersCountEl = document.querySelector('#host-viewers-count');

// Pestañas de la Consola Derecha
const tabBtnLayers = document.querySelector('#tab-btn-layers');
const tabBtnChat = document.querySelector('#tab-btn-chat');
const tabBtnWhitelist = document.querySelector('#tab-btn-whitelist');
const tabBtnBlacklist = document.querySelector('#tab-btn-blacklist');
const panelLayers = document.querySelector('#panel-layers');
const panelChat = document.querySelector('#panel-chat');
const panelWhitelist = document.querySelector('#panel-whitelist');
const panelBlacklist = document.querySelector('#panel-blacklist');
const hostTabDbBadge = document.querySelector('#host-tab-db-badge');
const hostTabBlacklistBadge = document.querySelector('#host-tab-blacklist-badge');

// Modal de Bloqueo por Inactividad
const hostInactivityLockOverlay = document.querySelector('#host-inactivity-lock-overlay');
const inactivityUnlockForm = document.querySelector('#inactivity-unlock-form');
const inactivityPassword = document.querySelector('#inactivity-password');
const inactivityUnlockBtn = document.querySelector('#inactivity-unlock-btn');
const inactivityUnlockError = document.querySelector('#inactivity-unlock-error');

// Lista Negra / Usuarios Bloqueados
const blacklistTableBody = document.querySelector('#blacklist-table-body');
const blacklistSearchInput = document.querySelector('#blacklist-search');
let dbBlacklist = [];


// Base de Datos / Lista Blanca de Participantes
const dbAddForm = document.querySelector('#db-add-form');
const dbNewName = document.querySelector('#db-new-name');
const dbAddEmojiBtn = document.querySelector('#db-add-emoji-btn');
const dbAddEmojiPopover = document.querySelector('#db-add-emoji-popover');
const dbAddColorPalette = document.querySelector('#db-add-color-palette');
const dbNewColorInput = document.querySelector('#db-new-color');
const dbSubmitBtn = document.querySelector('#db-submit-button');
const dbFormStatus = document.querySelector('#db-form-status');
const dbTableBody = document.querySelector('#db-table-body');
const dbSearchInput = document.querySelector('#db-search');
const dbToastEl = document.querySelector('#db-toast');

// Modal de edición de participante de la lista blanca
const dbEditModal = document.querySelector('#db-edit-modal');
const dbEditForm = document.querySelector('#db-edit-form');
const dbEditId = document.querySelector('#db-edit-id');
const dbEditName = document.querySelector('#db-edit-name');
const dbEditEmojiBtn = document.querySelector('#db-edit-emoji-btn');
const dbEditEmojiPopover = document.querySelector('#db-edit-emoji-popover');
const dbEditColorPalette = document.querySelector('#db-edit-color-palette');
const dbEditColorInput = document.querySelector('#db-edit-color');
const dbEditCancel = document.querySelector('#db-edit-cancel');
const dbEditCancelX = document.querySelector('#db-edit-cancel-x');
const dbEditSubmit = document.querySelector('#db-edit-submit');

// Modal de bloqueo y purga de historial
const dbBlockModal = document.querySelector('#db-block-modal');
const dbBlockModalText = document.querySelector('#db-block-modal-text');
const dbBlockCancel = document.querySelector('#db-block-cancel');
const dbBlockConfirm = document.querySelector('#db-block-confirm');

// Modal de eliminación de lista blanca
const dbDeleteModal = document.querySelector('#db-delete-modal');
const dbDeleteCancelBtn = document.querySelector('#db-delete-cancel');
const dbDeleteConfirmBtn = document.querySelector('#db-delete-confirm');

// Modal de registro rápido desde el chat
const quickRegModal = document.querySelector('#quick-register-modal');
const quickRegForm = document.querySelector('#quick-reg-form');
const quickRegName = document.querySelector('#quick-reg-name');
const quickRegEmojiBtn = document.querySelector('#quick-reg-emoji-btn');
const quickRegEmojiPopover = document.querySelector('#quick-reg-emoji-popover');
const quickRegColorPalette = document.querySelector('#quick-reg-color-palette');
const quickRegColorInput = document.querySelector('#quick-reg-color');
const quickRegDeviceId = document.querySelector('#quick-reg-device-id');
const quickRegClose = document.querySelector('#quick-reg-close');
const quickRegCancel = document.querySelector('#quick-reg-cancel');

let dbParticipants = [];
let dbToastTimer = null;
let pendingDeleteParticipant = null;
let pendingEditParticipant = null;
let pendingBlockTarget = null;

// Helpers para selección de chips de colores sólidos
function bindColorPalette(container, hiddenInput) {
  if (!container || !hiddenInput) return;
  const chips = container.querySelectorAll('.db-color-chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      hiddenInput.value = chip.dataset.color || '';
    });
  });
}

function setColorPaletteValue(container, hiddenInput, color) {
  if (!container || !hiddenInput) return;
  hiddenInput.value = color || '';
  const chips = container.querySelectorAll('.db-color-chip');
  let matched = false;
  chips.forEach((chip) => {
    const isMatch = (chip.dataset.color || '').toLowerCase() === (color || '').toLowerCase();
    chip.classList.toggle('active', isMatch);
    if (isMatch) matched = true;
  });
  if (!matched && chips.length > 0) {
    chips[0].classList.add('active');
  }
}

// Emisor WebRTC hacia los clientes
const streamBroadcaster = window.Ludito.createStreamBroadcaster();
streamBroadcaster.onViewersCount((count) => {
  if (viewersCountEl) {
    viewersCountEl.textContent = `${count} ${count === 1 ? 'espectador' : 'espectadores'}`;
  }
});

// Chat en vivo
const chatList = document.querySelector('#host-chat-list');
const chatEmpty = document.querySelector('#host-chat-empty');
const chatForm = document.querySelector('#host-chat-form');
const chatInput = document.querySelector('#host-chat-input');
const chatSend = document.querySelector('#host-chat-send');
const chatStatus = document.querySelector('#host-chat-status');
const hostChatEmojiToggle = document.querySelector('#host-chat-emoji-toggle');
const hostChatEmojiPopover = document.querySelector('#host-chat-emoji-popover');
const hostQuickEmojis = document.querySelector('#host-quick-emojis');

let hostEmojiPicker = null;
if (window.Ludito?.setupEmojiPicker && hostChatEmojiToggle && hostChatEmojiPopover && chatInput) {
  hostEmojiPicker = window.Ludito.setupEmojiPicker({
    toggleBtn: hostChatEmojiToggle,
    popover: hostChatEmojiPopover,
    input: chatInput,
    quickChipsContainer: hostQuickEmojis
  });
}

// Inicialización de selectores de emojis y paletas de color en formularios
if (window.Ludito?.setupEmojiPicker) {
  if (dbAddEmojiBtn && dbAddEmojiPopover && dbNewName) {
    window.Ludito.setupEmojiPicker({
      toggleBtn: dbAddEmojiBtn,
      popover: dbAddEmojiPopover,
      input: dbNewName
    });
  }
  if (dbEditEmojiBtn && dbEditEmojiPopover && dbEditName) {
    window.Ludito.setupEmojiPicker({
      toggleBtn: dbEditEmojiBtn,
      popover: dbEditEmojiPopover,
      input: dbEditName
    });
  }
  if (quickRegEmojiBtn && quickRegEmojiPopover && quickRegName) {
    window.Ludito.setupEmojiPicker({
      toggleBtn: quickRegEmojiBtn,
      popover: quickRegEmojiPopover,
      input: quickRegName
    });
  }
}

bindColorPalette(dbAddColorPalette, dbNewColorInput);
bindColorPalette(dbEditColorPalette, dbEditColorInput);
bindColorPalette(quickRegColorPalette, quickRegColorInput);


// Síntesis de voz
const voiceToggle = document.querySelector('#host-voice-toggle');
const voiceSelector = document.querySelector('#voiceSelector');
const voiceTestButton = document.querySelector('#host-voice-test');
const voiceVolume = document.querySelector('#host-voice-volume');
const voiceVolumeValue = document.querySelector('#host-voice-volume-value');
const speechQueue = window.Ludito.createSpeechQueue();
const seenChatIds = new Set();

let isHost = false;
let spanishVoices = [];
let voicePreference = null;
speechQueue.setEnabled(voiceToggle?.checked ?? true);

function renderVoiceOptions(voices) {
  spanishVoices = voices;
  const selectedVoiceURI = voicePreference?.voiceURI || '';
  if (!voiceSelector) return;
  voiceSelector.replaceChildren();
  const automaticOption = document.createElement('option');
  automaticOption.value = '';
  automaticOption.textContent = voices.length ? 'Automática (español)' : 'Voz del sistema';
  voiceSelector.append(automaticOption);
  voices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} · ${voice.lang}`;
    voiceSelector.append(option);
  });
  voiceSelector.value = voices.some((voice) => voice.voiceURI === selectedVoiceURI) ? selectedVoiceURI : '';
  voiceSelector.disabled = !isHost;
  if (voiceTestButton) voiceTestButton.disabled = !isHost;
  if (voiceVolume) voiceVolume.disabled = !isHost;
}

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

  if (window.Ludito?.saveCachedState) {
    window.Ludito.saveCachedState(state);
  }

  if (!state.chat || state.chat.length === 0) {
    seenChatIds.clear();
    speechQueue.clear();
  }
  voicePreference = state.voicePreference || null;
  speechQueue.setVoicePreference(voicePreference);
  const volume = Number(voicePreference?.volume ?? 1);
  if (voiceVolume && voiceVolumeValue) {
    voiceVolume.value = String(volume);
    voiceVolumeValue.value = `${Math.round(volume * 100)}%`;
    voiceVolumeValue.textContent = `${Math.round(volume * 100)}%`;
  }
  if (spanishVoices.length || voicePreference) renderVoiceOptions(spanishVoices);

  renderChat(state.chat || [], isLiveUpdate);
}

function renderChat(messages, isLiveUpdate) {
  chatList.replaceChildren(chatEmpty);
  chatEmpty.hidden = messages.length > 0;

  messages.forEach((message) => {
    const isNew = !seenChatIds.has(message.id);
    if (isLiveUpdate && isNew && voiceToggle && voiceToggle.checked) {
      speechQueue.speak(`${message.name} dice: ${message.text}`);
    }
    seenChatIds.add(message.id);

    const row = document.createElement('article');
    row.className = isLiveUpdate && isNew ? 'host-chat-message is-incoming' : 'host-chat-message';
    row.dataset.msgId = message.id;

    const header = document.createElement('div');
    header.className = 'host-chat-message-header';

    const authorWrap = document.createElement('div');
    authorWrap.className = 'host-chat-author-wrap';

    const MARIO_PALETTE = ['#fed100', '#e52521', '#009fe3', '#00a844', '#9d4edd', '#ff6b35'];
    const name = document.createElement('strong');
    name.className = 'client-chat-author-name';
    const rawName = (message.name && message.name.trim()) ? message.name.trim() : 'Invitado';

    // Personalización de Color Sólido o Multicolor Predeterminado
    if (message.color) {
      name.style.color = message.color;
      name.style.textShadow = `0 0 12px ${message.color}88, 0 1px 2px rgba(0, 0, 0, 0.9)`;
      name.textContent = rawName;
    } else {
      Array.from(rawName).forEach((ch, idx) => {
        const span = document.createElement('span');
        span.textContent = ch;
        if (ch.trim()) {
          span.style.color = MARIO_PALETTE[idx % MARIO_PALETTE.length];
        } else {
          span.innerHTML = '&nbsp;';
        }
        name.append(span);
      });
    }
    authorWrap.append(name);

    // Etiqueta de identificación
    const roleBadge = document.createElement('span');
    if (message.role === 'host') {
      roleBadge.className = 'chat-badge host';
      roleBadge.textContent = 'HOST';
    } else if (message.isRegistered || message.role === 'registered') {
      roleBadge.className = 'chat-badge verified';
      roleBadge.textContent = '✓ Registrado';
    } else {
      roleBadge.className = 'chat-badge guest';
      roleBadge.textContent = 'Invitado';

      // Botón rápido de registro para el administrador
      if (message.senderId && message.senderId !== 'host') {
        const regBtn = document.createElement('button');
        regBtn.type = 'button';
        regBtn.className = 'chat-register-quick-btn';
        regBtn.textContent = '➕ Registrar';
        regBtn.title = 'Registrar a este usuario en la lista blanca oficial';
        regBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openQuickRegisterModal(message.senderId, message.name !== 'Invitado' ? message.name : '');
        });
        authorWrap.append(regBtn);
      }
    }
    authorWrap.append(roleBadge);

    const time = document.createElement('time');
    time.dateTime = message.timestamp;
    time.textContent = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(message.timestamp));

    // Herramientas de Moderación del Anfitrión (Borrar individualmente / Bloquear usuario)
    const msgTools = document.createElement('div');
    msgTools.className = 'admin-msg-tools';

    const delMsgBtn = document.createElement('button');
    delMsgBtn.type = 'button';
    delMsgBtn.className = 'admin-msg-tool-btn delete';
    delMsgBtn.title = 'Eliminar este mensaje';
    delMsgBtn.textContent = '🗑️';
    delMsgBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      delMsgBtn.disabled = true;
      try {
        await window.Ludito.deleteChatMessage(message.id);
      } catch (err) {
        console.error('Error eliminando mensaje:', err);
        delMsgBtn.disabled = false;
      }
    });
    msgTools.append(delMsgBtn);

    if (message.role !== 'host') {
      const blockUserBtn = document.createElement('button');
      blockUserBtn.type = 'button';
      blockUserBtn.className = 'admin-msg-tool-btn block';
      blockUserBtn.title = 'Bloquear usuario y purgar todo su historial';
      blockUserBtn.textContent = '🚫';
      blockUserBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openBlockModal({ senderId: message.senderId, name: message.name, deviceId: message.deviceId });
      });
      msgTools.append(blockUserBtn);
    }

    const text = document.createElement('p');
    text.textContent = message.text;

    header.append(authorWrap, time, msgTools);
    row.append(header, text);
    chatList.append(row);
  });

  chatList.scrollTo({ top: chatList.scrollHeight, behavior: 'smooth' });
}

// Modal de registro rápido desde el chat
function openQuickRegisterModal(senderDeviceId, initialName) {
  if (!quickRegModal) return;
  quickRegDeviceId.value = senderDeviceId || '';
  quickRegName.value = initialName || '';
  setColorPaletteValue(quickRegColorPalette, quickRegColorInput, '');
  quickRegModal.hidden = false;
  setTimeout(() => quickRegName.focus(), 50);
}

function closeQuickRegisterModal() {
  if (quickRegModal) quickRegModal.hidden = true;
}

if (quickRegClose) quickRegClose.addEventListener('click', closeQuickRegisterModal);
if (quickRegCancel) quickRegCancel.addEventListener('click', closeQuickRegisterModal);
if (quickRegModal) {
  quickRegModal.addEventListener('click', (e) => {
    if (e.target === quickRegModal) closeQuickRegisterModal();
  });
}

if (quickRegForm) {
  quickRegForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = quickRegName.value.trim();
    const deviceId = quickRegDeviceId.value.trim();
    const color = quickRegColorInput ? quickRegColorInput.value.trim() : '';
    if (!name) return;

    try {
      const res = await window.Ludito.addParticipant({ name, deviceId: deviceId || undefined, color: color || undefined });
      closeQuickRegisterModal();
      showDbToast(`¡"${res.participant.name}" registrado en la lista oficial!`);
      loadAdminParticipants();
    } catch (err) {
      alert(err.message);
    }
  });
}

// Autenticación de Host y Manejo de Inactividad
async function unlockHost(session) {
  if (!session || session.role !== 'host') throw new Error('Esta cuenta no tiene permisos de anfitrión.');
  isHost = true;
  sessionStorage.setItem(ADMIN_AUTH_STORAGE_KEY, 'true');
  localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, 'true');

  hostSession.textContent = (session.user || 'El Tío Mario').toUpperCase();
  hostLogin.hidden = true;
  hostLayout.hidden = false;
  hostPassword.value = '';
  resetButton.disabled = false;
  renderVoiceOptions(spanishVoices);
  chatInput.disabled = false;
  chatSend.disabled = false;
  if (hostEmojiPicker) hostEmojiPicker.setEnabled(true);
  chatStatus.textContent = 'Conectado como Administrador (Tío Mario)';

  // Asegurar que El Tío Mario Studio (Escenario) esté 100% editable para el administrador
  if (stageController && typeof stageController.setEditable === 'function') {
    stageController.setEditable(true);
  }

  // Cargar las secciones con permisos de administrador
  loadAdminParticipants().catch((err) => console.warn('Error cargando participantes:', err));
  loadAdminBlacklist().catch((err) => console.warn('Error cargando lista negra:', err));

  if (window.Ludito?.setupAdminInactivityMonitor) {
    window.Ludito.setupAdminInactivityMonitor(() => {
      // Bloqueo de seguridad sin detener la señal en vivo del escenario
      if (hostInactivityLockOverlay) {
        hostInactivityLockOverlay.hidden = false;
        if (inactivityPassword) {
          inactivityPassword.value = '';
          inactivityPassword.focus();
        }
      } else {
        isHost = false;
        hostLayout.hidden = true;
        hostLogin.hidden = false;
        hostLoginError.textContent = 'Sesión pausada por inactividad. Ingresa la contraseña de anfitrión para reactivar.';
      }
    });
  }
}

// ============================================================================
// AUTENTICACIÓN COMO ADMINISTRADOR (ONLINE CON TOKEN + COMPATIBLE ESTÁTICO)
// ============================================================================
const ADMIN_SECRET_KEY = 'tiomario#2026Admin$*';
const ADMIN_AUTH_STORAGE_KEY = 'isAdminAuthenticated';

function isClientAdminAuthenticated() {
  return sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY) === 'true' || localStorage.getItem(ADMIN_AUTH_STORAGE_KEY) === 'true';
}

function clientAdminLogout() {
  if (window.Ludito?.logout) {
    window.Ludito.logout();
  }
  sessionStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
  localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
  isHost = false;
  hostLayout.hidden = true;
  hostLogin.hidden = false;
  hostPassword.value = '';
  hostLoginError.textContent = '';
  if (hostInactivityLockOverlay) hostInactivityLockOverlay.hidden = true;
  if (hostPassword) hostPassword.focus();
}

// Desbloqueo del modal de inactividad
if (inactivityUnlockForm) {
  inactivityUnlockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!inactivityPassword) return;
    const pass = inactivityPassword.value.trim();
    if (!pass) return;

    if (inactivityUnlockBtn) inactivityUnlockBtn.disabled = true;
    if (inactivityUnlockError) inactivityUnlockError.textContent = 'Verificando…';

    try {
      const session = await window.Ludito.authenticateAdmin(pass);
      isHost = true;
      sessionStorage.setItem(ADMIN_AUTH_STORAGE_KEY, 'true');
      localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, 'true');
      if (hostInactivityLockOverlay) hostInactivityLockOverlay.hidden = true;
      inactivityPassword.value = '';
      if (inactivityUnlockError) inactivityUnlockError.textContent = '';
      if (stageController && typeof stageController.setEditable === 'function') {
        stageController.setEditable(true);
      }
      showDbToast('¡Controles de Administrador reactivados!');
    } catch (err) {
      if (inactivityUnlockError) inactivityUnlockError.textContent = err.message || 'Contraseña incorrecta';
      inactivityPassword.focus();
    } finally {
      if (inactivityUnlockBtn) inactivityUnlockBtn.disabled = false;
    }
  });
}

// Validación inicial al cargar la página: verifica sesión activa
(async () => {
  try {
    const session = await window.Ludito.restoreAdminSession();
    if (session && session.role === 'host') {
      await unlockHost(session);
      return;
    }
  } catch (_) {}

  if (isClientAdminAuthenticated()) {
    unlockHost({ role: 'host', user: 'El Tío Mario' }).catch(() => {});
  } else {
    hostLayout.hidden = true;
    hostLogin.hidden = false;
  }
})();

// Formulario principal de Login de Host
hostLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hostLoginError.textContent = '';
  const password = hostPassword.value.trim();
  if (!password) {
    hostPassword.focus();
    return;
  }

  const submitBtn = hostLoginForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  hostLoginError.textContent = 'Verificando contraseña de administrador…';

  try {
    const session = await window.Ludito.authenticateAdmin(password);
    await unlockHost(session);
    hostLoginError.textContent = '';
  } catch (error) {
    hostLoginError.textContent = error.message || 'Contraseña incorrecta. Inténtalo de nuevo.';
    hostPassword.focus();
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// Botón de Cerrar Sesión en Cabecera
const hostLogoutBtn = document.querySelector('#host-logout-btn');
if (hostLogoutBtn) {
  hostLogoutBtn.addEventListener('click', () => {
    if (confirm('¿Deseas cerrar la sesión de anfitrión?')) {
      clientAdminLogout();
    }
  });
}

// Envío de chat del Host
chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!isHost || !message) return;
  chatInput.disabled = true;
  chatSend.disabled = true;
  if (hostEmojiPicker) hostEmojiPicker.setEnabled(false);
  try {
    await window.Ludito.sendChat(message);
    chatInput.value = '';
    chatStatus.textContent = 'Mensaje enviado.';
  } catch (error) {
    chatStatus.textContent = error.message;
  } finally {
    chatInput.disabled = !isHost;
    chatSend.disabled = !isHost;
    if (hostEmojiPicker) hostEmojiPicker.setEnabled(isHost);
    if (isHost) chatInput.focus();
  }
});

// Control de Voces
window.Ludito.onSpanishVoicesChanged((voices) => renderVoiceOptions(voices));

voiceToggle.addEventListener('change', () => {
  speechQueue.setEnabled(voiceToggle.checked);
});

voiceSelector.addEventListener('change', async () => {
  if (!isHost) return;
  const selectedVoice = spanishVoices.find((voice) => voice.voiceURI === voiceSelector.value) || null;
  const currentVolume = Number(voiceVolume.value || 1);
  voicePreference = selectedVoice
    ? { voiceURI: selectedVoice.voiceURI, lang: selectedVoice.lang, name: selectedVoice.name, volume: currentVolume }
    : { voiceURI: '', lang: 'es-MX', name: 'Automática (español)', volume: currentVolume };
  try {
    await window.Ludito.saveVoicePreference(voicePreference);
  } catch (error) {
    console.error('Error guardando voz:', error);
  }
});

voiceVolume.addEventListener('input', () => {
  const currentVolume = Number(voiceVolume.value || 1);
  voiceVolumeValue.value = `${Math.round(currentVolume * 100)}%`;
  voiceVolumeValue.textContent = `${Math.round(currentVolume * 100)}%`;
});

voiceVolume.addEventListener('change', async () => {
  if (!isHost) return;
  const currentVolume = Number(voiceVolume.value || 1);
  voicePreference = { ...(voicePreference || {}), volume: currentVolume };
  try {
    await window.Ludito.saveVoicePreference(voicePreference);
  } catch (error) {
    console.error('Error guardando volumen:', error);
  }
});

voiceTestButton.addEventListener('click', () => {
  speechQueue.speak('Prueba de voz en directo para el canal.');
});

// Reinicio de Sala
resetButton.addEventListener('click', () => {
  resetModal.hidden = false;
});

resetCancel.addEventListener('click', () => {
  resetModal.hidden = true;
});

resetConfirm.addEventListener('click', async () => {
  resetConfirm.disabled = true;
  resetStatus.textContent = 'Reiniciando…';
  try {
    await window.Ludito.clearChat();
    resetModal.hidden = true;
    resetStatus.textContent = 'Sala reiniciada.';
    setTimeout(() => { resetStatus.textContent = ''; }, 3000);
  } catch (error) {
    resetStatus.textContent = error.message;
  } finally {
    resetConfirm.disabled = false;
  }
});

// ============================================================================
// CONMUTACIÓN DE PESTAÑAS DE LA CONSOLA DERECHA
// ============================================================================
let stageController = null;

function switchConsoleTab(viewName) {
  const isLayers = viewName === 'layers';
  const isChat = viewName === 'chat';
  const isWhitelist = viewName === 'whitelist';
  const isBlacklist = viewName === 'blacklist';

  tabBtnLayers.classList.toggle('active', isLayers);
  tabBtnChat.classList.toggle('active', isChat);
  tabBtnWhitelist.classList.toggle('active', isWhitelist);
  if (tabBtnBlacklist) tabBtnBlacklist.classList.toggle('active', isBlacklist);

  panelLayers.hidden = !isLayers;
  panelChat.hidden = !isChat;
  panelWhitelist.hidden = !isWhitelist;
  if (panelBlacklist) panelBlacklist.hidden = !isBlacklist;

  // El escenario SIEMPRE permanece editable para el administrador autenticado
  if (stageController && typeof stageController.setEditable === 'function') {
    stageController.setEditable(true);
  }

  if (isWhitelist) {
    loadAdminParticipants();
  } else if (isBlacklist) {
    loadAdminBlacklist();
  } else if (isLayers && stageController) {
    stageController.updateOverlay();
  }
}

tabBtnLayers.addEventListener('click', () => switchConsoleTab('layers'));
tabBtnChat.addEventListener('click', () => switchConsoleTab('chat'));
tabBtnWhitelist.addEventListener('click', () => switchConsoleTab('whitelist'));
if (tabBtnBlacklist) tabBtnBlacklist.addEventListener('click', () => switchConsoleTab('blacklist'));

// ============================================================================
// GESTIÓN DE LISTA BLANCA DE PARTICIPANTES
// ============================================================================
function showDbToast(msg, duration = 3500) {
  if (!dbToastEl) return;
  if (dbToastTimer) clearTimeout(dbToastTimer);
  dbToastEl.textContent = msg;
  dbToastEl.hidden = false;
  dbToastTimer = setTimeout(() => {
    dbToastEl.hidden = true;
  }, duration);
}

async function loadAdminParticipants() {
  if (!dbTableBody) return;
  try {
    const data = await window.Ludito.fetchParticipants();
    dbParticipants = Array.isArray(data.participants) ? data.participants : [];
    renderAdminParticipantsTable(dbSearchInput?.value || '');
    if (hostTabDbBadge) hostTabDbBadge.textContent = String(dbParticipants.length);
  } catch (err) {
    dbTableBody.innerHTML = `<tr><td colspan="4" class="db-table-empty error">Error: ${err.message}</td></tr>`;
  }
}

function renderAdminParticipantsTable(query = '') {
  if (!dbTableBody) return;
  dbTableBody.replaceChildren();

  const q = query.trim().toLowerCase();
  const filtered = q
    ? dbParticipants.filter((p) => p.name.toLowerCase().includes(q))
    : dbParticipants;

  if (filtered.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="4" class="db-table-empty">${q ? 'No hay participantes que coincidan con la búsqueda.' : 'No hay participantes registrados todavía.'}</td>`;
    dbTableBody.append(row);
    return;
  }

  filtered.forEach((p, index) => {
    const tr = document.createElement('tr');

    const tdNum = document.createElement('td');
    tdNum.className = 'td-num';
    tdNum.textContent = String(index + 1);

    const tdName = document.createElement('td');
    tdName.className = 'td-name';
    if (p.color) {
      const colorDot = document.createElement('span');
      colorDot.className = 'db-user-badge-color';
      colorDot.style.background = p.color;
      tdName.append(colorDot);

      const nameText = document.createElement('span');
      nameText.textContent = p.name;
      nameText.style.color = p.color;
      nameText.style.fontWeight = 'bold';
      nameText.style.textShadow = `0 0 10px ${p.color}66`;
      tdName.append(nameText);
    } else {
      tdName.textContent = p.name;
    }

    const tdDate = document.createElement('td');
    tdDate.className = 'td-date';
    try {
      tdDate.textContent = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(p.createdAt));
    } catch {
      tdDate.textContent = 'Reciente';
    }

    const tdActions = document.createElement('td');
    tdActions.className = 'td-actions';

    // Botón Editar Nombre y Color (✏️)
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'db-action-btn edit';
    editBtn.title = 'Editar nombre y color asignado';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => {
      openEditParticipantModal(p);
    });

    // Botón Bloquear o Desbloquear según estado actual
    let middleBtn;
    if (p.isBlocked) {
      const blockedTag = document.createElement('span');
      blockedTag.className = 'blacklist-badge-tag';
      blockedTag.style.marginLeft = '8px';
      blockedTag.textContent = '🚫 Bloqueado';
      tdName.append(blockedTag);

      const unblockBtn = document.createElement('button');
      unblockBtn.type = 'button';
      unblockBtn.className = 'db-action-btn unblock';
      unblockBtn.title = 'Desbloquear y devolver acceso al chat';
      unblockBtn.innerHTML = '<span>🔓 Desbloquear</span>';
      unblockBtn.addEventListener('click', async () => {
        unblockBtn.disabled = true;
        try {
          await window.Ludito.unblockUser({
            participantId: p.id,
            name: p.name,
            deviceId: p.deviceId
          });
          showDbToast(`¡"${p.name}" ha sido desbloqueado con éxito!`);
          await loadAdminParticipants();
          await loadAdminBlacklist();
        } catch (err) {
          alert(`Error al desbloquear: ${err.message}`);
          unblockBtn.disabled = false;
        }
      });
      middleBtn = unblockBtn;
    } else {
      const blockBtn = document.createElement('button');
      blockBtn.type = 'button';
      blockBtn.className = 'db-action-btn block';
      blockBtn.title = 'Bloquear usuario y purgar todos sus mensajes';
      blockBtn.textContent = '🚫';
      blockBtn.addEventListener('click', () => {
        openBlockModal({ participantId: p.id, name: p.name, deviceId: p.deviceId });
      });
      middleBtn = blockBtn;
    }

    // Botón Eliminar de lista blanca (🗑️)
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'db-action-btn delete';
    delBtn.title = 'Eliminar de la lista blanca';
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', () => {
      openDeleteModal(p);
    });

    tdActions.append(editBtn, middleBtn, delBtn);
    tr.append(tdNum, tdName, tdDate, tdActions);
    dbTableBody.append(tr);
  });
}

// Modal de edición de participante de lista blanca
function openEditParticipantModal(participant) {
  pendingEditParticipant = participant;
  if (!dbEditModal) return;
  if (dbEditId) dbEditId.value = participant.id;
  if (dbEditName) dbEditName.value = participant.name;
  setColorPaletteValue(dbEditColorPalette, dbEditColorInput, participant.color || '');
  dbEditModal.hidden = false;
  setTimeout(() => dbEditName?.focus(), 50);
}

function closeEditParticipantModal() {
  pendingEditParticipant = null;
  if (dbEditModal) dbEditModal.hidden = true;
}

if (dbEditCancel) dbEditCancel.addEventListener('click', closeEditParticipantModal);
if (dbEditCancelX) dbEditCancelX.addEventListener('click', closeEditParticipantModal);
if (dbEditModal) {
  dbEditModal.addEventListener('click', (e) => {
    if (e.target === dbEditModal) closeEditParticipantModal();
  });
}

if (dbEditForm) {
  dbEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingEditParticipant) return;
    const name = dbEditName.value.trim();
    const color = dbEditColorInput ? dbEditColorInput.value.trim() : '';
    if (!name) {
      dbEditName.focus();
      return;
    }
    if (dbEditSubmit) dbEditSubmit.disabled = true;
    try {
      const res = await window.Ludito.updateParticipant(pendingEditParticipant.id, {
        name,
        color: color || undefined
      });
      const updated = res.participant;
      const idx = dbParticipants.findIndex((p) => p.id === updated.id);
      if (idx !== -1) {
        dbParticipants[idx] = updated;
      }
      renderAdminParticipantsTable(dbSearchInput?.value || '');
      showDbToast(`¡"${updated.name}" actualizado con éxito!`);
      closeEditParticipantModal();
    } catch (err) {
      alert(`Error al actualizar: ${err.message}`);
    } finally {
      if (dbEditSubmit) dbEditSubmit.disabled = false;
    }
  });
}

// Modal de bloqueo de usuario y purga masiva de historial
function openBlockModal(target) {
  pendingBlockTarget = target;
  if (!dbBlockModal) return;
  if (dbBlockModalText) {
    const targetName = target.name || 'este usuario';
    dbBlockModalText.innerHTML = `Esta acción <strong>expulsará a "${targetName}"</strong> de la sala e impedirá que vuelva a enviar mensajes. Además, <strong>se eliminarán automáticamente todos los mensajes</strong> que haya escrito en el chat en tiempo real.`;
  }
  dbBlockModal.hidden = false;
}

function closeBlockModal() {
  pendingBlockTarget = null;
  if (dbBlockModal) dbBlockModal.hidden = true;
}

if (dbBlockCancel) dbBlockCancel.addEventListener('click', closeBlockModal);
if (dbBlockModal) {
  dbBlockModal.addEventListener('click', (e) => {
    if (e.target === dbBlockModal) closeBlockModal();
  });
}

if (dbBlockConfirm) {
  dbBlockConfirm.addEventListener('click', async () => {
    if (!pendingBlockTarget) return;
    dbBlockConfirm.disabled = true;
    try {
      await window.Ludito.blockUser(pendingBlockTarget);
      await loadAdminParticipants();
      await loadAdminBlacklist();
      showDbToast(`Usuario bloqueado y su historial de mensajes purgado.`);
      closeBlockModal();
    } catch (err) {
      alert(`Error al bloquear: ${err.message}`);
    } finally {
      dbBlockConfirm.disabled = false;
    }
  });
}

function openDeleteModal(participant) {
  pendingDeleteParticipant = participant;
  if (dbDeleteModal) dbDeleteModal.hidden = false;
}

function closeDeleteModal() {
  pendingDeleteParticipant = null;
  if (dbDeleteModal) dbDeleteModal.hidden = true;
}

if (dbDeleteCancelBtn) dbDeleteCancelBtn.addEventListener('click', closeDeleteModal);
if (dbDeleteModal) {
  dbDeleteModal.addEventListener('click', (e) => {
    if (e.target === dbDeleteModal) closeDeleteModal();
  });
}

if (dbDeleteConfirmBtn) {
  dbDeleteConfirmBtn.addEventListener('click', async () => {
    if (!pendingDeleteParticipant) return;
    const p = pendingDeleteParticipant;
    dbDeleteConfirmBtn.disabled = true;
    try {
      await window.Ludito.deleteParticipant(p.id);
      dbParticipants = dbParticipants.filter((item) => item.id !== p.id);
      renderAdminParticipantsTable(dbSearchInput?.value || '');
      if (hostTabDbBadge) hostTabDbBadge.textContent = String(dbParticipants.length);
      showDbToast(`"${p.name}" removido de la lista blanca.`);
      closeDeleteModal();
    } catch (err) {
      alert(err.message);
    } finally {
      dbDeleteConfirmBtn.disabled = false;
    }
  });
}

if (dbAddForm) {
  dbAddForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = dbNewName.value.trim();
    const color = dbNewColorInput ? dbNewColorInput.value.trim() : '';
    if (!name) {
      dbNewName.focus();
      return;
    }

    if (dbSubmitBtn) dbSubmitBtn.disabled = true;
    if (dbFormStatus) {
      dbFormStatus.textContent = 'Registrando participante…';
      dbFormStatus.className = 'db-form-status';
    }

    try {
      const res = await window.Ludito.addParticipant({ name, color: color || undefined });
      const newP = res.participant;
      dbParticipants.unshift(newP);
      renderAdminParticipantsTable(dbSearchInput?.value || '');
      if (hostTabDbBadge) hostTabDbBadge.textContent = String(dbParticipants.length);

      if (dbFormStatus) {
        dbFormStatus.textContent = `¡"${newP.name}" registrado con éxito!`;
        dbFormStatus.className = 'db-form-status success';
      }
      showDbToast(`Guardado en Lista Blanca: ${newP.name}`);
      dbNewName.value = '';
      setColorPaletteValue(dbAddColorPalette, dbNewColorInput, '');
      dbNewName.focus();
    } catch (err) {
      if (dbFormStatus) {
        dbFormStatus.textContent = err.message;
        dbFormStatus.className = 'db-form-status error';
      }
    } finally {
      if (dbSubmitBtn) dbSubmitBtn.disabled = false;
    }
  });
}

if (dbSearchInput) {
  dbSearchInput.addEventListener('input', () => {
    renderAdminParticipantsTable(dbSearchInput.value);
  });
}

// ============================================================================
// GESTIÓN DE LISTA NEGRA / USUARIOS BLOQUEADOS
// ============================================================================
async function loadAdminBlacklist() {
  if (!blacklistTableBody) return;
  try {
    const data = await window.Ludito.fetchBlockedUsers();
    dbBlacklist = Array.isArray(data.blocked) ? data.blocked : [];
    renderBlacklistTable(blacklistSearchInput?.value || '');
    if (hostTabBlacklistBadge) hostTabBlacklistBadge.textContent = String(dbBlacklist.length);
  } catch (err) {
    blacklistTableBody.innerHTML = `<tr><td colspan="5" class="db-table-empty error">Error: ${err.message}</td></tr>`;
  }
}

function renderBlacklistTable(query = '') {
  if (!blacklistTableBody) return;
  blacklistTableBody.replaceChildren();

  const q = query.trim().toLowerCase();
  const filtered = q
    ? dbBlacklist.filter((b) =>
        (b.name || '').toLowerCase().includes(q) ||
        (b.identifier || '').toLowerCase().includes(q) ||
        (b.senderId || '').toLowerCase().includes(q)
      )
    : dbBlacklist;

  if (filtered.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="5" class="db-table-empty">${q ? 'No hay usuarios bloqueados que coincidan con la búsqueda.' : 'No hay usuarios bloqueados en la lista negra.'}</td>`;
    blacklistTableBody.append(row);
    return;
  }

  filtered.forEach((b, index) => {
    const tr = document.createElement('tr');

    const tdNum = document.createElement('td');
    tdNum.className = 'td-num';
    tdNum.textContent = String(index + 1);

    const tdName = document.createElement('td');
    tdName.className = 'td-name';
    const strongName = document.createElement('strong');
    strongName.textContent = b.name || b.identifier || 'Invitado';
    strongName.style.color = '#fca5a5';
    tdName.append(strongName);

    if (b.senderId && b.senderId !== b.name) {
      const codeSpan = document.createElement('small');
      codeSpan.style.display = 'block';
      codeSpan.style.color = 'var(--text-dim)';
      codeSpan.style.fontSize = '10px';
      codeSpan.style.fontFamily = 'var(--font-mono)';
      codeSpan.textContent = `ID: ${b.senderId}`;
      tdName.append(codeSpan);
    }

    const tdType = document.createElement('td');
    tdType.className = 'td-type';
    const typeBadge = document.createElement('span');
    if (b.type === 'participant') {
      typeBadge.className = 'blacklist-badge-tag participant';
      typeBadge.textContent = 'Lista Blanca';
    } else {
      typeBadge.className = 'blacklist-badge-tag';
      typeBadge.textContent = 'Espectador Invitado';
    }
    tdType.append(typeBadge);

    const tdDate = document.createElement('td');
    tdDate.className = 'td-date';
    try {
      tdDate.textContent = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(b.blockedAt));
    } catch {
      tdDate.textContent = 'Reciente';
    }

    const tdActions = document.createElement('td');
    tdActions.className = 'td-actions';

    const unblockBtn = document.createElement('button');
    unblockBtn.type = 'button';
    unblockBtn.className = 'db-action-btn unblock';
    unblockBtn.title = 'Desbloquear a este usuario y devolverle el acceso al chat';
    unblockBtn.innerHTML = '<span>🔓 Desbloquear</span>';
    unblockBtn.addEventListener('click', async () => {
      unblockBtn.disabled = true;
      try {
        await window.Ludito.unblockUser({
          id: b.id,
          identifier: b.identifier,
          name: b.name,
          senderId: b.senderId,
          participantId: b.participantId
        });
        showDbToast(`¡"${b.name}" ha sido desbloqueado con éxito!`);
        await loadAdminBlacklist();
        await loadAdminParticipants();
      } catch (err) {
        alert(`Error al desbloquear: ${err.message}`);
        unblockBtn.disabled = false;
      }
    });

    tdActions.append(unblockBtn);
    tr.append(tdNum, tdName, tdType, tdDate, tdActions);
    blacklistTableBody.append(tr);
  });
}

if (blacklistSearchInput) {
  blacklistSearchInput.addEventListener('input', () => {
    renderBlacklistTable(blacklistSearchInput.value);
  });
}










// ============================================================================
// SIMULADOR FLOTANTE DE VISTA DE CLIENTE
// ============================================================================
const hostPreviewClientBtn = document.querySelector('#host-preview-client-btn');
const clientPreviewDrawer = document.querySelector('#client-preview-drawer');
const clientPreviewBackdrop = document.querySelector('#client-preview-backdrop');
const clientPreviewClose = document.querySelector('#client-preview-close');
const clientPreviewFrame = document.querySelector('#client-preview-frame');

function openClientPreview() {
  if (!clientPreviewDrawer || !clientPreviewFrame) return;
  clientPreviewFrame.src = '/?preview_simulator=1';
  clientPreviewDrawer.hidden = false;
}

function closeClientPreview() {
  if (!clientPreviewDrawer || !clientPreviewFrame) return;
  clientPreviewDrawer.hidden = true;
  clientPreviewFrame.src = 'about:blank';
}

if (hostPreviewClientBtn) hostPreviewClientBtn.addEventListener('click', openClientPreview);
if (clientPreviewClose) clientPreviewClose.addEventListener('click', closeClientPreview);
if (clientPreviewBackdrop) clientPreviewBackdrop.addEventListener('click', closeClientPreview);

// ============================================================================
// INICIALIZACIÓN DEL MOTOR DE COMPOSICIÓN DEL ESCENARIO (STAGE)
// ============================================================================
try {
  stageController = initStage({
    streamBroadcaster,
    getLocalStream: () => null
  });
} catch (err) {
  console.warn('Error inicializando Stage compositor:', err);
}

// Suscripción al estado general del servidor
window.Ludito.subscribe(renderState, () => {});
window.Ludito.fetchState().then(renderState).catch(() => {});
