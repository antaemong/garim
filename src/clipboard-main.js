// 페이지 쪽(MAIN world)에서 실행된다.
// AI 사이트의 복사 버튼이 클립보드에 쓴 글을 가림(content.js)에 알려주기만 한다.
// 원래 값이 담긴 대응표는 여기에 두지 않는다. 페이지 스크립트가 읽을 수 있기 때문이다.
(function () {
  'use strict';

  const clipboard = navigator.clipboard;
  if (!clipboard || clipboard.__garimWrapped) return;
  clipboard.__garimWrapped = true;

  // 다른 world로 객체를 넘기면 사라지므로 문자열(JSON)로 넘긴다.
  const notify = (text, html) =>
    window.dispatchEvent(new CustomEvent('garim:copied', { detail: JSON.stringify({ text, html }) }));

  const writeText = clipboard.writeText;
  clipboard.writeText = function (text) {
    return writeText.call(this, text).then((result) => {
      notify(String(text), null);
      return result;
    });
  };

  const write = clipboard.write;
  clipboard.write = function (items) {
    return write.call(this, items).then(async (result) => {
      try {
        const item = items && items[0];
        const read = async (type) => (item.types.includes(type) ? (await item.getType(type)).text() : null);
        const text = await read('text/plain');
        const html = await read('text/html');
        if (text || html) notify(text, html);
      } catch {
        // 읽을 수 없는 형식이면 그대로 둔다.
      }
      return result;
    });
  };
})();
