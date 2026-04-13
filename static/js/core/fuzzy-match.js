/**
 * fuzzy-match.js — 차량명 퍼지 매칭
 *
 * 사용:
 *   import { fuzzyMatch, fuzzyTop } from '../core/fuzzy-match.js';
 *   fuzzyMatch('아반테', ['아반떼','쏘나타','그랜저']); // → { value: '아반떼', score: 0.16 }
 *   fuzzyTop('그렌져', ['그랜저','그랜져','그랜저IG'], 3); // → [{ value, score }, ...]
 */

function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ''); }

function levenshtein(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i - 1] === a[j - 1]
        ? m[i - 1][j - 1]
        : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return m[b.length][a.length];
}

/**
 * 후보 중 가장 유사한 1개 반환
 * @returns {{ value: string, score: number } | null}  score 0 = 완벽, 0.5 이하만 반환
 */
export function fuzzyMatch(input, candidates, threshold = 0.5) {
  if (!input || !candidates?.length) return null;
  const inN = norm(input);
  if (!inN) return null;

  // 정확 일치
  const exact = candidates.find(c => norm(c) === inN);
  if (exact) return { value: exact, score: 0 };

  // 포함 관계 (부분 문자열)
  for (const c of candidates) {
    const cN = norm(c);
    if (cN.includes(inN) || inN.includes(cN)) return { value: c, score: 0.01 };
  }

  // Levenshtein
  let best = null, bestScore = Infinity;
  for (const c of candidates) {
    if (!c) continue;
    const cN = norm(c);
    const dist = levenshtein(inN, cN);
    const ratio = dist / Math.max(inN.length, cN.length);
    if (ratio < bestScore) { best = c; bestScore = ratio; }
  }
  return bestScore <= threshold ? { value: best, score: bestScore } : null;
}

/**
 * 후보 중 유사한 상위 N개 반환 (점수순)
 */
export function fuzzyTop(input, candidates, n = 3, threshold = 0.6) {
  if (!input || !candidates?.length) return [];
  const inN = norm(input);
  if (!inN) return [];
  return candidates
    .map(c => {
      const cN = norm(c);
      if (cN === inN) return { value: c, score: 0 };
      if (cN.includes(inN) || inN.includes(cN)) return { value: c, score: 0.01 };
      const dist = levenshtein(inN, cN);
      return { value: c, score: dist / Math.max(inN.length, cN.length) };
    })
    .filter(r => r.score <= threshold)
    .sort((a, b) => a.score - b.score)
    .slice(0, n);
}
