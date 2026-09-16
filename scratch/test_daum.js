import fs from 'fs';
const query = '신라면 큰사발면 원재료명';
fetch('https://search.daum.net/search?w=tot&q=' + encodeURIComponent(query))
.then(r => r.text())
.then(html => {
  fs.writeFileSync('scratch/daum_search.html', html, 'utf-8');
});
