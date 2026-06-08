# Kenapa Lo Harus Test Pakai Website Beneran (Bukan Demo App)

> **Seri tutorial buat QA automation engineer yang pengen ngetest beneran.**
>
> Part 1 dari 8 — [Lihat full repo →](https://github.com/mihaamiharu/github-projects-e2e)

---

## Jebakan Demo App

Kebanyakan tutorial Playwright tuh ngelakuin hal yang sama: pakai TodoMVC atau SauceDemo terus bilang "tuh kan, E2E testing itu gampang." Ya emang gampang — kalau semua button punya `data-testid`, setiap halaman load dalam 200ms, dan nggak ada yang ngubah DOM di Jumat sore.

Masalahnya bukan karena demo app itu jelek. Masalahnya, mereka ngasih lo **rasa percaya diri palsu**.
Lo nulis 50 test yang hijau (passing), deploy ke production, dan deploy pertama langsung bikin 30 test gagal cuma gara-gara nggak ada yang ngasih tau lo soal hashed CSS class names.

Seri ini beda. Kita bakal bikin Playwright test suite ke **website production beneran** — GitHub, Wikipedia, Hacker News. Website yang kondisinya kayak gini:

- CSS class-nya bentuknya kayak `Box-sc-g0xbh4-0 gWHNVC` dan ganti tiap kali deploy
- Kontennya load perlahan (progressive) lewat beberapa request yang beda-beda
- Ada rate limit yang siap nge-block lo
- Two-factor authentication (2FA) yang nggak bisa diotomatisasi

Kendala-kendala ini bukan halangan. **Ini materi utamanya.**

---

## 4 Hal yang Lo Pelajari dari Website Beneran (Yang Gak Ada di Demo App)

### 1. CSS selector itu jebakan

Buka halaman login GitHub terus inspect tombol Sign In. Ini yang bakal lo lihat:

```html
<input
  type="submit"
  value="Sign in"
  class="Button--primary Button--medium Button
         Button--fullWidth flex-1
         btn-primary btn-block"
/>
```

Kelihatannya gampang kan? Sayangnya class names itu — `Button--primary`, `btn-primary`, `flex-1` — di-**generate sama pipeline CSS-in-JS GitHub**.
Mereka bakal ganti tiap kali ada deploy. Test yang nge-click `.btn-primary` mungkin jalan hari ini, tapi bakal gagal besok.

Seluruh industri udah belajar soal ini dari bertahun-tahun lalu. Ini urutan prioritas locator resmi dari Playwright:

1. **`getByRole()`** — nyocokin ARIA semantics (apa yang dilihat sama screen reader)
2. **`getByLabel()` / `getByPlaceholder()`** — untuk form field
3. **`getByText()`** — teks yang kelihatan
4. **`getByTestId()`** — pilihan terakhir

Perhatiin deh, CSS selector bahkan nggak masuk list. Ini cara LoginPage kita nangani masalah ini:

```typescript
// ✅ Aman dari tiap kali GitHub deploy
this.signInButton = page.getByRole('button', { name: 'Sign in' });
this.usernameInput = page.getByLabel('Username or email address');

// ❌ Bakal gagal pas next deploy
this.signInButton = page.locator('.btn-primary');
```

**Pelajaran:** Kalau lo nulis CSS selector buat ngetest website yang bukan kontrol lo, lo cuma nulis kode yang bakal dibuang. Role-based locator maksa lo buat mikirin elemen itu _fungsinya buat apa_, bukan _keliatannya gimana_. Ini skill yang kepake banget di setiap project yang bakal lo pegang.

### 2. Konten bakal load semaunya dia

Demo app ngerender semuanya sekaligus. Website beneran nggak gitu. GitHub butuh load:

- Shell-nya (nav bar, layout skeleton)
- Feed / repo lo (butuh 1-3 API call di belakang layar)
- Avatar dan gambar (lewat CDN terpisah)
- Notifikasi badge (lewat polling)

`BasePage` kita nanganin ini dengan nunggu signal load yang jelas, bukan sekadar pakai sleep buta:

```typescript
// ❌ Rapuh — gimana kalau 5 detik nggak cukup pas mesin CI lagi lemot?
await page.waitForTimeout(5000);

// ✅ Nunggu konten aslinya, bukan pakai timer acak
await expect(page.getByRole('main')).toBeVisible({ timeout: 15_000 });
```

**Pelajaran:** `waitForTimeout()` itu tool buat debugging, bukan strategi. Tiap halaman punya sinyal "ready" — cari sinyal itu, bikin assertion di situ, dan biarin auto-waiting Playwright yang ngurusin sisanya.

### 3. Lo bakal kena rate limit

Coba jalanin 30 test ke GitHub secara paralel, lo bakal kena limit lebih cepet dari dugaan lo.
Solusi kita? **Dua mode test:**

| Mode        | Fungsinya                                                      | Dijalankan di mana                   |
| ----------- | -------------------------------------------------------------- | ------------------------------------ |
| `read-only` | Tanpa kredensial, cuma halaman publik, aman di-scale berapapun | CI tiap kali ada PR                  |
| `full`      | Pake autentikasi, create/delete data, patuh sama rate limit    | Local development, trigger CI manual |

Ini bukan cuma urusan GitHub doang. Tiap API yang lo test pasti punya limit.
Nerapin arsitektur ini dari awal bakal nyegah mimpi buruk "di lokal sukses, di CI gagal".

### 4. Test lo BAKAL gagal — dan emang itu tujuannya

Demo app nggak pernah berubah. Website beneran deploy tiap hari. Waktu GitHub rilis desain header baru dan test dashboard lo gagal, lo beneran dapet **skenario maintenance test yang nyata**. Bukan skenario pura-pura dari postingan blog.

Tiap kali lo benerin locator yang gagal, lo lagi ngelatih skill yang sama persis kayak yang dipake QA engineer tiap sprint. File [TEST-PLAN.md](https://github.com/mihaamiharu/github-projects-e2e/blob/main/docs/TEST-PLAN.md) di repo ini nyatet semua 38 skenario yang direncanain lengkap sama prioritas, tipe test, dan statusnya — jadi lo bakal selalu tau mana yang pass, mana yang gagal, dan apa yang harus dikerjain selanjutnya.

---

## Gimana Struktur Repo Ini

Daripada numpukin semuanya di satu folder `/tests`, kita ngatur berdasarkan concern (kegunaan):

```
github-projects-e2e/
├── features/              ← Gherkin specs (bisa dibaca tim product)
│   └── github/login.feature
├── steps/                 ← Step definitions (kode penghubung)
│   └── github/login.steps.ts
├── tests/                 ← Pure Playwright tests
│   ├── e2e/               ← Browser-driven
│   ├── api/               ← API-only
│   ├── visual/            ← Screenshot comparison
│   └── accessibility/     ← Axe-core audits
├── src/
│   ├── pages/             ← Page Objects (per target site)
│   ├── fixtures/          ← Auto-setup/teardown
│   └── utils/             ← DataManager, API client
└── docs/
    ├── TEST-PLAN.md       ← Apa yang kita test dan kenapa
    └── ARCHITECTURE.md    ← Keputusan desain
```

**Tiga layer dokumentasi:**

1. **Test plan** (`TEST-PLAN.md`) — "apa" yang kita test. 38 skenario dengan ID, prioritas, dan tipe. PM (Product Manager) lo bisa baca ini.
2. **Gherkin features** — "gimana" perilakunya. Spesifikasi yang bisa dieksekusi dan langsung nyambung ke test. QA lead lo yang biasanya nulis ini.
3. **Dokumen arsitektur** (`ARCHITECTURE.md`) — "kenapa" kita milih pattern tertentu. Diri lo di masa depan bakal berterima kasih banget.

Ini pattern yang sering dipake tim QA yang udah mature. Repo ini nunjukin caranya, dan lo bisa adaptasi ke project lo sendiri.

---

## Gherkin: Specs yang Beneran Dieksekusi

Ini contoh feature beneran dari reponya:

```gherkin
Feature: GitHub Login

  @P0 @smoke
  Scenario: Login with valid credentials
    Given I am on the GitHub login page
    When I enter valid credentials
    And I submit the login form
    Then I should be redirected to the dashboard

  @P1
  Scenario: Login with empty fields shows validation
    Given I am on the GitHub login page
    When I submit the form without entering credentials
    Then I should see an error message "Incorrect username or password"
```

Dan step definition-nya langsung nyambung ke Page Object kita:

```typescript
Given('I am on the GitHub login page', async ({ loginPage }) => {
  await loginPage.navigate();
});

When('I submit the form without entering credentials', async ({ loginPage }) => {
  await loginPage.submit();
});

Then('I should see an error message {string}', async ({ loginPage }, expectedMessage: string) => {
  await expect(loginPage.errorMessage).toContainText(expectedMessage);
});
```

Kita pake **[playwright-bdd](https://github.com/vitalets/playwright-bdd)** daripada Cucumber.js soalnya ini jalan langsung di atas **native test runner**-nya Playwright — artinya fixture, tracing, sharding, dan reporter semuanya bisa jalan tanpa konfigurasi tambahan.

---

## Apa Aja yang Ada di Seri Ini

| Part | Topik                                                                       | Key Skill                       |
| ---- | --------------------------------------------------------------------------- | ------------------------------- |
| 1    | **Lo lagi di sini** — ngetest website beneran, bukan demo app               | Mindset shift                   |
| 2    | Setup project: TypeScript, Playwright, ESLint dari nol                      | Scaffolding                     |
| 3    | Selector war: kenapa role menang dan CSS kalah                              | Locator strategy                |
| 4    | [Autentikasi tanpa mimpi buruk 2FA](/blog-id/04-authentication-without-2fa) | `storageState`, IMAP auto-fetch |
| 5    | Ngetest API dan UI di dalam test yang sama                                  | Hybrid E2E pattern              |
| 6    | Visual regression buat website yang bukan kontrol lo                        | Dynamic content masking         |
| 7    | Flaky test bukan salah Playwright                                           | Retry patterns yang efektif     |
| 8    | CI/CD buat E2E beneran dalam skala besar                                    | Sharding, scheduled runs        |

---

## Mulai Sekarang

```bash
git clone https://github.com/mihaamiharu/github-projects-e2e.git
cd github-projects-e2e
npm install
npx playwright install --with-deps chromium
npm test
```

Nggak butuh kredensial. Nggak ada demo app. Cuma website beneran, test beneran, dan pelajaran nyata yang bisa langsung lo pake buat kerjaan sehari-hari.

---

_Part 1 dari seri 8 bagian. [Follow repo-nya](https://github.com/mihaamiharu/github-projects-e2e) biar dapet update, atau baca full [dokumen arsitekturnya](https://github.com/mihaamiharu/github-projects-e2e/blob/main/docs/ARCHITECTURE.md) buat tau keputusan desain di balik semua pattern ini._
