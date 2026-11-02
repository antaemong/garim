// 설정은 chrome.storage.local(이 기기에만 저장, 동기화 안 함),
// 대응표는 chrome.storage.session(메모리에만 저장, 브라우저를 닫으면 삭제)에 둔다.
// chrome.storage를 쓸 수 없는 환경(테스트 페이지 등)에서는 메모리로 대신한다.
(function (global) {
  'use strict';

  const DEFAULT_SETTINGS = { disabledSites: [], customWords: [] };
  const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage;
  const memory = { local: {}, session: {} };

  async function get(area, key) {
    if (hasChrome) {
      try {
        return (await chrome.storage[area].get(key))[key];
      } catch (err) {
        console.warn('[가림] 저장소 읽기 실패', err);
      }
    }
    return memory[area][key];
  }

  async function set(area, key, value) {
    memory[area][key] = value;
    if (!hasChrome) return;
    try {
      await chrome.storage[area].set({ [key]: value });
    } catch (err) {
      console.warn('[가림] 저장소 쓰기 실패', err);
    }
  }

  async function remove(area, key) {
    delete memory[area][key];
    if (!hasChrome) return;
    try {
      await chrome.storage[area].remove(key);
    } catch (err) {
      console.warn('[가림] 저장소 삭제 실패', err);
    }
  }

  const mapKey = (origin) => 'map:' + origin;

  global.GarimStorage = {
    mapKey,
    async getSettings() {
      return { ...DEFAULT_SETTINGS, ...(await get('local', 'settings')) };
    },
    saveSettings: (settings) => set('local', 'settings', settings),
    getMapState: (origin) => get('session', mapKey(origin)),
    saveMapState: (origin, state) => set('session', mapKey(origin), state),
    clearMapState: (origin) => remove('session', mapKey(origin)),
    onChange(callback) {
      if (hasChrome) chrome.storage.onChanged.addListener(callback);
    },
  };
})(globalThis);
