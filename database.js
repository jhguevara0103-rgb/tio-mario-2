/**
 * database.js - Gestión de Base de Datos de Participantes y Códigos PIN
 * Sistema de administración y control de accesos para Ludito Live
 */

const addForm = document.querySelector('#db-add-form');
const nameInput = document.querySelector('#db-new-name');
const pinInput = document.querySelector('#db-new-pin');
const submitBtn = document.querySelector('#db-submit-button');
const formStatus = document.querySelector('#db-form-status');
const tableBody = document.querySelector('#db-table-body');
const searchInput = document.querySelector('#db-search');
const statTotal = document.querySelector('#db-stat-total');
const statSamplePin = document.querySelector('#db-stat-sample-pin');
const toastEl = document.querySelector('#db-toast');
const hostSessionEl = document.querySelector('#db-host-session');

// Delete Modal Elements
const deleteModal = document.querySelector('#db-delete-modal');
const deleteModalText = document.querySelector('#db-delete-modal-text');
const deleteCancelBtn = document.querySelector('#db-delete-cancel');
const deleteConfirmBtn = document.querySelector('#db-delete-confirm');

// Auth Modal Elements
const authModal = document.querySelector('#db-auth-modal');
const authForm = document.querySelector('#db-auth-form');
const authPasswordInput = document.querySelector('#db-auth-password');
const authError = document.querySelector('#db-auth-error');
const authSubmitBtn = document.querySelector('#db-auth-submit');

let participants = [];
let toastTimeout = null;
let pendingDeleteParticipant = null;
let isHostAuthenticated = false;

function showToast(message, duration = 3500) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.hidden = true;
  }, duration);
}

function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('es', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(d);
  } catch {
    return '—';
  }
}

async function copyText(text, successMessage = 'Copiado al portapapeles') {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
      return;
    }
    throw new Error('Clipboard API no disponible');
  } catch {
    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    tempInput.setAttribute('readonly', '');
    tempInput.style.position = 'absolute';
    tempInput.style.left = '-9999px';
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    showToast(successMessage);
  }
}

function openAuthModal(errorMessage = '') {
  if (!authModal) return;
  if (authError) {
    authError.textContent = errorMessage;
    authError.hidden = !errorMessage;
  }
  authPasswordInput.value = '';
  authModal.hidden = false;
  authPasswordInput.focus();
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.hidden = true;
}

function openDeleteModal(participant) {
  if (!deleteModal) return;
  pendingDeleteParticipant = participant;
  deleteModalText.innerHTML = `¿Estás seguro de que deseas eliminar a <strong>"${escapeHtml(participant.name)}"</strong> con código PIN <strong>${participant.pin}</strong>? Esta persona ya no podrá acceder a la transmisión con este código.`;
  deleteConfirmBtn.disabled = false;
  deleteConfirmBtn.textContent = '🗑️ Sí, Eliminar';
  deleteModal.hidden = false;
}

