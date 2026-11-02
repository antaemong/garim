// 원래 값 <-> 치환 기호([전화1] 등) 대응표를 관리하고, 가리기/되돌리기를 수행한다.
(function (global) {
  'use strict';

  const { DETECTORS, buildCustomDetector, escapeRegExp } = global.GarimPatterns;
  const compact = (s) => s.replace(/[\s.\-()]/g, '');

  class Masker {
    constructor(state) {
      this.entries = []; // { type, label, key, original, token }
      this.counters = {};
      this.byKey = new Map();
      this.byToken = new Map();
      this._tokenRe = null;
      if (state) {
        for (const e of state.entries || []) this._add(e);
        Object.assign(this.counters, state.counters);
      }
    }

    get size() {
      return this.entries.length;
    }

    _add(entry) {
      this.entries.push(entry);
      this.byKey.set(entry.type + ':' + entry.key, entry);
      this.byToken.set(entry.token, entry);
      this._tokenRe = null;
    }

    _tokenFor(det, value) {
      const key = (det.key || compact)(value);
      const existing = this.byKey.get(det.type + ':' + key);
      if (existing) return existing.token;

      const n = (this.counters[det.type] || 0) + 1;
      this.counters[det.type] = n;
      const entry = { type: det.type, label: det.label, key, original: value, token: `[${det.label}${n}]` };
      this._add(entry);
      return entry.token;
    }

    findMatches(text, customWords) {
      const custom = buildCustomDetector(customWords);
      const detectors = custom ? [custom, ...DETECTORS] : DETECTORS;
      const accepted = [];
      for (const det of detectors) {
        for (const m of text.matchAll(det.regex)) {
          const start = m.index;
          const end = start + m[0].length;
          if (det.validate && !det.validate(m[0])) continue;
          if (accepted.some((a) => start < a.end && end > a.start)) continue;
          accepted.push({ start, end, value: m[0], det });
        }
      }
      return accepted.sort((a, b) => a.start - b.start);
    }

    mask(text, customWords) {
      const matches = this.findMatches(text, customWords);
      const byType = {};
      if (!matches.length) return { text, count: 0, byType };

      let out = '';
      let pos = 0;
      for (const m of matches) {
        out += text.slice(pos, m.start) + this._tokenFor(m.det, m.value);
        pos = m.end;
        byType[m.det.label] = (byType[m.det.label] || 0) + 1;
      }
      return { text: out + text.slice(pos), count: matches.length, byType };
    }

    // AI가 기호를 살짝 바꿔 쓰는 경우([전화 1], 【전화1】, 전화1)도 되돌린다.
    _tokenRegex() {
      if (this._tokenRe) return this._tokenRe;
      const labels = [...new Set(this.entries.map((e) => e.label))].map(escapeRegExp).join('|');
      this._tokenRe = new RegExp(
        `[\\[【［]\\s*(${labels})\\s*[_ -]?\\s*(\\d+)\\s*[\\]】］]|(${labels})(\\d+)(?!\\d)`,
        'g'
      );
      return this._tokenRe;
    }

    unmask(text) {
      if (!this.entries.length || !text) return text;
      return text.replace(this._tokenRegex(), (whole, l1, n1, l2, n2) => {
        const entry = this.byToken.get(`[${l1 || l2}${n1 || n2}]`);
        return entry ? entry.original : whole;
      });
    }

    toJSON() {
      return { entries: this.entries, counters: this.counters };
    }
  }

  global.GarimMasker = Masker;
})(globalThis);
