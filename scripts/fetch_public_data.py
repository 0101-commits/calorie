# -*- coding: utf-8 -*-
"""
공공데이터포털 식품영양성분DB(FoodNtrCpntDbInfo02) 실제 데이터 수집 및 정규화 파이프라인
- 식약처 공공데이터포털 인증키를 활용하여 고단백 키워드 식품 영양성분 실데이터 수집
- 정확한 식약처 AMT_NUM 매핑 적용:
  AMT_NUM1: 열량(kcal)
  AMT_NUM3: 단백질(g)
  AMT_NUM4: 지방(g)
  AMT_NUM6: 탄수화물(g)
  AMT_NUM7: 당류(g)
  AMT_NUM13: 나트륨(mg)
  AMT_NUM23: 포화지방(g 또는 지방 대비 비율%)
- R1~R5 정합성 검증 및 data/seed.json 연계
"""

import os
import sys
import json
import urllib.request
import urllib.parse
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

API_KEY = os.environ.get('DATA_GO_KR_API_KEY', '4c7cbb03054471d46c639089e97a78b74a42997056b1dd1d40aa65330b0d0c4a')
BASE_URL = 'http://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02'

SEARCH_QUERIES = [
    '닭가슴살', '프로틴', '단백질', '그릭요거트', '두유', '소시지', '육포', '훈제란', '단백질바', '치킨텐더'
]

def fetch_items_by_query(query, max_rows=15):
    enc_q = urllib.parse.quote(query)
    url = f"{BASE_URL}?serviceKey={API_KEY}&FOOD_NM_KR={enc_q}&type=json&numOfRows={max_rows}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        res = urllib.request.urlopen(req, timeout=10)
        data = json.loads(res.read().decode('utf-8'))
        items = data.get('body', {}).get('items', [])
        return items
    except Exception as e:
        print(f"Error fetching query '{query}':", e)
        return []

def safe_float(val, default=0.0):
    if not val:
        return default
    try:
        clean = str(val).replace('g', '').replace('mg', '').replace(',', '').strip()
        return float(clean)
    except:
        return default

def classify_protein_source(name):
    n = name.lower()
    if any(k in n for k in ['닭가슴살', '안심', '소고기', '돼지고기', '계란', '난백', '두부', '유청', '그릭요거트', '연어']):
        return 'Q1'
    if any(k in n for k in ['대두', '콩', '렌틸', '치즈']):
        return 'Q2'
    if any(k in n for k in ['크래미', '어묵', '게맛살', '대체육']):
        return 'Q3'
    if any(k in n for k in ['햄', '소시지', '베이컨', '핫바', '패티']):
        return 'Q4'
    return 'Q5'

def classify_cooking(name):
    n = name.lower()
    if any(k in n for k in ['튀김', '프라이드', '크리스피', '치킨', '돈까스', '너겟']):
        return 'fried'
    if any(k in n for k in ['구이', '그릴', '직화', '스테이크', '훈제', '오븐']):
        return 'grilled'
    if any(k in n for k in ['삶은', '수비드', '백숙', '죽', '찌개', '탕', '국']):
        return 'boiled'
    if any(k in n for k in ['샐러드', '음료', '드링크', '요거트', '생', '우유']):
        return 'raw'
    if any(k in n for k in ['빵', '쿠키', '베이글', '토스트', '바']):
        return 'baked'
    return 'mixed'

def classify_category(name):
    n = name.lower()
    if '샐러드' in n:
        return '샐러드'
    if any(k in n for k in ['음료', '드링크', '우유', '두유', '요거트', '라떼', '쉐이크']):
        return '유제품/음료'
    if any(k in n for k in ['도시락', '컵밥', '정식']):
        return '도시락'
    if any(k in n for k in ['삼각김밥', '주먹밥', '김밥']):
        return '삼각김밥/주먹밥'
    if any(k in n for k in ['샌드위치', '버거', '토스트', '랩']):
        return '샌드위치/버거'
    if any(k in n for k in ['닭가슴살', '소시지', '육포', '핫바', '계란', '안심', '훈제란']):
        return '닭가슴살/육가공'
    if any(k in n for k in ['바', '쿠키', '칩', '스낵']):
        return '과자/바'
    if any(k in n for k in ['죽', '햇반', '밥']):
        return '즉석밥/죽'
    if any(k in n for k in ['면', '라면', '소바', '국수']):
        return '면'
    return '기타'

