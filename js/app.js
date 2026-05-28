/* =============================================
   FormDocs – app.js
   Motor principal: upload, renderização,
   campos de formulário, exportação
   ============================================= */

// ─── PDF.js worker ───────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

// ─── Estado global ───────────────────────────
const state = {
  fileType: null,          // 'pdf' | 'image'
  pdfDoc: null,
  totalPages: 0,
  currentPage: 1,
  pages: [],               // { canvas, wrapper, fields[] }
  selectedField: null,
  pendingSigFieldId: null,
  fieldCounter: 0,
};

// ─── Referências DOM ─────────────────────────
const uploadZone     = document.getElementById('upload-zone');
const fileInput      = document.getElementById('file-input');
const editorArea     = document.getElementById('editor-area');
const pagesContainer = document.getElementById('pages-container');
const headerActions  = document.getElementById('header-actions');
const pageIndicator  = document.getElementById('page-indicator');
const btnPrev        = document.getElementById('btn-prev-page');
const btnNext        = document.getElementById('btn-next-page');
const propsPanel     = document.getElementById('props-panel');
const propsBody      = document.getElementById('props-body');
const previewModal   = document.getElementById('preview-modal');
const previewBody    = document.getElementById('preview-body');
const sigModal       = document.getElementById('signature-modal');
const sigCanvas      = document.getElementById('sig-canvas');

