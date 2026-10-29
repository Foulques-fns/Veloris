# VELORIS — a complete full-stack AI assistant

A production-grade AI workspace built with **Next.js 16 (App Router) + PostgreSQL + Drizzle ORM**, powered by **free, open models via [Pollinations](https://gen.pollinations.ai)**.

![stack](https://img.shields.io/badge/Next.js-16-black) ![db](https://img.shields.io/badge/PostgreSQL-Drizzle-blue) ![ai](https://img.shields.io/badge/AI-Pollinations_free_tier-purple)

---

## What's inside

| Area | Features |
|---|---|
| **AI Chat** | Streaming responses · conversation history, search, rename, delete · live model selector (only **free-verified** models) · Markdown + code highlighting + tables + copy buttons · file upload & document analysis · image understanding & chat-vision · custom instructions & assistant personalities · regenerate · edit & resend · per-model advanced params (temperature, top-p, max tokens, reasoning effort — only enabled when the model supports them) · read-aloud replies · voice input |
| **Images** | Text-to-image, **image editing & image-to-image** (models that accept image inputs: MAI Image 2.6, MAI Image 2.6 Flash, FLUX.2 Klein 4B, FLUX.1 Kontext Pro) · aspect ratio & quality · seeds · image analysis (vision) · download & regenerate · strict daily quota (FREE: 5/day, enforced server-side) |
| **Audio** | Text-to-speech (OpenAI TTS-1 / TTS-1 HD / MAI-Voice 2.1 & Flash) · 100+ voices · 23 languages · playback & download · transcription of uploads or mic recordings (MAI Transcribe 2 / Whisper v3) |
| **Video** | Availability-aware studio: activates automatically when a **free** Pollinations video model exists. Paid video models are **never** used as fallback (currently none are free, so the studio shows a live-catalog standby state). |
| **Accounts** | Email + password registration · 6-digit email-verification codes (10 min TTL, attempt-limited) · login/logout · password reset via email code · scrypt password hashing · httpOnly session cookies · per-endpoint rate limiting |
| **Plans** | FREE / PREMIUM / ULTRA with per-plan daily quotas (chat, images, speech, transcription) — **configurable from the admin panel** · per-user image-cap overrides |
| **Admin** | Secure console (`/admin`): live stats & 14-day usage charts · user search/manage, plan & role changes, quota overrides, force-logout, delete · daily limit and feature switches · live free-model registry with enable/disable toggles · API error monitor |

## Verified model catalog (fetched live at runtime)

The app queries the official catalog endpoints and hard-filters `paid_only === false`:

- `/image/models` → FLUX.1 Schnell, FLUX 1.1 Pro, FLUX.1 Kontext Pro, FLUX.2 Klein 4B, MAI Image 2.6 (+Flash), Z-Image Turbo, DreamShaper 8 LCM …
- `/v1/models` → free text/vision models (OpenAI GPT family, Mistral Large, DeepSeek, GLM, Kimi, etc.)
- `/audio/models` → TTS-1, TTS-1 HD, MAI-Voice 2.1 (+Flash), MAI Transcribe 2, Whisper Large v3
- `/video/models` → currently **all paid** → video studio stays in standby

API calls use the documented endpoints with `Authorization: Bearer ‹key›`:

- Chat: `POST /v1/chat/completions` (SSE streaming)
- Images: `POST /v1/images/generations` and `POST /v1/images/edits` (multipart)
- Speech: `POST /v1/audio/speech`
- Transcription: `POST /v1/audio/transcriptions` (multipart)
- Video (when free): `GET /video/{model}`-style `/image/{prompt}?model=…&duration=…`

---

## Getting started

### 1. Prerequisites
- Node.js 20+
- A PostgreSQL database
- A free Pollinations API key → <https://gen.pollinations.ai> (keys start with `sk_`)

### 2. Configure

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `POLLINATIONS_API_KEY` | **Secret — server only.** Your `sk_` key. Never prefixed with `NEXT_PUBLIC_`. |
| `SESSION_SECRET` | Long random string (`openssl rand -hex 32`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Outgoing mail for verification & reset codes |
| `SMTP_SECURE` | `true` for port 465, otherwise `false` (STARTTLS, e.g. 587) |
| `APP_BASE_URL` | Public base URL (used in emails) |
| `ADMIN_EMAIL` | The verified address that receives the ADMIN role (default `foulques.fns1@gmail.com`) |
| `AUTH_DISABLED` | `true` = **open mode, no login screens** — every visitor is the guest admin (`OPEN_USER_EMAIL`, ULTRA plan). `false` = full auth. Temporarily enabled in this deployment. |
| `OPEN_USER_EMAIL` / `OPEN_USER_NAME` | Identity of the guest account used in open mode |
| `COOKIE_SECURE` | Override session-cookie policy (default: Secure/SameSite=None/Partitioned in production, Lax in dev) |

> **No SMTP yet?** The app still works: verification/reset codes are printed to the server console and surfaced in the UI in dev mode until you configure SMTP.

### 3. Install, migrate, run

```bash
npm install
npx drizzle-kit push        # creates all tables
npm run dev                 # http://localhost:3000
# production: npm run build && npm start
```

### 4. Create the admin account

1. Register with `foulques.fns1@gmail.com` (or whatever `ADMIN_EMAIL` is).
2. Complete email verification.
3. The backend assigns `role = admin` **only** to that verified address — role changes are never trusted from the client.
4. Open **/admin** from the user menu.

### 5. Raise image limits / upgrade users

Admin console → **Users**: change a user's plan to PREMIUM/ULTRA, or set an individual *image cap override*.
Admin console → **Limits & models**: edit per-plan daily quotas, flip feature switches, enable/disable free models.

---

## Security model

- Passwords: `scrypt` (salted) via Node `crypto`.
- Tokens (session, verification, reset): SHA-256 hashed before storage; codes expire in 10 minutes; max 8 wrong attempts; codes are one-time.
- Rate limiting on auth endpoints (IP + email sliding window).
- Admin authorization is enforced in every `/api/admin/*` route by re-reading the role from the DB session.
- AI quotas are enforced server-side before any provider call; generation calls validate the model against the live **free** catalog — paid models can never be reached.
- The Pollinations key only exists in server-side code paths.

## Project structure

```
src/
  app/
    api/           # auth, chat (SSE), conversations, messages, files,
                   # images (+analyze), audio (tts/transcribe), video, models, admin/*
    (auth)/        # login / register / verify / forgot / reset
    chat, images, audio, video, settings, pricing, admin
  components/      # ChatApp, ImageStudio, AudioStudio, VideoStudio, AdminApp, …
  db/              # Drizzle schema + client
  lib/             # session, auth, email, quotas, model registry, Pollinations client
```
