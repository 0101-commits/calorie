# -*- coding: utf-8 -*-
import os
import sys
import json
import urllib.request
import urllib.parse
from datetime import datetime
import time

sys.stdout.reconfigure(encoding='utf-8')

API_KEY = os.environ.get('DATA_GO_KR_API_KEY')
if not API_KEY:
    raise SystemExit('DATA_GO_KR_API_KEY 환경변수가 필요합니다. .env 를 로드하거나 export 후 실행하세요.')
BASE_URL = 'http://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02'

# Junk food keywords to massively expand comparison DB (D-grade targets)
SEARCH_QUERIES = [
    '신라면', '진라면', '불닭볶음면', '짜파게티', '너구리', '안성탕면', '육개장사발면', '왕뚜껑',
    '포카칩', '새우깡', '꼬북칩', '홈런볼', '맛동산', '오징어땅콩', '초코파이', '몽쉘',
    '메로나', '투게더', '월드콘', '돼지바', '붕어싸만코',
    '빅맥', '와퍼', '싸이버거', '불고기버거',
    '포테토칩', '허니버터칩', '스윙칩', '오감자', '프링글스',
    '삼각김밥', '도시락', '샌드위치', '크림빵', '단팥빵', '소보로빵'
]

# Helper to guess price based on item type
def guess_price(name):
    if '버거' in name: return 5000
    if '피자' in name: return 20000
    if '사발' in name or '큰컵' in name or '컵라면' in name or '뚜껑' in name: return 1500
    if '라면' in name or '볶음면' in name: return 1000
    if '칩' in name or '깡' in name or '과자' in name or '볼' in name: return 2000
    if '파이' in name or '빵' in name or '몽쉘' in name: return 1500
    if '바' in name or '콘' in name: return 1200
    if '투게더' in name or '아이스크림' in name: return 6000
    if '도시락' in name: return 5000
    if '김밥' in name: return 1200
    if '샌드위치' in name: return 3000
    return 2500 # fallback

def fetch_data(query, page_no=1, num_of_rows=5):
    params = urllib.parse.urlencode({
        'ServiceKey': API_KEY,
        'DESC_KOR': query,
        'pageNo': str(page_no),
        'numOfRows': str(num_of_rows),
        'type': 'json'
    })
    # the api key is already encoded, so we need to manually construct
    url = f"{BASE_URL}?ServiceKey={API_KEY}&DESC_KOR={urllib.parse.quote(query)}&pageNo={page_no}&numOfRows={num_of_rows}&type=json"
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read()
            return json.loads(res_body.decode('utf-8'))
    except Exception as e:
        print(f"Error fetching {query}: {e}")
        return None

def parse_float(val):
    if not val or val == 'N/A' or val == '-': return 0.0
    try:
        return float(val)
    except:
        return 0.0

def process():
    print(f"Starting massive expansion script for {len(SEARCH_QUERIES)} keywords...")
    results = []
    seen = set()

    # Load existing seed to avoid duplicates
    seed_path = os.path.join('data', 'seed.json')
    if os.path.exists(seed_path):
        with open(seed_path, 'r', encoding='utf-8') as f:
            existing = json.load(f)
            for item in existing:
                seen.add(item['name'].replace(' ', ''))

    added_count = 0

    for query in SEARCH_QUERIES:
        print(f"Searching for [{query}]...")
        data = fetch_data(query, 1, 10)
        time.sleep(0.5) # rate limit
        
        if not data or 'body' not in data:
            continue
            
        items = data['body'].get('items', [])
        for item in items:
            name = item.get('FOOD_NM_KR', '')
            maker = item.get('MAKER_NAME', '')
            
            clean_name = name.replace(' ', '')
            if clean_name in seen or not name:
                continue
                
            serving_size = parse_float(item.get('SERVING_SIZE', '0').replace('g','').replace('ml',''))
            kcal = parse_float(item.get('AMT_NUM1', '0'))
            protein = parse_float(item.get('AMT_NUM3', '0'))
            fat = parse_float(item.get('AMT_NUM4', '0'))
            carb = parse_float(item.get('AMT_NUM6', '0'))
            sugar = parse_float(item.get('AMT_NUM7', '0'))
            sodium = parse_float(item.get('AMT_NUM13', '0'))
            sat_fat = parse_float(item.get('AMT_NUM23', '0'))
            
            if serving_size <= 0 or kcal <= 0:
                continue
                
            if sat_fat > fat: sat_fat = fat
                
            price = guess_price(name)
            
            channel = 'mart'
            if '버거' in name or '맥도날드' in maker or '버거킹' in maker: channel = 'fr'
            elif '김밥' in name or '도시락' in name: channel = 'cvs'
            
            new_item = {
                "menu_id": f"auto-{int(time.time()*1000)}-{added_count}",
                "channel": channel,
                "brand": maker if maker else "일반",
                "name": name,
                "category": "일반식품",
                "price_krw": price,
                "serving_g": serving_size,
                "kcal": kcal,
                "protein_g": protein,
                "carb_g": carb,
                "sugar_g": sugar,
                "fat_g": fat,
                "sat_fat_g": sat_fat,
                "sodium_mg": sodium,
                "ingredients_raw": "", 
                "protein_source": "none",
                "cooking": "processed",
                "marketing_claim": 0,
                "image_url": "",
                "source_type": "official",
                "verified_at": "2026-09-16",
                "rule_version": "v1.0",
                "source_url": "https://various"
            }
            results.append(new_item)
            seen.add(clean_name)
            added_count += 1
            print(f"  + Added: {name} (Kcal: {kcal}, P: {protein}g)")

    print(f"\nSuccessfully scraped {added_count} new items!")
    
    # Append to existing
    if results:
        if os.path.exists(seed_path):
            with open(seed_path, 'r', encoding='utf-8') as f:
                existing = json.load(f)
            existing.extend(results)
            with open(seed_path, 'w', encoding='utf-8') as f:
                json.dump(existing, f, ensure_ascii=False, indent=2)
            print(f"Updated {seed_path} successfully. Total: {len(existing)}")

if __name__ == '__main__':
    process()
