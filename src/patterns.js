// 개인정보 탐지 규칙.
// 배열 순서가 우선순위다. 같은 위치를 여러 규칙이 잡으면 앞쪽 규칙이 이긴다.
(function (global) {
  'use strict';

  const digits = (s) => s.replace(/\D/g, '');

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 주민등록번호 앞 6자리가 실제 날짜 형태인지 확인한다.
  // 2020년 10월 이후 발급분은 검증 숫자가 없어서 체크섬은 보지 않는다.
  function isValidRrn(m) {
    const d = digits(m);
    const month = Number(d.slice(2, 4));
    const day = Number(d.slice(4, 6));
    return month >= 1 && month <= 12 && day >= 1 && day <= 31;
  }

  function luhn(num) {
    let sum = 0;
    let alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let n = Number(num[i]);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function isValidBizNo(m) {
    const d = digits(m).split('').map(Number);
    const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += d[i] * weights[i];
    sum += Math.floor((d[8] * 5) / 10);
    return (10 - (sum % 10)) % 10 === d[9];
  }

  // key: 같은 값을 다른 형식으로 써도(010-1234-5678 / 01012345678) 같은 기호로 묶기 위한 정규화 함수
  const DETECTORS = [
    {
      type: 'rrn',
      label: '주민번호',
      regex: /(?<!\d)\d{6}\s?-?\s?[1-8](?:\d{6}|\*{6})(?![\d*])/g,
      validate: isValidRrn,
      key: (s) => s.replace(/[\s-]/g, ''),
    },
    {
      type: 'driver',
      label: '면허번호',
      regex: /(?<![\d-])\d{2}-\d{2}-\d{6}-\d{2}(?![\d-])/g,
      key: digits,
    },
    {
      type: 'card',
      label: '카드번호',
      regex: /(?<!\d)(?:\d{4}[- ]?){3}\d{4}(?!\d)|(?<!\d)3[47]\d{2}[- ]?\d{6}[- ]?\d{5}(?!\d)/g,
      validate: (m) => luhn(digits(m)),
      key: digits,
    },
    {
      type: 'biz',
      label: '사업자번호',
      regex: /(?<![\d-])\d{3}-\d{2}-\d{5}(?![\d-])/g,
      validate: isValidBizNo,
      key: digits,
    },
    {
      type: 'phone',
      label: '전화',
      regex: /(?<!\d)01[016789][-. ]?\d{3,4}[-. ]?\d{4}(?!\d)/g,
      key: digits,
    },
    {
      // 일반 전화는 숫자만 이어진 경우 오탐이 많아서 구분자가 있을 때만 잡는다.
      type: 'phone',
      label: '전화',
      regex: /(?<!\d)(?:\(0\d{1,2}\)\s?|0(?:2|[3-6][1-5]|70)[-. ])\d{3,4}[-. ]\d{4}(?!\d)/g,
      key: digits,
    },
    {
      type: 'email',
      label: '이메일',
      regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
      key: (s) => s.toLowerCase(),
    },
    {
      type: 'passport',
      label: '여권번호',
      regex: /(?<![A-Za-z0-9])(?:[MSRODG]\d{8}|M\d{3}[A-Z]\d{4})(?![A-Za-z0-9])/g,
    },
    {
      // 은행마다 형식이 달라서 하이픈으로 나뉜 10~16자리 숫자를 계좌로 본다.
      // 전화·사업자번호 등은 위 규칙이 먼저 가져가므로 여기까지 오지 않는다.
      type: 'account',
      label: '계좌',
      regex: /(?<![\d-])\d{2,6}-\d{2,6}-\d{2,7}(?:-\d{1,3})?(?![\d-])/g,
      validate: (m) => {
        const n = digits(m).length;
        return n >= 10 && n <= 16;
      },
      key: digits,
    },
  ];

  // 사용자가 직접 등록한 단어(이름, 회사명 등). 다른 규칙보다 먼저 적용한다.
  function buildCustomDetector(words) {
    const list = [...new Set((words || []).map((w) => w.trim()).filter((w) => w.length >= 2))].sort(
      (a, b) => b.length - a.length
    );
    if (!list.length) return null;
    return {
      type: 'custom',
      label: '비공개',
      regex: new RegExp(list.map(escapeRegExp).join('|'), 'gi'),
      key: (s) => s.toLowerCase(),
    };
  }

  global.GarimPatterns = { DETECTORS, buildCustomDetector, escapeRegExp };
})(globalThis);