function closeDeleteModal() {
  if (!deleteModal) return;
  deleteModal.hidden = true;
  pendingDeleteParticipant = null;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTable(filterQuery = '') {
  const query = filterQuery.toLowerCase().trim();
  const filtered = participants.filter((p) => {
    if (!query) return true;
    return p.name.toLowerCase().includes(query) || p.pin.includes(query);
  });

  if (statTotal) {
    statTotal.textContent = String(participants.length);
  }
  if (participants.length > 0 && statSamplePin) {
    statSamplePin.textContent = participants[0].pin;
  }

  tableBody.replaceChildren();

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'db-table-empty';
    td.textContent = query
      ? `No se encontraron resultados para "${query}".`
      : 'No hay participantes registrados todavía. Agrega el primero usando el formulario de arriba.';
    tr.appendChild(td);
    tableBody.appendChild(tr);
    return;
  }

  filtered.forEach((p, index) => {
    const tr = document.createElement('tr');
    tr.dataset.participantId = p.id;

    // # Number
    const tdNum = document.createElement('td');
    tdNum.className = 'td-num';
    tdNum.textContent = String(index + 1);

    // Name
    const tdName = document.createElement('td');
    const nameWrap = document.createElement('div');
    nameWrap.className = 'td-name';
    const avatar = document.createElement('span');
    avatar.className = 'participant-avatar';
    avatar.textContent = (p.name || 'P').trim()[0].toUpperCase();
    const nameText = document.createElement('strong');
    nameText.className = 'participant-name-text';
    nameText.textContent = p.name;
    nameWrap.append(avatar, nameText);
    tdName.appendChild(nameWrap);

    // PIN Badge
    const tdPin = document.createElement('td');
    const pinBadge = document.createElement('div');
    pinBadge.className = 'participant-pin-badge';
    const pinText = document.createElement('strong');
    pinText.className = 'pin-display-text';
    pinText.textContent = p.pin;
    const copyPinBtn = document.createElement('button');
    copyPinBtn.type = 'button';
    copyPinBtn.className = 'pin-copy-btn';
    copyPinBtn.title = 'Copiar PIN';
    copyPinBtn.textContent = 'Copiar';
    copyPinBtn.addEventListener('click', () => {
      copyText(p.pin, `PIN ${p.pin} copiado`);
    });
    pinBadge.append(pinText, copyPinBtn);
    tdPin.appendChild(pinBadge);

    // Date
    const tdDate = document.createElement('td');
    tdDate.className = 'td-date';
    tdDate.textContent = formatDate(p.createdAt);

    // Actions (WhatsApp, Nuevo PIN, Eliminar)
    const tdActions = document.createElement('td');
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'td-actions';

    // WhatsApp Invitation
    const waBtn = document.createElement('button');
    waBtn.type = 'button';
    waBtn.className = 'action-btn whatsapp';
    waBtn.title = 'Copiar invitación para WhatsApp';
    waBtn.innerHTML = '<span>💬</span> WhatsApp';
    waBtn.addEventListener('click', () => {
      const liveUrl = window.location.origin;
      const message = `¡Hola ${p.name}! Tu código PIN para ingresar a la transmisión en vivo de Ludito es: *${p.pin}*\n\nIngresa aquí: ${liveUrl}`;
      copyText(message, `Invitación para ${p.name} copiada para enviar por WhatsApp.`);
    });

    // Regenerate PIN (Instant random generation)
    const regenBtn = document.createElement('button');
    regenBtn.type = 'button';
    regenBtn.className = 'action-btn regen';
    regenBtn.title = 'Generar un nuevo PIN aleatorio';
    regenBtn.innerHTML = '<span>🔄</span> Nuevo PIN';
    regenBtn.addEventListener('click', async () => {
      try {
        regenBtn.disabled = true;
        regenBtn.innerHTML = '<span>⏳</span> Generando…';

        const res = await window.Ludito.updateParticipant(p.id, { regeneratePin: true });
        p.pin = res.participant.pin;

        // Visual feedback
        pinText.textContent = p.pin;
        pinBadge.classList.remove('pin-pulse-glow');
        void pinBadge.offsetWidth;
        pinBadge.classList.add('pin-pulse-glow');

        if (index === 0 && statSamplePin) {
          statSamplePin.textContent = p.pin;
        }

        copyText(p.pin, `✨ ¡Nuevo PIN generado para ${p.name}: ${p.pin}! (Copiado)`);
      } catch (err) {
        if (err.message.includes('403') || err.message.includes('administrador') || err.message.includes('sesión')) {
          openAuthModal('Inicia sesión como administrador para regenerar códigos PIN.');
        } else {
          showToast('Error: ' + err.message);
        }
      } finally {
        regenBtn.disabled = false;
        regenBtn.innerHTML = '<span>🔄</span> Nuevo PIN';
      }
    });

    // Delete Button (Opens interactive Delete modal)
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'action-btn delete';
    deleteBtn.title = 'Eliminar de la base de datos';
    deleteBtn.innerHTML = '<span>🗑️</span>';
    deleteBtn.addEventListener('click', () => {
      openDeleteModal(p);
    });

    actionsWrap.append(waBtn, regenBtn, deleteBtn);
    tdActions.appendChild(actionsWrap);

    tr.append(tdNum, tdName, tdPin, tdDate, tdActions);
    tableBody.appendChild(tr);
  });
}

async function loadParticipants() {
  try {
    const data = await window.Ludito.fetchParticipants();
    participants = data.participants || [];
    renderTable(searchInput.value);
  } catch (err) {
    tableBody.replaceChildren();
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'db-table-empty';
    td.textContent = 'Error al cargar los participantes: ' + err.message;
    tr.appendChild(td);
    tableBody.appendChild(tr);
  }
}

// Delete Confirmation Modal Listeners
if (deleteCancelBtn) {
  deleteCancelBtn.addEventListener('click', closeDeleteModal);
}
if (deleteModal) {
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });
}

