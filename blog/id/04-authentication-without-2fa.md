# Autentikasi Tanpa Mimpi Buruk 2FA

> **Part 4 dari seri Playwright E2E.**
> [Part 1](/blog-id/01-why-real-websites.md) — Kenapa website beneran lebih baik dari demo app
> [Part 2](/architecture-tour) — Arsitektur dari production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Kenapa pakai fixtures daripada BaseTest

---

## Masalahnya: tiap test run keliatan kayak hacker

Pertama kali gue jalanin Playwright test ke GitHub, semuanya lancar — selama sekitar 30 detik. Terus test runner-nya nampilin log:

```
After login attempt, URL: https://github.com/sessions/verified-device
```

GitHub nandain sesi headless Chromium gue sebagai perangkat yang nggak dikenal (unrecognized device). Kode verifikasi 6 digit udah masuk di inbox email gue. Automated test suite gue malah minta gue ngecek email secara manual. Itu namanya bukan automation — itu script yang butuh babysitter manusia.

Ini masalah autentikasi yang bakal dialami tiap E2E test suite buat website beneran:

| Tantangan                | Kenapa ini penting                                                         |
| ------------------------ | -------------------------------------------------------------------------- |
| **Device verification**  | GitHub nganggep tiap headless browser sebagai perangkat baru               |
| **2FA / 2SV**            | Akun dengan keamanan ekstra nggak bisa cuma login pakai password           |
| **Session expiry**       | Storage state pada akhirnya bakal expired — biasanya jam 3 pagi pas CI run |
| **Test account hygiene** | Lo butuh akun khusus, tapi ngasih full permission itu berisiko             |

Artikel ini bakal bahas solusi yang gue bikin: **pola autentikasi dua kredensial** (two-credential authentication pattern) yang nanganin verifikasi perangkat otomatis, nge-cache sesi di tiap test run, dan sama sekali nggak butuh campur tangan manual.

---

## Pola dua kredensial

Konsep intinya simpel: **login browser dan API call punya tujuan beda, makanya kredensial yang dipake juga beda.**

| Tujuan                                   | Kredensial                            | Pemilik                  |
| ---------------------------------------- | ------------------------------------- | ------------------------ |
| Login browser (lihat board, klik tombol) | `GITHUB_USERNAME` + `GITHUB_PASSWORD` | Akun test khusus         |
| API call (bikin issue, manage project)   | `GITHUB_API_TOKEN`                    | Repo owner (full access) |

Akun test dipake buat login ke browser dan verifikasi state UI. API token dari repo owner dipake buat urusan berat kayak setup dan cleanup data. Dua akun ini bisa (dan idealnya harus) dari akun GitHub yang beda.

```env
# .env — gitignored, nggak pernah di-commit
GITHUB_USERNAME=ekkisyam23
GITHUB_PASSWORD=***
GITHUB_API_TOKEN=ghp_***
```

Ini alasan kenapa pemisahan ini penting:

- **Akun test sama sekali nggak punya permission penting.** Cuma jadi collaborator di satu test repo dan satu kanban board. Kalau credential-nya bocor, impact-nya nol (zero blast radius).
- **API token punya full access**, tapi nggak pernah lewat browser. Cuma dipake khusus lewat REST dan GraphQL di dalam kode fixture — nggak ada halaman login, nggak ada device verification, dan nggak ke-detect sebagai headless browser.
- **Browser nggak pernah tau API token-nya**, dan API nggak pernah tau password browser-nya. Kalau salah satu bocor, yang lain tetep aman.

---

## Cara kerja session di Playwright

Playwright punya mekanisme bawaan buat ini: **storage state**. Waktu lo simpen `page.context().storageState({ path: 'auth/state.json' })`, lo bakal dapet file JSON yang isinya cookie dan localStorage dari browser.

Tiap test berikutnya bisa langsung nge-load state itu:

```typescript
// playwright.config.ts
export default defineConfig({
  globalSetup: './src/config/global-setup.ts',
  use: {
    storageState: 'auth/github.json',
  },
});
```

Script global setup jalan sekali sebelum semua test dimulai. Fungsinya:

1. Ngecek apa `auth/github.json` udah ada — kalau udah, skip proses login sepenuhnya
2. Kalau belum, login ke GitHub pakai kredensial akun test
3. Simpen sesi (session) ke `auth/github.json`
4. Tiap test worker bakal nge-load sesi yang udah di-cache itu

Artinya, proses login penuh (termasuk verifikasi perangkat) cuma kejadian waktu cache-nya nggak ada — pas pertama kali jalanin di mesin baru, pas sesi udah kedaluwarsa, atau abis lo hapus cache secara manual.

---

## Tembok device verification

Bagian tersulit ada di langkah 2. Halaman verifikasi perangkat GitHub bentuknya kayak gini:

