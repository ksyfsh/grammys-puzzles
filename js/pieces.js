/* =====================================================================
   pieces.js — cutting a picture into classic jigsaw pieces.

   How it works, in plain English:
   - We pick a grid (for example 10 across and 7 down = 70 pieces) that
     keeps every piece close to square for this picture's shape.
   - Each line between two pieces gets a knob that pokes one way or the
     other, chosen at random. The pattern comes from a "seed" number, so
     the same puzzle always gets the same shapes when she comes back.
   - Measurements here use "units": one piece is 1 unit tall and
     `aspect` units wide. puzzle.js turns units into screen pixels.
   ===================================================================== */

const Pieces = (() => {
  const TAB = 0.11;      // knob size (fraction of a piece)
  const JITTER = 0.04;   // how much each knob varies, so they look hand-cut
  const PAD = 0.42;      // room around each piece for knobs (in units)

  /** A repeatable random-number maker: same seed → same numbers. */
  function makeRandom(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Chooses how many pieces across and down, and how much (if any) to trim
   * off the picture so the pieces come out nearly square.
   * The total may be a few pieces off the requested number
   * (for example 96 instead of 100) so the pieces stay a nice shape.
   */
  function chooseGrid(imgW, imgH, count) {
    let best = null;
    for (let cols = 2; cols <= 40; cols++) {
      for (let rows = 2; rows <= 40; rows++) {
        const n = cols * rows;
        const off = Math.abs(n - count) / count;
        if (off > 0.1) continue;
        const pieceAspect = (imgW / cols) / (imgH / rows);
        const score = Math.abs(Math.log(pieceAspect)) + off * 2;
        if (!best || score < best.score) best = { cols, rows, score };
      }
    }
    const { cols, rows } = best;
    // Trim the picture a little if the pieces would be too stretched.
    let cropW = imgW, cropH = imgH;
    const MAX = 1.15;
    const pieceAspect = (imgW / cols) / (imgH / rows);
    if (pieceAspect > MAX) cropW = (imgH / rows) * MAX * cols;
    if (pieceAspect < 1 / MAX) cropH = (imgW / cols) * MAX * rows;
    return {
      cols, rows,
      crop: { x: (imgW - cropW) / 2, y: (imgH - cropH) / 2, w: cropW, h: cropH },
      aspect: (cropW / cols) / (cropH / rows),
    };
  }

  /** Decides knob direction and wobble for every line between pieces. */
  function makeEdges(cols, rows, seed) {
    const rand = makeRandom(seed);
    const wobble = () => (rand() * 2 - 1) * JITTER;
    const one = () => ({ flip: rand() < 0.5 ? 1 : -1, a: wobble(), b: wobble(), c: wobble(), d: wobble(), e: wobble() });
    const horizontal = []; // lines between a piece and the one BELOW it
    const vertical = [];   // lines between a piece and the one to its RIGHT
    for (let r = 0; r < rows - 1; r++) { horizontal[r] = []; for (let c = 0; c < cols; c++) horizontal[r][c] = one(); }
    for (let r = 0; r < rows; r++) { vertical[r] = []; for (let c = 0; c < cols - 1; c++) vertical[r][c] = one(); }
    return { horizontal, vertical };
  }

  /**
   * The 10 points that describe one wavy edge with a knob, going from
   * (x0,y0) to (x1,y1). (Classic jigsaw curve made of 3 smooth curves.)
   */
  function edgePoints(x0, y0, x1, y1, p, size) {
    const ux = x1 - x0, uy = y1 - y0;
    const len = Math.hypot(ux, uy);
    const nx = (-uy / len) * size * p.flip;
    const ny = (ux / len) * size * p.flip;
    const t = TAB;
    const shape = [
      [0, 0],
      [0.2, p.a],
      [0.5 + p.b + p.d, -t + p.c],
      [0.5 - t + p.b, t + p.c],
      [0.5 - 2 * t + p.b - p.d, 3 * t + p.c],
      [0.5 + 2 * t + p.b - p.d, 3 * t + p.c],
      [0.5 + t + p.b, t + p.c],
      [0.5 + p.b + p.d, -t + p.c],
      [0.8, p.e],
      [1, 0],
    ];
    return shape.map(([along, out]) => [x0 + ux * along + nx * out, y0 + uy * along + ny * out]);
  }

  /** Builds the outline of one piece, in board units. */
  function piecePath(grid, edges, r, c) {
    const a = grid.aspect;
    const size = Math.min(a, 1);
    const x0 = c * a, y0 = r, x1 = (c + 1) * a, y1 = r + 1;
    const path = new Path2D();
    const addCurve = (pts) => {
      for (let i = 1; i < pts.length; i += 3) {
        path.bezierCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i + 2][0], pts[i + 2][1]);
      }
    };
    path.moveTo(x0, y0);
    // top edge (left → right)
    if (r === 0) path.lineTo(x1, y0);
    else addCurve(edgePoints(x0, y0, x1, y0, edges.horizontal[r - 1][c], size));
    // right edge (top → bottom)
    if (c === grid.cols - 1) path.lineTo(x1, y1);
    else addCurve(edgePoints(x1, y0, x1, y1, edges.vertical[r][c], size));
    // bottom edge (right → left): same line as the piece below, walked backwards
    if (r === grid.rows - 1) path.lineTo(x0, y1);
    else addCurve(edgePoints(x0, y1, x1, y1, edges.horizontal[r][c], size).reverse());
    // left edge (bottom → top)
    if (c === 0) path.lineTo(x0, y0);
    else addCurve(edgePoints(x0, y0, x0, y1, edges.vertical[r][c - 1], size).reverse());
    path.closePath();
    return path;
  }

  /**
   * Draws one piece onto its own little canvas.
   *   boardCanvas: the whole picture already drawn at board size
   *   k:   pixels per unit      dpr: screen sharpness (2 on iPad)
   *   placed: placed pieces get a fainter outline so the finished
   *           area looks smooth, like a real assembled puzzle.
   */
  function drawPiece(canvas, piece, grid, boardCanvas, k, dpr, placed) {
    const a = grid.aspect;
    const wUnits = a + PAD * 2, hUnits = 1 + PAD * 2;
    const pxW = Math.ceil(wUnits * k * dpr), pxH = Math.ceil(hUnits * k * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW; canvas.height = pxH;
    }
    canvas.style.width = (wUnits * k) + 'px';
    canvas.style.height = (hUnits * k) + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pxW, pxH);
    // Work in board units, shifted so this piece sits in the middle.
    ctx.setTransform(k * dpr, 0, 0, k * dpr, (PAD - piece.c * a) * k * dpr, (PAD - piece.r) * k * dpr);

    ctx.save();
    ctx.clip(piece.path);
    // Copy just this piece's part of the picture (plus room for knobs).
    // (Kept inside the picture's edges, because Safari can refuse to copy
    //  from outside them.)
    const boardW = grid.cols * a, boardH = grid.rows;
    const bx = Math.max(0, piece.c * a - PAD), by = Math.max(0, piece.r - PAD);
    const bw = Math.min(boardW, piece.c * a + a + PAD) - bx;
    const bh = Math.min(boardH, piece.r + 1 + PAD) - by;
    const scale = boardCanvas.width / boardW;
    ctx.drawImage(boardCanvas, bx * scale, by * scale, bw * scale, bh * scale, bx, by, bw, bh);
    if (!placed) {
      // Light and dark rims give the piece a gentle 3D, cardboard look.
      const px = 1 / k;
      ctx.lineWidth = 3 * px;
      ctx.translate(1.2 * px, 1.2 * px);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.stroke(piece.path);
      ctx.translate(-2.4 * px, -2.4 * px);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.stroke(piece.path);
    }
    ctx.restore();
    ctx.lineWidth = (placed ? 1 : 1.6) / k;
    ctx.strokeStyle = placed ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.5)';
    ctx.stroke(piece.path);
  }

  // A tiny invisible canvas used to check "is this finger inside the piece shape?"
  const hitCtx = document.createElement('canvas').getContext('2d');
  function isInside(piece, x, y) {
    return hitCtx.isPointInPath(piece.path, x, y);
  }

  /** Loads a picture and waits until it's ready to draw. */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Picture could not be loaded'));
      img.src = src;
    });
  }

  return { PAD, loadImage, chooseGrid, makeEdges, piecePath, drawPiece, isInside, makeRandom };
})();
