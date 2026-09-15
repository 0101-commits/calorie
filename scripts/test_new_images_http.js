import https from 'https';

const testUrls = [
  'https://search4.kakaocdn.net/argon/320x320_85_c/5gTtKdk9DT3',
  'https://search1.kakaocdn.net/argon/320x320_85_c/7nqOOai4ky3',
  'https://search1.kakaocdn.net/argon/320x320_85_c/IW7n42DI6jN',
  'https://search2.kakaocdn.net/argon/320x320_85_c/JtHrpCtfs2K',
  'https://search3.kakaocdn.net/argon/320x320_85_c/BycNyFopnrU',
  'https://search4.kakaocdn.net/argon/320x320_85_c/6CToIsprX09',
  'https://search3.kakaocdn.net/argon/320x320_85_c/LaqBiUNtXXU',
  'https://search4.kakaocdn.net/argon/320x320_85_c/KRaelBav0d0'
];

async function checkUrl(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      resolve({ url, status: res.statusCode });
    }).on('error', (err) => resolve({ url, error: err.message }));
  });
}

async function main() {
  for (const u of testUrls) {
    const res = await checkUrl(u);
    console.log(`${res.status === 200 ? 'OK 200' : 'FAIL ' + res.status}: ${res.url}`);
  }
}

main();
