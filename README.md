# Grammy's Puzzles

A calm jigsaw puzzle app for the iPad. No ads, no accounts, no timers, no scores.
It works offline once installed on the Home Screen.

---

## Part 1 — Put it on GitHub and publish it (free)

You only do this once. It takes about 15 minutes. Use a Mac with **Chrome** or **Safari**.

### A. Create the repository (the project's home on GitHub)

1. Go to **https://github.com** and sign in.
2. In the top-right corner, click the **+** button, then click **New repository**.
3. In **Repository name**, type: `grammys-puzzles`
4. Leave **Public** selected. Free GitHub Pages sites have to be public. The app is
   public, but her photos are not: they never leave her iPad.
5. Do **not** tick "Add a README file". This folder already has one.
6. Click the green **Create repository** button at the bottom.

### B. Upload the files

1. On the new, mostly empty page, find the sentence that says
   "…or **uploading an existing file**". Click the words **uploading an existing file**.
2. On your Mac, open **Finder** → **Documents** → **grandma-puzzles**.
3. Click once on any file in that window, then press **⌘ Command + A** to select everything.
   You should see these folders and files selected:
   `css`, `icons`, `js`, `pictures`, `CREDITS.md`, `index.html`, `manifest.webmanifest`,
   `README.md`, `sw.js`.
4. Drag the selected items into the box on the GitHub page that says
   "Drag files here to add them to your repository".
5. Wait until the list of files stops growing (about 30 files).
   - If the folders didn't upload and only the loose files appear, try again in **Google Chrome**.
     It handles dragging folders best.
6. Scroll down. Click the green **Commit changes** button.
   ("Commit" just means "save this version".)

### C. Turn on the free website (GitHub Pages)

1. Near the top of your repository page, click **⚙ Settings**. It's the last tab in the row
   that starts with "Code".
2. In the left-hand menu, click **Pages**.
3. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
4. Under **Branch**, click the dropdown that says **None** and choose **main**. Leave the
   folder as **/ (root)**. Click **Save**.
5. Wait 1–3 minutes, then refresh the page. A box at the top will say
   **"Your site is live at https://YOUR-USERNAME.github.io/grammys-puzzles/"**.
   That web address is her app. Click **Visit site** to check that it opens.

---

## Part 2 — Install it on her iPad

Do this on her iPad, connected to Wi-Fi.

1. Open **Safari**. It has to be Safari: Chrome on iPad can't install home-screen apps the same way.
2. Tap the address bar, type the web address from Part 1C, and tap **Go**.
3. Wait until the "Grammy's Puzzles" home screen appears.
4. Tap the **Share** button. On iPad it's at the **top right**, next to the address bar:
   a square with an arrow pointing up.
5. In the menu that opens, scroll down and tap **Add to Home Screen**.
6. You'll see the name **Grammy's Puzzles**. The iPad may shorten long names under the icon
   (for example "Grammy's Puzz…"). If you prefer, change the name here to something shorter,
   such as **Puzzles**.
7. Tap **Add** (top right). The green puzzle-piece icon appears on her Home Screen.
8. **Open the app from the new icon once while still on Wi-Fi.** Tap **Choose a Puzzle**, then
   wait about 10 seconds. That saves everything on the iPad for offline use.
9. To check that it works offline: turn on **Airplane Mode**, close the app, and open it again
   from the icon. It should open normally. Then turn Airplane Mode off.

**Important:**
- Always use the **Home Screen icon**, not the Safari tab. The icon version keeps its own
  saved puzzles and photos.
- If the icon is ever **deleted**, her saved progress and added photos are deleted with it.
  The photos are still safe in her Photos app and can be added again.

### Sound

The snap "click" and the celebration chime come on after her first tap.
If she hears nothing:
- Swipe down from the **top-right corner** of the screen to open **Control Center**.
  Make sure the **bell** icon is not crossed out (silent mode), and turn the **volume** up.
- Check that the app's button says **Sound On**.

---

## Part 3 — Making changes later

1. Change the files on your Mac.
2. Open `sw.js` and change `const VERSION = 'v1';` to `'v2'` (then `'v3'` next time, and so on).
   **This step matters.** Without it, the iPad keeps showing the old saved copy.
3. On GitHub, open the repository, click **Add file** → **Upload files**, drag in the changed
   files (keep the same folder structure), and click **Commit changes**.
4. On the iPad, open the app with internet, close it, and open it again.
   The new version loads on the second opening.

Her saved puzzles and photos are kept through updates.

---

## Privacy

- No ads, tracking, accounts, or analytics. The app never contacts any server after installing.
- Photos she adds are shrunk and stored **only on her iPad**, inside the app.
  They are never uploaded and never become files in this project, so they can't end up on GitHub.
- `.gitignore` is an extra safety net that tells GitHub tools to ignore common photo files,
  in case anyone ever copies photos into this folder. Even so, **never put family photos in
  this folder.**

## Picture credits

See [CREDITS.md](CREDITS.md). All built-in pictures are from Wikimedia Commons under
Creative Commons licenses that allow this use with credit.

---

## For whoever maintains this: how the code is organized

| File | What it does |
|---|---|
| `index.html` | The page, with the 4 screens: home, choose, start, puzzle |
| `css/style.css` | Colors, sizes, and layout. Colors are at the top. |
| `js/storage.js` | Saving progress and photos on the iPad (IndexedDB) |
| `js/sound.js` | The snap click and celebration chime, made with Web Audio |
| `js/pieces.js` | Cutting a picture into classic jigsaw shapes |
| `js/puzzle.js` | The puzzle screen: dragging, snapping, tray, Peek, Edges, Tidy |
| `js/app.js` | Switching screens, the picture list, adding and removing photos |
| `sw.js` | Offline support (the list of files to save, and the version number) |
| `manifest.webmanifest` | Home Screen name and icon |
| `pictures/` | Built-in pictures, with small previews in `pictures/thumbs/` |

How pieces behave:
- A piece (or a joined group) dropped near its correct spot on the board locks in with a soft click and a gold glow.
- Two loose pieces that fit together click together wherever they are on the table, and from then on move as one.
- **Tidy Up Pieces** sends single loose pieces back to the tray. Joined groups stay on the table, so her work is never pulled apart.
- **Peek at Picture** opens a picture window. Drag it with one finger to move it. It can hang partly off the left, right, or bottom edge to show just part of the picture, and a strip always stays on screen to grab. Use **Bigger**/**Smaller**, or pinch with two fingers, to resize it. **Hide** puts it away, and it always opens big again next time. Its three buttons are deliberately smaller than the rest of the app, so the picture gets more room.

Handy settings to tweak:
- `SNAP_DISTANCE` in `js/puzzle.js`: how close a piece must be to its board spot to lock in (0.45 = about half a piece).
- `JOIN_DISTANCE` in `js/puzzle.js`: how close two matching pieces must be to click together.
- `PEEK_MIN_WIDTH` and `PEEK_STEP` in `js/puzzle.js`: the picture window's smallest size, and how much Bigger/Smaller change it.
- `PEEK_KEEP` in `js/puzzle.js`: how many pixels of the picture window always stay on screen when it's dragged off an edge.
- `VOLUME` in `js/sound.js`: overall loudness. The snap note itself is in the `snap()` function there.

To try it on a Mac: in Terminal, run `python3 -m http.server 8123` inside this folder, then open
http://localhost:8123 in a browser.
