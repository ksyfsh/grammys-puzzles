/* =====================================================================
   app.js — moving between screens, the picture list, and her photos.

   This file also:
   - stops iPad Safari from zooming, scrolling, or selecting text by accident
   - turns on offline mode (the "service worker", see sw.js)
   - re-opens the puzzle she was in if the app was closed mid-puzzle
   ===================================================================== */

const App = (() => {
  // ---- The built-in pictures. Files live in the "pictures" folder. ----
  // To add or swap a picture: put the .jpg in pictures/ and a small copy in
  // pictures/thumbs/, add a line here, and add both files to sw.js.
  const BUILT_IN = [
    { id: 'b-tulips', name: 'Pink Tulips', file: 'tulips.jpg' },
    { id: 'b-farm-garden', name: 'Farm Garden', file: 'farm-garden.jpg' },
    { id: 'b-white-rose', name: 'White Rose', file: 'white-rose.jpg' },
    { id: 'b-waxwing', name: 'Cedar Waxwing', file: 'waxwing.jpg' },
    { id: 'b-bluebird', name: 'Bluebird', file: 'bluebird.jpg' },
    { id: 'b-calico-cat', name: 'Calico Cat', file: 'calico-cat.jpg' },
    { id: 'b-kitten', name: 'Ginger Kitten', file: 'kitten.jpg' },
    { id: 'b-yarn', name: 'Rainbow Yarn', file: 'yarn.jpg' },
    // Added November 2026
    { id: 'b-robin', name: 'Robin', file: 'robin.jpg' },
    { id: 'b-blue-tit', name: 'Blue Tit', file: 'blue-tit.jpg' },
    { id: 'b-geese', name: 'Geese in Flight', file: 'geese.jpg' },
    { id: 'b-giraffes', name: 'Three Giraffes', file: 'giraffes.jpg' },
    { id: 'b-elephants', name: 'Elephants at the Water', file: 'elephants.jpg' },
    { id: 'b-zebra', name: 'Zebra', file: 'zebra.jpg' },
    { id: 'b-red-panda', name: 'Red Panda', file: 'red-panda.jpg' },
    { id: 'b-giant-panda', name: 'Giant Panda', file: 'giant-panda.jpg' },
  ];
  const COUNTS = [24, 48, 70, 100, 150];

  const $ = (id) => document.getElementById(id);
  let tempUrls = [];   // temporary picture links we must tidy up later

  // ===================================================================
  // Screens
  // ===================================================================
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== 'screen-' + name; });
    if (name !== 'puzzle') Store.setPref('resume', null);
  }

  function showMessage(id, text) {
    const box = $(id);
    box.textContent = text || '';
    box.hidden = !text;
  }

  function freeTempUrls() {
    tempUrls.forEach((u) => URL.revokeObjectURL(u));
    tempUrls = [];
  }

  function goHome(message) {
    freeTempUrls();
    show('home');
    showMessage('home-message', message || '');
  }

  // ===================================================================
  // Choose a Puzzle screen
  // ===================================================================
  // The Choose screen shows one of three lists:
  //   'main'     — pictures she hasn't finished (new or in progress)
  //   'finished' — pictures whose puzzle she has completed
  //   'putaway'  — built-in pictures she has hidden ("Put Away")
  // Nothing is ever deleted by moving between these lists.
  let chooseMode = 'main';

  // ---- Put Away: a small saved list of built-in picture ids she has hidden ----
  function putAwayIds() {
    const list = Store.getPref('putAway', []);
    return Array.isArray(list) ? list : [];
  }
  function isPutAway(id) { return putAwayIds().includes(id); }
  function setPutAway(id, away) {
    const set = new Set(putAwayIds());
    if (away) set.add(id); else set.delete(id);
    Store.setPref('putAway', [...set]);
  }

  async function showChoose(message, mode = 'main') {
    freeTempUrls();
    chooseMode = mode;
    show('choose');
    showMessage('choose-message', message || '');
    const inFolder = mode !== 'main';
    $('choose-title').textContent = { main: 'Choose a Puzzle', finished: 'Finished Puzzles', putaway: 'Put Away Pictures' }[mode];
    $('choose-back-label').textContent = inFolder ? 'Back' : 'Home';
    // (Icons are SVG drawings, which need the "hidden" attribute set directly.)
    document.querySelector('#choose-back .icon-home').toggleAttribute('hidden', inFolder);
    document.querySelector('#choose-back .icon-back').toggleAttribute('hidden', !inFolder);
    $('choose-scroll').scrollTop = 0;
    await renderChoose();
  }

  async function renderChoose() {
    const mode = chooseMode;
    const puzzles = await Store.getAllPuzzles().catch(() => []);
    const status = new Map(puzzles.map((p) => [p.pictureId, p.done ? 'done' : 'going']));
    const away = new Set(putAwayIds());

    // Which list does each picture belong in?
    const listFor = (id, builtIn) => {
      if (builtIn && away.has(id)) return 'putaway';
      return status.get(id) === 'done' ? 'finished' : 'main';
    };

    const builtins = BUILT_IN.filter((pic) => listFor(pic.id, true) === mode);
    $('builtin-grid').replaceChildren(...builtins.map((pic) => makeCard({
      id: pic.id, name: pic.name, thumb: 'pictures/thumbs/' + pic.file,
      status: mode === 'main' ? status.get(pic.id) : null,
      bringBack: mode === 'putaway',
    })));
    $('builtin-title').hidden = builtins.length === 0;

    const allPhotos = await Store.getAllPhotos().catch(() => []);
    allPhotos.sort((a, b) => a.added - b.added);
    const photos = allPhotos.filter((photo) => listFor(photo.id, false) === mode);
    $('photo-grid').replaceChildren(...photos.map((photo) => {
      const url = URL.createObjectURL(new Blob([photo.thumb], { type: 'image/jpeg' }));
      tempUrls.push(url);
      return makeCard({
        id: photo.id, name: photoName(photo), thumb: url,
        status: mode === 'main' ? status.get(photo.id) : null, removable: true,
      });
    }));
    const noPhotosYet = mode === 'main' && allPhotos.length === 0;
    $('photo-title').hidden = photos.length === 0 && !noPhotosYet;
    $('no-photos').hidden = !noPhotosYet;

    // A short note at the top of each folder.
    let hint = '';
    if (mode === 'finished') hint = builtins.length + photos.length
      ? 'Puzzles you have finished. Tap one to do it again.' : 'No finished puzzles yet.';
    if (mode === 'putaway') hint = builtins.length
      ? 'Pictures you put away. Tap “Bring Back” to return one to the list.' : 'Nothing is put away right now.';
    $('folder-hint').textContent = hint;
    $('folder-hint').hidden = !hint;

    // On the main list: big buttons to open the folders (only if they have something in them).
    const folderButtons = [];
    if (mode === 'main') {
      const finishedCount = BUILT_IN.filter((p) => listFor(p.id, true) === 'finished').length
        + allPhotos.filter((p) => listFor(p.id, false) === 'finished').length;
      const awayCount = BUILT_IN.filter((p) => away.has(p.id)).length;
      if (finishedCount) {
        folderButtons.push(makeButton(`Finished Puzzles (${finishedCount})`, 'btn-secondary',
          () => showChoose('', 'finished')));
      }
      if (awayCount) {
        folderButtons.push(makeButton(`Put Away Pictures (${awayCount})`, 'btn-secondary',
          () => showChoose('', 'putaway')));
      }
    }
    $('folder-buttons').replaceChildren(...folderButtons);
  }

  function photoName(photo) {
    const date = new Date(photo.added).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    return 'Photo added ' + date;
  }

  /** One picture card: a big tappable picture, its name, and a status badge. */
  function makeCard({ id, name, thumb, status, removable, bringBack }) {
    const card = document.createElement('div');
    card.className = 'card';

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'card-pick';
    const img = document.createElement('img');
    img.src = thumb;
    img.alt = '';
    const label = document.createElement('span');
    label.className = 'card-label';
    label.textContent = name;
    if (status) {
      const badge = document.createElement('span');
      badge.className = 'badge' + (status === 'done' ? ' badge-done' : '');
      badge.textContent = status === 'done' ? 'Finished' : 'In progress';
      label.appendChild(badge);
    }
    pick.append(img, label);
    pick.addEventListener('click', () => showStart(id));
    card.appendChild(pick);

    if (removable) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-secondary';
      remove.textContent = 'Remove Photo';
      remove.addEventListener('click', () => askToRemove(card, id));
      card.appendChild(remove);
    }
    if (bringBack) {
      card.appendChild(makeButton('Bring Back', 'btn-primary btn-bring-back', () => {
        setPutAway(id, false);
        showChoose(`“${name}” is back in your list of puzzles.`, 'putaway');
      }));
    }
    return card;
  }

  /** Swaps the Remove button for a clear yes/no question. Nothing is deleted until "Yes". */
  function askToRemove(card, id) {
    const box = document.createElement('div');
    box.className = 'confirm-box';
    const q = document.createElement('p');
    q.textContent = 'Remove this photo from the puzzles? It will still be in your Photos app.';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn btn-danger';
    yes.textContent = 'Yes, Remove It';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn btn-primary';
    no.textContent = 'No, Keep It';
    box.append(q, yes, no);

    const removeButton = card.querySelector('.btn');
    removeButton.replaceWith(box);
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    no.addEventListener('click', () => box.replaceWith(removeButton));
    yes.addEventListener('click', async () => {
      await Store.deletePhoto(id).catch(() => {});
      await Store.deletePuzzle(id).catch(() => {});
      await showChoose('The photo was removed.', chooseMode);
    });
  }

  // ===================================================================
  // Start screen: "How many pieces?" or "Keep Going"
  // ===================================================================

  /** Finds a picture by id. Returns its name and where to load it from. */
  async function findPicture(id) {
    const builtIn = BUILT_IN.find((p) => p.id === id);
    if (builtIn) return { id, name: builtIn.name, src: 'pictures/' + builtIn.file };
    const photo = await Store.getPhoto(id);
    if (!photo) return null;
    const url = URL.createObjectURL(new Blob([photo.data], { type: photo.type || 'image/jpeg' }));
    return { id, name: photoName(photo), src: url, revoke: () => URL.revokeObjectURL(url) };
  }

  async function showStart(id) {
    const pic = await findPicture(id);
    if (!pic) { showChoose(); return; }
    freeTempUrls();
    if (pic.revoke) tempUrls.push(pic.src);
    show('start');
    $('start-title').textContent = pic.name;
    $('start-preview').src = pic.src;
    const rec = await Store.getPuzzle(id).catch(() => null);
    if (rec && !rec.done) showKeepGoing(id, rec);
    else showCountChooser(id, false);
  }

  function makeButton(text, className, onTap) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + className;
    b.textContent = text;
    b.addEventListener('click', onTap);
    return b;
  }

  function paragraph(text, className) {
    const p = document.createElement('p');
    p.className = className;
    p.textContent = text;
    return p;
  }

  function showKeepGoing(id, rec) {
    const placed = rec.pieces.filter((p) => p.s === 'p').length;
    $('start-panel').replaceChildren(
      paragraph('You have this puzzle started.', 'lead'),
      paragraph(`${placed} of ${rec.pieces.length} pieces ${placed === 1 ? 'is' : 'are'} in place.`, 'note'),
      makeButton('Keep Going', 'btn-primary btn-big', () => openPuzzle(id, null)),
      makeButton('Start New Puzzle', 'btn-secondary btn-big', () => showCountChooser(id, true)),
      ...putAwayButton(id),
    );
  }

  /**
   * For built-in pictures: a quieter "Put Away This Picture" button (or
   * "Bring Back This Picture" if it's already put away). Returns a list
   * with zero or one button, so it can be added with "...".
   * Nothing is deleted: put-away pictures wait in the "Put Away Pictures" folder.
   */
  function putAwayButton(id) {
    const pic = BUILT_IN.find((p) => p.id === id);
    if (!pic) return [];
    if (isPutAway(id)) {
      return [makeButton('Bring Back This Picture', 'btn-secondary', () => {
        setPutAway(id, false);
        showChoose(`“${pic.name}” is back in your list of puzzles.`);
      })];
    }
    return [makeButton('Put Away This Picture', 'btn-secondary', () => {
      setPutAway(id, true);
      showChoose(`“${pic.name}” was put away. To bring it back, tap “Put Away Pictures” at the bottom of the list.`);
    })];
  }

  function showCountChooser(id, replacing) {
    let chosen = Store.getPref('count', 70);
    if (!COUNTS.includes(chosen)) chosen = 70;

    const grid = document.createElement('div');
    grid.className = 'count-grid';
    const buttons = COUNTS.map((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-secondary count-btn';
      b.innerHTML = `${n}<small>pieces</small>`;
      b.setAttribute('aria-pressed', String(n === chosen));
      b.addEventListener('click', () => {
        chosen = n;
        buttons.forEach((other, i) => other.setAttribute('aria-pressed', String(COUNTS[i] === n)));
      });
      return b;
    });
    grid.append(...buttons);

    const parts = [paragraph('How many pieces?', 'lead'), grid];
    if (replacing) parts.push(paragraph('Starting a new puzzle will clear the one you have going.', 'note'));
    parts.push(makeButton('Start Puzzle', 'btn-primary btn-big', () => {
      Store.setPref('count', chosen);
      openPuzzle(id, chosen);
    }));
    if (replacing) {
      parts.push(makeButton('Keep My Puzzle', 'btn-secondary btn-big', async () => {
        const rec = await Store.getPuzzle(id);
        if (rec) showKeepGoing(id, rec);
      }));
    } else {
      parts.push(...putAwayButton(id));
    }
    $('start-panel').replaceChildren(...parts);
  }

  // ===================================================================
  // Opening a puzzle
  // ===================================================================
  async function openPuzzle(id, count) {
    const pic = await findPicture(id);
    if (!pic) { goHome(); return; }
    freeTempUrls();
    if (isPutAway(id)) setPutAway(id, false); // playing a put-away picture brings it back
    show('puzzle');
    Store.setPref('resume', id);
    try {
      await PuzzleScreen.open(pic, count);
    } catch (err) {
      console.error(err);
      goHome('Sorry, that puzzle could not be opened.');
    }
  }

  // ===================================================================
  // Add a Photo
  // ===================================================================
  function chooseFromPhotos() {
    const input = $('photo-input');
    input.value = '';
    input.click(); // opens the iPad's photo picker
  }

  async function photosChosen() {
    const files = Array.from($('photo-input').files || []);
    if (!files.length) return; // she cancelled; nothing happens
    showMessage('home-message', 'Adding your photo…');
    let added = 0;
    for (const file of files) {
      try { await addPhoto(file); added++; } catch (err) { console.error(err); }
    }
    if (!added) {
      showMessage('home-message', 'Sorry, that photo could not be opened. Please try a different one.');
      return;
    }
    await showChoose(added === 1
      ? 'Your photo was added. It is under “Your Photos” at the bottom.'
      : `Your ${added} photos were added. They are under “Your Photos” at the bottom.`);
    const scroller = $('choose-scroll');
    scroller.scrollTop = scroller.scrollHeight;
  }

  /** Shrinks a photo and saves it on this iPad only. Nothing is uploaded. */
  async function addPhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await Pieces.loadImage(url);
      const big = await shrink(img, 2048, 0.86);
      const thumb = await shrink(img, 520, 0.8);
      await Store.putPhoto({
        id: 'p-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
        added: Date.now(),
        type: 'image/jpeg',
        data: await big.arrayBuffer(),
        thumb: await thumb.arrayBuffer(),
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function shrink(img, maxSide, quality) {
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        canvas.width = 0;
        if (blob) resolve(blob); else reject(new Error('Could not shrink photo'));
      }, 'image/jpeg', quality);
    });
  }

  // ===================================================================
  // iPad Safari protections
  // ===================================================================
  function protectFromAccidents() {
    // Pinch-zoom (Safari's own gesture events)
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) =>
      document.addEventListener(type, (e) => e.preventDefault(), { passive: false }));
    // Page dragging/bouncing — except inside the picture list, which scrolls.
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1 || !e.target.closest('.scroll-area')) e.preventDefault();
    }, { passive: false });
    // Double-tap zoom, long-press menus, and text selection
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('selectstart', (e) => e.preventDefault());
    document.addEventListener('dragstart', (e) => e.preventDefault());
  }

  // ===================================================================
  // Start-up
  // ===================================================================
  function init() {
    protectFromAccidents();
    PuzzleScreen.init({
      onHome: () => goHome(),
      onChooseAnother: () => showChoose(),
      onFinished: () => Store.setPref('resume', null),
    });

    $('btn-choose').addEventListener('click', () => showChoose());
    $('btn-add-photo').addEventListener('click', chooseFromPhotos);
    $('photo-input').addEventListener('change', photosChosen);
    // The Start screen's "Back" returns to whichever list she came from.
    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.go === 'home') goHome(); else showChoose('', chooseMode);
    }));
    // The Choose screen's top-left button: "Back" inside a folder, "Home" on the main list.
    $('choose-back').addEventListener('click', () => {
      if (chooseMode !== 'main') showChoose(); else goHome();
    });

    Store.askToKeepData();

    // Offline support: only works when the app is served from a web address.
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // If the app was closed in the middle of a puzzle, go straight back to it.
    const resumeId = Store.getPref('resume', null);
    if (resumeId) {
      Store.getPuzzle(resumeId).then((rec) => {
        if (rec && !rec.done) openPuzzle(resumeId, null);
      }).catch(() => {});
    }
  }

  init();
  return { showChoose };
})();
