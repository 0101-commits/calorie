# -*- coding: utf-8 -*-
"""
공공데이터 수집분과 기본 시드 데이터를 통합하고 R1~R5 QA를 통과한 데이터만 병합하는 파이프라인
"""

import json
import os
import csv
import subprocess
from fetch_public_data import run_pipeline

def validate_item_py(item, existing_ids):
    kcal = float(item.get('kcal', 0))
    p = float(item.get('protein_g', 0))
    c = float(item.get('carb_g', 0))
    f = float(item.get('fat_g', 0))
    sugar = float(item.get('sugar_g', 0))
    sat_fat = float(item.get('sat_fat_g', 0))
    sodium = float(item.get('sodium_mg', 0))
    serving = float(item.get('serving_g', 0))
    price = float(item.get('price_krw', 0))

    # R1: 열량 정합성
    if kcal <= 0:
        return False, "R1: kcal <= 0"

    # R2: 질량 정합성
    if serving <= 0:
        return False, "R2: serving <= 0"
    if p > serving or c > serving or f > serving:
        return False, "R2: nutrient exceeds serving"
    if (p + c + f + sodium / 1000.0) > serving * 1.05:
        return False, "R2: total nutrient mass exceeds serving"
    if sugar > c * 1.05:
        return False, "R2: sugar exceeds carb"
    if sat_fat > f * 1.05:
        return False, "R2: sat_fat exceeds fat"

    # R3: 범위 및 이상치
    if price < 500 or price > 30000:
        return False, "R3: price out of range"
    if p < 0 or p > 80:
        return False, "R3: protein out of range"
    if sodium < 0 or sodium > 4000:
        return False, "R3: sodium out of range"

    # R4: ID 중복
    if item.get('menu_id') in existing_ids:
        return False, "R4: duplicate menu_id"

    # R5: 출처 완결성
    for req in ['source_type', 'verified_at', 'rule_version']:
        if not item.get(req):
            return False, f"R5: missing {req}"
    if not item.get('source_url') and not item.get('image_hash'):
        return False, "R5: missing source_url and image_hash"

    return True, "OK"

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    seed_path = os.path.join(root, 'data', 'seed.json')
    
    with open(seed_path, 'r', encoding='utf-8') as f:
        existing_items = json.load(f)
    print(f"기존 시드 데이터: {len(existing_items)}건")
    
    # 공공데이터 수집
    new_items = run_pipeline()
    
    existing_names = set(x['name'] for x in existing_items)
    existing_ids = set(x['menu_id'] for x in existing_items)
    
    added_count = 0
    skipped_count = 0
    
    for it in new_items:
        if it['name'] in existing_names or it['menu_id'] in existing_ids:
            continue
        
        valid, reason = validate_item_py(it, existing_ids)
        if not valid:
            skipped_count += 1
            continue
            
        existing_items.append(it)
        existing_names.add(it['name'])
        existing_ids.add(it['menu_id'])
        added_count += 1
        
    print(f"새로 병합된 공공DB 데이터: {added_count}건 (QA 제외: {skipped_count}건, 총 {len(existing_items)}건)")
    
    # 저장
    with open(seed_path, 'w', encoding='utf-8') as f:
        json.dump(existing_items, f, ensure_ascii=False, indent=2)
        
    csv_path = os.path.join(root, 'data', 'seed.csv')
    if existing_items:
        keys = list(existing_items[0].keys())
        for x in existing_items:
            for k in x.keys():
                if k not in keys:
                    keys.append(k)
        with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            for x in existing_items:
                writer.writerow(x)
                
    print(f"✅ data/seed.json 및 data/seed.csv 갱신 완료 ({len(existing_items)}건).")

if __name__ == '__main__':
    main()

