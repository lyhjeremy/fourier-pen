// Built-in example pictures, drawn on a canvas so no image files ship.

export const SAMPLES = ['word', 'pi', 'heart', 'clef', 'einstein'];

// The one picture file that ships: Albert Einstein, 1947, photograph by Orren Jack Turner,
// Library of Congress, public domain (copyright not renewed).
export const PHOTO_SAMPLES = { einstein: 'samples/einstein.jpg' };

// Slider values a sample sets when chosen, so a photo opens with settings that suit it.
// Values are the raw input values (smooth is tenths of a pixel).
export const SAMPLE_SETTINGS = { einstein: { smooth: 20, minlen: 14 } };

export function loadSample(kind) {
  if (PHOTO_SAMPLES[kind]) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('sample failed to load'));
      img.src = PHOTO_SAMPLES[kind];
    });
  }
  return Promise.resolve(sampleCanvas(kind));
}

export function sampleCanvas(kind) {
  const c = document.createElement('canvas'); c.width = 600; c.height = 600;
  const x = c.getContext('2d');
  const WHITE = '#fff', BLACK = '#000'; // ledger-allow: purewhite, pureblack (input picture, not UI)
  const SERIF = '"Source Serif 4", "Iowan Old Style", "Palatino Linotype", Palatino, serif';
  x.fillStyle = WHITE; x.fillRect(0, 0, 600, 600); x.fillStyle = BLACK;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (kind === 'word') {
    c.width = 900; c.height = 360;
    x.fillStyle = WHITE; x.fillRect(0, 0, 900, 360); x.fillStyle = BLACK;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `600 200px ${SERIF}`; x.fillText('Fourier', 450, 180);
  } else if (kind === 'pi') {
    x.font = `600 460px ${SERIF}`; x.fillText('π', 300, 290);
  } else if (kind === 'heart') {
    x.beginPath();
    for (let i = 0; i <= 400; i++) {
      const a = (i / 400) * Math.PI * 2;
      const hx = 16 * Math.sin(a) ** 3, hy = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
      const px = 300 + hx * 15, py = 290 - hy * 15;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.fill();
    x.fillStyle = WHITE; x.beginPath(); x.ellipse(220, 210, 40, 26, -0.6, 0, Math.PI * 2); x.fill();
  } else {
    x.font = '420px "Apple Symbols", "Segoe UI Symbol", "Noto Music", "DejaVu Sans", serif';
    x.fillText('♫', 300, 310);
  }
  return c;
}
