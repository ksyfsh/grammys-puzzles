/* =====================================================================
   puzzle.js — the puzzle screen.

   The screen has three parts:
     - the toolbar along the top (5 buttons)
     - the TABLE: a felt-colored area with the board outline in the middle.
       Loose pieces can be dropped anywhere on the table, just like a real
       puzzle on a kitchen table.
     - the TRAY: a scrolling box of pieces not used yet. It sits on the
       right in landscape and along the bottom in portrait.

   Each piece is in one of three states:
     'tray'   — waiting in the tray
     'loose'  — lying on the table somewhere
     'placed' — locked into its correct spot (can't be moved again)

   Loose pieces that fit together JOIN into a group and move as one.
   Every piece has a group number (`g`). A piece on its own is a group of
   one. When two groups join, they share one group number.

   Positions are saved in "units" (1 unit = 1 piece tall), so they still
   make sense if the iPad is turned and everything changes size.
   ===================================================================== */

const PuzzleScreen = (() => {
  // ---- Settings you might want to adjust ----
  const SNAP_DISTANCE = 0.45;  // how close (in pieces) to the right spot on the board to lock in
  const JOIN_DISTANCE = 0.35;  // how close two matching pieces must be to join together
  const HOLD_TO_LIFT_MS = 300; // in the tray, holding a piece this long picks it up
  const GUTTER = 8;            // space around the tray's edge, in pixels
  const DEFAULT_COUNT = 70;

  // The floating picture window
  const PEEK_MIN_WIDTH = 220;  // smallest it can get (so its buttons still fit)
  const PEEK_BAR = 40;         // height of its button bar, in pixels (matches style.css)
  const PEEK_KEEP = 120;       // when dragged off the edge, this much always stays on screen
  const PEEK_STEP = 1.3;       // how much "Bigger" / "Smaller" change the size

  const PAD = Pieces.PAD;
  const NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // up, down, left, right
  const el = {};
  let P = null;          // everything about the puzzle that's open right now
  let gesture = null;    // what her finger is doing right now
  let saveTimer = null;
  let momentumFrame = null;
  let layoutFrame = null;
  let callbacks = {};

  // ===================================================================
  // Setup (runs once when the app starts)
  // ===================================================================
  function init(cb) {
    callbacks = cb;
    ['screen-puzzle', 'play', 'table', 'board', 'pieces-layer', 'tray', 'tray-inner', 'tray-message',
      'drag-layer', 'done-panel', 'tool-home', 'tool-peek', 'tool-edges', 'tool-tidy', 'tool-sound',
      'done-another', 'done-admire', 'peek-window', 'peek', 'peek-smaller', 'peek-bigger', 'peek-hide',
    ].forEach((id) => {
      el[id.replace(/-([a-z])/g, (m, ch) => ch.toUpperCase())] = document.getElementById(id);
    });

    // Finger handling for the table and tray.
    el.table.addEventListener('pointerdown', onPointerDown);
    el.tray.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    // Tell Safari not to scroll, zoom, select, or swipe while she works here.
    [el.table, el.tray, el.peek].forEach((area) =>
      area.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false }));

    // Toolbar buttons
    el.toolHome.addEventListener('click', goHome);
    el.toolPeek.addEventListener('click', () => { if (P && P.peek) hidePeek(); else showPeek(); });
    el.toolEdges.addEventListener('click', toggleEdges);
    el.toolTidy.addEventListener('click', tidyUp);
    el.toolSound.addEventListener('click', toggleSound);
    el.doneAnother.addEventListener('click', () => { close(); callbacks.onChooseAnother(); });
    el.doneAdmire.addEventListener('click', () => { el.donePanel.hidden = true; });

    // The floating picture window
    el.peek.addEventListener('pointerdown', peekPointerDown);
    el.peek.addEventListener('pointermove', peekPointerMove);
    el.peek.addEventListener('pointerup', peekPointerUp);
    el.peek.addEventListener('pointercancel', peekPointerUp);
    el.peekSmaller.addEventListener('click', () => resizePeek(1 / PEEK_STEP));
    el.peekBigger.addEventListener('click', () => resizePeek(PEEK_STEP));
    el.peekHide.addEventListener('click', hidePeek);

    // Re-arrange when the iPad is turned.
    window.addEventListener('resize', () => {
      cancelAnimationFrame(layoutFrame);
      layoutFrame = requestAnimationFrame(layout);
    });
    // Save the moment the app is hidden or closed.
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
    window.addEventListener('pagehide', saveNow);

    showSoundState();
  }

  // ===================================================================
  // Opening and closing a puzzle
  // ===================================================================

  /**
   * Opens a puzzle.
   *   picture: { id, src, revoke? }
   *   count:   a number to start a NEW puzzle, or null to keep going
   */
  async function open(picture, count) {
    close();
    const img = await Pieces.loadImage(picture.src);
    let rec = count ? null : await Store.getPuzzle(picture.id);
    if (!rec) rec = newRecord(picture.id, img, count || DEFAULT_COUNT);

    const grid = { cols: rec.cols, rows: rec.rows, crop: rec.crop, aspect: rec.aspect };
    const edges = Pieces.makeEdges(grid.cols, grid.rows, rec.seed);
    P = {
      picture, rec, img, grid,
      pieces: [],
      order: rec.order.slice(),
      edgeOnly: !!rec.edgeOnly,
      done: !!rec.done,
      zTop: 0,
      k: 0, renderedK: 0, dpr: 1,
      boardCanvas: document.createElement('canvas'),
      peek: null,  // the picture window's size and place, when it's showing
    };
    const states = { t: 'tray', l: 'loose', p: 'placed' };
    for (let i = 0; i < grid.cols * grid.rows; i++) {
      const r = Math.floor(i / grid.cols), c = i % grid.cols;
      const saved = rec.pieces[i] || { s: 't', x: 0, y: 0, z: 0 };
      const canvas = document.createElement('canvas');
      canvas.className = 'piece';
      canvas.dataset.row = r;   // handy for testing; not used by the app
      canvas.dataset.col = c;
      const piece = {
        id: i, r, c,
        isEdge: r === 0 || c === 0 || r === grid.rows - 1 || c === grid.cols - 1,
        path: Pieces.piecePath(grid, edges, r, c),
        el: canvas,
        state: states[saved.s] || 'tray',
        x: saved.x, y: saved.y, z: saved.z || 0,
        g: saved.g === undefined ? i : saved.g,
      };
      if (piece.state === 'placed') { piece.x = c * grid.aspect; piece.y = r; }
      if (piece.state === 'tray') piece.g = i;
      P.zTop = Math.max(P.zTop, piece.z);
      P.pieces.push(piece);
    }
    el.donePanel.hidden = true;
    showEdgeState();
    layout();
    setScroll(rec.trayScroll || 0);
    saveNow();
  }

  /** A brand-new puzzle: every piece shuffled into the tray. */
  function newRecord(pictureId, img, count) {
    const grid = Pieces.chooseGrid(img.naturalWidth, img.naturalHeight, count);
    const n = grid.cols * grid.rows;
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { // shuffle
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return {
      pictureId, count,
      cols: grid.cols, rows: grid.rows, crop: grid.crop, aspect: grid.aspect,
      seed: Math.floor(Math.random() * 2147483647),
      pieces: Array.from({ length: n }, (_, i) => ({ s: 't', x: 0, y: 0, z: 0, g: i })),
      order, edgeOnly: false, done: false, trayScroll: 0,
      started: Date.now(), updated: Date.now(),
    };
  }

  /** Puts the puzzle away (after saving) and frees the iPad's memory. */
  function close() {
    stopMomentum();
    gesture = null;
    if (!P) return;
    saveNow();
    hidePeek();
    P.pieces.forEach((p) => { p.el.width = 0; p.el.height = 0; p.el.remove(); });
    P.boardCanvas.width = 0;
    el.donePanel.hidden = true;
    if (P.picture.revoke) P.picture.revoke();
    P = null;
  }

  function goHome() {
    close();
    callbacks.onHome();
  }

  // ===================================================================
  // Groups (pieces joined together)
  // ===================================================================
  function pieceAt(r, c) {
    if (r < 0 || c < 0 || r >= P.grid.rows || c >= P.grid.cols) return null;
    return P.pieces[r * P.grid.cols + c];
  }

  /** All loose pieces in the same group as this one. */
  function groupMembers(g) {
    return P.pieces.filter((q) => q.state === 'loose' && q.g === g);
  }

  /** Joined pieces are drawn with soft seams so they look like one piece. */
  function looksJoined(p) {
    if (p.state === 'placed') return true;
    if (p.state !== 'loose') return false;
    return P.pieces.some((q) => q !== p && q.state === 'loose' && q.g === p.g);
  }

  function redraw(p) {
    Pieces.drawPiece(p.el, p, P.grid, P.boardCanvas, P.k, P.dpr, looksJoined(p));
  }

  /**
   * After a group is put down: does any of its pieces sit right next to a
   * matching neighbor on the table? If so, they click together.
   * Returns true if anything joined.
   */
  function joinNeighbors(g) {
    const a = P.grid.aspect;
    let joinedAny = false;
    for (let pass = 0; pass < 8; pass++) {
      let match = null;
      for (const p of groupMembers(g)) {
        for (const [dr, dc] of NEIGHBORS) {
          const q = pieceAt(p.r + dr, p.c + dc);
          if (!q || q.state !== 'loose' || q.g === g) continue;
          // Where q would be if it fit perfectly against p:
          const wantX = p.x + dc * a, wantY = p.y + dr;
          if (Math.hypot(q.x - wantX, q.y - wantY) <= JOIN_DISTANCE) {
            match = { other: q.g, dx: wantX - q.x, dy: wantY - q.y };
            break;
          }
        }
        if (match) break;
      }
      if (!match) break;

      const mine = groupMembers(g), theirs = groupMembers(match.other);
      if (!joinedAny) {
        // First join: the group she just put down slides over to meet the other one.
        mine.forEach((m) => { m.x -= match.dx; m.y -= match.dy; });
      } else {
        // Any extra joins: the other group slides in to meet hers.
        theirs.forEach((m) => { m.x += match.dx; m.y += match.dy; });
      }
      theirs.forEach((m) => { m.g = g; });
      joinedAny = true;
    }
    return joinedAny;
  }

  /** Keeps a whole group on the table (not hanging off the edge). */
  function clampGroup(g) {
    const members = groupMembers(g);
    if (!members.length) return;
    const k = P.k, a = P.grid.aspect;
    const minX = Math.min(...members.map((m) => m.x)), maxX = Math.max(...members.map((m) => m.x)) + a;
    const minY = Math.min(...members.map((m) => m.y)), maxY = Math.max(...members.map((m) => m.y)) + 1;
    const left = -P.boardX / k, right = (P.tableW - P.boardX) / k;
    const top = -P.boardY / k, bottom = (P.tableH - P.boardY) / k;
    let dx = 0, dy = 0;
    if (maxX > right) dx = right - maxX;
    if (minX + dx < left) dx = left - minX;
    if (maxY > bottom) dy = bottom - maxY;
    if (minY + dy < top) dy = top - minY;
    members.forEach((m) => { m.x += dx; m.y += dy; });
  }

  // ===================================================================
  // Sizing and arranging everything on screen
  // ===================================================================
  function layout() {
    if (!P) return;
    const g = P.grid;
    const tableRect = el.table.getBoundingClientRect();
    if (tableRect.width < 10 || tableRect.height < 10) return;
    const boardW = g.cols * g.aspect, boardH = g.rows;

    // k = how many screen pixels make one "unit" (one piece tall).
    // The board is made as big as the table allows.
    const k = Math.max(4, Math.min((tableRect.width - 24) / (boardW + 0.5), (tableRect.height - 24) / (boardH + 0.5)));
    P.k = k;
    P.tableW = tableRect.width;
    P.tableH = tableRect.height;
    P.boardX = (tableRect.width - boardW * k) / 2;
    P.boardY = (tableRect.height - boardH * k) / 2;
    Object.assign(el.board.style, {
      left: P.boardX + 'px', top: P.boardY + 'px',
      width: boardW * k + 'px', height: boardH * k + 'px',
    });

    if (Math.abs(k - P.renderedK) > 0.25) renderAllPieces();

    // Tray: two lanes of pieces, scrolled up/down (landscape) or sideways (portrait).
    P.portrait = window.matchMedia('(orientation: portrait)').matches;
    const across = P.portrait ? el.tray.clientHeight : el.tray.clientWidth;
    P.cell = Math.max(40, (across - GUTTER * 2) / 2);
    P.trayScale = Math.min(1, P.cell / ((Math.max(g.aspect, 1) + 0.5) * k));

    const groupsSeen = new Set();
    P.pieces.forEach((p) => {
      if (p.state === 'loose' && !groupsSeen.has(p.g)) { groupsSeen.add(p.g); clampGroup(p.g); }
    });
    P.pieces.forEach((p) => { if (p.state === 'loose' || p.state === 'placed') putOnTable(p); });
    layoutTray();
    if (P.peek) { drawPeekPicture(); placePeek(); }
  }

  /** Draws every piece at the current size. */
  function renderAllPieces() {
    const g = P.grid;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bc = P.boardCanvas;
    bc.width = Math.round(g.cols * g.aspect * P.k * dpr);
    bc.height = Math.round(g.rows * P.k * dpr);
    const bctx = bc.getContext('2d');
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(P.img, g.crop.x, g.crop.y, g.crop.w, g.crop.h, 0, 0, bc.width, bc.height);
    P.renderedK = P.k;
    P.dpr = dpr;
    P.pieces.forEach(redraw);
  }

  /** Puts a piece onto the table at its saved spot. */
  function putOnTable(p) {
    if (p.el.parentNode !== el.piecesLayer) el.piecesLayer.appendChild(p.el);
    const x = P.boardX + (p.x - PAD) * P.k;
    const y = P.boardY + (p.y - PAD) * P.k;
    p.el.style.transform = `translate(${x}px, ${y}px)`;
    p.el.style.display = '';
    p.el.style.zIndex = p.state === 'loose' ? String(10 + p.z) : '';
    p.el.classList.toggle('loose', p.state === 'loose');
    p.el.classList.toggle('placed', p.state === 'placed');
  }

  // ===================================================================
  // The tray
  // ===================================================================
  // A piece she has just picked up from the tray keeps its spot (P.trayHole)
  // until she puts it down, so the other pieces don't shuffle over.
  function trayList() {
    return P.order.map((i) => P.pieces[i])
      .filter((p) => (p.state === 'tray' || p === P.trayHole) && (!P.edgeOnly || p.isEdge));
  }

  function layoutTray() {
    if (!P) return;
    const g = P.grid, k = P.k, f = P.trayScale, cell = P.cell;
    const canvasW = (g.aspect + PAD * 2) * k * f;
    const canvasH = (1 + PAD * 2) * k * f;
    const list = trayList();
    const shown = new Set(list);

    P.pieces.forEach((p) => {
      if (p.state === 'tray' && !shown.has(p)) {
        if (p.el.parentNode !== el.trayInner) el.trayInner.appendChild(p.el);
        p.el.style.display = 'none';
      }
    });
    list.forEach((p, i) => {
      const lane = i % 2, step = Math.floor(i / 2);
      const centerX = GUTTER + (P.portrait ? step : lane) * cell + cell / 2;
      const centerY = GUTTER + (P.portrait ? lane : step) * cell + cell / 2;
      p.trayX = centerX - canvasW / 2;
      p.trayY = centerY - canvasH / 2;
      if (p === P.trayHole) return;   // it's in her hand: leave a blank space
      if (p.el.parentNode !== el.trayInner) el.trayInner.appendChild(p.el);
      p.el.classList.remove('loose', 'placed', 'snapped', 'settling');
      p.el.style.display = '';
      p.el.style.zIndex = '';
      p.el.style.transform = `translate(${p.trayX}px, ${p.trayY}px) scale(${f})`;
    });

    const length = GUTTER * 2 + Math.ceil(list.length / 2) * cell;
    el.trayInner.style.width = P.portrait ? length + 'px' : '100%';
    el.trayInner.style.height = P.portrait ? '100%' : length + 'px';

    // A friendly note when the tray is empty.
    let note = '';
    if (list.length === 0) {
      const anyInTray = P.pieces.some((p) => p.state === 'tray');
      if (P.edgeOnly && anyInTray) note = 'No edge pieces left here. Tap “Show All Pieces” to see the rest.';
      else if (!P.done) note = 'All the pieces are out of the tray.';
    }
    el.trayMessage.textContent = note;
    el.trayMessage.hidden = !note;
  }

  function getScroll() { return P && P.portrait ? el.tray.scrollLeft : el.tray.scrollTop; }
  function setScroll(v) {
    if (P && P.portrait) el.tray.scrollLeft = v; else el.tray.scrollTop = v;
  }

  /** Which tray piece is under the finger? (Generous: anywhere in its square.) */
  function trayHit(cx, cy) {
    const r = el.tray.getBoundingClientRect();
    const lx = cx - r.left - el.tray.clientLeft + el.tray.scrollLeft - GUTTER;
    const ly = cy - r.top - el.tray.clientTop + el.tray.scrollTop - GUTTER;
    const step = Math.floor((P.portrait ? lx : ly) / P.cell);
    const lane = Math.floor((P.portrait ? ly : lx) / P.cell);
    if (lane < 0 || lane > 1 || step < 0) return null;
    const p = trayList()[step * 2 + lane];
    return p && p !== P.trayHole ? p : null;
  }

  /** Which loose piece on the table is under the finger? (Top-most first.) */
  function tableHit(cx, cy) {
    const t = el.table.getBoundingClientRect();
    const ux = (cx - t.left - P.boardX) / P.k;
    const uy = (cy - t.top - P.boardY) / P.k;
    const a = P.grid.aspect;
    const loose = P.pieces.filter((p) => p.state === 'loose').sort((m, n) => n.z - m.z);
    for (const p of loose) {
      const lx = ux - p.x, ly = uy - p.y;
      if (lx < -PAD || lx > a + PAD || ly < -PAD || ly > 1 + PAD) continue;
      const inBody = lx > -0.08 && lx < a + 0.08 && ly > -0.08 && ly < 1.08;
      if (inBody || Pieces.isInside(p, lx + p.c * a, ly + p.r)) return p;
    }
    return null;
  }

  // ===================================================================
  // Finger handling: picking up, dragging, dropping, and tray scrolling
  // ===================================================================
  function onPointerDown(e) {
    if (!P || gesture || (e.pointerType === 'mouse' && e.button !== 0)) return; // one finger at a time
    stopMomentum();
    const start = { pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY };

    if (el.tray.contains(e.target)) {
      const piece = trayHit(e.clientX, e.clientY);
      gesture = Object.assign(start, {
        kind: 'tray-pending', piece, scroll0: getScroll(),
        lastPos: P.portrait ? e.clientX : e.clientY, lastT: performance.now(), velocity: 0,
      });
      if (piece) {
        gesture.holdTimer = setTimeout(() => {
          if (gesture && gesture.kind === 'tray-pending') liftFromTray();
        }, HOLD_TO_LIFT_MS);
      }
      return;
    }

    // On the table: pick up the piece (and everything joined to it).
    const piece = tableHit(e.clientX, e.clientY);
    if (!piece) return;
    const t = el.table.getBoundingClientRect();
    gesture = Object.assign(start, {
      kind: 'drag', piece, fromTray: false,
      gx: (e.clientX - t.left - P.boardX) / P.k - piece.x,
      gy: (e.clientY - t.top - P.boardY) / P.k - piece.y,
      members: groupMembers(piece.g).map((m) => ({ p: m, rx: m.x - piece.x, ry: m.y - piece.y })),
    });
    gesture.members.forEach((m) => { m.p.state = 'held'; });
    lift();
  }

  function onPointerMove(e) {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    gesture.x = e.clientX;
    gesture.y = e.clientY;

    if (gesture.kind === 'drag') { moveLifted(); return; }

    const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
    if (gesture.kind === 'tray-pending') {
      if (Math.hypot(dx, dy) < 10) return;
      const along = P.portrait ? dx : dy;   // the tray's scrolling direction
      const across = P.portrait ? dy : dx;  // toward the table
      // Lean toward picking the piece up: only a nearly straight swipe along
      // the tray scrolls it. Anything angled toward the table lifts the piece.
      if (gesture.piece && Math.abs(across) > Math.abs(along) * 0.5) { liftFromTray(); return; }
      clearTimeout(gesture.holdTimer);
      gesture.kind = 'scroll';
    }
    if (gesture.kind === 'scroll') {
      setScroll(gesture.scroll0 - (P.portrait ? dx : dy));
      const now = performance.now(), pos = P.portrait ? e.clientX : e.clientY;
      const dt = Math.max(1, now - gesture.lastT);
      gesture.velocity = 0.7 * ((pos - gesture.lastPos) / dt) + 0.3 * gesture.velocity;
      gesture.lastPos = pos;
      gesture.lastT = now;
    }
  }

  function onPointerUp(e) {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const g = gesture;
    gesture = null;
    clearTimeout(g.holdTimer);
    if (g.kind === 'drag') drop(g);
    else if (g.kind === 'scroll' && performance.now() - g.lastT < 100) startMomentum(g.velocity);
    if (g.kind === 'scroll') scheduleSave(); // remember where the tray was scrolled to
  }

  /** Picks up the tray piece under her finger. */
  function liftFromTray() {
    const g = gesture, p = g.piece;
    clearTimeout(g.holdTimer);
    const r = el.tray.getBoundingClientRect();
    const f = P.trayScale, a = P.grid.aspect;
    const canvasLeft = r.left + el.tray.clientLeft - el.tray.scrollLeft + p.trayX;
    const canvasTop = r.top + el.tray.clientTop - el.tray.scrollTop + p.trayY;
    // Keep the same spot of the piece under her finger as it grows to full size.
    g.gx = Math.min(a, Math.max(0, (g.sx - canvasLeft) / (P.k * f) - PAD));
    g.gy = Math.min(1, Math.max(0, (g.sy - canvasTop) / (P.k * f) - PAD));
    g.kind = 'drag';
    g.fromTray = true;
    g.members = [{ p, rx: 0, ry: 0 }];
    p.state = 'held';
    p.g = p.id;
    P.trayHole = p;
    lift();
    layoutTray();
  }

  /** Moves the piece(s) into the floating layer so they follow her finger. */
  function lift() {
    gesture.members.forEach(({ p }) => {
      p.el.classList.remove('loose', 'placed', 'snapped', 'settling');
      p.el.classList.add('lifted');
      p.el.style.zIndex = '';
      p.el.style.display = '';
      el.dragLayer.appendChild(p.el);
    });
    gesture.layerRect = el.dragLayer.getBoundingClientRect();
    moveLifted();
  }

  function moveLifted() {
    const g = gesture, k = P.k;
    const baseX = g.x - g.layerRect.left, baseY = g.y - g.layerRect.top;
    g.members.forEach(({ p, rx, ry }) => {
      const left = baseX + (rx - g.gx - PAD) * k;
      const top = baseY + (ry - g.gy - PAD) * k;
      p.el.style.transform = `translate(${left}px, ${top}px)`;
    });
    // Light up the tray when a single piece can be dropped back into it.
    el.tray.classList.toggle('drop-hover', g.members.length === 1 && isOver(el.tray, g.x, g.y));
  }

  function isOver(element, x, y) {
    const r = element.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /** She let go. Where do the piece(s) go? */
  function drop(g) {
    const lead = g.piece;
    const list = g.members.map((m) => m.p);
    list.forEach((p) => p.el.classList.remove('lifted'));
    el.tray.classList.remove('drop-hover');
    P.trayHole = null;   // she's put it down: the tray can close the gap now

    // A single piece dropped on the tray goes back into the tray.
    // (Joined groups stay on the table so her work isn't pulled apart.)
    if (list.length === 1 && isOver(el.tray, g.x, g.y)) {
      lead.state = 'tray';
      lead.g = lead.id;
      el.trayInner.appendChild(lead.el);
      layoutTray();
      scheduleSave();
      return;
    }

    // Work out where it landed, in units.
    const t = el.table.getBoundingClientRect();
    const leadX = (g.x - t.left - P.boardX) / P.k - g.gx;
    const leadY = (g.y - t.top - P.boardY) / P.k - g.gy;
    g.members.forEach(({ p, rx, ry }) => { p.x = leadX + rx; p.y = leadY + ry; });
    const a = P.grid.aspect;

    if (Math.hypot(lead.x - lead.c * a, lead.y - lead.r) <= SNAP_DISTANCE) {
      // 1. The right spot on the board: lock it all in.
      placeOnBoard(list);
    } else {
      // 2. Somewhere else on the table. It stays where she put it…
      const z = ++P.zTop;
      list.forEach((p) => { p.state = 'loose'; p.z = z; putOnTable(p); });
      // …unless it fits against a matching piece, in which case they click together.
      const joined = joinNeighbors(lead.g);
      clampGroup(lead.g);
      const group = groupMembers(lead.g);
      group.forEach((p) => { p.z = z; });
      if (joined) {
        group.forEach((p) => {
          void p.el.offsetWidth;            // glide the last little bit together
          p.el.classList.add('settling');
          putOnTable(p);
          redraw(p);                        // soft seams: they now look like one piece
        });
        celebrateSnap(group);
      } else {
        group.forEach(putOnTable);
      }
    }
    layoutTray();
    scheduleSave();
  }

  /** The happy moment: click, glow, and lock in place. */
  function placeOnBoard(list) {
    const a = P.grid.aspect;
    list.forEach((p) => {
      p.state = 'placed';
      putOnTable(p);                     // start where she dropped it…
      void p.el.offsetWidth;             // (lets the browser notice the start point)
      p.el.classList.add('settling');    // …then glide the last little bit
      p.x = p.c * a;
      p.y = p.r;
      putOnTable(p);
      redraw(p);
    });
    celebrateSnap(list);
    if (P.pieces.every((q) => q.state === 'placed')) finish();
  }

  /** Soft click and a gentle gold glow that fades in about a second. */
  function celebrateSnap(list) {
    list.forEach((p) => {
      p.el.classList.remove('snapped');
      void p.el.offsetWidth;
      p.el.classList.add('snapped');
      clearTimeout(p.glowTimer);
      p.glowTimer = setTimeout(() => p.el.classList.remove('snapped', 'settling'), 1200);
    });
    Sound.snap();
  }

  function finish() {
    P.done = true;
    P.edgeOnly = false;
    showEdgeState();
    saveNow();
    if (callbacks.onFinished) callbacks.onFinished();
    setTimeout(() => {
      Sound.celebrate();
      el.donePanel.hidden = false;
    }, 600);
  }

  // Smooth "coasting" after a quick flick of the tray.
  function startMomentum(velocity) {
    stopMomentum();
    let v = velocity, last = performance.now();
    if (Math.abs(v) < 0.1) return;
    const step = (now) => {
      const dt = now - last; last = now;
      const before = getScroll();
      setScroll(before - v * dt);
      v *= Math.pow(0.994, dt);
      if (Math.abs(v) > 0.02 && getScroll() !== before) momentumFrame = requestAnimationFrame(step);
      else { momentumFrame = null; scheduleSave(); }
    };
    momentumFrame = requestAnimationFrame(step);
  }
  function stopMomentum() {
    if (momentumFrame) cancelAnimationFrame(momentumFrame);
    momentumFrame = null;
  }

  // ===================================================================
  // The picture window ("Peek at Picture")
  //   - opens big, over the board
  //   - drag it with one finger to move it
  //   - "Bigger" / "Smaller" buttons, or pinch with two fingers
  //   - "Hide" (or the toolbar button) puts it away; it opens big again next time
  // ===================================================================

  /** The area the window must stay inside (below the toolbar), relative to the screen. */
  function peekArea() {
    const s = el.screenPuzzle.getBoundingClientRect();
    const r = el.play.getBoundingClientRect();
    return { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height, sLeft: s.left, sTop: s.top };
  }
  function peekAspect() { return P.boardCanvas.width / P.boardCanvas.height; }
  function peekHeight(w) { return w / peekAspect() + PEEK_BAR + 8; }
  function peekMaxWidth() {
    const area = peekArea();
    return Math.max(PEEK_MIN_WIDTH, Math.min(area.width - 16, (area.height - 16 - PEEK_BAR - 8) * peekAspect()));
  }

  function showPeek() {
    if (!P) return;
    // Start big, centered over the board.
    const area = peekArea();
    const board = el.board.getBoundingClientRect();
    const w = peekMaxWidth();
    P.peek = {
      w,
      x: board.left - area.sLeft + board.width / 2 - w / 2,
      y: board.top - area.sTop + board.height / 2 - peekHeight(w) / 2,
    };
    drawPeekPicture();
    placePeek();
    el.peekWindow.hidden = false;
    el.toolPeek.setAttribute('aria-pressed', 'true');
    el.toolPeek.querySelector('.label').textContent = 'Hide Picture';
  }

  function drawPeekPicture() {
    const bc = P.boardCanvas;
    el.peek.width = bc.width;
    el.peek.height = bc.height;
    el.peek.getContext('2d').drawImage(bc, 0, 0);
  }

  /**
   * Keeps the window a sensible size, then shows it.
   * It may hang off the left, right, or bottom edge (so she can see just part
   * of the picture), but a strip always stays on screen so she can grab it
   * back. It never goes up over the toolbar.
   */
  function placePeek() {
    const area = peekArea(), pk = P.peek;
    pk.w = Math.min(peekMaxWidth(), Math.max(PEEK_MIN_WIDTH, pk.w));
    pk.x = Math.min(area.left + area.width - PEEK_KEEP, Math.max(area.left + PEEK_KEEP - pk.w, pk.x));
    pk.y = Math.min(area.top + area.height - PEEK_KEEP, Math.max(area.top + 4, pk.y));
    el.peekWindow.style.width = pk.w + 'px';
    el.peekWindow.style.transform = `translate(${pk.x}px, ${pk.y}px)`;
  }

  /** Bigger / Smaller buttons: change size, keeping the middle in the same place. */
  function resizePeek(factor) {
    if (!P || !P.peek) return;
    const pk = P.peek;
    const cx = pk.x + pk.w / 2, cy = pk.y + peekHeight(pk.w) / 2;
    pk.w = Math.min(peekMaxWidth(), Math.max(PEEK_MIN_WIDTH, pk.w * factor));
    pk.x = cx - pk.w / 2;
    pk.y = cy - peekHeight(pk.w) / 2;
    placePeek();
  }

  function hidePeek() {
    if (P) P.peek = null;
    peekFingers.clear();
    el.peekWindow.hidden = true;
    el.peek.width = 0;
    el.toolPeek.setAttribute('aria-pressed', 'false');
    el.toolPeek.querySelector('.label').textContent = 'Peek at Picture';
  }

  // Moving and pinching the picture window.
  const peekFingers = new Map();
  let peekStart = null;
  function beginPeekGesture() {
    const pts = [...peekFingers.values()];
    peekStart = {
      x: P.peek.x, y: P.peek.y, w: P.peek.w,
      pts: pts.map((p) => ({ x: p.x, y: p.y })),
      dist: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
    };
  }
  function peekPointerDown(e) {
    if (!P || !P.peek) return;
    e.preventDefault();
    try { el.peek.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    peekFingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    beginPeekGesture();
  }
  function peekPointerMove(e) {
    if (!P || !P.peek || !peekFingers.has(e.pointerId)) return;
    peekFingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...peekFingers.values()], s = peekStart;
    if (pts.length >= 2 && s.dist > 0) {
      // Two fingers: pinch to resize around the point between the fingers.
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const w = Math.min(peekMaxWidth(), Math.max(PEEK_MIN_WIDTH, s.w * dist / s.dist));
      const ratio = w / s.w;
      const midX0 = (s.pts[0].x + s.pts[1].x) / 2, midY0 = (s.pts[0].y + s.pts[1].y) / 2;
      const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
      P.peek.w = w;
      P.peek.x = midX - (midX0 - s.x) * ratio;
      P.peek.y = midY - (midY0 - s.y) * ratio;
    } else {
      // One finger: move it.
      P.peek.x = s.x + (pts[0].x - s.pts[0].x);
      P.peek.y = s.y + (pts[0].y - s.pts[0].y);
    }
    placePeek();
  }
  function peekPointerUp(e) {
    if (!peekFingers.has(e.pointerId)) return;
    peekFingers.delete(e.pointerId);
    if (P && P.peek && peekFingers.size) beginPeekGesture(); // carry on smoothly with the finger left
  }

  // ===================================================================
  // Other toolbar buttons
  // ===================================================================

  // Edge Pieces Only: the tray shows only edge pieces. Tap again to show all.
  function toggleEdges() {
    if (!P) return;
    P.edgeOnly = !P.edgeOnly;
    showEdgeState();
    setScroll(0);
    layoutTray();
    scheduleSave();
  }
  function showEdgeState() {
    const on = !!(P && P.edgeOnly);
    el.toolEdges.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.toolEdges.querySelector('.label').textContent = on ? 'Show All Pieces' : 'Edge Pieces Only';
  }

  // Tidy Up: every single loose piece goes back into the tray, and the tray
  // is sorted with edge pieces first. Pieces she has joined together stay
  // on the table, so her work is never pulled apart.
  function tidyUp() {
    if (!P) return;
    P.pieces.forEach((p) => {
      if (p.state === 'loose' && !looksJoined(p)) {
        p.state = 'tray';
        p.g = p.id;
        el.trayInner.appendChild(p.el);
      }
    });
    const edgesFirst = P.order.filter((i) => P.pieces[i].isEdge);
    const middles = P.order.filter((i) => !P.pieces[i].isEdge);
    P.order = edgesFirst.concat(middles);
    stopMomentum();
    setScroll(0);
    layoutTray();
    scheduleSave();
  }

  function toggleSound() {
    Sound.setOn(!Sound.isOn());
    showSoundState();
  }
  function showSoundState() {
    const on = Sound.isOn();
    el.toolSound.classList.toggle('is-off', !on);
    el.toolSound.querySelector('.label').textContent = on ? 'Sound On' : 'Sound Off';
  }

  // ===================================================================
  // Saving (happens automatically, a moment after every change)
  // ===================================================================
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    if (!P) return;
    const codes = { loose: 'l', placed: 'p' }; // anything else (tray, held) saves as tray
    const rec = P.rec;
    rec.pieces = P.pieces.map((p) => {
      let s = codes[p.state] || 't';
      // A piece being held right now is saved where it was picked up from.
      if (p.state === 'held' && gesture && !gesture.fromTray) s = 'l';
      return {
        s,
        x: Math.round(p.x * 1000) / 1000,
        y: Math.round(p.y * 1000) / 1000,
        z: p.z,
        g: s === 't' ? p.id : p.g,
      };
    });
    rec.order = P.order.slice();
    rec.edgeOnly = P.edgeOnly;
    rec.done = P.done;
    rec.trayScroll = getScroll();
    rec.updated = Date.now();
    Store.putPuzzle(rec).catch(() => { /* try again on the next change */ });
  }

  return { init, open, close };
})();
