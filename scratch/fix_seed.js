import fs from 'fs';
const p = 'data/seed.json';
let d = JSON.parse(fs.readFileSync(p));
d = d.filter(x => x.name && x.name.trim() !== '');
fs.writeFileSync(p, JSON.stringify(d, null, 2));