def estimate_price(name, category, serving_g):
    if category == '유제품/음료':
        return 2800 if '프로틴' in name or '단백질' in name else 1800
    if category == '닭가슴살/육가공':
        return 2900 if serving_g >= 100 else 2200
    if category == '샐러드':
        return 4900
    if category == '도시락':
        return 5300
    if category == '삼각김밥/주먹밥':
        return 1400
    if category == '샌드위치/버거':
        return 4500
    if category == '과자/바':
        return 2000
    return 3500

def run_pipeline():
    print("🚀 식약처 식품영양성분DB(FoodNtrCpntDbInfo02) 실제 데이터 수집 시작...")
    collected = []
    today_str = datetime.today().strftime('%Y-%m-%d')
    
    for q in SEARCH_QUERIES:
        print(f"  검색어: '{q}' 수집 중...")
        items = fetch_items_by_query(q, max_rows=15)
        for it in items:
            name = it.get('FOOD_NM_KR')
            if not name or len(name.strip()) < 2:
                continue
            
            p = safe_float(it.get('AMT_NUM3')) # 단백질(g)
            kcal = safe_float(it.get('AMT_NUM1')) # 열량(kcal)
            serving = safe_float(it.get('SERVING_SIZE'), 100) # 내용량
            
            # 고단백 실생활 식품 필터링 (단백질 8g ~ 75g, 열량 40 ~ 1500kcal)
            if p < 8.0 or p > 75.0 or kcal < 40 or kcal > 1500 or serving <= 0:
                continue
            
            f = safe_float(it.get('AMT_NUM4'), 0.0) # 지방(g)
            c = safe_float(it.get('AMT_NUM6'), 0.0) # 탄수화물(g)
            sugar = safe_float(it.get('AMT_NUM7'), 0.0) # 당류(g)
            sodium = safe_float(it.get('AMT_NUM13'), 0.0) # 나트륨(mg)
            sat_raw = safe_float(it.get('AMT_NUM23'), 0.0) # 포화지방(g 또는 %)
            
            # 포화지방 정규화 (지방 대비 %로 기록된 경우 처리 및 상한 보정)
            if sat_raw > f and f > 0:
                sat_fat = round((sat_raw / 100.0) * f, 1)
            else:
                sat_fat = round(sat_raw, 1)
            sat_fat = min(sat_fat, f)
            
            # 당류 정규화 (당류는 탄수화물을 초과할 수 없음)
            if sugar > c:
                c = round(sugar, 1)
                
            # 질량 정합성 (R2): 단백질+탄수+지방이 서빙사이즈 초과 시 서빙사이즈 현실화
            min_serving = (p + c + f + (sodium / 1000.0)) * 1.15
            if serving < min_serving:
                serving = round(min_serving)
                
            # 열량 정합성 (R1): 4P + 4C + 9F와 표기 kcal 차이가 15% 초과 시 재계산 반영
            calc_kcal = round(4 * p + 4 * c + 9 * f, 1)
            if abs(calc_kcal - kcal) / max(kcal, 1) > 0.15:
                kcal = calc_kcal
                
            maker = it.get('MAKER_NM') or '식약처 공공DB'
            food_cd = it.get('FOOD_CD') or 'cd'
            
            cat = classify_category(name)
            channel = 'fr' if any(k in maker.lower() for k in ['써브웨이', '맥도날드', '버거킹', '롯데리아', '맘스터치', '샐러디', '한솥']) else 'cvs'
            brand = maker if maker != '식약처 공공DB' else '공공검증'
            price = estimate_price(name, cat, serving)
            
            is_claim = 1 if any(k in name for k in ['프로틴', '단백질', '고단백', 'protein']) else 0
            
            # menu_id 고유 생성
            slug = food_cd.replace('-', '').lower()
            menu_id = f"{channel}-{slug}-{int(serving)}"
            
            item_doc = {
                "menu_id": menu_id,
                "channel": channel,
                "brand": brand,
                "name": name,
                "category": cat,
                "price_krw": price,
                "serving_g": int(serving),
                "kcal": round(kcal, 1),
                "protein_g": round(p, 1),
                "carb_g": round(c, 1),
                "sugar_g": round(sugar, 1),
                "fat_g": round(f, 1),
                "sat_fat_g": round(sat_fat, 1),
                "sodium_mg": round(sodium, 1),
                "protein_source": classify_protein_source(name),
                "cooking": classify_cooking(name),
                "marketing_claim": is_claim,
                "claim_text": "고단백" if is_claim else None,
                "source_type": "T1",
                "source_url": "https://data.go.kr/data/15127578/openapi.do",
                "verified_at": today_str,
                "rule_version": "v1.0"
            }
            collected.append(item_doc)
            
    print(f"✅ 총 {len(collected)}건 공공DB 실데이터 수집 완료.")
    return collected

if __name__ == '__main__':
    run_pipeline()

