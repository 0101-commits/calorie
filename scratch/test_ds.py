import urllib.request
import urllib.parse
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')

query = '신라면 큰사발'
url = 'http://www.dietshin.com/calorie/calorie_search.asp?keyword=' + urllib.parse.quote(query)
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('euc-kr', errors='replace')  # DietShin uses euc-kr mostly
        # find search results
        # e.g. <td class="subject"><a href="calorie_view.asp?no=XXXX">...
        matches = re.findall(r'<a href="(/calorie/calorie_view\.asp\?[\w=&]+)".*?>(.*?)</a>', html)
        print("Matches found:")
        for m in matches[:5]:
            print(m[1].strip())
except Exception as e:
    print(e)