// ─── Utilitários ─────────────────────────────
function showToast(msg, type = 'info') {
  const tc = document.getElementById('toast-container');
  const t  = document.createElement('div');
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${msg}</span>`;
  tc.appendChild(t);
  setTimeout(() => {
    t.classList.add('removing');
    t.addEventListener('animationend', () => t.remove());
  }, 3200);
}

function showLoading(msg = 'Processando…') {
  if (document.getElementById('loading-overlay')) return;
  const el = document.createElement('div');
  el.id = 'loading-overlay';
  el.className = 'loading-overlay';
  el.innerHTML = `<div class="spinner"></div><p>${msg}</p>`;
  document.body.appendChild(el);
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.remove();
}

function uid() {
  return 'f_' + (++state.fieldCounter) + '_' + Math.random().toString(36).slice(2, 7);
}

// ─── Upload & Drag-and-Drop ───────────────────
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('dragging');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragging'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

uploadZone.addEventListener('click', e => {
  if (e.target.closest('label') || e.target === fileInput) return;
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) handleFile(file);
});

document.getElementById('btn-new').addEventListener('click', resetApp);

function resetApp() {
  state.pdfDoc = null;
  state.fileType = null;
  state.totalPages = 0;
  state.currentPage = 1;
  state.pages = [];
  state.selectedField = null;
  state.fieldCounter = 0;
  pagesContainer.innerHTML = '';
  fileInput.value = '';
  editorArea.style.display = 'none';
  uploadZone.style.display = '';
  headerActions.style.display = 'none';
  hidePropsPanel();
}

async function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const imgExts = ['png','jpg','jpeg','webp','gif','bmp'];

  if (ext === 'pdf' || file.type === 'application/pdf') {
    await loadPDF(file);
  } else if (imgExts.includes(ext) || file.type.startsWith('image/')) {
    await loadImage(file);
  } else {
    showToast('Formato não suportado. Use PDF ou imagem.', 'error');
  }
}

// ─── Carregar PDF ─────────────────────────────
async function loadPDF(file) {
  showLoading('Carregando PDF…');
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    state.pdfDoc   = pdf;
    state.fileType = 'pdf';
    state.totalPages = pdf.numPages;
    state.currentPage = 1;
    state.pages = [];
    pagesContainer.innerHTML = '';

    for (let p = 1; p <= pdf.numPages; p++) {
      await renderPDFPage(pdf, p);
    }
    enterEditor();
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar o PDF.', 'error');
  } finally {
    hideLoading();
  }
}

async function renderPDFPage(pdf, pageNum) {
  const page = await pdf.getPage(pageNum);
  const scale = getOptimalScale(page);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  const wrapper = createPageWrapper(canvas.width, canvas.height, pageNum);
  wrapper.appendChild(canvas);
  pagesContainer.appendChild(wrapper);

  state.pages.push({ canvas, wrapper, fields: [] });
  bindPageClick(wrapper, pageNum - 1);
}

function getOptimalScale(page) {
  const vp = page.getViewport({ scale: 1 });
  const maxW = Math.min(window.innerWidth - 80, 900);
  return Math.min(maxW / vp.width, 2);
}

// ─── Carregar Imagem ──────────────────────────
async function loadImage(file) {
  showLoading('Carregando imagem…');
  try {
    const url = URL.createObjectURL(file);
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        state.fileType = 'image';
        state.totalPages = 1;
        state.currentPage = 1;
        state.pages = [];
        pagesContainer.innerHTML = '';

        const maxW = Math.min(window.innerWidth - 80, 900);
        const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);

        const wrapper = createPageWrapper(w, h, 1);
        const el = document.createElement('img');
        el.src = url;
        el.style.width  = w + 'px';
        el.style.height = h + 'px';
        el.style.display = 'block';
        el.draggable = false;
        wrapper.appendChild(el);
        pagesContainer.appendChild(wrapper);

        state.pages.push({ canvas: el, wrapper, fields: [] });
        bindPageClick(wrapper, 0);
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });
    enterEditor();
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar a imagem.', 'error');
  } finally {
    hideLoading();
  }
}

// ─── Entrar no Editor ─────────────────────────
function enterEditor() {
  uploadZone.style.display = 'none';
  editorArea.style.display = 'flex';
  headerActions.style.display = 'flex';
  updatePageIndicator();
  showToast('Documento carregado! Clique no campo desejado na barra e depois clique sobre o documento.', 'info');
}

// ─── Criar wrapper de página ──────────────────
function createPageWrapper(w, h, pageNum) {
  const wrapper = document.createElement('div');
  wrapper.className = 'page-wrapper';
  wrapper.style.width  = w + 'px';
  wrapper.style.height = h + 'px';
  wrapper.dataset.page = pageNum;
  return wrapper;
}

// ─── Clicar na página para inserir campo ──────
function bindPageClick(wrapper, pageIdx) {
  wrapper.addEventListener('click', e => {
    // Ignorar cliques em campos existentes
    if (e.target.closest('.form-field')) return;

    const activeType = getActiveFieldType();
    if (!activeType) return;

    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    addFieldToPage(pageIdx, activeType, x - 60, y - 15);
  });
}

function getActiveFieldType() {
  const map = {
    'btn-add-text':      'text',
    'btn-add-textarea':  'textarea',
    'btn-add-checkbox':  'checkbox',
    'btn-add-radio':     'radio',
    'btn-add-select':    'select',
    'btn-add-signature': 'signature',
  };
  for (const [id, type] of Object.entries(map)) {
    if (document.getElementById(id).classList.contains('active')) return type;
  }
  return null;
}

// ─── Botões da toolbar ────────────────────────
['btn-add-text','btn-add-textarea','btn-add-checkbox',
 'btn-add-radio','btn-add-select','btn-add-signature'].forEach(id => {
  document.getElementById(id).addEventListener('click', function () {
    const wasActive = this.classList.contains('active');
    clearActiveTools();
    if (!wasActive) this.classList.add('active');
  });
});

function clearActiveTools() {
  ['btn-add-text','btn-add-textarea','btn-add-checkbox',
   'btn-add-radio','btn-add-select','btn-add-signature'].forEach(id => {
    document.getElementById(id).classList.remove('active');
  });
}

// ─── Navegação de páginas ─────────────────────
btnPrev.addEventListener('click', () => {
  if (state.currentPage > 1) {
    state.currentPage--;
    scrollToPage(state.currentPage);
    updatePageIndicator();
  }
});

btnNext.addEventListener('click', () => {
  if (state.currentPage < state.totalPages) {
    state.currentPage++;
    scrollToPage(state.currentPage);
    updatePageIndicator();
  }
});

function scrollToPage(n) {
  const wrapper = state.pages[n - 1]?.wrapper;
  if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updatePageIndicator() {
  pageIndicator.textContent = `${state.currentPage} / ${state.totalPages}`;
  btnPrev.disabled = state.currentPage <= 1;
  btnNext.disabled = state.currentPage >= state.totalPages;
}

// ─── Adicionar campo ──────────────────────────
function addFieldToPage(pageIdx, type, x, y) {
  const page    = state.pages[pageIdx];
  const wrapper = page.wrapper;
  const id      = uid();

  const defaults = {
    text:      { w: 140, h: 32,  label: 'Texto',     placeholder: 'Digite aqui…' },
    textarea:  { w: 180, h: 70,  label: 'Área',      placeholder: 'Digite aqui…' },
    checkbox:  { w: 130, h: 30,  label: 'Checkbox',  text: 'Opção' },
    radio:     { w: 130, h: 30,  label: 'Rádio',     text: 'Opção' },
    select:    { w: 150, h: 32,  label: 'Select',    options: 'Opção 1\nOpção 2\nOpção 3' },
    signature: { w: 160, h: 60,  label: 'Assinatura' },
  };

  const d = defaults[type];

  // Garante que fique dentro do wrapper
  const pw = parseInt(wrapper.style.width);
  const ph = parseInt(wrapper.style.height);
  x = Math.max(0, Math.min(x, pw - d.w));
  y = Math.max(0, Math.min(y, ph - d.h));

  const fieldData = {
    id, type, pageIdx,
    x, y,
    w: d.w, h: d.h,
    label: d.label,
    placeholder: d.placeholder || '',
    text: d.text || '',
    options: d.options || '',
    fontSize: 13,
    fontColor: '#111111',
    required: false,
    value: '',
    imgData: null,  // assinatura
  };

  page.fields.push(fieldData);
  renderField(fieldData);
  selectField(fieldData);
  clearActiveTools();
}

// ─── Renderizar campo ─────────────────────────
function renderField(fd) {
  const page    = state.pages[fd.pageIdx];
  const wrapper = page.wrapper;

  // Remove se já existir
  const existing = wrapper.querySelector(`[data-field-id="${fd.id}"]`);
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'form-field';
  el.dataset.fieldId = fd.id;
  el.style.left   = fd.x + 'px';
  el.style.top    = fd.y + 'px';
  el.style.width  = fd.w + 'px';
  el.style.height = fd.h + 'px';

  const inner = document.createElement('div');
  inner.className = 'field-inner';

  const labelEl = document.createElement('span');
  labelEl.className = 'field-label';
  labelEl.textContent = fd.label;

  inner.style.fontSize  = fd.fontSize + 'px';
  inner.style.color     = fd.fontColor;

  // Construir conteúdo interno
  if (fd.type === 'text') {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = fd.placeholder;
    inp.value = fd.value;
    inp.style.fontSize = fd.fontSize + 'px';
    inp.style.color    = fd.fontColor;
    inp.addEventListener('input', e => { fd.value = e.target.value; });
    inp.addEventListener('mousedown', e => e.stopPropagation());
    inner.appendChild(inp);
  } else if (fd.type === 'textarea') {
    const ta = document.createElement('textarea');
    ta.placeholder = fd.placeholder;
    ta.value = fd.value;
    ta.style.fontSize = fd.fontSize + 'px';
    ta.style.color    = fd.fontColor;
    ta.addEventListener('input', e => { fd.value = e.target.value; });
    ta.addEventListener('mousedown', e => e.stopPropagation());
    inner.appendChild(ta);
  } else if (fd.type === 'checkbox') {
    const wrap = document.createElement('div');
    wrap.className = 'checkbox-wrap';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = fd.value === 'true';
    cb.addEventListener('change', e => { fd.value = String(e.target.checked); });
    cb.addEventListener('mousedown', e => e.stopPropagation());
    const lbl = document.createElement('span');
    lbl.textContent = fd.text;
    lbl.style.fontSize = fd.fontSize + 'px';
    lbl.style.color    = fd.fontColor;
    wrap.appendChild(cb);
    wrap.appendChild(lbl);
    inner.appendChild(wrap);
  } else if (fd.type === 'radio') {
    const wrap = document.createElement('div');
    wrap.className = 'radio-wrap';
    const rb = document.createElement('input');
    rb.type = 'radio';
    rb.name = 'radio_' + fd.id;
    rb.checked = fd.value === 'true';
    rb.addEventListener('change', e => { fd.value = String(e.target.checked); });
    rb.addEventListener('mousedown', e => e.stopPropagation());
    const lbl = document.createElement('span');
    lbl.textContent = fd.text;
    lbl.style.fontSize = fd.fontSize + 'px';
    lbl.style.color    = fd.fontColor;
    wrap.appendChild(rb);
    wrap.appendChild(lbl);
    inner.appendChild(wrap);
  } else if (fd.type === 'select') {
    const sel = document.createElement('select');
    sel.style.fontSize = fd.fontSize + 'px';
    sel.style.color    = fd.fontColor;
    const opts = fd.options.split('\n').filter(o => o.trim());
    opts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.trim();
      opt.textContent = o.trim();
      if (fd.value === o.trim()) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', e => { fd.value = e.target.value; });
    sel.addEventListener('mousedown', e => e.stopPropagation());
    inner.appendChild(sel);
  } else if (fd.type === 'signature') {
    if (fd.imgData) {
      const img = document.createElement('img');
      img.src = fd.imgData;
      img.className = 'sig-field-img';
      img.draggable = false;
      inner.appendChild(img);
    } else {
      const sigBtn = document.createElement('button');
      sigBtn.innerHTML = '<i class="fa-solid fa-pen-nib"></i> Assinar';
      sigBtn.style.cssText = `
        width:100%; height:100%; background:none; border:none;
        color:var(--clr-primary); font-size:${fd.fontSize}px;
        cursor:pointer; font-family:'Inter',sans-serif;
        display:flex; align-items:center; justify-content:center; gap:6px;
      `;
      sigBtn.addEventListener('mousedown', e => e.stopPropagation());
      sigBtn.addEventListener('click', e => { e.stopPropagation(); openSignatureModal(fd.id); });
      inner.appendChild(sigBtn);
    }
  }

  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';

  el.appendChild(labelEl);
  el.appendChild(inner);
  el.appendChild(resizeHandle);
  wrapper.appendChild(el);

  makeDraggable(el, fd);
  makeResizable(resizeHandle, el, fd);
  el.addEventListener('mousedown', e => {
    if (e.target.classList.contains('resize-handle')) return;
    selectField(fd);
  });
}

// ─── Seleção de campo ─────────────────────────
function selectField(fd) {
  // Deselect all
  document.querySelectorAll('.form-field.selected').forEach(el => el.classList.remove('selected'));

  state.selectedField = fd;
  const el = document.querySelector(`[data-field-id="${fd.id}"]`);
  if (el) el.classList.add('selected');
  showPropsPanel(fd);
}

// ─── Drag & Drop de campos ────────────────────
function makeDraggable(el, fd) {
  let startX, startY, startLeft, startTop, dragging = false;

  el.addEventListener('mousedown', e => {
    if (e.target.classList.contains('resize-handle')) return;
    if (['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target.tagName)) return;
    e.preventDefault();
    dragging = true;
    startX   = e.clientX;
    startY   = e.clientY;
    startLeft = fd.x;
    startTop  = fd.y;
    el.style.zIndex = 50;
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const wrapper = state.pages[fd.pageIdx].wrapper;
    const pw = parseInt(wrapper.style.width);
    const ph = parseInt(wrapper.style.height);
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    fd.x = Math.max(0, Math.min(startLeft + dx, pw - fd.w));
    fd.y = Math.max(0, Math.min(startTop  + dy, ph - fd.h));
    el.style.left = fd.x + 'px';
    el.style.top  = fd.y + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; el.style.zIndex = 10; }
  });
}

// ─── Resize de campos ─────────────────────────
function makeResizable(handle, el, fd) {
  let startX, startY, startW, startH;

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    startX = e.clientX;
    startY = e.clientY;
    startW = fd.w;
    startH = fd.h;

    function onMove(e) {
      fd.w = Math.max(60, startW + (e.clientX - startX));
      fd.h = Math.max(24, startH + (e.clientY - startY));
      el.style.width  = fd.w + 'px';
      el.style.height = fd.h + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ─── Painel de Propriedades ───────────────────
function showPropsPanel(fd) {
  propsPanel.style.display = 'flex';
  buildPropsForm(fd);
}

function hidePropsPanel() {
  propsPanel.style.display = 'none';
  state.selectedField = null;
  document.querySelectorAll('.form-field.selected').forEach(el => el.classList.remove('selected'));
}

document.getElementById('btn-close-props').addEventListener('click', hidePropsPanel);
document.getElementById('btn-delete-field').addEventListener('click', () => {
  if (!state.selectedField) return;
  deleteField(state.selectedField);
});

function deleteField(fd) {
  const page = state.pages[fd.pageIdx];
  page.fields = page.fields.filter(f => f.id !== fd.id);
  const el = document.querySelector(`[data-field-id="${fd.id}"]`);
  if (el) el.remove();
  hidePropsPanel();
  showToast('Campo removido.', 'info');
}

function buildPropsForm(fd) {
  propsBody.innerHTML = '';

  const add = (labelText, inputEl) => {
    const g = document.createElement('div');
    g.className = 'prop-group';
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    g.appendChild(lbl);
    g.appendChild(inputEl);
    propsBody.appendChild(g);
    return inputEl;
  };

  const addRow = (items) => {
    const row = document.createElement('div');
    row.className = 'prop-row';
    items.forEach(([labelText, inputEl]) => {
      const g = document.createElement('div');
      g.className = 'prop-group';
      const lbl = document.createElement('label');
      lbl.textContent = labelText;
      g.appendChild(lbl);
      g.appendChild(inputEl);
      row.appendChild(g);
    });
    propsBody.appendChild(row);
  };

  const inp = (type, val, onChange) => {
    const el = document.createElement('input');
    el.type  = type;
    el.value = val;
    el.addEventListener('input', e => onChange(e.target.value));
    return el;
  };

  // Label
  add('Rótulo', inp('text', fd.label, v => {
    fd.label = v;
    const el = document.querySelector(`[data-field-id="${fd.id}"] .field-label`);
    if (el) el.textContent = v;
  }));

  // Placeholder / texto
  if (['text','textarea'].includes(fd.type)) {
    add('Placeholder', inp('text', fd.placeholder, v => {
      fd.placeholder = v;
      const inp2 = document.querySelector(`[data-field-id="${fd.id}"] input, [data-field-id="${fd.id}"] textarea`);
      if (inp2) inp2.placeholder = v;
    }));
  }

  if (['checkbox','radio'].includes(fd.type)) {
    add('Texto da opção', inp('text', fd.text, v => {
      fd.text = v;
      renderField(fd);
    }));
  }

  if (fd.type === 'select') {
    const ta = document.createElement('textarea');
    ta.value = fd.options;
    ta.placeholder = 'Uma opção por linha';
    ta.addEventListener('input', e => {
      fd.options = e.target.value;
      renderField(fd);
      if (state.selectedField && state.selectedField.id === fd.id) {
        const el = document.querySelector(`[data-field-id="${fd.id}"]`);
        if (el) el.classList.add('selected');
      }
    });
    add('Opções (1 por linha)', ta);
  }

  // Tamanho da fonte
  addRow([
    ['Fonte (px)', inp('number', fd.fontSize, v => {
      fd.fontSize = parseInt(v) || 13;
      renderField(fd);
    })],
    ['Cor do texto', (() => {
      const el = document.createElement('input');
      el.type  = 'color';
      el.value = fd.fontColor;
      el.addEventListener('input', e => {
        fd.fontColor = e.target.value;
        renderField(fd);
      });
      return el;
    })()],
  ]);

  // Posição e tamanho
  addRow([
    ['X (px)', inp('number', Math.round(fd.x), v => {
      fd.x = parseInt(v) || 0;
      const el = document.querySelector(`[data-field-id="${fd.id}"]`);
      if (el) el.style.left = fd.x + 'px';
    })],
    ['Y (px)', inp('number', Math.round(fd.y), v => {
      fd.y = parseInt(v) || 0;
      const el = document.querySelector(`[data-field-id="${fd.id}"]`);
      if (el) el.style.top = fd.y + 'px';
    })],
  ]);

  addRow([
    ['Largura (px)', inp('number', fd.w, v => {
      fd.w = parseInt(v) || 60;
      const el = document.querySelector(`[data-field-id="${fd.id}"]`);
      if (el) el.style.width = fd.w + 'px';
    })],
    ['Altura (px)', inp('number', fd.h, v => {
      fd.h = parseInt(v) || 24;
      const el = document.querySelector(`[data-field-id="${fd.id}"]`);
      if (el) el.style.height = fd.h + 'px';
    })],
  ]);

  // Assinatura: botão para redefinir
  if (fd.type === 'signature' && fd.imgData) {
    const btn = document.createElement('button');
    btn.className = 'tool-btn danger-btn';
    btn.style.width = '100%';
    btn.style.marginTop = '4px';
    btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Redesenhar';
    btn.addEventListener('click', () => {
      fd.imgData = null;
      renderField(fd);
      selectField(fd);
    });
    propsBody.appendChild(btn);
  }
}

// ─── Assinatura ───────────────────────────────
let sigCtx, sigDrawing = false, sigLastX = 0, sigLastY = 0;

function openSignatureModal(fieldId) {
  state.pendingSigFieldId = fieldId;
  sigModal.style.display = 'flex';
  sigCtx = sigCanvas.getContext('2d');
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigCtx.strokeStyle = '#1a1aff';
  sigCtx.lineWidth   = 2.5;
  sigCtx.lineCap     = 'round';
  sigCtx.lineJoin    = 'round';
}

function getSigPos(e) {
  const rect = sigCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return [
    (clientX - rect.left) * (sigCanvas.width  / rect.width),
    (clientY - rect.top)  * (sigCanvas.height / rect.height),
  ];
}

sigCanvas.addEventListener('mousedown',  e => { sigDrawing = true;  [sigLastX, sigLastY] = getSigPos(e); });
sigCanvas.addEventListener('mousemove',  e => {
  if (!sigDrawing) return;
  const [x, y] = getSigPos(e);
  sigCtx.beginPath();
  sigCtx.moveTo(sigLastX, sigLastY);
  sigCtx.lineTo(x, y);
  sigCtx.stroke();
  [sigLastX, sigLastY] = [x, y];
});
sigCanvas.addEventListener('mouseup',    () => sigDrawing = false);
sigCanvas.addEventListener('mouseleave', () => sigDrawing = false);
// Touch
sigCanvas.addEventListener('touchstart', e => { e.preventDefault(); sigDrawing = true; [sigLastX, sigLastY] = getSigPos(e); }, { passive: false });
sigCanvas.addEventListener('touchmove',  e => {
  e.preventDefault();
  if (!sigDrawing) return;
  const [x, y] = getSigPos(e);
  sigCtx.beginPath();
  sigCtx.moveTo(sigLastX, sigLastY);
  sigCtx.lineTo(x, y);
  sigCtx.stroke();
  [sigLastX, sigLastY] = [x, y];
}, { passive: false });
sigCanvas.addEventListener('touchend',   () => sigDrawing = false);

document.getElementById('btn-clear-sig').addEventListener('click', () => {
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
});

document.getElementById('btn-save-sig').addEventListener('click', saveSignature);
document.getElementById('btn-close-sig').addEventListener('click', () => { sigModal.style.display = 'none'; });
document.getElementById('sig-backdrop').addEventListener('click', () => { sigModal.style.display = 'none'; });

function saveSignature() {
  const imgData = sigCanvas.toDataURL('image/png');
  const fieldId = state.pendingSigFieldId;
  if (!fieldId) return;

  // Encontrar campo
  for (const page of state.pages) {
    const fd = page.fields.find(f => f.id === fieldId);
    if (fd) {
      fd.imgData = imgData;
      renderField(fd);
      selectField(fd);
      break;
    }
  }
  sigModal.style.display = 'none';
  showToast('Assinatura salva!', 'success');
}

// ─── Preview ──────────────────────────────────
document.getElementById('btn-preview').addEventListener('click', openPreview);
document.getElementById('btn-close-preview').addEventListener('click', () => previewModal.style.display = 'none');
document.getElementById('modal-backdrop').addEventListener('click', () => previewModal.style.display = 'none');

async function openPreview() {
  if (state.pages.length === 0) return;
  showLoading('Gerando pré-visualização…');
  previewBody.innerHTML = '';
  try {
    for (const page of state.pages) {
      const snap = await capturePageSnapshot(page);
      const img  = document.createElement('img');
      img.src    = snap;
      img.style.cssText = 'max-width:100%; border-radius:4px; box-shadow:0 4px 20px rgba(0,0,0,0.5);';
      previewBody.appendChild(img);
    }
    hideLoading();
    previewModal.style.display = 'flex';
  } catch(err) {
    hideLoading();
    console.error(err);
    showToast('Erro ao gerar preview.', 'error');
  }
}

// ─── Capturar snapshot de uma página ──────────
async function capturePageSnapshot(page) {
  // Esconder handles e labels temporariamente
  const handles = page.wrapper.querySelectorAll('.resize-handle,.field-label');
  const borders  = page.wrapper.querySelectorAll('.field-inner');
  handles.forEach(h => h.style.display = 'none');
  borders.forEach(b => {
    b._origBorder = b.style.border;
    b._origBg     = b.style.background;
    b.style.border     = '1px solid rgba(0,0,0,0.15)';
    b.style.background = 'rgba(255,255,255,0.4)';
  });

  const c = await html2canvas(page.wrapper, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#fff',
  });

  handles.forEach(h => h.style.display = '');
  borders.forEach(b => {
    b.style.border     = b._origBorder;
    b.style.background = b._origBg;
  });

  return c.toDataURL('image/png');
}

// ─── Exportar PDF ─────────────────────────────
document.getElementById('btn-export').addEventListener('click', exportToPDF);

async function exportToPDF() {
  if (state.pages.length === 0) return;
  showLoading('Exportando PDF…');
  try {
    const { jsPDF } = window.jspdf;

    for (let i = 0; i < state.pages.length; i++) {
      const page      = state.pages[i];
      const imgData   = await capturePageSnapshot(page);
      const pw        = parseInt(page.wrapper.style.width);
      const ph        = parseInt(page.wrapper.style.height);
      const orientation = pw > ph ? 'l' : 'p';

      if (i === 0) {
        var pdf = new jsPDF({ orientation, unit: 'px', format: [pw, ph], hotfixes: ['px_scaling'] });
      } else {
        pdf.addPage([pw, ph], orientation);
      }
      pdf.addImage(imgData, 'PNG', 0, 0, pw, ph);
    }

    pdf.save('documento_formdocs.pdf');
    hideLoading();
    showToast('PDF exportado com sucesso!', 'success');
  } catch(err) {
    hideLoading();
    console.error(err);
    showToast('Erro ao exportar o PDF.', 'error');
  }
}

// ─── Deselect ao clicar fora ──────────────────
document.getElementById('canvas-scroll').addEventListener('mousedown', e => {
  if (!e.target.closest('.form-field') && !e.target.closest('.props-panel')) {
    hidePropsPanel();
  }
});

// ─── Teclado: Delete / Escape ─────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    clearActiveTools();
    hidePropsPanel();
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedField) {
    const active = document.activeElement;
    if (['INPUT','TEXTAREA','SELECT'].includes(active?.tagName)) return;
    deleteField(state.selectedField);
  }
});
