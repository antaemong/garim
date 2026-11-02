'use strict';

const store = globalThis.GarimStorage;
const $ = (id) => document.getElementById(id);
const BUILT_IN_MATCHES = chrome.runtime.getManifest().content_scripts[0].matches;

let tab;
let url;
let settings;

async function main() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  settings = await store.getSettings();
  $('words').value = settings.customWords.join('\n');

  try {
    url = new URL(tab.url);
  } catch {
    url = null;
  }
  if (!url || !/^https?:$/.test(url.protocol)) {
    $('host').textContent = '이 페이지에서는 사용할 수 없습니다';
    $('clear').hidden = true;
    return;
  }

  $('host').textContent = url.hostname;
  await renderSite();
  await renderEntries();
}

async function renderSite() {
  const pattern = url.origin + '/*';
  const builtIn = BUILT_IN_MATCHES.includes(pattern);
  const added = !builtIn && (await chrome.permissions.contains({ origins: [pattern] }));

  $('toggle-row').hidden = !(builtIn || added);
  $('add-site').hidden = builtIn || added;
  $('remove-site').hidden = !added;
  $('toggle').checked = !settings.disabledSites.includes(url.hostname);
  $('site-hint').textContent = builtIn
    ? '기본 지원 AI 사이트입니다.'
    : added
      ? '직접 추가한 사이트입니다.'
      : '아직 가림이 동작하지 않는 사이트입니다.';
}

async function renderEntries() {
  const state = await store.getMapState(url.origin);
  const entries = (state && state.entries) || [];
  $('count').textContent = entries.length;
  $('entries').replaceChildren(
    ...entries.map((e) => {
      const li = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = e.token;
      const original = document.createElement('span');
      original.textContent = e.original;
      li.append(code, original);
      return li;
    })
  );
}

$('toggle').addEventListener('change', async (e) => {
  const others = settings.disabledSites.filter((h) => h !== url.hostname);
  settings.disabledSites = e.target.checked ? others : [...others, url.hostname];
  await store.saveSettings(settings);
});

$('add-site').addEventListener('click', async () => {
  // 권한 창이 뜨면 팝업이 닫힐 수 있다. 스크립트 등록은 background가 권한 변경을 보고 처리한다.
  const granted = await chrome.permissions.request({ origins: [url.origin + '/*'] });
  if (granted) chrome.tabs.reload(tab.id);
  await renderSite();
});

$('remove-site').addEventListener('click', async () => {
  await chrome.permissions.remove({ origins: [url.origin + '/*'] });
  chrome.tabs.reload(tab.id);
  await renderSite();
});

$('clear').addEventListener('click', async () => {
  await store.clearMapState(url.origin);
  await renderEntries();
});

$('save-words').addEventListener('click', async () => {
  settings.customWords = $('words').value.split('\n').map((w) => w.trim()).filter(Boolean);
  await store.saveSettings(settings);
  $('saved').hidden = false;
  setTimeout(() => ($('saved').hidden = true), 1500);
});

main();
