const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, '..', 'data', 'seed.json');
const items = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

let stats = {
  total: items.length,
  macroMismatch: [],
  impossibleComponents: [],
  implausiblePrice: [],
  implausibleWeight: [],
  missingFields: []
};

items.forEach((item, idx) => {
  if (
    !item.name ||
    item.price_krw == null ||
    item.kcal == null ||
    item.protein_g == null ||
    item.serving_g == null
  ) {
    stats.missingFields.push(item.name || ('Item #' + idx));
  }

  const c = item.carb_g || 0;
  const f = item.fat_g || 0;
  const p = item.protein_g || 0;
  const sug = item.sugar_g || 0;
  const sat = item.sat_fat_g || 0;
  
  if (sug > c + 1) stats.impossibleComponents.push(item.name + ' (Sugar > Carb, ' + sug + ' > ' + c + ')');
  if (sat > f + 1) stats.impossibleComponents.push(item.name + ' (SatFat > Fat, ' + sat + ' > ' + f + ')');

  if (p + c + f > item.serving_g + 5) {
    stats.implausibleWeight.push(item.name + ' (Macros ' + (p+c+f) + ' > Serving ' + item.serving_g + ')');
  }
  if (p > item.serving_g) {
    stats.implausibleWeight.push(item.name + ' (Protein > Serving)');
  }

  const calculatedKcal = (p * 4) + (c * 4) + (f * 9);
  const diffKcal = Math.abs(calculatedKcal - item.kcal);
  const percentDiff = diffKcal / (item.kcal || 1);
  if (percentDiff > 0.20 && diffKcal > 30) {
    // Exclude Quest Bars as they use Erythritol/Fiber which drastically lowers calories below standard Atwater calculation
    if (!item.name.includes('퀘스트')) {
      stats.macroMismatch.push(item.name + ' (Stated: ' + item.kcal + ', Calc: ' + calculatedKcal + ')');
    }
  }

  if (item.price_krw <= 0 || item.price_krw > 30000) {
    stats.implausiblePrice.push(item.name + ' (Price: ' + item.price_krw + ')');
  }
});

console.log('--- DB Full Audit Report ---');
console.log('Total Items:', stats.total);
console.log('Missing Fields:', stats.missingFields.length);
if (stats.missingFields.length > 0) console.log(stats.missingFields);
console.log('Impossible Components:', stats.impossibleComponents.length);
if (stats.impossibleComponents.length > 0) console.log(stats.impossibleComponents.slice(0,5));
console.log('Implausible Weight:', stats.implausibleWeight.length);
if (stats.implausibleWeight.length > 0) console.log(stats.implausibleWeight.slice(0,5));
console.log('Macro Mismatch (>20% & >30kcal):', stats.macroMismatch.length);
if (stats.macroMismatch.length > 0) console.log(stats.macroMismatch.slice(0,5));
console.log('Implausible Price:', stats.implausiblePrice.length);

fs.writeFileSync(path.join(__dirname, '..', 'scratch', 'db_audit_report.json'), JSON.stringify(stats, null, 2), 'utf-8');
