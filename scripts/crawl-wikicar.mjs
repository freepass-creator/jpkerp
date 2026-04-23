#!/usr/bin/env node
/**
 * 위키중고차(wikicar.co.kr) 크롤러 — 제조사·모델·세대 계층 수집.
 *
 * 수집 대상:
 *   1. 메인 네비 → 제조사 목록 (현대/기아/르노/쉐보레/KGM/제네시스)
 *   2. 제조사 → 모델 리스트 (i30, 아반떼, 쏘렌토, ...)
 *   3. 모델 → 세대 리스트 (i30 신형, 더뉴i30, i30cw, ...)
 *
 * 출력: scripts/wikicar-raw.json
 *
 * 실행: node scripts/crawl-wikicar.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, 'wikicar-raw.json');

const BASE = 'http://wikicar.co.kr';
const HOME = `${BASE}/carinfo`;
const UA = 'Mozilla/5.0 (JPKERP/1.0; internal use)';

// 요청 간격 (초당 1건 미만)
const DELAY_MS = 1200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.text();
}

/** 메인 페이지에서 제조사별 메뉴 파싱 */
function parseMainMenu(html) {
  // <li class="main_hover"> ... <a href="/hyundai">현대</a>
  //   <ul> ... <li><a href="/i30_a">i30</a>
  //     <ul> <li><a href="/i30_pd">i30 신형(3세대)</a></li> ...
  const makers = [];
  // 메인 nav 추출 — gnb 섹션 안의 최상위 li들
  const gnbMatch = html.match(/<div class="gnb fix_width">([\s\S]*?)<\/ul>\s*<\/div>/);
  if (!gnbMatch) return makers;

  // 제조사 메뉴 블록 단위로 분해 — <li class="main_hover ...">부터 다음 main_hover 전까지
  const makerBlocks = html.split(/<li class="main_hover[^"]*">/);
  for (const block of makerBlocks) {
    // 제조사 이름 + href
    const makerA = block.match(/<a href="(\/[a-z_]+)" class="hover_1[^"]*">[\s\S]*?(?:common" \/>)?([가-힣A-Za-z]+)<\/a>/);
    if (!makerA) continue;
    const makerPath = makerA[1];
    const makerName = makerA[2].trim();
    // 홈/매물정보 제외
    if (makerName === '홈' || makerName === '매물정보' || makerName.length > 5) continue;
    // 실제 제조사만 (현대/기아/르노/쉐보레/KGM/제네시스/쌍용 등)
    const knownMakers = ['현대', '기아', '제네시스', '쉐보레', '르노', 'KGM', '쌍용', '벤츠', 'BMW', '아우디', '폭스바겐', '테슬라'];
    if (!knownMakers.includes(makerName)) continue;

    // 2차 메뉴 (모델 그룹) + 3차 메뉴 (세대)
    const models = [];
    const modelBlocks = block.split(/<span class="view"><\/span>/);
    for (const mb of modelBlocks) {
      const modelA = mb.match(/<a href="(\/[a-z0-9_]+)" class="active_a">([^<]+)<\/a>/);
      if (!modelA) continue;
      const modelPath = modelA[1];
      const modelName = modelA[2].trim();

      // 세대 (3차)
      const generations = [];
      const genRe = /<a href="(\/[a-z0-9_]+)" class="active_2a">([^<]+)<\/a>/g;
      let gm;
      while ((gm = genRe.exec(mb)) !== null) {
        generations.push({ path: gm[1], name: gm[2].trim() });
      }

      models.push({ path: modelPath, name: modelName, generations });
    }

    if (models.length > 0) makers.push({ maker: makerName, path: makerPath, models });
  }

  return makers;
}

/** 모델/세대 상세 페이지에서 생산기간·연료·배기량 등 파싱 */
function parseDetailPage(html) {
  // 본문 내 spec 테이블 패턴이 사이트마다 다름 — 일단 body 전체에서 키워드 기반 추출
  const body = html.match(/<div[^>]*class="xe_content"[^>]*>([\s\S]*?)<\/div>\s*<\/article>/);
  const content = body ? body[1] : html;

  // 텍스트만 추출
  const text = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const pick = (pattern) => {
    const m = text.match(pattern);
    return m ? m[1].trim() : null;
  };

  // 생산기간 "2020. 03" 이나 "2020년 3월"
  const productionRange = pick(/생산[^\d]*(\d{4}[년.\s\-/]+\d{1,2}[월]*[\s~ー\-]+\d{4}[년.\s\-/]*\d{0,2}[월]*|현재|단종)/);

  return {
    production_text: productionRange,
    raw_text_preview: text.slice(0, 400),
  };
}

async function main() {
  console.log('[crawl-wikicar] 시작');
  console.log(`[crawl-wikicar] 홈 페이지 fetch: ${HOME}`);

  const homeHtml = await fetchHtml(HOME);
  const makers = parseMainMenu(homeHtml);

  console.log(`[crawl-wikicar] 제조사 ${makers.length}개 발견:`,
    makers.map((m) => `${m.maker}(${m.models.length})`).join(', '));

  const result = {
    source: 'wikicar.co.kr',
    fetched_at: new Date().toISOString(),
    makers,
  };

  // 첫 단계는 목록만 저장 (상세 페이지 수백 개 fetching 전에 구조 확인)
  await fs.writeFile(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[crawl-wikicar] 목록 저장 완료 → ${OUT_FILE}`);
  console.log(`[crawl-wikicar] 세대 상세 페이지는 선택적 2단계에서 fetch (옵션 --detail)`);

  // 세대 개수 요약
  let totalModels = 0;
  let totalGens = 0;
  for (const m of makers) {
    totalModels += m.models.length;
    for (const md of m.models) totalGens += md.generations.length;
  }
  console.log(`[crawl-wikicar] 합계: 모델 ${totalModels}개, 세대 ${totalGens}개`);

  // --detail 플래그 있으면 각 세대 페이지도 fetch
  if (process.argv.includes('--detail')) {
    console.log('[crawl-wikicar] --detail 모드: 세대 페이지 상세 정보 수집 시작');
    for (const maker of makers) {
      for (const model of maker.models) {
        const targets = model.generations.length > 0 ? model.generations : [{ path: model.path, name: model.name }];
        for (const gen of targets) {
          const url = `${BASE}${gen.path}`;
          try {
            await sleep(DELAY_MS);
            const html = await fetchHtml(url);
            const detail = parseDetailPage(html);
            gen.detail = detail;
            process.stdout.write('.');
          } catch (err) {
            process.stdout.write('X');
            gen.error = err.message;
          }
        }
      }
    }
    console.log('\n[crawl-wikicar] 상세 수집 완료');
    await fs.writeFile(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');
    console.log(`[crawl-wikicar] 최종 저장 → ${OUT_FILE}`);
  }
}

main().catch((err) => {
  console.error('[crawl-wikicar] 실패:', err);
  process.exit(1);
});
