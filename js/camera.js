// Live camera with a card-shaped frame. Returns an upright card image (canvas, 590 x 860).

export const CARD_W = 590;
export const CARD_H = 860;

export function createCamera({ root, video, frame, onCapture, onError }) {
  let stream = null;

  async function open() {
    root.hidden = false;
    document.body.classList.add('cam-open');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
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

  // The video is shown with object-fit: cover, so map the frame on screen back to video pixels.
  function capture() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return;
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
    card.width = CARD_W; card.height = CARD_H;
    const ctx = card.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, CARD_W, CARD_H);
    close();
    onCapture(card);
  }

  return { open, close, capture };
}

// For a photo from the gallery: assume one card fills most of the picture.
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
    c.width = CARD_W; c.height = CARD_H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    if (sideways) {
      ctx.translate(CARD_W, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, x, y, w, h, 0, 0, CARD_H, CARD_W);
    } else {
      ctx.drawImage(img, x, y, w, h, 0, 0, CARD_W, CARD_H);
    }
    out.push(c);
  }
  return out;
}
