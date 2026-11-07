// Live camera.
//  * "multi": full picture at the camera's best resolution (ImageCapture.takePhoto), cards are found later
//  * "single": card-shaped frame, returns the upright card (canvas, CARD_W x CARD_H)

export const CARD_W = 590;
export const CARD_H = 860;

export function createCamera({ root, video, frame, hint, onPhoto, onCard, onError }) {
  let stream = null;
  let mode = 'multi';

  async function open(m = 'multi') {
    mode = m;
    root.hidden = false;
    root.classList.toggle('multi', mode === 'multi');
    hint.textContent = mode === 'multi'
      ? 'Lay the cards flat, side by side, not overlapping'
      : 'Fit the card into the frame';
    document.body.classList.add('cam-open');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      const [track] = stream.getVideoTracks();
      // continuous autofocus where the phone supports it
      try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* not supported */ }
    } catch (err) {
      close();
      onError(err);
    }
  }

  function close() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    root.hidden = true;
    document.body.classList.remove('cam-open');
  }

  function videoFrame() {
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    return c;
  }

  // A sharper still photo when the video stream itself is small. Capped at ~12 MP: the phone's
  // maximum (often 50 MP) makes Android switch the camera mode (black preview) and takes seconds to decode.
  const PHOTO_MAX = 4000;
  async function stillPhoto() {
    const [track] = stream?.getVideoTracks() || [];
    if (!track || !('ImageCapture' in window)) return null;
    try {
      const ic = new window.ImageCapture(track);
      const caps = await ic.getPhotoCapabilities().catch(() => null);
      let settings = {};
      const wr = caps?.imageWidth, hr = caps?.imageHeight;
      if (wr?.max && hr?.max) {
        const k = Math.min(1, PHOTO_MAX / Math.max(wr.max, hr.max));
        const fit = (r, v) => { const st = r.step || 1; return Math.max(r.min || 1, Math.round(v / st) * st); };
        settings = { imageWidth: fit(wr, wr.max * k), imageHeight: fit(hr, hr.max * k) };
      }
      const blob = await ic.takePhoto(settings);
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      if (bmp.width * bmp.height > video.videoWidth * video.videoHeight * 1.2) return bmp;
    } catch (e) {
      console.warn('takePhoto failed, using the video frame', e);
    }
    return null;
  }

  // The video is shown with object-fit: cover, so map the frame on screen back to video pixels.
  function cutFrame() {
    const vw = video.videoWidth, vh = video.videoHeight;
    const el = video.getBoundingClientRect();
    const fr = frame.getBoundingClientRect();
    const scale = Math.max(el.width / vw, el.height / vh);
    const offX = (el.width - vw * scale) / 2;
    const offY = (el.height - vh * scale) / 2;
    const sx = (fr.left - el.left - offX) / scale;
    const sy = (fr.top - el.top - offY) / scale;
    const sw = fr.width / scale;
    const sh = fr.height / scale;
    const card = document.createElement('canvas');
    card.width = Math.round(CARD_W * 1.5); card.height = Math.round(CARD_H * 1.5);
    const ctx = card.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, card.width, card.height);
    return card;
  }

  async function capture() {
    if (!video.videoWidth) return;
    if (mode === 'single') {
      const card = cutFrame();
      close();
      onCard(card);
      return;
    }
    // Show the picture at once (scan animation runs over it) – no waiting for the photo pipeline.
    const frameNow = videoFrame();
    if (Math.max(video.videoWidth, video.videoHeight) >= 1920 || !('ImageCapture' in window)) {
      close();
      onPhoto(frameNow);
      return;
    }
    // small video stream: start with the frame, then hand over the sharper photo
    root.hidden = true;
    document.body.classList.remove('cam-open');
    onPhoto(frameNow);
    const photo = await stillPhoto();
    close();
    if (photo) onPhoto(photo, { better: true });
  }

  return { open, close, capture };
}

// For a photo with one card filling most of it (no card finder available).
// Returns upright and sideways candidates; the recogniser picks the better one.
export function cardsFromPhoto(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const out = [];
  for (const sideways of [false, true]) {
    const ratio = sideways ? CARD_H / CARD_W : CARD_W / CARD_H; // width / height of the card as seen in the photo
    let h = H * 0.92, w = h * ratio;
    if (w > W * 0.92) { w = W * 0.92; h = w / ratio; }
    const x = (W - w) / 2, y = (H - h) / 2;
    const c = document.createElement('canvas');
    const cw = Math.round(CARD_W * 1.5), ch = Math.round(CARD_H * 1.5);
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    if (sideways) {
      ctx.translate(cw, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, x, y, w, h, 0, 0, ch, cw);
    } else {
      ctx.drawImage(img, x, y, w, h, 0, 0, cw, ch);
    }
    // where it sits in the photo, so it can be marked like a found card
    out.push({ canvas: c, box: { cx: W / 2, cy: H / 2, w, h, angle: 0 } });
  }
  return out;
}
