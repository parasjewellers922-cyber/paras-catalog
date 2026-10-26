// Reads a barcode from a still photo for the web version of Paras Catalog.
// Uses the ZXing library (the same one the live scanner uses), loaded the
// first time it is needed. Tries a few sizes and two contrast methods,
// because tag barcodes are small and photos vary.
(function () {
  const ZXING_URL = 'https://unpkg.com/@zxing/library@0.21.3';
  let loading = null;

  function loadZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (!loading) {
      loading = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = ZXING_URL;
        s.onload = function () { resolve(window.ZXing); };
        s.onerror = function () { loading = null; reject(new Error('ZXing did not load')); };
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Photo could not be opened')); };
      img.src = url;
    });
  }

  window.parasDecodeBarcode = async function (url) {
    const Z = await loadZXing();
    const img = await loadImage(url);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const hints = new Map();
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    const sizes = [1600, 2400, 1000, 3200];
    for (const target of sizes) {
      const scale = Math.min(1, target / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const source = new Z.HTMLCanvasElementLuminanceSource(canvas);
      for (const Binarizer of [Z.HybridBinarizer, Z.GlobalHistogramBinarizer]) {
        try {
          const result = reader.decodeWithState(new Z.BinaryBitmap(new Binarizer(source)));
          if (result && result.getText()) return result.getText();
        } catch (e) {
          // Not found at this size; try the next.
        }
      }
      if (scale === 1) break; // Already tried the full photo.
    }
    return null;
  };
})();
