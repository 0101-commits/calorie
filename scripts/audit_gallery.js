// scripts/audit_gallery.js
// 전체 631개 품목 이미지 전수 검사용 시각화 갤러리 생성 스크립트
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const data = JSON.parse(fs.readFileSync(path.join(rootDir, 'data.json'), 'utf-8'));

// 1. 중복 이미지 감지
const urlCounts = {};
data.forEach(item => {
  if (item.image_url) {
    urlCounts[item.image_url] = (urlCounts[item.image_url] || 0) + 1;
  }
});

let html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>프로틴레이더 631개 전 품목 이미지 전수 검수 시트</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
  h1 { font-size: 24px; margin-bottom: 8px; color: #38bdf8; }
  .stats { font-size: 14px; color: #94a3b8; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .card { background: #1e293b; border-radius: 12px; padding: 12px; border: 1px solid #334155; display: flex; flex-direction: column; }
  .card.dupe { border-color: #ef4444; background: #2a151b; }
  .img-box { width: 100%; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: #0b0f19; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; position: relative; }
  .img-box img { width: 100%; height: 100%; object-fit: cover; }
  .badge { position: absolute; top: 8px; right: 8px; background: rgba(239, 68, 68, 0.9); color: white; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: bold; }
  .meta { font-size: 12px; color: #38bdf8; font-weight: bold; margin-bottom: 4px; }
  .name { font-size: 14px; font-weight: 600; color: #f1f5f9; margin-bottom: 6px; line-height: 1.3; }
  .info { font-size: 11px; color: #94a3b8; margin-top: auto; border-top: 1px solid #334155; padding-top: 8px; word-break: break-all; }
  .filter-bar { margin-bottom: 16px; display: flex; gap: 8px; }
  .btn { padding: 6px 12px; border-radius: 6px; border: 1px solid #475569; background: #334155; color: white; cursor: pointer; font-size: 13px; }
  .btn.active { background: #0284c7; border-color: #38bdf8; }
</style>
</head>
<body>
<h1>프로틴레이더 전체 품목 이미지 전수 검수 갤러리</h1>
<div class="stats">
  전체 품목: <strong>${data.length}개</strong> | 
  고유 이미지 수: <strong>${Object.keys(urlCounts).length}개</strong> | 
  중복 이미지 품목: <strong style="color: #ef4444;">${data.filter(x => urlCounts[x.image_url] > 1).length}개</strong>
</div>
<div class="filter-bar">
  <button class="btn active" onclick="filterCards('all')">전체보기 (${data.length})</button>
  <button class="btn" onclick="filterCards('dupe')">중복 의심만 보기 (${data.filter(x => urlCounts[x.image_url] > 1).length})</button>
  <button class="btn" onclick="filterCards('cvs')">편의점 (${data.filter(x => x.channel === 'cvs').length})</button>
  <button class="btn" onclick="filterCards('fr')">외식 (${data.filter(x => x.channel === 'fr').length})</button>
  <button class="btn" onclick="filterCards('mart')">마트 (${data.filter(x => x.channel === 'mart').length})</button>
  <button class="btn" onclick="filterCards('online')">식단몰 (${data.filter(x => x.channel === 'online').length})</button>
</div>
<div class="grid" id="grid">
`;

data.forEach((item, idx) => {
  const isDupe = urlCounts[item.image_url] > 1;
  html += `
  <div class="card ${isDupe ? 'dupe' : ''}" data-channel="${item.channel}" data-dupe="${isDupe ? 'true' : 'false'}">
    <div class="img-box">
      <img src="${item.image_url}" alt="${item.name}" loading="lazy" referrerpolicy="no-referrer">
      ${isDupe ? `<span class="badge">중복 (${urlCounts[item.image_url]}건)</span>` : ''}
    </div>
    <div class="meta">[${item.channel.toUpperCase()}] ${item.brand} · ${item.category}</div>
    <div class="name">#${idx + 1}. ${item.name}</div>
    <div class="info">
      <div>단백질: <strong>${item.protein_g}g</strong> / ${item.kcal}kcal / ${item.price_krw.toLocaleString()}원</div>
      <div style="font-size:10px; color:#64748b; margin-top:4px;">ID: ${item.menu_id}</div>
    </div>
  </div>`;
});

html += `
</div>
<script>
function filterCards(mode) {
  document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  const cards = document.querySelectorAll('.card');
  cards.forEach(c => {
    if (mode === 'all') c.style.display = 'flex';
    else if (mode === 'dupe') c.style.display = c.dataset.dupe === 'true' ? 'flex' : 'none';
    else c.style.display = c.dataset.channel === mode ? 'flex' : 'none';
  });
}
</script>
</body>
</html>`;

fs.writeFileSync(path.join(rootDir, 'audit_gallery.html'), html, 'utf-8');
console.log(`✅ audit_gallery.html 생성 완료! 총 ${data.length}개 품목 (중복 의심: ${data.filter(x => urlCounts[x.image_url] > 1).length}개)`);
