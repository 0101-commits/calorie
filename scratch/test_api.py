import os
import requests
import json
import urllib.parse

API_KEY = os.environ.get('DATA_GO_KR_API_KEY')
if not API_KEY:
    raise SystemExit('DATA_GO_KR_API_KEY 환경변수가 필요합니다. .env 를 로드하거나 export 후 실행하세요.')
URL = "http://apis.data.go.kr/B553748/CertImgListServiceV3/getCertImgListServiceV3"

url = URL + '?ServiceKey=' + API_KEY + '&prdlstNm=' + urllib.parse.quote('더단백') + '&returnType=json'

try:
    response = requests.get(url, timeout=5)
    print(response.text[:1000])
except Exception as e:
    print(e)
