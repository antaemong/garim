// AI 사이트 안에서 실행된다.
// 1) 붙여넣기를 가로채 개인정보를 기호로 바꿔 넣고
// 2) 화면에 나타나는 기호를 원래 값으로 되돌려 보여준다.
(function () {
  'use strict';

  if (window.__garimLoaded) return;
  window.__garimLoaded = true;

  const Masker = globalThis.GarimMasker;
  const store = globalThis.GarimStorage;
  const origin = location.origin;
  const TOAST_ID = 'garim-toast-host';
  const SKIP_SELECTOR = 'script, style, noscript, textarea, input, #' + TOAST_ID;

  let settings = { disabledSites: [], customWords: [] };
  let masker = new Masker();
  let enabled = true;
  let redispatching = false;

  async function init() {
    settings = await store.getSettings();
    masker = new Masker(await store.getMapState(origin));
    enabled = !settings.disabledSites.includes(location.hostname);

    window.addEventListener('paste', onPaste, true);
    window.addEventListener('garim:copied', onCopied);
    store.onChange(onStorageChange);
    startRestoring();
  }

  // ---------- 가리기 ----------

  function editableRoot(node) {
    const el = node instanceof Element ? node : node && node.parentElement;
    if (!el) return null;
    if (el instanceof HTMLTextAreaElement) return el;
    if (el instanceof HTMLInputElement) return ['text', 'search', ''].includes(el.type) ? el : null;
    return el.isContentEditable ? el : null;
  }

  function onPaste(e) {
    if (!enabled || redispatching) return;
    const target = editableRoot(e.target);
    if (!target) return;
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!text) return;

    const result = masker.mask(text, settings.customWords);
    if (!result.count) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    insertText(e.target, target, result.text);
    store.saveMapState(origin, masker.toJSON());
    showToast(result);
  }

  function insertText(eventTarget, editable, text) {
    const isField = editable instanceof HTMLTextAreaElement || editable instanceof HTMLInputElement;

    // ChatGPT·Claude(ProseMirror), Gemini(Quill) 같은 에디터는 자기 붙여넣기 처리기를 거쳐야
    // 내부 상태가 맞게 유지된다. 가린 글로 붙여넣기 이벤트를 다시 보내서 에디터가 처리하게 한다.
    if (!isField) {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      redispatching = true;
      try {
        eventTarget.dispatchEvent(event);
      } finally {
        redispatching = false;
      }
      if (event.defaultPrevented) return;
    }

    // 에디터가 이벤트를 처리하지 않았으면 브라우저 기본 입력으로 넣는다 (실행 취소도 유지됨).
    editable.focus();
    if (document.execCommand('insertText', false, text)) return;

    if (isField) {
      editable.setRangeText(text, editable.selectionStart, editable.selectionEnd, 'end');
      editable.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ---------- 복사 버튼 ----------
  // 답변의 복사 버튼은 화면이 아니라 사이트 내부 데이터(기호가 든 글)를 복사한다.
  // clipboard-main.js가 알려주면 기호를 원래 값으로 바꿔 클립보드에 다시 쓴다.

  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function onCopied(e) {
    if (!enabled || !masker.size) return;
    let data;
    try {
      data = JSON.parse(e.detail);
    } catch {
      return;
    }
    const text = data.text && masker.unmask(data.text);
    const html = data.html && masker.unmask(data.html, escapeHtml);
    if (text === data.text && html === data.html) return;

    const parts = {};
    if (text) parts['text/plain'] = new Blob([text], { type: 'text/plain' });
    if (html) parts['text/html'] = new Blob([html], { type: 'text/html' });
    navigator.clipboard
      .write([new ClipboardItem(parts)])
      .catch((err) => console.warn('[가림] 복사한 글 되돌리기 실패', err));
  }

  // ---------- 되돌리기 ----------

  function restoreText(node) {
    const value = node.nodeValue;
    if (!value) return;
    const parent = node.parentElement;
    // 입력창 안은 되돌리지 않는다. 되돌리면 원래 값이 그대로 전송된다.
    if (!parent || parent.isContentEditable || parent.closest(SKIP_SELECTOR)) return;
    const restored = masker.unmask(value);
    if (restored !== value) node.nodeValue = restored;
  }

  function restoreTree(node) {
    if (node.nodeType === Node.TEXT_NODE) return restoreText(node);
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) restoreText(t);
  }

  function startRestoring() {
    const pending = new Set();
    let scheduled = false;

    const flush = () => {
      scheduled = false;
      for (const node of pending) if (node.isConnected) restoreTree(node);
      pending.clear();
    };

    new MutationObserver((mutations) => {
      if (!enabled || !masker.size) return;
      for (const m of mutations) {
        if (m.type === 'characterData') pending.add(m.target);
        else m.addedNodes.forEach((n) => pending.add(n));
      }
      if (!scheduled) {
        scheduled = true;
        // requestAnimationFrame은 백그라운드 탭에서 멈추므로 타이머를 쓴다.
        setTimeout(flush, 30);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });

    if (enabled && masker.size) restoreTree(document.body);
  }

  function onStorageChange(changes, area) {
    if (area === 'local' && changes.settings) {
      settings = { ...settings, ...changes.settings.newValue };
      enabled = !settings.disabledSites.includes(location.hostname);
    }
    const key = store.mapKey(origin);
    if (area === 'session' && changes[key]) {
      masker = new Masker(changes[key].newValue);
      if (enabled && masker.size) restoreTree(document.body);
    }
  }

  // ---------- 알림 ----------

  function showToast(result) {
    let host = document.getElementById(TOAST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = TOAST_ID;
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          .toast {
            position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
            max-width: 320px; padding: 12px 14px; border-radius: 10px;
            background: #12312b; color: #f2fbf8; box-shadow: 0 6px 24px rgba(0,0,0,.25);
            font: 13px/1.5 system-ui, -apple-system, "Malgun Gothic", sans-serif;
            opacity: 0; transform: translateY(8px); transition: opacity .2s, transform .2s;
            pointer-events: none;
          }
          .toast.show { opacity: 1; transform: none; }
          b { color: #7fe0c5; }
          .detail { color: #b9d6ce; font-size: 12px; }
        </style>
        <div class="toast"><div class="title"></div><div class="detail"></div></div>`;
      document.documentElement.appendChild(host);
    }
    const shadow = host.shadowRoot;
    const toast = shadow.querySelector('.toast');
    shadow.querySelector('.title').innerHTML = `<b>가림</b> 개인정보 ${result.count}건을 가렸습니다`;
    shadow.querySelector('.detail').textContent = Object.entries(result.byType)
      .map(([label, n]) => `${label} ${n}`)
      .join(' · ');
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 3500);
  }

  init();
})();
