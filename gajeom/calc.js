// 청약 가점 계산 — 근거: 주택공급에 관한 규칙 [별표 1] 가점제 적용기준 (2024.12.18 개정)
// 원문 사본: 근거/주택공급규칙_별표1_가점제_2024-12-18개정.pdf
// 날짜는 'YYYY-MM-DD' 문자열로 받는다. 화면(index.html)과 테스트(test.mjs)가 같이 쓴다.

export const MAX = { homeless: 32, family: 35, account: 17, total: 84 };

const parse = s => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? { y, m, d } : null;
};
const key = p => p.y * 10000 + p.m * 100 + p.d;
const fmt = p => `${p.y}.${String(p.m).padStart(2, '0')}.${String(p.d).padStart(2, '0')}`;

// from부터 to까지 꽉 채운 개월 수 (to가 from보다 앞이면 음수가 아닌 -1)
export function fullMonths(from, to) {
  if (key(to) < key(from)) return -1;
  let months = (to.y - from.y) * 12 + (to.m - from.m);
  if (to.d < from.d) months -= 1;
  return months;
}

// ① 무주택기간 (상한 32): 1년 미만 2점, 1년마다 2점씩, 15년 이상 32점
export function homelessPoints(years) {
  return Math.min(32, 2 + 2 * years);
}

// ② 부양가족수 (상한 35): 0명 5점, 1명당 5점, 6명 이상 35점
export function familyPoints(count) {
  return Math.min(35, 5 + 5 * Math.max(0, count));
}

// ③ 주택청약종합저축 가입기간 (상한 17): 6개월 미만 1, 6개월~1년 2, 1년 이상은 (년수 + 2), 15년 이상 17
export function accountPointsByMonths(months) {
  if (months < 6) return 1;
  if (months < 12) return 2;
  return Math.min(17, Math.floor(months / 12) + 2);
}

/**
 * input = {
 *   base: 입주자모집공고일, birth: 본인 생년월일,
 *   married: boolean, marriage: 혼인신고일,
 *   ownsNow: 세대원 누구라도 지금 주택(분양권 포함) 소유,
 *   ownedBefore: 본인·배우자가 예전에 주택 소유, homelessSince: 마지막으로 무주택자가 된 날,
 *   recentWin: 최근 2년 안에 가점제로 당첨된 세대,
 *   parents: 부양가족으로 인정되는 직계존속 수, kids: 미혼 자녀(30세 미만) 수, adultKids: 1년 이상 같은 등본인 30세 이상 미혼 자녀 수,
 *   hasAccount: 청약통장 있음, accountJoined: 본인 통장 최초 가입일,
 *   spouseAccountJoined: 배우자 통장 최초 가입일 (없으면 빈 값)
 * }
 */
export function calculate(input) {
  const base = parse(input.base);
  const birth = parse(input.birth);
  const notes = [];
  const missing = [];
  if (!base) missing.push('입주자모집공고일');

  // ── ① 무주택기간 ─────────────────────────────
  const homeless = { points: 0, years: null, start: null, reason: '' };
  if (input.ownsNow) {
    homeless.reason = '지금 세대원 중 주택을 가진 사람이 있으면 무주택기간은 0점이에요.';
  } else if (!birth) {
    missing.push('생년월일');
  } else if (base) {
    const turn30 = { y: birth.y + 30, m: birth.m, d: birth.d };
    const marriage = input.married ? parse(input.marriage) : null;
    if (input.married && !marriage) missing.push('혼인신고일');
    // 30세가 되는 날부터 세되, 30세 전에 혼인했으면 혼인신고일부터 센다
    let start = marriage && key(marriage) < key(turn30) ? marriage : turn30;
    let startLabel = start === turn30 ? '만 30세가 된 날' : '혼인신고일';
    if (input.ownedBefore) {
      const since = parse(input.homelessSince);
      if (!since) missing.push('무주택자가 된 날');
      else if (key(since) > key(start)) { start = since; startLabel = '마지막으로 무주택자가 된 날'; }
    }
    homeless.start = fmt(start);
    const months = fullMonths(start, base);
    if (months < 0) {
      homeless.reason = '미혼이고 만 30세 전이면 무주택기간을 아직 세지 않아 0점이에요. 30세 전에 혼인신고를 하면 그날부터 세요.';
    } else {
      homeless.years = Math.floor(months / 12);
      homeless.points = homelessPoints(homeless.years);
      homeless.reason = `${startLabel}(${homeless.start})부터 ${homeless.years}년 ${months % 12}개월`;
    }
  }

  // ── ② 부양가족 ─────────────────────────────
  const spouse = input.married ? 1 : 0;
  const familyCount = spouse + (input.parents | 0) + (input.kids | 0) + (input.adultKids | 0);
  const family = { points: familyPoints(familyCount), count: familyCount };

  // ── ③ 청약통장 ─────────────────────────────
  const account = { points: 0, own: 0, spouse: 0, reason: '' };
  if (!input.hasAccount) {
    account.reason = '청약통장이 없으면 1순위로 청약할 수 없어요.';
  } else {
    const joined = parse(input.accountJoined);
    if (!joined) missing.push('청약통장 가입일');
    else if (base) {
      const months = fullMonths(joined, base);
      if (months < 0) missing.push('가입일이 공고일보다 늦어요');
      else {
        account.own = accountPointsByMonths(months);
        account.reason = `본인 ${Math.floor(months / 12)}년 ${months % 12}개월`;
      }
    }
    // 비고 2: 배우자 가입기간의 50%에 해당하는 기간의 점수(최대 3점)를 더하고, 합계는 17점까지
    const sJoined = input.married ? parse(input.spouseAccountJoined) : null;
    if (sJoined && base) {
      const sMonths = fullMonths(sJoined, base);
      if (sMonths >= 0) {
        account.spouse = Math.min(3, accountPointsByMonths(sMonths / 2));
        account.reason += ` + 배우자 ${Math.floor(sMonths / 12)}년 ${sMonths % 12}개월의 절반`;
      }
    }
    account.points = Math.min(17, account.own + account.spouse);
  }

  // ── 가점제 대상 여부 (비고 1) ───────────────────
  let eligible = true;
  if (input.ownsNow) {
    eligible = false;
    notes.push('지금 주택을 가진 세대는 1순위 가점제 대상이 아니고 추첨제로만 신청할 수 있어요.');
  }
  if (input.recentWin) {
    eligible = false;
    notes.push('최근 2년 안에 가점제로 당첨된 세대는 1순위 가점제 대상이 아니고 추첨제로만 신청할 수 있어요.');
  }
  if (!input.hasAccount) eligible = false;

  const total = homeless.points + family.points + account.points;
  return { total, homeless, family, account, eligible, notes, missing };
}

// 1년 뒤(공고일 +1년) 같은 조건이면 몇 점인지
export function nextYear(input) {
  const base = parse(input.base);
  if (!base) return null;
  return calculate({ ...input, base: `${base.y + 1}-${String(base.m).padStart(2, '0')}-${String(base.d).padStart(2, '0')}` });
}