```
┌─────────────────────────────────────┐
│ Device verification                 │
│                                     │
│ We just sent your authentication    │
│ code via email to k****@gmail.com   │
│                                     │
│ [Device Verification Code]          │
│                                     │
│ [Verify]                            │
│                                     │
│ Re-send the code                    │
│ Try GitHub Mobile                   │
└─────────────────────────────────────┘
```

Kode bakal masuk ke email dengan format gini:

```
From: GitHub <noreply@github.com>
Subject: [GitHub] Please verify your device

Hey ekkisyam23!

A sign in attempt requires further verification...
Device: Chrome on Linux
Verification code: 454367
```

Solusinya adalah **baca kode verifikasi dari inbox secara terprogram (programmatically)**, terus masukin lagi ke browser. Di sinilah peran **Gmail App Password**.

### Gmail App Passwords

App Password itu token 16 karakter yang bisa lo bikin di Google Account settings (Security → 2-Step Verification → App Passwords). Ini berfungsi layaknya password khusus Gmail buat akses IMAP, tapi nggak ngasih akses ke hal lain di akun lo.

Bikin satu khusus buat "Mail" di opsi "Other (Custom name)" — gue namain punya gue `Playwright E2E Auth`.

```
App password: xxxx xxxx xxxx xxxx
```

Masukin ini ke file `.env` barengan kredensial GitHub:

```env
GMAIL_ADDRESS=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

Jangan pernah hardcode ini. Jangan pernah commit ini. File `.env` udah masuk `.gitignore`.

---

## Nyambungin auto-fetch ke global-setup

Dengan email yang bisa diakses via IMAP, script global setup-nya jadi kayak gini:

```typescript
import { chromium } from '@playwright/test';
import { ImapFlow } from 'imapflow';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
const AUTH_FILE = 'auth/github.json';