if (deleteConfirmBtn) {
  deleteConfirmBtn.addEventListener('click', async () => {
    if (!pendingDeleteParticipant) return;
    const { id, name } = pendingDeleteParticipant;
    try {
      deleteConfirmBtn.disabled = true;
      deleteConfirmBtn.textContent = 'Eliminando…';

      await window.Ludito.deleteParticipant(id);
      participants = participants.filter((item) => item.id !== id);
      renderTable(searchInput.value);
      closeDeleteModal();
      showToast(`Participante "${name}" eliminado de la base de datos.`);
    } catch (err) {
      if (err.message.includes('403') || err.message.includes('administrador') || err.message.includes('sesión')) {
        closeDeleteModal();
        openAuthModal('Inicia sesión como administrador para eliminar participantes.');
      } else {
        showToast('Error al eliminar: ' + err.message);
        deleteConfirmBtn.disabled = false;
        deleteConfirmBtn.textContent = '🗑️ Sí, Eliminar';
      }
    }
  });
}

// Auth Modal Form Submission
if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = authPasswordInput.value.trim();
    if (!password) return;

    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = 'Verificando…';
    authError.hidden = true;

    try {
      const res = await window.Ludito.authenticateAdmin(password);
      isHostAuthenticated = true;
      if (hostSessionEl) {
        hostSessionEl.textContent = `${res.user.toUpperCase()} · CONECTADO`;
        hostSessionEl.style.cursor = 'default';
      }
      closeAuthModal();
      showToast('¡Sesión de administrador activa!');
      loadParticipants();
    } catch (err) {
      authError.textContent = err.message || 'Contraseña incorrecta.';
      authError.hidden = false;
      authPasswordInput.focus();
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = 'Desbloquear';
    }
  });
}

// Host session badge click to unlock if unauthenticated
if (hostSessionEl) {
  hostSessionEl.addEventListener('click', () => {
    if (!isHostAuthenticated) {
      openAuthModal();
    }
  });
}

// Add Participant Form Submit
addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const pin = pinInput.value.trim();

  if (!name) {
    formStatus.textContent = 'Por favor escribe el nombre de la persona.';
    formStatus.className = 'db-form-status error';
    nameInput.focus();
    return;
  }

  if (pin && !/^\d{4}$/.test(pin)) {
    formStatus.textContent = 'El PIN manual debe contener exactamente 4 dígitos numéricos.';
    formStatus.className = 'db-form-status error';
    pinInput.focus();
    return;
  }

  submitBtn.disabled = true;
  formStatus.textContent = 'Registrando persona y generando código…';
  formStatus.className = 'db-form-status';

  try {
    const res = await window.Ludito.addParticipant({ name, pin: pin || undefined });
    const newP = res.participant;
    participants.unshift(newP);
    renderTable(searchInput.value);

    formStatus.textContent = `¡"${newP.name}" registrado con éxito! Código PIN asignado: ${newP.pin}`;
    formStatus.className = 'db-form-status success';

    showToast(`Persona guardada: ${newP.name} (PIN: ${newP.pin})`, 4000);

    nameInput.value = '';
    pinInput.value = '';
    nameInput.focus();
  } catch (err) {
    if (err.message.includes('403') || err.message.includes('administrador') || err.message.includes('sesión')) {
      formStatus.textContent = 'Se requiere autenticación de administrador.';
      formStatus.className = 'db-form-status error';
      openAuthModal('Inicia sesión como administrador para registrar participantes.');
    } else {
      formStatus.textContent = err.message;
      formStatus.className = 'db-form-status error';
    }
  } finally {
    submitBtn.disabled = false;
  }
});

searchInput.addEventListener('input', () => {
  renderTable(searchInput.value);
});

// Restore Admin Session & Init
window.Ludito.restoreAdminSession()
  .then((session) => {
    if (session) {
      isHostAuthenticated = true;
      if (hostSessionEl) {
        hostSessionEl.textContent = `${session.user.toUpperCase()} · CONECTADO`;
      }
      if (window.Ludito?.setupAdminInactivityMonitor) {
        window.Ludito.setupAdminInactivityMonitor(() => {
          isHostAuthenticated = false;
          if (hostSessionEl) {
            hostSessionEl.textContent = 'INGRESAR HOST 🔑 (Inactividad 10m)';
            hostSessionEl.style.cursor = 'pointer';
          }
          loadParticipants();
        });
      }
    } else {
      isHostAuthenticated = false;
      if (hostSessionEl) {
        hostSessionEl.textContent = 'INGRESAR HOST 🔑';
        hostSessionEl.style.cursor = 'pointer';
        hostSessionEl.title = 'Haz clic para iniciar sesión como host';
      }
    }
    loadParticipants();
  })
  .catch(() => {
    isHostAuthenticated = false;
    if (hostSessionEl) {
      hostSessionEl.textContent = 'INGRESAR HOST 🔑';
      hostSessionEl.style.cursor = 'pointer';
    }
    loadParticipants();
  });
