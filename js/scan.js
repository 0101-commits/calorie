// 바코드 스캔 및 식별 엔진 (scan.js)
// 규칙 버전: v1.0 (2026-09-15 확정 스펙)

export class BarcodeScanner {
  constructor(options = {}) {
    this.videoElement = options.videoElement || null;
    this.onDetected = options.onDetected || (() => {});
    this.onError = options.onError || (() => {});
    this.isScanning = false;
    this.stream = null;
    this.hasNativeDetector = 'BarcodeDetector' in window;
    this.detector = null;

    if (this.hasNativeDetector) {
      try {
        this.detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] });
      } catch (e) {
        console.warn('Native BarcodeDetector initialization fallback:', e);
        this.hasNativeDetector = false;
      }
    }
  }

  /**
   * 후면 카메라 시작 및 감지 루프 실행
   */
  async startCamera(videoEl) {
    if (videoEl) this.videoElement = videoEl;
    if (!this.videoElement) {
      throw new Error('Video element가 지정되지 않았습니다.');
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

      this.scanLoop();
      return true;
    } catch (err) {
      console.warn('카메라 권한 거부 또는 미지원 기기:', err);
      this.onError(err);
      return false;
    }
  }

  stopCamera() {
    this.isScanning = false;
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  async scanLoop() {
    if (!this.isScanning) return;

    if (this.hasNativeDetector && this.detector && this.videoElement) {
      try {
        const barcodes = await this.detector.detect(this.videoElement);
        if (barcodes.length > 0) {
          const rawValue = barcodes[0].rawValue;
          this.isScanning = false;
          this.onDetected(rawValue);
          return;
        }
      } catch (e) {
        // 프레임 감지 중 일시적 오류는 무시
      }
    }

    if (this.isScanning) {
      requestAnimationFrame(() => this.scanLoop());
    }
  }

  /**
   * 이미지 파일로부터 바코드 분석 시도
   */
  async scanImageFile(file) {
    if (this.hasNativeDetector && this.detector) {
      try {
        const bitmap = await createImageBitmap(file);
        const barcodes = await this.detector.detect(bitmap);
        if (barcodes.length > 0) {
          return barcodes[0].rawValue;
        }
      } catch (e) {
        console.warn('Image bitmap barcode scan error:', e);
      }
    }
    return null;
  }
}

/**
 * 바코드 번호로 data.json 내 등록 상품 검색
 */
export function lookupBarcode(barcode, products) {
  if (!barcode || !products) return null;
  const cleanCode = String(barcode).trim();
  return products.find(p => p.barcode && String(p.barcode).trim() === cleanCode) || null;
}

if (typeof window !== 'undefined') {
  window.ProteinScan = {
    BarcodeScanner,
    lookupBarcode
  };
}
