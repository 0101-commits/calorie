// scripts/fix_variant_images.js
// 맛/종류별 중복 이미지 15종 개별 고유 이미지 매핑
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const seedPath = path.join(rootDir, 'data', 'seed.json');
const products = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

const FIX_MAP = {
  'cvs-p1098010801002786-100': 'https://search2.kakaocdn.net/argon/320x320_85_c/JtHrpCtfs2K', // 하이뮨 딥초코
  'cvs-ildong-himmune-active-choco-250': 'https://search4.kakaocdn.net/argon/320x320_85_c/GhBSpVRV6tK', // 하이뮨 액티브 초코
  'cvs-cu-baek-triple-tonkatsu-490': 'https://search4.kakaocdn.net/argon/320x320_85_c/1qNUB3p8BmL', // CU 백종원 돈까스 도시락
  'cvs-p1014150004000122-100': 'https://search1.kakaocdn.net/argon/320x320_85_c/2r7ckBtlXLZ', // 맛있닭 한끼피자 야채
  'cvs-p1011030001000064-100': 'https://search4.kakaocdn.net/argon/320x320_85_c/1aLqJ8Wwono', // 얼그레이 쿠우키
  'cvs-p1011030001000300-109': 'https://search3.kakaocdn.net/argon/320x320_85_c/EZHb32qgFzt', // 여에스더 땅콩버터
  'cvs-p1167030703000002-100': 'https://search4.kakaocdn.net/argon/320x320_85_c/2zHpao9z54w', // 고기대신 핫스파이시
  'cvs-p1167030703000050-100': 'https://search1.kakaocdn.net/argon/320x320_85_c/HUDT9OgNJ3j', // 언리미트 양꼬치
  'cvs-p1167030703000049-100': 'https://search1.kakaocdn.net/argon/320x320_85_c/HAn3dST8bg5', // 언리미트 멕시칸
  'cvs-p1167030703000134-100': 'https://search1.kakaocdn.net/argon/320x320_85_c/AcXIagx665j', // 언리미트 후추
  'cvs-p1167030703000208-100': 'https://search4.kakaocdn.net/argon/320x320_85_c/BPugh2mr5Cf', // 비그레인 매운맛
  'cvs-p1021030103000836-100': 'https://search3.kakaocdn.net/argon/320x320_85_c/Ld6mua4olQq', // 끌레도르 카라멜
  'cvs-p1012050002001431-100': 'https://search3.kakaocdn.net/argon/320x320_85_c/6LJ3408seoj', // 닥터랩노쉬 릴렉스
  'cvs-p1012050002001434-100': 'https://search2.kakaocdn.net/argon/320x320_85_c/LaqlM5e2Vgl', // 닥터랩노쉬 에너지
  'cvs-p1014050004002791-100': 'https://search4.kakaocdn.net/argon/320x320_85_c/2QCY97p08tm', // 굽네 카야 토스트
  'mart-pulmuone-tofu-bar-basil-40': 'https://search3.kakaocdn.net/argon/320x320_85_c/9XrG5BjFKtj', // 풀무원 바질 두부바
  'online-metree-chicken-fried-rice-garlic-200': 'https://search3.kakaocdn.net/argon/320x320_85_c/7vmSXmOELjq', // 미트리 갈릭볶음밥
  'online-metree-chicken-fried-rice-kimchi-200': 'https://search4.kakaocdn.net/argon/320x320_85_c/AWbNfXQHql', // 미트리 김치볶음밥
  'fr-frankburger-jg-burger-310': 'https://search4.kakaocdn.net/argon/320x320_85_c/DEe2SwaUKnh' // 프랭크버거 JG버거
};

let count = 0;
for (const item of products) {
  if (FIX_MAP[item.menu_id]) {
    item.image_url = FIX_MAP[item.menu_id];
    count++;
    console.log(`✅ [개별 맛/품목 매핑] ${item.name} -> ${item.image_url}`);
  }
}

fs.writeFileSync(seedPath, JSON.stringify(products, null, 2), 'utf-8');
console.log(`\n🎉 총 ${count}건 고유 이미지 수정 완료 및 seed.json 저장!`);
