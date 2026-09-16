import urllib.request
import urllib.parse
import sys

sys.stdout.reconfigure(encoding='utf-8')

query = '신라면'
url = 'https://www.fatsecret.kr/' + urllib.parse.quote('칼로리-영양소') + '/search?q=' + urllib.parse.quote(query)
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        # Check if we can find generic item links like /칼로리-영양소/일반명/...
        import re
        matches = re.findall(r'href="([^"]+)" class="prominent"', html)
        print("Matches found:", matches)
except Exception as e:
    print(e)
