// Barcode scanning for the web version of Paras Catalog.
//
// parasLiveScan(): opens a full-screen camera view over the app and resolves
// with the first barcode read (or null when closed). Browsers' default camera
// video is small and soft, so this asks for full HD and reads only the area
// inside the guide box, where the tag's bars get the most pixels. Uses the
// browser's own BarcodeDetector when there is one (Chrome on Android), and
// the ZXing library otherwise (Safari on iPhone).
//
// parasDecodeBarcode(url): reads a barcode from a still photo (the "Take a
// photo instead" button, and a fallback when there is no camera).
(function () {
  'use strict';

  const ZXING_URL = 'https://unpkg.com/@zxing/library@0.21.3';
  const MAROON = '#7A1F2B';
  const GOLD = '#E2B95A';
  let zxingLoading = null;

  function loadZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (!zxingLoading) {
      zxingLoading = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = ZXING_URL;
        s.onload = function () { resolve(window.ZXing); };
        s.onerror = function () { zxingLoading = null; reject(new Error('ZXing did not load')); };
        document.head.appendChild(s);
      });
    }
    return zxingLoading;
  }

  function zxingReader(Z, tryHarder) {
    const hints = new Map();
    if (tryHarder) hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    return reader;
  }

  // Reads one canvas with ZXing; returns the text or null.
  function zxingDecode(Z, reader, canvas, binarizers) {
    const source = new Z.HTMLCanvasElementLuminanceSource(canvas);
    for (const Binarizer of binarizers) {
      try {
        const result = reader.decodeWithState(new Z.BinaryBitmap(new Binarizer(source)));
        if (result && result.getText()) return result.getText();
      } catch (e) {
        // Nothing found.
      }
    }
    return null;
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Photo could not be opened')); };
      img.src = url;
    });
  }

  // ---- Still photo -------------------------------------------------------

  window.parasDecodeBarcode = async function (url) {
    const Z = await loadZXing();
    const img = await loadImage(url);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const reader = zxingReader(Z, true);
    for (const target of [1600, 2400, 1000, 3200]) {
      const scale = Math.min(1, target / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const text = zxingDecode(Z, reader, canvas, [Z.HybridBinarizer, Z.GlobalHistogramBinarizer]);
      if (text) return text;
      if (scale === 1) break;
    }
    return null;
  };

  // ---- Live camera -------------------------------------------------------

  function el(tag, style, text) {
    const e = document.createElement(tag);
    if (style) e.setAttribute('style', style);
    if (text) e.textContent = text;
    return e;
  }

  function button(label, style) {
    const b = el('button', 'font: 600 15px sans-serif; border-radius: 22px; padding: 11px 20px; ' +
      'cursor: pointer; -webkit-tap-highlight-color: transparent; ' + style, label);
    b.type = 'button';
    return b;
  }

  async function openCamera() {
    const wanted = {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: wanted, audio: false });
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e;
      // Some cameras refuse the size request; take whatever the back camera gives.
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      });
    }
    // Keep refocusing as the tag moves (Android Chrome; ignored elsewhere).
    const track = stream.getVideoTracks()[0];
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }
    } catch (e) {
      // Not supported: the camera's own focus is used.
    }
    return stream;
  }

  async function nativeDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (!formats || !formats.length) return null;
      return new window.BarcodeDetector({ formats: formats });
    } catch (e) {
      return null;
    }
  }

  window.parasLiveScan = function () {
    return new Promise(function (resolve, reject) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        reject(new Error('no-camera'));
        return;
      }

      // Full-screen layer above the app.
      const layer = el('div', 'position: fixed; inset: 0; z-index: 2147483647; background: #000; ' +
        'overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none;');
      const video = el('video', 'position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;');
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.setAttribute('autoplay', '');
      video.muted = true;
      const box = el('div', 'position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%); ' +
        'width: min(84vw, 440px); aspect-ratio: 2.2 / 1; border: 3px solid ' + GOLD + '; ' +
        'border-radius: 16px; box-shadow: 0 0 0 100vmax rgba(0,0,0,0.45);');
      const line = el('div', 'position: absolute; left: 8%; right: 8%; top: 50%; height: 2px; ' +
        'background: rgba(226,185,90,0.85);');
      box.appendChild(line);
      const top = el('div', 'position: absolute; left: 0; right: 0; top: 0; ' +
        'padding: calc(env(safe-area-inset-top) + 14px) 16px 14px; display: flex; align-items: center; ' +
        'justify-content: space-between; background: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0));');
      const title = el('div', 'color: #fff; font: 600 17px sans-serif;', 'Scan barcode');
      const close = button('✕  Close', 'background: rgba(255,255,255,0.15); color: #fff; border: 0;');
      top.appendChild(title);
      top.appendChild(close);
      const bottom = el('div', 'position: absolute; left: 0; right: 0; bottom: 0; ' +
        'padding: 16px 16px calc(env(safe-area-inset-bottom) + 22px); display: flex; flex-direction: column; ' +
        'align-items: center; gap: 14px; background: linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.7));');
      const hint = el('div', 'color: #fff; font: 600 15px sans-serif; text-align: center; line-height: 1.4;',
        'Put the barcode inside the box');
      const sub = el('div', 'color: #E2C784; font: 13px sans-serif; text-align: center; margin-top: -8px;',
        'Hold the tag about a hand-length away and keep it steady');
      const photoBtn = button('Take a photo instead', 'background: ' + MAROON + '; color: #fff; border: 1px solid ' + GOLD + ';');
      bottom.appendChild(hint);
      bottom.appendChild(sub);
      bottom.appendChild(photoBtn);
      const fileInput = el('input', 'display: none;');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.setAttribute('capture', 'environment');
      layer.appendChild(video);
      layer.appendChild(box);
      layer.appendChild(top);
      layer.appendChild(bottom);
      layer.appendChild(fileInput);
      document.body.appendChild(layer);

      let stream = null;
      let finished = false;
      let timer = null;
      let busy = false;

      function finish(value, error) {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        layer.remove();
        if (error) reject(error); else resolve(value);
      }

      close.onclick = function () { finish(null); };
      photoBtn.onclick = function () { fileInput.click(); };
      fileInput.onchange = async function () {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        hint.textContent = 'Reading the photo…';
        const url = URL.createObjectURL(file);
        try {
          const text = await window.parasDecodeBarcode(url);
          if (text) { finish(text); return; }
          hint.textContent = 'Could not read that photo. Try again, closer and sharper.';
        } catch (e) {
          hint.textContent = 'Could not read that photo. Try again.';
        } finally {
          URL.revokeObjectURL(url);
          fileInput.value = '';
        }
      };

      // The part of the video frame that is inside the guide box (with a
      // margin), worked out from how the video is scaled to fill the screen.
      function boxInVideo() {
        const vw = video.videoWidth, vh = video.videoHeight;
        const lr = layer.getBoundingClientRect();
        const br = box.getBoundingClientRect();
        const scale = Math.max(lr.width / vw, lr.height / vh);
        const offX = (lr.width - vw * scale) / 2;
        const offY = (lr.height - vh * scale) / 2;
        const marginX = br.width * 0.12, marginY = br.height * 0.25;
        let x = (br.left - lr.left - marginX - offX) / scale;
        let y = (br.top - lr.top - marginY - offY) / scale;
        let w = (br.width + 2 * marginX) / scale;
        let h = (br.height + 2 * marginY) / scale;
        x = Math.max(0, x); y = Math.max(0, y);
        w = Math.min(vw - x, w); h = Math.min(vh - y, h);
        return { x: x, y: y, w: w, h: h };
      }

      const crop = document.createElement('canvas');
      const whole = document.createElement('canvas');
      let detector = null, Z = null, fast = null, careful = null;
      let round = 0;

      async function readFrame() {
        if (video.readyState < 2 || !video.videoWidth) return null;
        const r = boxInVideo();
        // The box area at full camera resolution (capped for speed).
        const s = Math.min(1, 1280 / r.w);
        crop.width = Math.max(1, Math.round(r.w * s));
        crop.height = Math.max(1, Math.round(r.h * s));
        crop.getContext('2d').drawImage(video, r.x, r.y, r.w, r.h, 0, 0, crop.width, crop.height);
        round++;
        if (detector) {
          try {
            const found = await detector.detect(crop);
            if (found && found.length && found[0].rawValue) return found[0].rawValue;
            if (round % 4 === 0) {
              const all = await detector.detect(video);
              if (all && all.length && all[0].rawValue) return all[0].rawValue;
            }
          } catch (e) {
            // Fall through to ZXing.
          }
        }
        if (!Z) return null;
        let text = zxingDecode(Z, fast, crop, [Z.HybridBinarizer]);
        if (text) return text;
        if (round % 3 === 0) {
          text = zxingDecode(Z, careful, crop, [Z.GlobalHistogramBinarizer, Z.HybridBinarizer]);
          if (text) return text;
        }
        if (round % 5 === 0) {
          // Now and then the whole frame, in case the tag is outside the box.
          const ws = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
          whole.width = Math.round(video.videoWidth * ws);
          whole.height = Math.round(video.videoHeight * ws);
          whole.getContext('2d').drawImage(video, 0, 0, whole.width, whole.height);
          text = zxingDecode(Z, fast, whole, [Z.HybridBinarizer]);
          if (text) return text;
        }
        return null;
      }

      function loop() {
        if (finished) return;
        timer = setTimeout(async function () {
          if (finished || busy) { loop(); return; }
          busy = true;
          try {
            const text = await readFrame();
            if (text && !finished) {
              if (navigator.vibrate) navigator.vibrate(60);
              finish(String(text).trim());
              return;
            }
          } catch (e) {
            // Keep trying with the next frame.
          } finally {
            busy = false;
          }
          loop();
        }, 120);
      }

      (async function start() {
        try {
          const loads = Promise.all([nativeDetector(), loadZXing().catch(function () { return null; })]);
          stream = await openCamera();
          if (finished) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
          video.srcObject = stream;
          await video.play().catch(function () {});
          const both = await loads;
          detector = both[0];
          Z = both[1];
          if (Z) {
            fast = zxingReader(Z, false);
            careful = zxingReader(Z, true);
          }
          if (!detector && !Z) {
            hint.textContent = 'The barcode reader did not load. Check the internet, or take a photo.';
          }
          loop();
        } catch (e) {
          const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
          hint.textContent = denied
            ? 'Camera access is off. Allow the camera for this site in Settings, or take a photo.'
            : 'The camera could not start. You can take a photo instead.';
          sub.textContent = '';
        }
      })();
    });
  };
})();
