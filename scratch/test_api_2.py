import requests
import urllib.parse

API_KEY = "4c7cbb03054471d46c639089e97a78b74a42997056b1dd1d40aa65330b0d0c4a"
URL = "http://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02"

url = URL + '?ServiceKey=' + API_KEY + '&DESC_KOR=' + urllib.parse.quote('더단백') + '&type=json&numOfRows=1'

try:
    response = requests.get(url, timeout=5)
    print(response.text[:1000])
except Exception as e:
    print(e)
