# 🪙 MelchiorCent

**Ludero's official ledger of the Melchior tax.**
Every question to Melchior, our tech wizard, costs **10 cents**. This single-page mini-game keeps the score:

- 👤 **Enter your name once.** It's remembered in a cookie (plus localStorage) and you can change it any time via the name chip.
- 👆 **Poke Melchior's head** and he'll react with a random tech-support one-liner.
- 🪙 **Pay 10¢** with a short note about what you asked. A coin flies into the *Melchior Fund* jar, his eyes turn into € signs, *ka-ching!*
- 📜 **Live question log.** Everyone sees new questions appear instantly (Server-Sent Events), with toasts and a coin drop.
- 🏆 **Hall of Curiosity**: a leaderboard of the most curious (or most helpless) colleagues.
- 🟢 **Who's online** right now.
- 🎮 **Levels.** The fund unlocks goals: ☕ Coffee → 🥙 Döner → 🍕 Pizza night → … → 🏝️ Early retirement, with a LEVEL UP celebration.
- 🔊 8-bit coin sounds (synthesised in the browser, mute button included), confetti, bouncy animations, reduced-motion friendly.

Brand colours: primary `#09614e`, secondary `#e3cd57`, tertiary `#005c8a`.

> No real money is involved. Settle up in person, preferably in stroopwafels.

---

## 🚀 Quick start

### Docker (recommended)

```bash
docker compose up -d --build
```

Open <http://localhost:3000>. Data is kept in the `melchior-data` volume.

Without compose:

```bash
docker build -t melchiorcent .
docker run -d --name melchiorcent -p 3000:3000 -v melchior-data:/data melchiorcent
```

### Local (Node ≥ 20)

There are **zero npm dependencies**, so there's nothing to install.

```bash
npm start        # or: node server.js
npm run dev      # auto-restart on changes
```

Data is written to `./data/db.json`.

---

## 🗂️ Folder structure

```
melchiorcent/
├── server.js               # Zero-dependency Node server: static files, JSON API, live updates (SSE)
├── package.json
├── Dockerfile              # node:22-alpine, runs as non-root, healthcheck, /data volume
├── docker-compose.yml
├── public/                 # The single page (no build step)
│   ├── index.html          # Markup, including the inline SVG cartoon Melchior
│   ├── favicon.svg
│   ├── css/style.css       # Arcade styling, animations, responsive layout
│   ├── js/app.js           # Game logic: name, donations, live feed, levels, FX, sound
│   └── img/                # Drop custom Melchior artwork here (optional)
├── docs/
│   ├── IMAGE_PROMPTS.md    # How to generate cartoon Melchior art with an image AI
│   └── reference/melchior-photo.webp
└── data/                   # Created at runtime (db.json); git-ignored
```

---

## ⚙️ Configuration

All settings are environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` (`/data` in Docker) | Where `db.json` is stored |
| `CENTS_PER_QUESTION` | `10` | Price per question, in cents (existing questions keep their original price) |
| `COOLDOWN_MS` | `3000` | Minimum time between two payments from the same IP |
| `ADMIN_TOKEN` | *(empty)* | Enables deleting questions via the API. Leave empty to disable. |
| `TRUST_PROXY` | `0` | Set to `1` behind a reverse proxy so the client IP is read from `X-Forwarded-For` |

### Reverse proxy note

Live updates use Server-Sent Events (`/api/stream`). The server already sends `X-Accel-Buffering: no` for Nginx, but make sure your proxy
doesn't buffer or time out long-lived responses. For Nginx: `proxy_buffering off; proxy_read_timeout 1h;`.

---

## 🔌 API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/state?name=Lucas` | Config, totals, leaderboard, your personal stats, who's online, latest 40 questions |
| `GET` | `/api/questions?before=<ts>&limit=40` | Older questions (paging, newest first) |
| `POST` | `/api/questions` | Pay 10¢. Body: `{"name":"Lucas","text":"how do I exit vim?"}` (`text` is optional, max 80 chars) |
| `DELETE` | `/api/questions/:id` | Remove a question. Needs header `X-Admin-Token: <ADMIN_TOKEN>` |
| `GET` | `/api/stream?name=Lucas` | SSE stream with `question`, `delete` and `online` events |
| `GET` | `/healthz` | Health check |

Example: remove a spam entry

```bash
curl -X DELETE -H "X-Admin-Token: $ADMIN_TOKEN" http://localhost:3000/api/questions/<id>
```

Backup: copy `db.json` out of the volume.

```bash
docker cp melchiorcent:/data/db.json ./backup-db.json
```

---

## 🎨 Custom Melchior artwork

The page ships with a vector cartoon Melchior drawn in SVG, including blinking, € eyes, and a poke face.
For a fancier look, generate art with an image AI using [`docs/IMAGE_PROMPTS.md`](docs/IMAGE_PROMPTS.md) and save it as:

```
public/img/melchior-idle.png    # required to switch to custom art
public/img/melchior-happy.png   # optional: shown after a payment
public/img/melchior-poke.png    # optional: shown when poked
```

The server detects the files automatically. With Docker, rebuild the image, or uncomment the `./public/img` volume in `docker-compose.yml`.

---

## 🛠️ Tweaking the fun

- **Goals / levels:** the `GOALS` array at the top of `public/js/app.js`
- **Melchior's one-liners, toasts, placeholders:** `LINES` and `EXAMPLE_PLACEHOLDERS` in the same file
- **Colours:** the CSS variables at the top of `public/css/style.css`

## 🔒 Notes

- Names are not authenticated. This is a trust-based office game, not a bank.
- All user text is rendered with `textContent` (no HTML injection), and a strict Content-Security-Policy is sent.
- Storage is a single JSON file written atomically. That's plenty for thousands of questions. If Ludero hires 500 people, swap it for SQLite.

---

Made with 🪙 by **Ludero**
