# uniplayOs

<img src="./public/assets/logo-wordmark.svg" alt="UniplayOS" width="220">

Universal media player engine. Handles video, audio, HLS, DASH, and embeds through a unified resolver and proxy layer.

**Live:** [uniplayos.web.id](https://www.uniplayos.web.id)
**Player:** [uniplayos.web.id/player.html](https://www.uniplayos.web.id/player.html)
**Embed:** `https://www.uniplayos.web.id/embed.js`

## Project Structure

```text
uniplayos/
├── index.js
├── proxy.js
├── embed.js
├── package.json
├── .gitignore
├── .env.example
├── vercel.json
├── README.md
└── public/
    ├── index.html
    ├── player.html
    ├── test.html
    ├── downloads.html
    ├── settings.html
    ├── explorer.html
    └── js/
        └── utils/
            ├── utils.js
            ├── storage.js
            ├── api.js
            ├── resolver.js
            └── download.js
                └── assets/
                    └──logo-wordmark.svg
```

## Requirements

- Node.js 18+
- npm

## Setup

```bash
npm install
npm run dev
```

Server runs on `http://localhost:3000` by default.

## Testing

Go to `http://localhost:3000/test.html` — this is the dev testing page.

Paste any media URL into the input and hit Load. The panel shows:

- what the resolver detected (type, extension, whether it goes through the proxy)
- the resolved/proxy URL
- live playback state (buffering, stalled, errors, resolution, duration)
- a timestamped log of every event

**Proxy ping** — use the bottom input to test if a URL can be fetched through the proxy without loading it into the player.

### What works

- Direct video files (mp4, webm, etc.)
- HLS streams (.m3u8)
- DASH streams (.mpd)
- YouTube and Vimeo (embedded via iframe, with thumbnail preview for YouTube)

### What doesn't

- TikTok, Instagram, Facebook — their video URLs are signed and loaded dynamically, can't be extracted without a headless browser or yt-dlp or something similar

## Player

`http://localhost:3000/player.html` — the actual player. Accepts a `?url=` param so you can deep-link directly into it:

```
http://localhost:3000/player.html?url=https://example.com/video.mp4
```

## Embed

Drop this into any page to embed the player:

```html
<script src="http://localhost:3000/embed.js"></script>
```

## Cloudflare Worker proxy (optional)

Some target sites block requests based on IP range. To bypass that, requests can be routed through a Cloudflare Worker that acts as an egress proxy — separate repo, `UniplayOsproxy`.

Set `CF_WORKER_URL` in `.env` (see `.env.example`) once deployed:

```
CF_WORKER_URL=https://uniplay-proxy.your-subdomain.workers.dev
```

Without this variable set, the app proxies directly as normal — this is purely an optional egress layer.

Deploy steps and details live in the `UniplayOsproxy` repo README.
