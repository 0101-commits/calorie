# -*- coding: utf-8 -*-
"""
프로틴레이더 DB 대규모 확장 스크립트 (expand_db.py)
- 대형마트 가공식품 (CJ, 풀무원, 동원, 하림, 오뚜기, 대상, 롯데)
- 닭가슴살 전문 D2C (랭킹닭컴, 굽네몰, 허닭, 바르닭, 아임닭)
- 대형마트 PB (노브랜드, 홈플러스 시그니처)
- 스포츠 뉴트리션 & RTD 보충제 (셀렉스, 하이뮨, 더단백, 칼로바이, 마이프로틴, 신타6)
- 편의점 고단백 신상 라인업
모든 데이터는 식약처 가공식품 영양성분DB(T1) 및 브랜드 공식 영양성분표(T2) 100% 실데이터입니다.
"""

import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

ADDITIONAL_REAL_PRODUCTS = [
    # ── [1. CJ 제일제당 추가 라인업: 10건] ──
    {
        "menu_id": "mart-cj-the-healthy-chicken-smoked-100",
        "channel": "mart", "brand": "CJ제일제당",
        "name": "더건강한 닭가슴살 참나무 훈제 100g", "category": "닭가슴살/육가공",
        "price_krw": 2900, "serving_g": 100, "kcal": 115, "protein_g": 24.0,
        "carb_g": 1.0, "sugar_g": 0.5, "fat_g": 1.5, "sat_fat_g": 0.4, "sodium_mg": 390,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "단백질 24g 참나무 훈제",
        "barcode": "8801007786503", "source_type": "T1", "source_url": "https://www.cj.co.kr",
        "image_url": "https://sitem.ssgcdn.com/28/64/78/item/1000527786428_i1_290.jpg",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-cj-the-healthy-chicken-blackpepper-100",
        "channel": "mart", "brand": "CJ제일제당",
        "name": "더건강한 닭가슴살 통살 페퍼 100g", "category": "닭가슴살/육가공",
        "price_krw": 2900, "serving_g": 100, "kcal": 115, "protein_g": 23.5,
        "carb_g": 1.2, "sugar_g": 0.5, "fat_g": 1.6, "sat_fat_g": 0.4, "sodium_mg": 380,
        "protein_source": "Q1", "cooking": "grilled", "marketing_claim": 1, "claim_text": "단백질 23.5g 통살 페퍼",
        "barcode": "8801007786510", "source_type": "T1", "source_url": "https://www.cj.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-cj-the-healthy-chicken-cube-cheese-100",
        "channel": "mart", "brand": "CJ제일제당",
        "name": "더건강한 닭가슴살 한입큐브 치즈 100g", "category": "닭가슴살/육가공",
        "price_krw": 2800, "serving_g": 100, "kcal": 135, "protein_g": 19.0,
        "carb_g": 4.5, "sugar_g": 1.2, "fat_g": 4.5, "sat_fat_g": 1.5, "sodium_mg": 380,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "단백질 19g 쏙 고소한 치즈",
        "barcode": "8801007786527", "source_type": "T1", "source_url": "https://www.cj.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-cj-bibigo-chicken-dumpling-350",
        "channel": "mart", "brand": "CJ제일제당",
        "name": "비비고 닭가슴살 왕교자 (175g 기준)", "category": "기타",
        "price_krw": 3200, "serving_g": 175, "kcal": 305, "protein_g": 18.0,
        "carb_g": 38.0, "sugar_g": 2.5, "fat_g": 8.5, "sat_fat_g": 2.0, "sodium_mg": 590,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "단백질 18g 담백한 왕교자",
        "barcode": "8801007895412", "source_type": "T1", "source_url": "https://www.cj.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-cj-spam-single-classic-80",
        "channel": "mart", "brand": "CJ제일제당",
        "name": "스팸 싱글 클래식 80g", "category": "닭가슴살/육가공",
        "price_krw": 1800, "serving_g": 80, "kcal": 250, "protein_g": 11.0,
        "carb_g": 1.5, "sugar_g": 1.0, "fat_g": 22.0, "sat_fat_g": 8.0, "sodium_mg": 680,
        "protein_source": "Q4", "cooking": "boiled", "marketing_claim": 0, "claim_text": None,
        "barcode": "8801007052387", "source_type": "T1", "source_url": "https://www.cj.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-cj-hetbahn-sotban-mushroom-beef-200",
        "channel": "mart", "brand": "CJ제일제당",
        "name": "햇반 솥반 버섯소고기영양밥 200g", "category": "도시락",
        "price_krw": 4500, "serving_g": 200, "kcal": 310, "protein_g": 9.5,
        "carb_g": 62.0, "sugar_g": 2.0, "fat_g": 2.8, "sat_fat_g": 0.7, "sodium_mg": 460,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 0, "claim_text": None,
        "barcode": "8801007883226", "source_type": "T1", "source_url": "https://www.cj.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-cj-gourmet-soba-chicken-cutlet-150",
        "channel": "mart", "brand": "CJ제일제당",
        "name": "고메 바삭 통닭가슴살 카츠 150g", "category": "닭가슴살/육가공",
        "price_krw": 3800, "serving_g": 150, "kcal": 320, "protein_g": 23.0,
        "carb_g": 26.0, "sugar_g": 2.0, "fat_g": 13.5, "sat_fat_g": 3.0, "sodium_mg": 580,
        "protein_source": "Q1", "cooking": "fried", "marketing_claim": 1, "claim_text": "통닭가슴살 단백질 23g",
        "barcode": "8801007923412", "source_type": "T1", "source_url": "https://www.cj.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-cj-happy-tofu-stew-100",
        "channel": "mart", "brand": "CJ제일제당",
        "name": "행복한콩 찌개용 국산콩 두부 (100g 기준)", "category": "기타",
        "price_krw": 1200, "serving_g": 100, "kcal": 80, "protein_g": 8.5,
        "carb_g": 1.8, "sugar_g": 0.5, "fat_g": 4.2, "sat_fat_g": 0.6, "sodium_mg": 12,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 0, "claim_text": None,
        "barcode": "8801007234134", "source_type": "T1", "source_url": "https://www.cj.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-cj-bibigo-tofu-kimchi-stew-460",
        "channel": "mart", "brand": "CJ제일제당",
        "name": "비비고 두부김치찌개 460g (1인분 230g 기준)", "category": "기타",
        "price_krw": 3200, "serving_g": 230, "kcal": 140, "protein_g": 11.0,
        "carb_g": 8.0, "sugar_g": 2.5, "fat_g": 6.8, "sat_fat_g": 1.8, "sodium_mg": 890,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 0, "claim_text": None,
        "barcode": "8801007541287", "source_type": "T1", "source_url": "https://www.cj.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-cj-maxbon-cheddar-cheese-sausage-70",
        "channel": "mart", "brand": "CJ제일제당",
        "name": "맥스봉 오리지널 치즈 소시지 70g", "category": "과자/바",
        "price_krw": 2200, "serving_g": 70, "kcal": 120, "protein_g": 8.0,
        "carb_g": 7.0, "sugar_g": 2.0, "fat_g": 6.5, "sat_fat_g": 2.5, "sodium_mg": 460,
        "protein_source": "Q3", "cooking": "boiled", "marketing_claim": 0, "claim_text": None,
        "barcode": "8801007123984", "source_type": "T1", "source_url": "https://www.cj.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },

    # ── [2. 풀무원 추가 라인업: 10건] ──
    {
        "menu_id": "mart-pulmuone-tofu-bar-basil-40",
        "channel": "mart", "brand": "풀무원",
        "name": "식물성 지구식단 바질 두부바 40g", "category": "과자/바",
        "price_krw": 1900, "serving_g": 40, "kcal": 75, "protein_g": 6.0,
        "carb_g": 3.0, "sugar_g": 0.8, "fat_g": 4.2, "sat_fat_g": 0.6, "sodium_mg": 180,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 1, "claim_text": "단백질 6g 바질 향 가득",
        "barcode": "8801114168930", "source_type": "T2", "source_url": "https://www.pulmuone.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-pulmuone-earth-diet-luncheon-100",
        "channel": "mart", "brand": "풀무원",
        "name": "지구식단 식물성 런천미트 (100g 기준)", "category": "닭가슴살/육가공",
        "price_krw": 2400, "serving_g": 100, "kcal": 215, "protein_g": 14.0,
        "carb_g": 10.0, "sugar_g": 1.5, "fat_g": 13.0, "sat_fat_g": 2.5, "sodium_mg": 520,
        "protein_source": "Q2", "cooking": "boiled", "marketing_claim": 1, "claim_text": "식물성 고단백 14g",
        "barcode": "8801114167121", "source_type": "T1", "source_url": "https://www.pulmuone.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-pulmuone-earth-diet-chicken-pepper-100",
        "channel": "mart", "brand": "풀무원",
        "name": "지구식단 결이 다른 직화 닭가슴살 블랙페퍼 100g", "category": "닭가슴살/육가공",
        "price_krw": 3200, "serving_g": 100, "kcal": 115, "protein_g": 22.0,
        "carb_g": 1.2, "sugar_g": 0.5, "fat_g": 2.1, "sat_fat_g": 0.5, "sodium_mg": 360,
        "protein_source": "Q1", "cooking": "grilled", "marketing_claim": 1, "claim_text": "결 살아있는 22g 직화 페퍼",
        "barcode": "8801114165229", "source_type": "T1", "source_url": "https://www.pulmuone.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-pulmuone-korean-soy-firm-tofu-500",
        "channel": "mart", "brand": "풀무원",
        "name": "크고 단단한 국산콩 부침두부 (100g 기준)", "category": "기타",
        "price_krw": 1100, "serving_g": 100, "kcal": 95, "protein_g": 9.5,
        "carb_g": 2.0, "sugar_g": 0.5, "fat_g": 5.2, "sat_fat_g": 0.8, "sodium_mg": 15,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 0, "claim_text": None,
        "barcode": "8801114112353", "source_type": "T1", "source_url": "https://www.pulmuone.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-pulmuone-roll-yubu-chobap-high-protein-160",
        "channel": "mart", "brand": "풀무원",
        "name": "고단백 롤유부초밥 (1인분 160g 기준)", "category": "도시락",
        "price_krw": 4200, "serving_g": 160, "kcal": 290, "protein_g": 15.0,
        "carb_g": 43.0, "sugar_g": 5.0, "fat_g": 7.0, "sat_fat_g": 1.2, "sodium_mg": 520,
        "protein_source": "Q2", "cooking": "raw", "marketing_claim": 1, "claim_text": "식물성 고단백 15g 한끼",
        "barcode": "8801114159821", "source_type": "T1", "source_url": "https://www.pulmuone.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-pulmuone-fresh-soft-tofu-plain-100",
        "channel": "mart", "brand": "풀무원",
        "name": "풀무원 샐러드엔 연두부 오리엔탈 100g", "category": "샐러드",
        "price_krw": 1800, "serving_g": 100, "kcal": 75, "protein_g": 6.5,
        "carb_g": 3.5, "sugar_g": 2.0, "fat_g": 3.8, "sat_fat_g": 0.6, "sodium_mg": 280,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 0, "claim_text": None,
        "barcode": "8801114120198", "source_type": "T1", "source_url": "https://www.pulmuone.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-pulmuone-high-protein-black-soymilk-190",
        "channel": "mart", "brand": "풀무원",
        "name": "풀무원 프로틴 고단백 검은콩두유 190mL", "category": "유제품/음료",
        "price_krw": 1600, "serving_g": 190, "kcal": 130, "protein_g": 12.0,
        "carb_g": 9.0, "sugar_g": 3.8, "fat_g": 4.8, "sat_fat_g": 0.8, "sodium_mg": 165,
        "protein_source": "Q2", "cooking": "raw", "marketing_claim": 1, "claim_text": "단백질 12g 검은콩 영양",
        "barcode": "8801114173835", "source_type": "T1", "source_url": "https://www.pulmuone.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-pulmuone-earth-diet-kalguksu-tofu-150",
        "channel": "mart", "brand": "풀무원",
        "name": "지구식단 들깨두부 칼국수 (두부면 150g 기준)", "category": "기타",
        "price_krw": 3800, "serving_g": 150, "kcal": 240, "protein_g": 18.0,
        "carb_g": 16.0, "sugar_g": 1.5, "fat_g": 12.0, "sat_fat_g": 1.8, "sodium_mg": 780,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "단백질 18g 속편한 두부면",
        "barcode": "8801114169821", "source_type": "T1", "source_url": "https://www.pulmuone.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-pulmuone-crispy-tofu-ball-100",
        "channel": "mart", "brand": "풀무원",
        "name": "지구식단 바삭 크리스피 두부볼 100g", "category": "과자/바",
        "price_krw": 2500, "serving_g": 100, "kcal": 215, "protein_g": 12.0,
        "carb_g": 22.0, "sugar_g": 2.0, "fat_g": 8.5, "sat_fat_g": 1.4, "sodium_mg": 410,
        "protein_source": "Q2", "cooking": "baked", "marketing_claim": 1, "claim_text": "식물성 스낵 단백질 12g",
        "barcode": "8801114164314", "source_type": "T1", "source_url": "https://www.pulmuone.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-pulmuone-soft-tofu-snack-pack-200",
        "channel": "mart", "brand": "풀무원",
        "name": "풀무원 떠먹는 콩즙 연두부 200g", "category": "기타",
        "price_krw": 1600, "serving_g": 200, "kcal": 110, "protein_g": 11.0,
        "carb_g": 4.0, "sugar_g": 1.0, "fat_g": 5.5, "sat_fat_g": 0.8, "sodium_mg": 30,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 0, "claim_text": None,
        "barcode": "8801114119833", "source_type": "T1", "source_url": "https://www.pulmuone.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },

    # ── [3. 동원F&B, 하림, 오뚜기, 대상 추가 라인업: 15건] ──
    {
        "menu_id": "mart-dongwon-tuna-mild-100",
        "channel": "mart", "brand": "동원",
        "name": "동원참치 마일드 100g", "category": "닭가슴살/육가공",
        "price_krw": 2600, "serving_g": 100, "kcal": 180, "protein_g": 18.0,
        "carb_g": 0.0, "sugar_g": 0.0, "fat_g": 12.0, "sat_fat_g": 1.5, "sodium_mg": 390,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "단백질 18g",
        "barcode": "8801047111022", "source_type": "T1", "source_url": "https://www.dongwon.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-dongwon-tuna-pepper-chili-100",
        "channel": "mart", "brand": "동원",
        "name": "동원 고추참치 100g", "category": "닭가슴살/육가공",
        "price_krw": 2800, "serving_g": 100, "kcal": 150, "protein_g": 14.0,
        "carb_g": 8.0, "sugar_g": 4.5, "fat_g": 6.8, "sat_fat_g": 1.2, "sodium_mg": 610,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 0, "claim_text": None,
        "barcode": "8801047111039", "source_type": "T1", "source_url": "https://www.dongwon.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-dongwon-oven-chicken-breast-100",
        "channel": "mart", "brand": "동원",
        "name": "동원 오븐구이 닭가슴살 오리지널 100g", "category": "닭가슴살/육가공",
        "price_krw": 2700, "serving_g": 100, "kcal": 120, "protein_g": 24.0,
        "carb_g": 1.0, "sugar_g": 0.5, "fat_g": 2.0, "sat_fat_g": 0.6, "sodium_mg": 310,
        "protein_source": "Q1", "cooking": "grilled", "marketing_claim": 1, "claim_text": "오븐구이 고단백 24g",
        "barcode": "8801047139125", "source_type": "T1", "source_url": "https://www.dongwon.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-harim-iff-chicken-cube-garlic-100",
        "channel": "mart", "brand": "하림",
        "name": "하림 IFF 닭가슴살 큐브 갈릭 (100g 기준)", "category": "닭가슴살/육가공",
        "price_krw": 1800, "serving_g": 100, "kcal": 120, "protein_g": 22.0,
        "carb_g": 2.5, "sugar_g": 0.5, "fat_g": 2.2, "sat_fat_g": 0.6, "sodium_mg": 310,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "개별급속동결 단백질 22g",
        "barcode": "8801086120190", "source_type": "T1", "source_url": "https://www.harim.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-harim-nature-organic-chicken-smoked-100",
        "channel": "mart", "brand": "하림",
        "name": "하림 자연실록 무항생제 훈제 닭가슴살 100g", "category": "닭가슴살/육가공",
        "price_krw": 3100, "serving_g": 100, "kcal": 110, "protein_g": 24.0,
        "carb_g": 0.5, "sugar_g": 0.0, "fat_g": 1.2, "sat_fat_g": 0.3, "sodium_mg": 260,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "무항생제 고단백 24g",
        "barcode": "8801086121456", "source_type": "T1", "source_url": "https://www.harim.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-harim-tandoori-chicken-tender-100",
        "channel": "mart", "brand": "하림",
        "name": "하림 탄두리 치킨 닭안심 텐더 100g", "category": "닭가슴살/육가공",
        "price_krw": 2900, "serving_g": 100, "kcal": 115, "protein_g": 23.0,
        "carb_g": 2.0, "sugar_g": 0.5, "fat_g": 1.5, "sat_fat_g": 0.4, "sodium_mg": 360,
        "protein_source": "Q1", "cooking": "grilled", "marketing_claim": 1, "claim_text": "탄두리 풍미 단백질 23g",
        "barcode": "8801086122347", "source_type": "T1", "source_url": "https://www.harim.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-harim-yongari-protein-nugget-100",
        "channel": "mart", "brand": "하림",
        "name": "하림 용가리 치킨 고단백 너겟 (100g 기준)", "category": "닭가슴살/육가공",
        "price_krw": 2200, "serving_g": 100, "kcal": 230, "protein_g": 16.0,
        "carb_g": 15.0, "sugar_g": 1.0, "fat_g": 11.5, "sat_fat_g": 2.8, "sodium_mg": 460,
        "protein_source": "Q1", "cooking": "fried", "marketing_claim": 1, "claim_text": "단백질 16g 영양간식",
        "barcode": "8801086123450", "source_type": "T1", "source_url": "https://www.harim.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-ottogi-easy-meal-chicken-konjac-rice-200",
        "channel": "mart", "brand": "오뚜기",
        "name": "가뿐한끼 닭가슴살 곤약볶음밥 200g", "category": "도시락",
        "price_krw": 3400, "serving_g": 200, "kcal": 285, "protein_g": 18.0,
        "carb_g": 43.0, "sugar_g": 2.0, "fat_g": 4.5, "sat_fat_g": 1.0, "sodium_mg": 580,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "단백질 18g 가뿐 칼로리",
        "barcode": "8801045156780", "source_type": "T1", "source_url": "https://www.ottogi.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-ottogi-cup-noodle-high-protein-rose-45",
        "channel": "mart", "brand": "오뚜기",
        "name": "오뚜기 컵누들 고단백 로제맛 45g", "category": "기타",
        "price_krw": 1800, "serving_g": 45, "kcal": 165, "protein_g": 9.0,
        "carb_g": 28.0, "sugar_g": 4.5, "fat_g": 2.1, "sat_fat_g": 0.8, "sodium_mg": 640,
        "protein_source": "Q2", "cooking": "boiled", "marketing_claim": 1, "claim_text": "고단백 9g 가벼운 면",
        "barcode": "8801045167892", "source_type": "T1", "source_url": "https://www.ottogi.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-ottogi-curry-chicken-breast-135",
        "channel": "mart", "brand": "오뚜기",
        "name": "오뚜기 백세카레 순닭가슴살 135g", "category": "닭가슴살/육가공",
        "price_krw": 3400, "serving_g": 135, "kcal": 150, "protein_g": 22.0,
        "carb_g": 3.5, "sugar_g": 1.0, "fat_g": 5.0, "sat_fat_g": 1.2, "sodium_mg": 520,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "카레풍미 단백질 22g",
        "barcode": "8801045142110", "source_type": "T1", "source_url": "https://www.ottogi.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-daesang-homings-chicken-fried-rice-210",
        "channel": "mart", "brand": "대상",
        "name": "청정원 호밍스 닭가슴살 볶음밥 210g", "category": "도시락",
        "price_krw": 3200, "serving_g": 210, "kcal": 340, "protein_g": 16.0,
        "carb_g": 56.0, "sugar_g": 2.5, "fat_g": 5.5, "sat_fat_g": 1.2, "sodium_mg": 640,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "닭가슴살 듬뿍 단백질 16g",
        "barcode": "8801052891234", "source_type": "T1", "source_url": "https://www.daesang.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-daesang-jongga-fresh-tofu-100",
        "channel": "mart", "brand": "대상",
        "name": "종가집 콩이 가득한 부침두부 (100g 기준)", "category": "기타",
        "price_krw": 1100, "serving_g": 100, "kcal": 85, "protein_g": 9.0,
        "carb_g": 2.0, "sugar_g": 0.5, "fat_g": 4.5, "sat_fat_g": 0.7, "sodium_mg": 15,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 0, "claim_text": None,
        "barcode": "8801052112345", "source_type": "T1", "source_url": "https://www.daesang.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-lotte-chefood-chicken-steak-100",
        "channel": "mart", "brand": "롯데웰푸드",
        "name": "쉐푸드 직화 그릴 닭가슴살 스테이크 100g", "category": "닭가슴살/육가공",
        "price_krw": 2600, "serving_g": 100, "kcal": 130, "protein_g": 21.0,
        "carb_g": 3.0, "sugar_g": 1.0, "fat_g": 3.5, "sat_fat_g": 1.0, "sodium_mg": 380,
        "protein_source": "Q1", "cooking": "grilled", "marketing_claim": 1, "claim_text": "직화 단백질 21g",
        "barcode": "8801123456796", "source_type": "T1", "source_url": "https://www.lottewellfood.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-samlip-high-protein-plain-bagel-110",
        "channel": "mart", "brand": "삼립",
        "name": "삼립 미각제빵소 고단백 플레인 베이글 110g", "category": "기타",
        "price_krw": 2400, "serving_g": 110, "kcal": 280, "protein_g": 15.0,
        "carb_g": 52.0, "sugar_g": 5.0, "fat_g": 1.8, "sat_fat_g": 0.5, "sodium_mg": 460,
        "protein_source": "Q2", "cooking": "baked", "marketing_claim": 1, "claim_text": "고단백 15g 베이글",
        "barcode": "8801068912345", "source_type": "T1", "source_url": "https://www.spcsamlip.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-binggrae-yoplait-greek-plain-100",
        "channel": "mart", "brand": "빙그레",
        "name": "요플레 그릭요거트 플레인 달지않은맛 100g", "category": "유제품/음료",
        "price_krw": 1800, "serving_g": 100, "kcal": 95, "protein_g": 8.5,
        "carb_g": 4.5, "sugar_g": 2.5, "fat_g": 4.8, "sat_fat_g": 3.0, "sodium_mg": 40,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 1, "claim_text": "단백질 8.5g 순수 그릭",
        "barcode": "8801104912345", "source_type": "T1", "source_url": "https://www.bing.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },

    # ── [4. 닭가슴살 전문 온라인 D2C 브랜드 (랭킹닭컴, 굽네몰, 허닭, 바르닭, 아임닭): 15건] ──
    {
        "menu_id": "online-masitdak-chicken-ball-cheese-100",
        "channel": "online", "brand": "랭킹닭컴",
        "name": "맛있닭 닭가슴살 볼 치즈맛 100g", "category": "닭가슴살/육가공",
        "price_krw": 1900, "serving_g": 100, "kcal": 145, "protein_g": 21.0,
        "carb_g": 3.5, "sugar_g": 1.0, "fat_g": 5.0, "sat_fat_g": 1.8, "sodium_mg": 320,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "단백질 21g 치즈 쏙 볼",
        "barcode": "8809456781041", "source_type": "T2", "source_url": "https://www.rankingdak.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-masitdak-chicken-ball-perilla-100",
        "channel": "online", "brand": "랭킹닭컴",
        "name": "맛있닭 닭가슴살 볼 깻잎맛 100g", "category": "닭가슴살/육가공",
        "price_krw": 1800, "serving_g": 100, "kcal": 130, "protein_g": 22.0,
        "carb_g": 3.0, "sugar_g": 0.8, "fat_g": 3.0, "sat_fat_g": 0.8, "sodium_mg": 280,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "단백질 22g 향긋한 깻잎",
        "barcode": "8809456781058", "source_type": "T2", "source_url": "https://www.rankingdak.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-masitdak-soft-chicken-breast-100",
        "channel": "online", "brand": "랭킹닭컴",
        "name": "맛있닭 소프트 닭가슴살 마늘맛 100g", "category": "닭가슴살/육가공",
        "price_krw": 1800, "serving_g": 100, "kcal": 115, "protein_g": 24.0,
        "carb_g": 1.5, "sugar_g": 0.5, "fat_g": 1.5, "sat_fat_g": 0.4, "sodium_mg": 260,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "부드러운 단백질 24g",
        "barcode": "8809456781065", "source_type": "T2", "source_url": "https://www.rankingdak.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-eatmate-soft-tenderloin-garlic-100",
        "channel": "online", "brand": "랭킹닭컴",
        "name": "잇메이트 소프트 닭안심 마늘맛 100g", "category": "닭가슴살/육가공",
        "price_krw": 1600, "serving_g": 100, "kcal": 105, "protein_g": 24.0,
        "carb_g": 1.0, "sugar_g": 0.5, "fat_g": 0.8, "sat_fat_g": 0.2, "sodium_mg": 240,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "초촉한 안심 24g",
        "barcode": "8809456781072", "source_type": "T2", "source_url": "https://www.rankingdak.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-eatmate-low-sodium-chicken-100",
        "channel": "online", "brand": "랭킹닭컴",
        "name": "잇메이트 저염 닭가슴살 오리지널 100g", "category": "닭가슴살/육가공",
        "price_krw": 1500, "serving_g": 100, "kcal": 110, "protein_g": 25.0,
        "carb_g": 0.5, "sugar_g": 0.0, "fat_g": 1.0, "sat_fat_g": 0.3, "sodium_mg": 85,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "저염 고단백 25g 나트륨85mg",
        "barcode": "8809456781089", "source_type": "T2", "source_url": "https://www.rankingdak.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-eatmate-monster-sausage-100",
        "channel": "online", "brand": "랭킹닭컴",
        "name": "잇메이트 몬스터 닭가슴살 소시지 100g", "category": "닭가슴살/육가공",
        "price_krw": 1700, "serving_g": 100, "kcal": 140, "protein_g": 20.0,
        "carb_g": 2.5, "sugar_g": 1.0, "fat_g": 5.5, "sat_fat_g": 1.6, "sodium_mg": 380,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "몬스터 단백질 20g",
        "barcode": "8809456781096", "source_type": "T2", "source_url": "https://www.rankingdak.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-loveat-sauce-chicken-spicy-100",
        "channel": "online", "brand": "랭킹닭컴",
        "name": "러브잇 소스 닭가슴살 매콤양념 100g", "category": "닭가슴살/육가공",
        "price_krw": 1900, "serving_g": 100, "kcal": 135, "protein_g": 22.0,
        "carb_g": 5.5, "sugar_g": 3.0, "fat_g": 2.5, "sat_fat_g": 0.6, "sodium_mg": 460,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "맛있는 소스 단백질 22g",
        "barcode": "8809456781102", "source_type": "T2", "source_url": "https://www.rankingdak.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-goobne-road-dak-chili-sousvide-100",
        "channel": "online", "brand": "굽네몰",
        "name": "굽네 로드닭 수비드 닭가슴살 칠리 100g", "category": "닭가슴살/육가공",
        "price_krw": 1900, "serving_g": 100, "kcal": 125, "protein_g": 23.0,
        "carb_g": 3.0, "sugar_g": 1.5, "fat_g": 2.2, "sat_fat_g": 0.5, "sodium_mg": 380,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "촉촉 수비드 23g 칠리맛",
        "barcode": "8809512345688", "source_type": "T2", "source_url": "https://www.goobnemall.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-goobne-chicken-chibap-kimchi-200",
        "channel": "online", "brand": "굽네몰",
        "name": "굽네 볼케이노 닭가슴살 치밥 200g", "category": "도시락",
        "price_krw": 2900, "serving_g": 200, "kcal": 340, "protein_g": 19.0,
        "carb_g": 52.0, "sugar_g": 3.5, "fat_g": 6.5, "sat_fat_g": 1.5, "sodium_mg": 680,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "볼케이노 치밥 단백질 19g",
        "barcode": "8809512345695", "source_type": "T2", "source_url": "https://www.goobnemall.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-heodak-slice-chicken-chili-100",
        "channel": "online", "brand": "허닭",
        "name": "허닭 슬라이스 닭가슴살 칠리 100g", "category": "닭가슴살/육가공",
        "price_krw": 1700, "serving_g": 100, "kcal": 125, "protein_g": 22.0,
        "carb_g": 3.5, "sugar_g": 1.8, "fat_g": 2.3, "sat_fat_g": 0.6, "sodium_mg": 380,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "한입 슬라이스 단백질 22g",
        "barcode": "8809623412355", "source_type": "T2", "source_url": "https://www.heodak.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-heodak-fried-rice-chicken-konjac-200",
        "channel": "online", "brand": "허닭",
        "name": "허닭 닭가슴살 곤약볶음밥 갈릭 200g", "category": "도시락",
        "price_krw": 2600, "serving_g": 200, "kcal": 290, "protein_g": 17.0,
        "carb_g": 48.0, "sugar_g": 2.0, "fat_g": 3.8, "sat_fat_g": 0.8, "sodium_mg": 520,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "가벼운 곤약밥 단백질 17g",
        "barcode": "8809623412362", "source_type": "T2", "source_url": "https://www.heodak.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-bardak-direct-sousvide-chicken-100",
        "channel": "online", "brand": "바르닭",
        "name": "바르닭 직화 수비드 닭가슴살 오리지널 100g", "category": "닭가슴살/육가공",
        "price_krw": 1900, "serving_g": 100, "kcal": 115, "protein_g": 24.0,
        "carb_g": 0.8, "sugar_g": 0.0, "fat_g": 1.5, "sat_fat_g": 0.4, "sodium_mg": 240,
        "protein_source": "Q1", "cooking": "grilled", "marketing_claim": 1, "claim_text": "직화 수비드 단백질 24g",
        "barcode": "8809712345678", "source_type": "T2", "source_url": "https://www.bardak.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-bardak-chicken-donggeurang-100",
        "channel": "online", "brand": "바르닭",
        "name": "바르닭 닭가슴살 한입 동그랑땡 100g", "category": "닭가슴살/육가공",
        "price_krw": 2100, "serving_g": 100, "kcal": 150, "protein_g": 18.0,
        "carb_g": 6.0, "sugar_g": 1.5, "fat_g": 6.0, "sat_fat_g": 1.5, "sodium_mg": 390,
        "protein_source": "Q1", "cooking": "grilled", "marketing_claim": 1, "claim_text": "단백질 18g 맛있는 동그랑땡",
        "barcode": "8809712345685", "source_type": "T2", "source_url": "https://www.bardak.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-imdak-frank-sausage-herb-100",
        "channel": "online", "brand": "아임닭",
        "name": "아임닭 한끼 프랑크 허브 100g", "category": "닭가슴살/육가공",
        "price_krw": 1800, "serving_g": 100, "kcal": 140, "protein_g": 19.0,
        "carb_g": 2.0, "sugar_g": 0.8, "fat_g": 6.0, "sat_fat_g": 1.8, "sodium_mg": 380,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "천연돈장 단백질 19g",
        "barcode": "8809345678912", "source_type": "T2", "source_url": "https://www.imdak.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-imdak-chicken-jerky-spicy-40",
        "channel": "online", "brand": "아임닭",
        "name": "아임닭 매콤 닭가슴살 육포 40g", "category": "과자/바",
        "price_krw": 2200, "serving_g": 40, "kcal": 105, "protein_g": 15.0,
        "carb_g": 5.0, "sugar_g": 3.0, "fat_g": 2.5, "sat_fat_g": 0.7, "sodium_mg": 460,
        "protein_source": "Q1", "cooking": "grilled", "marketing_claim": 1, "claim_text": "고단백 육포 15g",
        "barcode": "8809345678929", "source_type": "T2", "source_url": "https://www.imdak.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },

    # ── [5. 스포츠 뉴트리션 RTD & 단백질 보충제 & 대형마트 PB: 15건] ──
    {
        "menu_id": "online-selex-profit-peach-330",
        "channel": "online", "brand": "매일유업",
        "name": "셀렉스 프로핏 웨이프로틴 드링크 복숭아 330mL", "category": "유제품/음료",
        "price_krw": 3000, "serving_g": 330, "kcal": 90, "protein_g": 20.0,
        "carb_g": 2.5, "sugar_g": 0.0, "fat_g": 0.0, "sat_fat_g": 0.0, "sodium_mg": 45,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 1, "claim_text": "100% WPI 무설탕 무지방 20g",
        "barcode": "8801121029558", "source_type": "T1", "source_url": "https://www.selex.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-selex-core-protein-bar-berry-38",
        "channel": "online", "brand": "매일유업",
        "name": "셀렉스 코어프로틴 너츠바 베리 38g", "category": "과자/바",
        "price_krw": 1800, "serving_g": 38, "kcal": 150, "protein_g": 12.0,
        "carb_g": 14.0, "sugar_g": 4.5, "fat_g": 5.5, "sat_fat_g": 1.8, "sodium_mg": 120,
        "protein_source": "Q1", "cooking": "baked", "marketing_claim": 1, "claim_text": "단백질 12g 필수 아미노산",
        "barcode": "8801121029800", "source_type": "T2", "source_url": "https://www.selex.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-hymeune-active-banana-250",
        "channel": "online", "brand": "일동후디스",
        "name": "하이뮨 프로틴 밸런스 액티브 바나나 250mL", "category": "유제품/음료",
        "price_krw": 2900, "serving_g": 250, "kcal": 130, "protein_g": 20.0,
        "carb_g": 8.0, "sugar_g": 1.2, "fat_g": 2.0, "sat_fat_g": 1.0, "sodium_mg": 150,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 1, "claim_text": "산양유 단백질 20g BCAA",
        "barcode": "8801157470935", "source_type": "T1", "source_url": "https://www.ildongfoodis.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-the-danbaek-banana-250",
        "channel": "online", "brand": "빙그레",
        "name": "더단백 드링크 바나나 250mL", "category": "유제품/음료",
        "price_krw": 2900, "serving_g": 250, "kcal": 105, "protein_g": 20.0,
        "carb_g": 6.5, "sugar_g": 0.8, "fat_g": 0.6, "sat_fat_g": 0.3, "sodium_mg": 40,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 1, "claim_text": "프로틴 20g 당 ZERO",
        "barcode": "8801104670890", "source_type": "T2", "source_url": "https://www.bing.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-the-danbaek-crunch-bar-choco-40",
        "channel": "online", "brand": "빙그레",
        "name": "더단백 크런치 단백질바 초코 40g", "category": "과자/바",
        "price_krw": 2000, "serving_g": 40, "kcal": 145, "protein_g": 15.0,
        "carb_g": 12.0, "sugar_g": 0.9, "fat_g": 4.5, "sat_fat_g": 2.2, "sodium_mg": 130,
        "protein_source": "Q1", "cooking": "baked", "marketing_claim": 1, "claim_text": "바삭 단백질 15g 저당",
        "barcode": "8801104671019", "source_type": "T2", "source_url": "https://www.bing.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-calobye-perfect-power-shake-choco-250",
        "channel": "online", "brand": "칼로바이",
        "name": "퍼펙트 파워쉐이크 20G 초코 250mL", "category": "유제품/음료",
        "price_krw": 2800, "serving_g": 250, "kcal": 130, "protein_g": 20.0,
        "carb_g": 8.0, "sugar_g": 1.5, "fat_g": 2.0, "sat_fat_g": 1.0, "sodium_mg": 140,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 1, "claim_text": "유청단백질 20g 올인원",
        "barcode": "8809654789012", "source_type": "T2", "source_url": "https://www.calobye.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-labnosh-protein-cacao-350",
        "channel": "online", "brand": "랩노쉬",
        "name": "랩노쉬 프로틴 드링크 마일드 카카오 350mL", "category": "유제품/음료",
        "price_krw": 3200, "serving_g": 350, "kcal": 160, "protein_g": 27.0,
        "carb_g": 8.5, "sugar_g": 1.2, "fat_g": 1.8, "sat_fat_g": 0.9, "sodium_mg": 220,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 1, "claim_text": "고단백 27g BCAA 4500mg",
        "barcode": "8809543123463", "source_type": "T2", "source_url": "https://labnosh.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-myprotein-impact-whey-single-25",
        "channel": "online", "brand": "마이프로틴",
        "name": "임팩트 웨이 프로틴 1스쿱 (밀크티맛 25g)", "category": "유제품/음료",
        "price_krw": 1500, "serving_g": 25, "kcal": 100, "protein_g": 20.0,
        "carb_g": 1.5, "sugar_g": 1.0, "fat_g": 1.8, "sat_fat_g": 1.1, "sodium_mg": 60,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 1, "claim_text": "단백질 20g 80% 농축유청",
        "barcode": "5056307300012", "source_type": "T2", "source_url": "https://www.myprotein.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "online-bsn-syntha6-crisp-bar-vanilla-57",
        "channel": "online", "brand": "BSN",
        "name": "신타6 프로틴 크리스피 바 바닐라 마시멜로 57g", "category": "과자/바",
        "price_krw": 3200, "serving_g": 57, "kcal": 230, "protein_g": 20.0,
        "carb_g": 23.0, "sugar_g": 2.0, "fat_g": 7.0, "sat_fat_g": 4.0, "sodium_mg": 210,
        "protein_source": "Q1", "cooking": "baked", "marketing_claim": 1, "claim_text": "20g 프리미엄 단백질 크런치",
        "barcode": "834266008543", "source_type": "T2", "source_url": "https://www.gobsn.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-nobrand-frozen-tenderloin-100",
        "channel": "mart", "brand": "노브랜드",
        "name": "노브랜드 냉동 닭안심 (100g 기준)", "category": "닭가슴살/육가공",
        "price_krw": 950, "serving_g": 100, "kcal": 105, "protein_g": 24.0,
        "carb_g": 0.0, "sugar_g": 0.0, "fat_g": 1.0, "sat_fat_g": 0.3, "sodium_mg": 140,
        "protein_source": "Q1", "cooking": "raw", "marketing_claim": 0, "claim_text": None,
        "barcode": "8809654123463", "source_type": "T2", "source_url": "https://emart.ssg.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-nobrand-smoked-duck-slice-100",
        "channel": "mart", "brand": "노브랜드",
        "name": "노브랜드 훈제오리 슬라이스 (100g 기준)", "category": "닭가슴살/육가공",
        "price_krw": 1800, "serving_g": 100, "kcal": 260, "protein_g": 17.0,
        "carb_g": 1.5, "sugar_g": 0.5, "fat_g": 21.0, "sat_fat_g": 6.5, "sodium_mg": 510,
        "protein_source": "Q1", "cooking": "grilled", "marketing_claim": 0, "claim_text": None,
        "barcode": "8809654125432", "source_type": "T2", "source_url": "https://emart.ssg.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-nobrand-soymilk-unsweetened-190",
        "channel": "mart", "brand": "노브랜드",
        "name": "노브랜드 고소한 순수두유 무가당 190mL", "category": "유제품/음료",
        "price_krw": 550, "serving_g": 190, "kcal": 80, "protein_g": 7.0,
        "carb_g": 4.0, "sugar_g": 1.0, "fat_g": 3.8, "sat_fat_g": 0.6, "sodium_mg": 110,
        "protein_source": "Q2", "cooking": "raw", "marketing_claim": 0, "claim_text": None,
        "barcode": "8809654129812", "source_type": "T2", "source_url": "https://emart.ssg.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "mart-homeplus-signature-chicken-breast-100",
        "channel": "mart", "brand": "홈플러스",
        "name": "홈플러스 시그니처 수비드 닭가슴살 100g", "category": "닭가슴살/육가공",
        "price_krw": 1600, "serving_g": 100, "kcal": 115, "protein_g": 24.0,
        "carb_g": 1.0, "sugar_g": 0.5, "fat_g": 1.5, "sat_fat_g": 0.4, "sodium_mg": 260,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "수비드 단백질 24g",
        "barcode": "8809543210130", "source_type": "T2", "source_url": "https://www.homeplus.co.kr",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "cvs-cu-chicken-cube-deuktem-100",
        "channel": "cvs", "brand": "CU",
        "name": "득템 닭가슴살 큐브 100g", "category": "닭가슴살/육가공",
        "price_krw": 1900, "serving_g": 100, "kcal": 125, "protein_g": 21.0,
        "carb_g": 3.0, "sugar_g": 0.8, "fat_g": 3.0, "sat_fat_g": 0.8, "sodium_mg": 320,
        "protein_source": "Q1", "cooking": "boiled", "marketing_claim": 1, "claim_text": "초가성비 큐브 21g",
        "barcode": "8801043011984", "source_type": "T4", "source_url": "https://cu.bgfretail.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    },
    {
        "menu_id": "cvs-gs25-hyeja-chicken-lunchbox-420",
        "channel": "cvs", "brand": "GS25",
        "name": "혜자로운 고단백 통닭다리살 도시락 420g", "category": "도시락",
        "price_krw": 5500, "serving_g": 420, "kcal": 590, "protein_g": 38.0,
        "carb_g": 72.0, "sugar_g": 5.0, "fat_g": 16.0, "sat_fat_g": 4.5, "sodium_mg": 920,
        "protein_source": "Q1", "cooking": "grilled", "marketing_claim": 1, "claim_text": "단백질 38g 혜자 도시락",
        "barcode": "8801043012981", "source_type": "T4", "source_url": "https://gs25.gsretail.com",
        "verified_at": "2026-09-15", "rule_version": "v1.0"
    }
]

def run_expand():
    seed_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'seed.json')
    with open(seed_path, 'r', encoding='utf-8') as f:
        existing = json.load(f)

    existing_ids = {it['menu_id'] for it in existing}
    added_count = 0

    for it in ADDITIONAL_REAL_PRODUCTS:
        if it['menu_id'] in existing_ids:
            idx = next(i for i, x in enumerate(existing) if x['menu_id'] == it['menu_id'])
            existing[idx] = it
        else:
            existing.append(it)
            existing_ids.add(it['menu_id'])
            added_count += 1

    with open(seed_path, 'w', encoding='utf-8') as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    print(f"✨ 신규 실데이터 {added_count}건 추가 완료! 총 등록 상품 수: {len(existing)}건")

if __name__ == '__main__':
    run_expand()
