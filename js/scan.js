// 바코드 스캔 및 식별 엔진 (scan.js)
// 기획안 v2.0 P2 — BarcodeDetector 미지원 브라우저용 ZXing 폴백을 추가한다.
// (이전에는 미지원 시 '데모 바코드 선택'으로 넘어가 실사용이 불가능했다.)

const ZXING_CDN = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';

let zxingLoadPromise = null;

/** ZXing UMD 번들을 필요할 때 한 번만 불러온다. */
function loadZXing() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (zxingLoadPromise) return zxingLoadPromise;

  zxingLoadPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = ZXING_CDN;
    s.async = true;
    s.onload = () => resolve(window.ZXing || null);
    s.onerror = () => {
      console.warn('ZXing 로드 실패 — 바코드 스캔을 쓸 수 없습니다.');
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return zxingLoadPromise;
}

export class BarcodeScanner {
  constructor(options = {}) {
    this.videoElement = options.videoElement || null;
    this.onDetected = options.onDetected || (() => {});
    this.onError = options.onError || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.isScanning = false;
    this.stream = null;
    this.hasNativeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    this.detector = null;
    this.zxingReader = null;

    if (this.hasNativeDetector) {
      try {
        this.detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] });
      } catch (e) {
        console.warn('Native BarcodeDetector initialization fallback:', e);
        this.hasNativeDetector = false;
      }
    }
  }

  /** 엔진 이름 — 화면에 "무엇으로 읽고 있는지" 표시하기 위해 노출한다. */
  get engineName() {
    if (this.hasNativeDetector) return 'BarcodeDetector';
    return this.zxingReader ? 'ZXing' : '준비 중';
  }

  async startCamera(videoEl) {
    if (videoEl) this.videoElement = videoEl;
    if (!this.videoElement) throw new Error('Video element가 지정되지 않았습니다.');

    // 네이티브 미지원이면 ZXing 을 먼저 준비한다.
    if (!this.hasNativeDetector && !this.zxingReader) {
      this.onStatus('바코드 인식기를 불러오는 중…');
      const ZXing = await loadZXing();
      if (ZXing) {
        try {
          this.zxingReader = new ZXing.BrowserMultiFormatReader();
        } catch (e) {
          console.warn('ZXing reader 생성 실패:', e);
        }
      }
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      this.isScanning = true;
      this.onStatus(`카메라로 바코드를 비춰 주세요 (${this.engineName})`);

      if (this.hasNativeDetector) {
        this.scanLoop();
      } else if (this.zxingReader) {
        this.zxingReader.decodeFromVideoElement(this.videoElement, (result) => {
          if (result && this.isScanning) {
            this.isScanning = false;
            this.onDetected(result.getText());
          }
        }).catch(err => console.warn('ZXing 디코드 오류:', err));
      } else {
        this.onStatus('이 브라우저에서는 바코드 인식을 쓸 수 없습니다. 제품명으로 검색해 주세요.');
      }
      return true;
    } catch (err) {
      console.warn('카메라 권한 거부 또는 미지원 기기:', err);
      this.onError(err);
      return false;
    }
  }

  stopCamera() {
    this.isScanning = false;
    if (this.zxingReader) {
      try { this.zxingReader.reset(); } catch (e) { /* 이미 정지 */ }
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) this.videoElement.srcObject = null;
  }

  async scanLoop() {
    if (!this.isScanning) return;

    if (this.hasNativeDetector && this.detector && this.videoElement) {
      try {
        const barcodes = await this.detector.detect(this.videoElement);
        if (barcodes.length > 0) {
          this.isScanning = false;
          this.onDetected(barcodes[0].rawValue);
          return;
        }
      } catch (e) {
        // 프레임 감지 중 일시적 오류는 무시
      }
    }

    if (this.isScanning) requestAnimationFrame(() => this.scanLoop());
  }

  /**
   * 이미지 파일(갤러리 업로드·카메라 권한 거부 시 대체 경로)에서 바코드 읽기
   */
  async scanImageFile(file) {
    if (this.hasNativeDetector && this.detector) {
      try {
        const bitmap = await createImageBitmap(file);
        const barcodes = await this.detector.detect(bitmap);
        if (barcodes.length > 0) return barcodes[0].rawValue;
      } catch (e) {
        console.warn('Image bitmap barcode scan error:', e);
      }
    }

    const ZXing = await loadZXing();
    if (!ZXing) return null;
    const url = URL.createObjectURL(file);
    try {
      const reader = new ZXing.BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      return result ? result.getText() : null;
    } catch (e) {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** EAN-13 체크디지트 검증 */
export function isValidEan13(code) {
  const s = String(code || '').trim();
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(s[12]);
}

/**
 * 바코드 번호로 등록 상품 검색
 */
export function lookupBarcode(barcode, products) {
  if (!barcode || !products) return null;
  const cleanCode = String(barcode).trim();
  return products.find(p => p.barcode && String(p.barcode).trim() === cleanCode) || null;
}

if (typeof window !== 'undefined') {
  window.ProteinScan = { BarcodeScanner, lookupBarcode, isValidEan13 };
}
