'use strict';

// Barcode rendering backed by the Barcode Bakery library
// (@barcode-bakery/barcode-aztec, -qrcode, -common).
//
// The upstream Node surface (@barcode-bakery/barcode-nodejs) renders through
// node-canvas, a native module that will not build in every environment. The
// 2D symbologies we use (Aztec, QR) only ever call `fillRect` on the drawing
// context, so we supply our own minimal surface that records those rectangles
// and emits an SVG string instead. That keeps the inline-SVG approach the
// receipt template already relies on and avoids the native dependency.

const { BCGColor, BCGDrawing } = require('@barcode-bakery/barcode-common');
const { BCGaztec } = require('@barcode-bakery/barcode-aztec');
const { BCGqrcode } = require('@barcode-bakery/barcode-qrcode');

const BLACK = new BCGColor(0, 0, 0);
const WHITE = new BCGColor(255, 255, 255);

// A drawing surface that mimics just enough of a CanvasRenderingContext2D for
// the Barcode Bakery 2D drawers: a resizable `canvas` and `fillStyle`/`fillRect`.
// Every other context member the library may touch is a harmless no-op so the
// same surface stays usable if a symbology ever draws text or circles.
function createSvgSurface(width, height) {
  const rects = [];
  let fillStyle = 'rgb(0, 0, 0)';

  const context = {
    canvas: { width, height },
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value) {
      fillStyle = value;
    },
    fillRect(x, y, w, h) {
      // Match canvas semantics: a negative width/height extends left/up from
      // the origin. The Aztec drawer relies on this (it renders with a flipped
      // Y axis), so normalise here or those rectangles would be lost.
      if (w < 0) {
        x += w;
        w = -w;
      }
      if (h < 0) {
        y += h;
        h = -h;
      }
      rects.push({ x, y, w, h, fill: fillStyle });
    },
    // Unused by Aztec/QR, present so the surface is a complete context.
    font: '',
    beginPath() {},
    ellipse() {},
    fill() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    fillText() {},
    measureText() {
      return {
        width: 0,
        actualBoundingBoxAscent: 0,
        actualBoundingBoxDescent: 0,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 0,
      };
    },
  };

  return { context, createSurface: createSvgSurface, rects };
}

// Converts an "rgb(r, g, b)" fill (the only form our surface records) to a
// #rrggbb hex string for SVG.
function toHex(rgb) {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m == null) return rgb;
  return (
    '#' +
    [m[1], m[2], m[3]]
      .map((v) => Number(v).toString(16).padStart(2, '0'))
      .join('')
  );
}

// Renders a configured barcode to an SVG string, padding it with a quiet zone
// (in module/scale units) of the background colour so scanners have margin.
function renderSvg(barcode, quietZone) {
  const drawing = new BCGDrawing(createSvgSurface, WHITE);
  drawing.draw(barcode, { throwException: true });

  const surface = drawing.getImage();
  const codeWidth = surface.context.canvas.width;
  const codeHeight = surface.context.canvas.height;
  const totalWidth = codeWidth + quietZone * 2;
  const totalHeight = codeHeight + quietZone * 2;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}"`,
    ` viewBox="0 0 ${totalWidth} ${totalHeight}" shape-rendering="crispEdges">`,
    // Quiet zone: paint the whole padded canvas the background colour first.
    `<rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#ffffff"/>`,
  ];
  // Replay every recorded rectangle in draw order (as a canvas would), so any
  // background-over-foreground overdraw is preserved faithfully.
  for (const r of surface.rects) {
    const x = r.x + quietZone;
    const y = r.y + quietZone;
    parts.push(
      `<rect x="${x}" y="${y}" width="${r.w}" height="${r.h}" fill="${toHex(r.fill)}"/>`
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

// Builds an Aztec Code SVG for the given text.
function aztecSvg(text, { scale = 4, quietZone = 4 } = {}) {
  const code = new BCGaztec();
  code.setScale(scale);
  code.setForegroundColor(BLACK);
  code.setBackgroundColor(WHITE);
  code.parse(text);
  return renderSvg(code, quietZone);
}

// Builds a QR Code SVG for the given text.
function qrcodeSvg(text, { scale = 4, quietZone = 8, errorLevel = 1 } = {}) {
  const code = new BCGqrcode();
  code.setScale(scale);
  code.setErrorLevel(errorLevel); // 0=L, 1=M, 2=Q, 3=H
  code.setForegroundColor(BLACK);
  code.setBackgroundColor(WHITE);
  code.parse(text);
  return renderSvg(code, quietZone);
}

module.exports = { aztecSvg, qrcodeSvg };
