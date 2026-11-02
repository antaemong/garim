// 사용자가 직접 추가한 사이트에도 가림이 동작하도록 콘텐츠 스크립트를 등록한다.
// 추가된 사이트 목록은 따로 저장하지 않고, 사용자가 허용한 권한 자체를 기준으로 삼는다.
'use strict';

const [BUILT_IN, BUILT_IN_MAIN] = chrome.runtime.getManifest().content_scripts;
const SCRIPT_IDS = ['garim-user-sites', 'garim-user-sites-main'];

// 콘텐츠 스크립트가 세션 저장소(대응표)에 접근할 수 있게 한다.
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

async function syncUserSites() {
  const { origins = [] } = await chrome.permissions.getAll();
  const matches = origins.filter((o) => !BUILT_IN.matches.includes(o));

  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: SCRIPT_IDS });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  if (!matches.length) return;

  await chrome.scripting.registerContentScripts([
    { id: SCRIPT_IDS[0], matches, js: BUILT_IN.js, runAt: 'document_idle' },
    { id: SCRIPT_IDS[1], matches, js: BUILT_IN_MAIN.js, runAt: 'document_start', world: 'MAIN' },
  ]);
}

chrome.runtime.onInstalled.addListener(syncUserSites);
chrome.runtime.onStartup.addListener(syncUserSites);
chrome.permissions.onAdded.addListener(syncUserSites);
chrome.permissions.onRemoved.addListener(syncUserSites);