async function globalSetup() {
  // Skip kalau udah ke-cache
  if (fs.existsSync(AUTH_FILE)) {
    console.log('✅ Auth state found — skipping login');
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://github.com/login');

  // Masukin kredensial dan submit
  await page.getByLabel('Username or email address').fill(GITHUB_USERNAME);
  await page.getByLabel('Password').fill(GITHUB_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(3000);

  // Nanganin device verification kalau muncul
  if (page.url().includes('/sessions/verified-device')) {
    const code = await fetchVerificationCode(); // baca Gmail via IMAP
    await page.getByLabel('Device Verification Code').fill(code);
    await page.getByRole('button', { name: 'Verify' }).click({ noWaitAfter: true });
    await page.waitForURL('https://github.com/');
  }

  // Simpen sesi buat test run ke depannya
  await page.context().storageState({ path: AUTH_FILE });
  await browser.close();
}
```

Fungsi `fetchVerificationCode()` pakai library **imapflow** — Node.js IMAP client yang langsung ke-integrasi di script tanpa butuh eksternal dependency yang ribet:

```typescript
import { ImapFlow } from 'imapflow';

async function fetchVerificationCode(): Promise<string> {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_ADDRESS!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
    logger: false,
  });

  await client.connect();

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Pencarian raw di Gmail — cocokin persis alamat FROM-nya
      const uids = await client.search({
        gmraw: 'from:(noreply@github.com)',
      });

      if (!uids || uids.length === 0) {
        throw new Error('GitHub verification email not found');
      }

      // Ambil email paling baru
      const latest = uids[uids.length - 1];
      const msg = await client.fetchOne(latest, { source: { maxLength: 100_000 } }, { uid: true });

      if (!msg?.source) throw new Error('Could not read email');

      const src = msg.source.toString();
      // Decode format quoted-printable (GitHub pake encoding =XX)
      const decoded = src.replace(/=([0-9A-F]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      );

      const codeMatch = decoded.match(/Verification code:\s*(\d{6})/);
      if (!codeMatch) throw new Error('Code not found in email');
      return codeMatch[1];
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}
```

Kalau emailnya belum nyampe (GitHub kadang butuh beberapa detik), script ini bakal nge-poll setiap 5 detik maksimal sampai 60 detik sebelum nyerah. Ini bisa di-handle pakai retry loop simpel yang ngelilingin logika pencarian tadi.

### Cuma satu dependency, nol konfigurasi

Nggak perlu install CLI aneh-aneh, nggak perlu setup config file, nggak perlu ngetik shell command buat nyari password. Cuma butuh `npm install --save-dev imapflow` dan taruh Gmail App Password di `.env`.

---

## Output run pertama bakal kayak apa?

```
$ npx playwright test tests/example.spec.ts

✅ Auth state found — skipping login
```

...tunggu, itu **run kedua**. Di run pertama banget, outputnya lebih menarik:

```
📍 Post-login URL: https://github.com/sessions/verified-device
📱 Device verification required — fetching code from Gmail...
✅ Found verification email (ID: 5604) — code: 447991
✅ Device verification passed
✅ GitHub auth saved to auth/github.json

Running 1 test using 1 worker
  ✓  1 [chromium] › example › playwright is configured correctly (596ms)
```

Seluruh flow ini — browser login → nge-detect verifikasi → ngambil kode dari email → masukin kode → lolos verifikasi → simpen sesi → jalanin test — semuanya selesai kurang dari 10 detik dan tanpa campur tangan orang sama sekali.

Setelah itu, semua run berikutnya bakal nge-skip proses login. Sesi yang udah ke-cache di `auth/github.json` bakal di-load langsung sama `storageState` Playwright. Kalau sesinya expired (biasanya abis berhari-hari atau berminggu-minggu), test-nya bakal gagal gara-gara auth error, lo tinggal hapus `auth/github.json`, dan run berikutnya bakal otomatis ngejalanin seluruh flownya lagi dari awal.

---

## Edge case yang kita beresin di tengah jalan

### "Sign in" nyocokin dua elemen

Halaman login GitHub punya tombol submit dan tombol passkey dengan accessible name yang sama:

```typescript
// ❌ Strict mode error — ketemu 2 elemen
page.getByRole('button', { name: 'Sign in' });

// ✅ Nyocokin input submit secara spesifik
page.getByRole('button', { name: 'Sign in', exact: true });
```

Selalu pakai `exact: true` di halaman login GitHub.

### Kode verifikasi kedaluwarsa

Kode verifikasi dari GitHub ini sensitif sama waktu — kedaluwarsa sekitar 15 menit. Polling loop kita ngasih jeda waktu (window) sekitar 45 detik, udah lebih dari cukup buat antisipasi delay pengiriman email dan sangat aman buat masuk dalam batas masa aktif kode tersebut.

### Navigasi halaman pas diklik

Waktu lo masukin kode verifikasi terus nge-klik tombol Verify, GitHub bakal langsung nge-redirect ke halaman utama (home page). Fungsi `click()` bawaan Playwright otomatis nunggu (auto-wait) proses navigasi ini, yang mana bisa timeout kalau redirect-nya terjadi sebelum listener navigasi internalnya click siap. Solusinya gampang, tinggal tambahin `{ noWaitAfter: true }`:

```typescript
await page.getByRole('button', { name: 'Verify' }).click({ noWaitAfter: true });
await page.waitForURL('https://github.com/'); // handle navigasi secara eksplisit
```

---

## Checklist keamanan

| Aturan                           | Implementasi                                              |
| -------------------------------- | --------------------------------------------------------- |
| Jangan pernah commit kredensial  | `.env` masuk ke `.gitignore`                              |
| Jangan pernah hardcode di source | Semua kredensial lewat `process.env`                      |
| Jangan taruh di config files     | `backend.auth.cmd` baca dari `.env` pas runtime           |
| Gunakan akun test khusus         | Zero blast radius (aman banget) kalau kredensial bocor    |
| Pisah browser + API kredensial   | Akun beda, tujuan beda                                    |
| .gitignore auth state            | `auth/*.json` di-gitignored (soalnya isinya cookies sesi) |

---

## Apa keuntungannya?

Setup autentikasi ini nggak bakal kerasa sama siapa aja yang ngejalanin test suite-nya. Mereka tinggal clone repo-nya, tambahin file `.env`, terus jalanin `npx playwright test`. Run pertama bakal nanganin verifikasi perangkat diem-diem di background. Semua run berikutnya tinggal nge-load sesi yang udah ke-cache. Nggak butuh proses manual, nggak perlu ngikutin langkah-langkah di dokumentasi, dan nggak perlu lagi "nanya password ke temen se-tim."

Inilah bedanya test suite yang "secara teori terotomatisasi" sama test suite yang bener-bener jalan sendiri tanpa dijagain (unattended). Tembok device verification biasanya jadi penghalang utama buat sebagian besar project Playwright yang nargetin GitHub. Sekalinya lo ngelewatin ini lewat automation, test suite lo sisanya bisa fokus ke hal yang emang penting — ngetest aplikasinya, bukan berantem sama halaman login.

---

## Selanjutnya

Autentikasi ini cuma sekadar prasyarat. Sekarang setelah kita bisa login dengan lancar dan tetep kondisi login, kerjaan aslinya baru dimulai:

- [Part 5](/blog-id/05-api-and-ui-hybrid-tests) — Ngetest API dan UI di dalam test yang sama
- Part 6 — Visual regression buat website yang bukan di bawah kontrol lo
- Part 7 — Flaky test bukan salah Playwright
- Part 8 — CI/CD buat E2E test yang nyata di skala besar

---

_Part 4 dari seri Playwright E2E. [Cek full repo-nya di sini →](https://github.com/mihaamiharu/playwright-e2e)_
