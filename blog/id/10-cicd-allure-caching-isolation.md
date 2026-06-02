# CI/CD Buat QA yang Paranoid: Isolasi Sandbox, Caching Allure, dan Jebakan Auth Sementara

> **Part 10 dari seri Playwright E2E.**
> [Part 1](/blog-id/01-why-real-websites.md) — Kenapa website beneran lebih baik dari demo app
> [Part 2](/architecture-tour) — Arsitektur dari production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Kenapa pakai fixtures daripada BaseTest
> [Part 4](/blog-id/04-authentication-without-2fa.md) — Autentikasi tanpa mimpi buruk 2FA
> [Part 5](/blog-id/05-building-label-tests-with-ui-discovery.md) — Bikin E2E test buat label lewat penelusuran UI
> [Part 6](/blog-id/06-assignees-milestones.md) — Assignees & Milestones: Pola sidebar beneran berguna
> [Part 7](/blog-id/07-real-world-e2e-gotchas.md) — 4 masalah asli E2E dari GitHub Projects
> [Part 8](/blog-id/08-graphql-schema-archaeology.md) — Arkeologi Skema GraphQL: Nyari Mutasi yang Pas
> [Part 9](/blog-id/09-scaling-playwright-cli-discovery.md) — Dari Sekali Klik ke Full Workflow: Scaling playwright-cli

---

## Premisnya: 37 skenario Gherkin, 0 pengalaman CI, 1 tenggat waktu (deadline)

Setelah enam bulan ngebangun test suite Playwright + BDD kualitas production ngelawan GitHub Projects asli, kita punya segala hal yang diimpi-impiin tim QA:

| Kemampuan (Capability)                                                | Status |
| --------------------------------------------------------------------- | ------ |
| 37 skenario Gherkin yang nge-cover seluruh siklus manajemen proyek    | Beres  |
| Klien REST + GraphQL API buat sebar data/bersih-bersih (seed/cleanup) | Beres  |
| Project sandbox persisten, penamaan unik aman diparalel               | Beres  |
| Tag prioritas `@P0`/`@P1`/`@P2`, filter `@smoke`/`@noauth`            | Beres  |
| Jalan di lokal `npm test` pake HTML + Allure + laporan di terminal    | Beres  |

Yang belum kita punya adalah satu baris pun kode CI/CD. Nggak ada `workflow_dispatch`. Nggak ada `cron`. Nggak ada `--grep @smoke` di cloud. Keseluruhan test plan numpang idup di laptop satu orang developer doang.

Fase 6 itu ngeberesin hal ini — dan ternyata jadi fase yang paling nguras otak soal arsitektur di seluruh project ini. Bukan gara-gara GitHub Actions itu susah. Tapi gara-gara nyoba otentikasi (auth) nembus layanan third-party beneran di dalem container sementara (ephemeral) itu maksa lo ngejawab pertanyaan-pertanyaan yang nggak pernah diajarin di tutorial CI manapun:

- Gimana caranya lo nanganin verifikasi device (polling IMAP 2FA) kalau tiap mesin CI runner itu dianggep "device baru"?
- Gimana caranya lo jalanin PR check buat ngebuktiin kode lo bisa compile dan test-nya nggak ada salah sintaks — tanpa ngebocorin credential production?
- Apa jadinya pas penyusunan (composition) fixture diem-diem nyemarin (contaminate) browser context punya satu test sama cookies kepunyaan test lain?
- Kenapa tag Gherkin `@P0` / `@P1` malah ilang dari dashboard Allure padahal playwright-bdd udah bener nggenerate-nya?
- Gimana caranya lo bikin grafik tren pengetesan bisa jalan padahal tiap run CI selalu mulai dari nol alias bersih banget?

Artikel ini bakal mbedah kelima masalah itu sama solusi yang berhasil kita rilis.

---

## Masalah 1: Dilema auth di container sementara (ephemeral)

### Persiapannya

Test suite kita ngelakuin auth ke GitHub ngelewatin `src/config/global-setup.ts`. Alurnya:

1. Cek apa `auth/github.json` udah ada. Kalau iya, lewatin (skip).
2. Nyalain Chromium mode headless, isi `GITHUB_USERNAME` sama `GITHUB_PASSWORD`.
3. Klik "Sign in".
4. Kalo diredirect ke `/sessions/verified-device`: konek ke Gmail via IMAP (package `imap`), nge-poll inbox buat nunggu 6-digit kode verifikasi dari `noreply@github.com`, masukin kodenya.
5. Simpen `storageState` ke `auth/github.json`.

Kalau jalan di lokal, mulus banget. Langkah 1 langsung ke-trigger di tiap `npm test` — "Auth state found — skipping login" — dan browser nyala dalam hitungan milidetik.

Di CI, langkah 1 **nggak bakalan pernah** ke-trigger. Mesin runner sementara punya GitHub Actions selalu mulai dari nol di tiap sesinya. File `auth/github.json` juga masuk di `.gitignore`. Tiap ngerun CI selalu diitung "run pertama".

### Empat pendekatannya

Kita nimbang empat strategi buat ngurusin auth di CI:

| Pendekatan                          | Mekanisme                                                                                      | Plus (Pros)                        | Minus (Cons)                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **A: Pre-generate sebagai secret**  | Encode Base64 `auth/github.json`, simpen jadi secret `AUTH_STATE`, terus decode pas di CI      | Nggak usah polling IMAP, cepet     | Cookies sesi mati (expire) tiap ~2 minggu. Butuh refresh manual. Kalo kelupaan, pipeline lo bakal hancur diem-diem.           |
| **B: Full login di setiap run**     | Kasih kelima variabel auth (username, pass, gmail, app pass, token), biarin global-setup kerja | Bebas perawatan, auth selalu seger | Makan 30–60 detik polling IMAP per run. GitHub bisa aja ngecap terus-terusan minta verifikasi device ini aktivitas nyurigain. |
| **C: `actions/cache` si file auth** | Cache `auth/github.json` pake TTL 7-hari, turun kasta jadi full login kalau kena cache miss    | Semi-otomatis, cepet abis run ke-1 | Balik ke masalah cookies mati. Kalo cache miss = full login juga.                                                             |
| **D: Cache plus jalur cadangan**    | Gabungin opsi C dan B — coba cache dulu, full login jadi jalur cadangan (fallback)             | Yang terbaik dari kedua cara       | File YAML lo jadi ribet kompleksnya.                                                                                          |

**Pilihan kita: Opsi B buat full suite tiap minggunya, dan workflow terpisah bebas rahasia (no-secrets) buat quality gates PR.**

Alasannya: ini run yang dijadwalin seminggu sekali. Ngabisin 30-60 detik polling IMAP sekali seminggu itu nggak berasa. Dan kita ogah kalau sampe kegagalan auth gara-gara cache-miss bikin ancur satu pipeline utuh di enam bulan ke depan cuma gara-gara nggak ada yang inget nge-refresh tokennya.

```yaml
# .github/workflows/e2e-full.yml
- name: Run Playwright tests
  env:
    GITHUB_USERNAME: ${{ secrets.GITHUB_USERNAME }}
    GITHUB_PASSWORD: ${{ secrets.GITHUB_PASSWORD }}
    GMAIL_ADDRESS: ${{ secrets.GMAIL_ADDRESS }}
    GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
    GITHUB_API_TOKEN: ${{ secrets.GITHUB_API_TOKEN }}
    # ... semua variabel sandbox lainnya ...
    TEST_MODE: full
  run: npm test
```

### Insight dari sisi arsitekturnya

Pertanyaan yang bener itu bukan "cara auth mana yang paling ngebut?" Tapi "**workflow mana aja sih yang butuh auth darisananya?**" Kalau lo nanya ini, jawabannya jadi jelas: lo butuh **paling nggak dua** workflow.

| Workflow        | Pemicu (Triggers)     | Secrets?      | Tujuannya                                     |
| --------------- | --------------------- | ------------- | --------------------------------------------- |
| `ci.yml`        | PR, push ke main      | **Nol**       | Typecheck, lint, format, bddgen               |
| `e2e-full.yml`  | Cron mingguan, manual | Semua rahasia | Jalanin full 37-skenario utuh                 |
| `e2e-debug.yml` | Manual, input tag     | Semua rahasia | Investigasi detil lengkap bawa jejak (traces) |

Pemecahan ini artinya nge-check PR bakal beres di bawah 2 menit tanpa resiko ngebocorin secuil pun rahasia. Sementara full suite mingguan yang bakalan manggul beban berat ngurusin auth.

---

## Masalah 2: Gerbang aman PR (PR safety gates) pakai conditional fixtures

### Persiapannya

Kita maunya `ci.yml` bisa ngebuktiin kalau file-file `.feature` BDD berhasil ke-compile tanpa error sintaks. Buat ngebuktiin itu butuh:

```
npm run bddgen       # nge-generate .spec.ts dari .feature
npm run typecheck    # verifikasi TypeScript
npm run lint         # verifikasi ESLint
npm run format:check # verifikasi Prettier
```

Tapi sekadar jalanin `npm run bddgen` doang nggak bikin testnya ngerun. Pas kita ketambahin `npx playwright test`, tiap test yang nyangkut paut sama sandbox bakal nyoba nyari `GITHUB_API_TOKEN` sama `GITHUB_TEST_REPO` — ujung-ujungnya meledak (fail) gara-gara variabel itu nggak pernah di-set di workflow PR.

Nambahin embel-embel `--grep @noauth` juga nggak ngefek. Soalnya project fixtures-nya (`github-project.fixture.ts`) manggil fungsi `requireSandbox()` di tiap kali ngebuat (factory) fixture:

```typescript
function requireSandbox() {
  if (!env.hasSandboxProject) {
    throw new Error(
      'Project fixtures require GITHUB_API_TOKEN, GITHUB_TEST_REPO, ' +
        'and GITHUB_PROJECT_SANDBOX in .env',
    );
  }
}
```

Bahkan walau ada test yang sama sekali nggak _makenya_ (sandbox), murni sekedar ngimport fixture gabungannya (`src/fixtures/index.ts`) aja udah ngetrigger error ini.

### Solusinya: `TEST_MODE=read-only`

Kita itu sebetulnya udah punya variabel `TEST_MODE` yang nangkring di file `env.config.ts`, tapi var-nya bener-bener var mati — didefinisiin, tapi nggak nyolok ke logika manapun. Kita perbaikin ini dengan ngasih satu palang pengaman doang:

```typescript
function requireSandbox() {
  if (env.testMode === 'read-only') {
    test.skip(true, 'Skipping sandbox-dependent test in read-only mode');
  }
  if (!env.hasSandboxProject) {
    throw new Error(/* ... */);
  }
}
```

Ini tipikal beneran yang kelihatannya sepele kalau dipikir belakangan (hindsight) tapi butuh pemikiran arsitektural dari awal. Fungsi `requireSandbox()` ini bakalan dipanggil sama tiap-tiap project fixture (`githubAPI`, `projectsAPI`, `sandbox`, `seededProjectIssue`). Satu palang buat ngejaga mereka semua. Nggak ada ceritanya nambah-nambah tag list per test. Nggak ada urusan pakai `--grep` filter yang gampang rapuh. Dan bebas beban perawatan tiap kali lo nambah fitur baru.

```yaml
# CI: read-only — ngerun test login negatif aja, nge-skip yang lain
TEST_MODE: read-only

# Full suite: authenticated — ngerun ke semua 37 skenario
TEST_MODE: full
```

### Workflow buat PR

Workflow di `ci.yml` ini emang sengaja kita bikin seminimal mungkin — beneran tanpa pake tes di browser sama sekali:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: lts/*, cache: 'npm' }
  - run: npm ci
  - run: npm run typecheck
  - run: npm run lint
  - run: npm run format:check
  - run: npx playwright install --with-deps chromium
  - run: npm run bddgen
```

Enam langkah, nol rahasia disebar, dan kelar jalan kurang dari 2 menit. Ini ngebuktiin kalau tiap baris file `.feature` lulus parsing, tiap rumusan step definition bisa dijalanin, tiap tipe data dari TypeScript bener dicek (type checks), sama kode base-nya bener diformat rapi. Inilah set jaminan yang pas buat dipake build sebuah PR.

---

## Masalah 3: Waktu fixture diem-diem nyemarin (contaminate) contexts

### Persiapannya

Kita punya dua buah file fixture yang kita lebur jadi satu:

```typescript
// src/fixtures/index.ts
export const test = mergeTests(githubTest, projectTest);
```

Si `github.fixture.ts` nyediain `anonymousPage` (halaman polos seger, 0 cookies) sama `loginPage`. Si `github-project.fixture.ts` nyediain `githubAPI`, `projectsAPI`, `sandbox`, `seededProjectIssue` — trus dia nimpa (override) `page` fixture-nya buat disuntik-in auth cookies:

```typescript
page: async ({ page }, use) => {
  await ensureAuthCookies(page.context());
  await use(page);
},
```

Si `loginPage` fixture yang nongkrong di `github.fixture.ts` tadinya dibangun berlandaskan `page` fixture:

```typescript
loginPage: async ({ page }, use) => {
  const loginPage = new LoginPage(page);
  await use(loginPage);
},
```

Gara-gara `page` sekarang ketempelan auth cookies (bawaan dari nimpaan di `github-project.fixture.ts`), tiap test yang nyoba make `loginPage` jadinya otomatis ngerun berbekal context yang udah **ter-otentikasi (authenticated)**. Waktu sebuah test login gagal (negative) coba nembak ke navigasi `https://github.com/login`, GitHub nyium bau session cookie yang sah dan sontak nendang balik ke halaman dashboard.

Buntutnya: Locator `getByLabel('Username or email address')` jadinya ga pernah ada nongol di layarnya. Test buat nguji login ini keburu gagal sebelon sempat nyoba ngetik password sekata pun.

### Pembenahan, Bagian 1: Ngisolasi context buat si anonymous

Fixture `anonymousPage` tadinya cuma sebates alias pajangan doang lewat doang (passthrough alias):

```typescript
anonymousPage: async ({ page }, use) => {
  await use(page); // halaman yang sama ketempelan auth cookies — nggak suci anonymous lagi!
},
```

Kita rombak total gantikan dia pakai context yang 100% kepisah nyendiri pakai fasilitas `browser.newContext()`:

```typescript
anonymousPage: async ({ browser }, use) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await use(page);
  await context.close();
},
```

Cara ini ngebikin context browser jadi perawan bener-bener 100% seger tanpa sebiji pun cookies, nol localStorage, dan nol state session. Sewaktu `loginPage` sekarang mulai ngebangun wujudnya dari perbekalan `anonymousPage`:

```typescript
loginPage: async ({ anonymousPage }, use) => {
  const loginPage = new LoginPage(anonymousPage);
  await use(loginPage);
},
```

### Pembenahan, Bagian 2: Ngasih assertion di page yang pas

Ternyata langkah di atas ngelotok (expose) satu kelemahan kutu (bug) baru. Tiap-tiap definisi langkah test ngetest login gagal itu make Playwright bawaan default fixture `{ page }` sebagai tempat nitipin pengujiannya (assertions):

```typescript
// ❌ Ini malah nguji di halamannya si authenticated yang cuma cengong di about:blank
Then('the form should not submit', async ({ page }) => {
  await expect(page).toHaveURL(/login/);
});
```

Sedangkan si `{ page }` itu adalah si halaman yang emang sedari awal auth-ed yang bahkan nggak pernah beneran dinavigasi ke path `/login`. Sedang si `loginPage` ngendon di dalem halamannya `anonymousPage` — yang notabene emang seutuhnya benda `Page` yang berbeda wujud. Usaha buat nguji test (assertion) jadi ngetes (checking) orang yang salah.

Pembenarannya: Uji test (assert)-nya ditujuin ke `loginPage.page` (halaman perawan yang beneran dijadiin ajang interaksi form tersebut):

```typescript
// ✅ Baru bener nunjuk asert-nya (Assert) terpisah buat si anonim di letak aslinya formulir ngumpul
Then('the form should not submit', async ({ loginPage }) => {
  await expect(loginPage.page).toHaveURL(/login/);
});
```

Pola pembenaran serupa ini nular berlaku juga buat rentetan step login berhasil (positive):

```typescript
Then('I should be redirected to the dashboard', async ({ loginPage }) => {
  const page = loginPage.page;
  await expect(page).toHaveURL(/github\.com/);
  // ... deteksi urusan 2FA / cek dashboardnya ...
});
```

### Prinsipnya

**Penyatuan fixture (Fixture composition) itu hukumnya bukan gabung murni (associative).** Ketika lo narik tali `mergeTests(githubTest, projectTest)` ngeganti (overrides) sifat asal `page` fixture, setiap fixture turunannya (downstream) yang ngandelin `page` bakal nular otomatis ketularan nimpaannya — tanpa disadari. Compiler-nya juga ngga bakalan nangkep ini. Linter-nya ga ngeluarin teguran. Cuma bermodal satu test ngetes jujur buat status aslinya-kah otentikasi pagenya itulah yang bakal ngungkap (reveal) pencemaran (contamination) di dalamnya.

**Aturan Main:** Kalo ada fixture yang bawa-bawa nama `anonymousPage`, dia harus bener-bener terbukti steril anonim. Nyodorin dalil passthrough numpang lewat ke fixture beraotentikasi sama aja ngehianatin namanya maupun kehendak (intent) aslinya. Pakai jurus murni `browser.newContext()` demi capain tingkatan pengisolasian sebenarnya (true isolation).

---

## Masalah 4: Ngubah Gherkin tags jadi metadata Allure

### Persiapannya

Pas lo ngetik file `.feature` dibubuhin tag penentu level prioritas (priority tags):

```gherkin
@P0 @smoke
Scenario: Login with valid credentials

@P1 @noauth
Scenario: Login fails with wrong password
```

playwright-bdd ngerangkum compile ini jadinya ngelahirin deretan native tag Playwright:

```javascript
test('Login fails with wrong password', { tag: ['@github', '@authentication', '@P1', '@noauth'] }, async ({ ... }) => { ... });
```

Sistem penyatu (integration) Allure punya Playwright nyaplok gampang aja sama jajaran tag barusan dan masangin langsung numpang sebagai atribut `label` entries dalam lembar hasil akhir (results JSON) punya Allure:

```json
[
  { "name": "tag", "value": "github" },
  { "name": "tag", "value": "authentication" },
  { "name": "tag", "value": "P1" },
  { "name": "tag", "value": "noauth" }
]
```

Tapi di sinilah celahnya kebuka: mereka-mereka ini keangkut rapi tapi nyumput di kolong satu atribut yang sama mulu `"name": "tag"`. Satu biji test statusnya `@P0` dikelompokin keonggokan tumpuk yang kelihatannya kembar plek plek seragam ga ada beda sama test `@noauth` pas nampang di Allure tag cloudnya. Ga bakalan bisa dah buat kita nge-filter si Allure dashboard itu ngerunut level prioritas, ga ada diagram bulet kue pengelompok (severity pie chart), sampai lenyaplah harapan mutusin bates "harus lolos smua ujian severity-level blocker sebelum dibolehin launch release."

### Pembenarannya: Ngakalin auto-fixture mampir ngepeta in (maps) tag nuju sebaran severity si Allure

Allure itu dari sananya bawa rancangan baku level krisis kasta tinggi sampe terendah (severity model): `blocker`, `critical`, `normal`, `minor`, `trivial`. Kita ngerakit daftar peta petunjuknya (mapping):

```typescript
// src/utils/allure-labels.ts
import { allure } from 'allure-playwright';

const SEVERITY_MAP: Record<string, 'blocker' | 'normal' | 'minor'> = {
  P0: 'blocker',
  P1: 'normal',
  P2: 'minor',
};

export async function attachAllureLabels(tags: string[]): Promise<void> {
  if (!tags || tags.length === 0) return;

  for (const tag of tags) {
    const cleanTag = tag.startsWith('@') ? tag.slice(1) : tag;
    const upper = cleanTag.toUpperCase();

    if (upper in SEVERITY_MAP) {
      await allure.severity(SEVERITY_MAP[upper]);
    }
  }
}
```

Trus dari situlah langsung ditancepin urat nadi penyambung kawat ini nyolok nyangkut memanjang kesetiap sel tesnya masing-masing ngelewatin alat canggih **auto-fixture**:

```typescript
// src/fixtures/index.ts
export const test = mergeTests(githubTest, projectTest).extend<{ _allureLabels: void }>({
  _allureLabels: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      await attachAllureLabels(testInfo.tags);
      await use();
    },
    { auto: true },
  ],
});
```

Setingan bawaannya embel-embel `{ auto: true }` memicu jalanin muter fungsi fixture tanpa pernah manggilnya duluan mendahului rentetan per setiap lajunya sebuah (single test) — ga merlu secuil barisan oprekan ubah baris kode secuil pun di salah satu isi file step definition-nya ataupun di selangkapan belantara seberang feature file.

### Balikannya (The result)

Isi genretan JSON hasil (generated JSON) Allure saat ini bakal bener bawa label kategori kedalam krisis keparahannya secara lebih utuh (structured severity label):

```json
[
  { "name": "tag", "value": "github" },
  { "name": "tag", "value": "authentication" },
  { "name": "tag", "value": "P1" },
  { "name": "severity", "value": "normal" },
  { "name": "tag", "value": "noauth" }
]
```

Si tag `P1` nya itu tetep diem melipir ke bentuk asal per-tag umum sekedar (buat diulik cari searchability gampang aja), cuman sekarang dy ditemenin sama si asisten sohib pendamping the `severity: normal` bentuk labelan pengenalnya Allure punya tampang antarmuka render dasboard dijadiin (filterable), diwarnain benderang menyilang beda kasta pengkategori sebaran warning bahayanya.

### Urusan bongkar makam (API archaeology) nyari ini biar fungsi nyala

Nemu rahasia selip jalan-keluar macem gini butuh kemampuan nelaah manggut-manggut dalem gimana ngertiin aliran cara kerjanya `playwright-bdd` dalam mindahin tag-tag itu muter kearah Playwright-nya sendiri. Kalo nengok jaman purba versi keawalan kemunculan perintis playwright-bdd dulu si dia cuma nanem (embedded) embel embelan si-tag itu kecampur blek aduk kedalem isian teks badan (title string) si test-nya doang ngurut gitu (`"Login fails with wrong password @P1 @noauth"`), makanya insting pertama kita pas itu nyoba inisiatif iseng ngegali pake obeng regex parser (parser beralaskan ekspresi regular) cuma buat mbongkar buang dan cabut mecahin-nge-kstrak tagnya.

Nyatanya masuk playwright-bdd v8 semua-mua rentetan tag dibungkus dilolosin kedorong laju kedalem selubungan array murninya kepunyaan native-nya si Playwright `testInfo.tags` percisnya. Langkah blunder asal asalan milih (parser-ngeker regex bongkar tulisan judul test title) tau tau di kemudian waktu ngehianatin berenti ngadat sepi pas ada oknum nyoba ngerename (ubah namanya scenario) diem-diemanan. Kebalikan dari yang keliru, banting setir haluan arah make jurusnya (`testInfo.tags`) anti luntur daya tahan-tangkal banting tahan badai biarpun tulisan-namanya judul ganti kek gimana soalnya tetep berpangku numpang pilar per-API aslinya-si framework tulen sendirinya (framework's own API).

**Pelajaran:** sebelon gatel napsu maen bangun nulis gembok parser bikinan sendiri (writing a parser), cek dulu kroscek mending cari taunya barangkali kerangkanya (framework) sendiri diem-diem udah nyajiin nganter (surfaces) suguhan datanya dibikin bentuk piringan bentuk form nyusun kokoh.

---

## Masalah 5: Ngebuka gembok penyumbat grafik tren masa lalu pas nginjekin kaki dilingkungan CI sesaat-an (ephemeral CI)

### Persiapannya

Pintu langkah buka pertama per setiap proses lintasan ngerun GitHub Actions itu ibarat ngegelar tiker bentangan kosong tanpa sisa dari masa-lampaunya (blank slate). Kandang penyimpan jejak (direktori) `allure-results/` baru dirubung-masukin sesakan rombongan datanya selagi sesi `npm test` lagi kerja keras-nya. Langkah barisan deretan rentetan lanjut penutup manggil si `npx allure generate` bertugas nyeduh si bubuk-bubuk mentahan hasil racikannya si JSON disulap manjur diubah kedalem rupa-rupa si bentuk penampakan akhir statis si (static HTML report).

Tapinya ketauan di balik jebakan (there's a catch): Rupa paras lekukan bentuk jejeran grafik (trend graphs) dari laporannya si Allure malah wajib nerima asupan pasokan prasyarat dari jeroan sebuah panggulan folder (directory) `history/` beramunisi bungkusan rangkuman pengumpulan timbunan angka-data historis perbandingan ngurut mundur narik rekam dari deretan rentetan barisan run-run di masa yang udah pernah dijalanin sebelum-sebelum kelarannya barusan. Karena nihil asupan, berbondong tiap hasil akhir report itu bakal kerasa ibarat jepretan hasil foto jepret sekali-buang-lepas (one-off snapshot) garingan tanpa wujud kenangan doang:

| Tanpa ada asupan masa lalu (Without history)                          | Begitu ditanam sejarahnya (With history)                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ✅ Nyatet Angka Pass/fail buat run yang ini aja                       | ✅ Jejak tren Pass/fail kelipatan per 20 rentetan run                                       |
| ✅ Jajaran nampak tes hasil persatu-persatunya                        | ✅ Fasilitas cek deteksi nangkep si pengacau tes goyah (Flaky)                              |
| ❌ Melongo kosong hampa melompong tiada rentetan tren (No trend data) | ✅ Ngamati sebaran durasi lama tesnya (ngecekin suite nya makin pelan keong gak durasinya?) |
| ❌ Ilang data-historis kerekam lajunya Pass rate (lulus)              | ✅ Memfasilitasi wujud rupa penampakan instrumen dashboard nyemprit Go/no-go!               |

### Pembenarannya: nancepin puteran cache renteng 5-Langkah sekelilingnya

Kita tanemin (embedded) pancingan jejak peninggalan cache-histori milik Allure nusuk ke tulang sumsum badannya `e2e-full.yml` langsung sedari intinya:

```
npm test
  │ (ngebongkar muncul ngelahirin reports/allure/results/*.json)
  ▼
Langkah 1: Sedot pulihin balik (Restore) historinya mumbul dari tumpukan cache
  │ actions/cache/restore → ngebentuk nuju ke reports/allure/history/
  ▼
Langkah 2: Suntikin cipratin masuknya data histori kedalem si bungkusan results (hasil test)
  │ cp -r reports/allure/history/* ke sasaran reports/allure/results/history/
  ▼
Langkah 3: Bangkitin Generate reportnya gandengan bareng rangkuman history
  │ npx allure generate si asupan reports/allure/results -o kelahirannya reports/allure/report
  │ (berantem nyambung ngawin data baru plus diseret nyatu sama sejarah jejak lampaunya history)
  ▼
Langkah 4: Comot keluarin Ekstrak-history perbaruannya
  │ cp -r reports/allure/report/history/* sasaran tarik kearah reports/allure/history/
  ▼
Langkah 5: Timpa balik Save rekam ulang si history muter mulang nancap kekasurnya cache
  │ actions/cache/save → tempelan kuncinya(key): allure-history-{branch}-{run}
```

Sang sangkar pelindung konci cachenya nyabet numpang idup gandulan narik ikatan dari `${{ github.ref_name }}` maupun bersandar gandengan dari `${{ github.run_id }}` bertujuan supaya porsian historinya ngurung di masing-masing batas kurungan per-cabang (branch) sekalian ngelosin dia ngebebasin ijin narikin nafas sisa idup peninggalannya sedari jejeran larian percobaan masa lalu (previous runs) milik cabang yang masih serumpun di per-cabang sama:

```yaml
- name: Restore Allure History Cache
  uses: actions/cache/restore@v4
  with:
    path: reports/allure/history
    key: allure-history-${{ github.ref_name }}-${{ github.run_id }}
    restore-keys: |
      allure-history-${{ github.ref_name }}-
      allure-history-
```

Alur cadangannya fallback berembel-embel si `restore-keys` nunjukin maksudnya: coba pantengin tempelin percis milih kuncian di ID si peng-run pertamanya tadi sebisa mungkin percis persis mutlak-dulu (mustahil/kecil untung bisa hit kecantol), trus sehabis itu merosot meluncur jatoh melorot turun manggil milih sasaran ngincer run paling anyar terkini sedari sedarah sekeluarga sedulur sebraketing cabangnya (same branch's), baru trus terakhirnya jatuh kejeblos numpang bebas kecangkel mendarat aja merengkuh riwayat (history) sekeluarnya manapun punya sisa-si cabang acak yang sempet tertinggal ngejejak naruh barang sisa (_any_ branch's). Skenario mutlak di ujung barisan jaminan-jamin memastikkan berjalannya rentangan riwayat tren tanpa putus tetep sinambung sekalipun saat kuncian target bidikan sang cache key murni sejati itu mleset (misses) tembak.

### Kenapa ampe perkara ini di-pentingin bengetan bagi kaum QA

Kaga bawa bekel rentetan urutan runut historis di masa lalu (history), ampe botak juga lo kagak bakalan ada modal balasan (answer) di genggaman tiap sewaktu dicecer diomelin diberondong sama gerombolan manajer tim barisan-engineer (engineering manager) mendadak menjelang detik-detik saat hari peluncuran pelepasan (release day) di peresmian besok harinya: "**Nih pengetesannya (tests) pada beneran naek mutu kelasnya tambah jago apa malahan makin ngeblangsak morot turun amburadul?**" Sesaat wujud bentukan sebuah cetakan sekali jebretan doang ngukur skor (single-pass/fail snapshot) cuman mangkas cerita seputaran sebates bagian apa (what) yang lagi putus rusak barusan itu ajah (broke). Adanya suguhan tren (Trend data) nyuapin jawaban lo kepastian pertanda (whether) emang murni satu sarang koloni testsuite itu yang lagi ngejalani masanya pembusukan pengkeroposan usang sendirinya (decaying).

Denganya kelengkapan history yang kepasang (enabled) terhampar, penampangnya dashboard Allure nganter suguhi unjukan tayangan mampang ke lo soal ginian:

- **Tren tarikan porsian urut masa tayang laju waku pengerjaannya (Duration trends)**: Apa nasib sang test TBL-01 terekam stabil mulu tekor ngedrop lambret melambat telatnya ngaret nyampe 2 detik meleset dipantengin ngebanding dari raihan rekor kelar waktu selesainya di sebulan kepotong belakangan kemarin?
- **Pendeteksi oknum penyusup tes pengetesan labil perusak keriangan mood (Flaky tests)**: Tes sebiji makhluk bedebah mana ajah si yang emang beneran mujur nasib lulus tes tembus lincah terus ngejalan 80% porsi hidup waktunya dan sisa dari celah sisanya berujung kejerembap ambruk di kawah 20% guling gulingan?
- **Sorotan Angka sebaran tren Pass (Pass rate) dipanjang uluran sang waktu peliput sejarah**: Di hitungan pamungkas yang baru ajahan kemaren tuh sisa 5 jajaran nge-run terakhir pada lulus beruntun rombongan, atau jangan-jangan emang ada kutu rayap ngendap sembunyi merusak diem-diem berkedok balikan kutukan malapetaka jeblos degradasi kemunduran bug edisi baru (new regression)?

---

## Penyatuan Pemusatan (Consolidation): murni satu direktori `reports/` penguasa takhta dari perwakilan atas penjelmaan semuanya beramai-ramai

Di masa pra kemunculannya Fase 6, di kawasan projeknya itu mengidap penumpukan empat sarang pangkalan (report directories) nyerak berhamparan belepotan acakan (scattered) tumpah mengotori ubin-ubin perkarangan pelataran kawasan ruang dasar akar pusar si lapak utama kerjanya (workspace root):

```
playwright-report/     ← tumpahan pangkalan muntahan laporan milik mesin HTML reporter (HTML reporter output)
allure-results/       ← gudang tumpukan kumpulan asupan gumpalan data mentahan si file Allure JSON
allure-report/        ← bentuk kemasan perwujudan final HTML yang ditampik hasil kerja jilidan generate kepunyaan Allure
test-results/         ← berangkas loker kotak barang titipan simpen tempat hasil sidik bongkar ngintip si jejak rekam pergerakan dom (traces), hasil potret gambar (screenshots), berserta file gulungan putaran sorot gambar pergerakan file pilem-nyah (videos)
```

Saban hari tiap oknum pengembang programmer nguli dipaksa mati matian meras isi di kepalanya dipaksa ngapalin mengingat (remember) milih letak pemosisian kandang yang nyocokin ngejawab dari arah sasaran panggilan apa buat nurutin permintaan si tujuan macem ini itu se-sreg cocok-cocokan sejalannya. Si tampungan daftaran file pembuangan `.gitignore` sampe numpuk padet megang nampung serapan perbekalan barisan per baris yang dijejali sampe kepenuhan nyampe ber-lima susun terpisah nyilang sendirian barisan entry buat nutup-nutupin wujud artefak si pelapor-pelapor laporan doang. Lanjut nyusul ngerembet sang file keramat naskah-kumpulan naskah lakon `package.json` yang nge-scripts pemanggilan referensinya ngebikin jalan tujuannya pada nggunain path berlainan haluan yang keblangsak ga ketulungan ga setara tak sebangun (inconsistent ways).

Kita gabungin merajut jadi utuh (consolidated) ngebulat nyatu di bawah rindangnya payung kepalan penguasa tunggal bertempatkan satu direktori bernama `reports/` merangkap segalanya semata-mata:

```
reports/
  playwright/          ← pangkalan bermukim HTML report
  allure/
    results/           ← markas persembunyian data gumpalan mentahan mentah raw JSON
    report/            ← letaknya kedudukan istana tempat bernaung HTML buatan (generated HTML)
    history/           ← wadah lumbung si data per-trend CI masa lalu (dijaga diselimutin diamankan cached)
  artifacts/           ← lapak barak penyimpanan buangan traces, file video-video kelakuan putar tontonan terekam (videos), file jepret (screenshots)
```

Tulisan penghadang barisan si `.gitignore` seketika rontok menguncup jadi satu sisa gompalan segaris baris aja seutasnya: `reports/`.

Deret script panggillannya (The npm scripts) ikutan nurut kena sunat ke-update selaras menyesuaikan setel sejalur jalannya:

```json
{
  "report": "npx playwright show-report reports/playwright",
  "report:allure": "npx allure generate reports/allure/results --clean -o reports/allure/report && npx allure open reports/allure/report"
}
```

Jalur pengaturan saklarnya Playwright (Playwright config) saat detik ini ngebanting rute (routes) segala pengeluaran buangannya dipaksa nurut nge-pusat mampir-terobos di pintu tol gerbangnya `reports/`:

```typescript
outputDir: 'reports/artifacts',
reporter: [
  ['html', { outputFolder: 'reports/playwright' }],
  ['allure-playwright', { resultsDir: 'reports/allure/results' }],
  ['line'],
],
```

### Lubang Perangkap sang `resultsDir` ditandingin vs `outputFolder`

Sesi perbincangan ini dipandang pantes ditunjukin disorot ditengah panggung khusus perkaranya kita sempet-sempetnya kehilangan korban 20 menit berharga ngulitin nyari kutu pusingin muter perkaranya ini (debugging). Di kejadian waktu hari pertamanya kita muter otak ngerelokasi bongkar mindah jalurnya lintasan pangkalan tujuannya si sang wartawan (reporter) penarik rekam di kubu `allure-playwright`, kita masang settingannya mengadopsi nama embel embelan rupa `outputFolder` — yakni serapan sisa nama settingan (option name) yang udah melekat lama disusui dirawat kental percis jadi milik kesayangan di pundak-nyah wartawannya si kubu reporter pihak si HTML (HTML reporter). Dan, boom mati tanpa suara meleset nihil tiada pertanda eror menjerit apa (failed silently). Bungkusan kiriman hasil paket si Allure (Allure results) malah asik asikan tetep leyeh-leyeh nongkrong turun mulus aja nyungsep di dalem direktori pangkalan tujuannya yang versi baheula dulu tempat tinggal lapaknya nangkring lamanya.

Rupa bungkusan nama selubungnya pilihan saklar opsi peng-arah setinganyang ngena pas aslinya buat pegangan peraturannya sang `allure-playwright` turunan generasi gen v3 nyatanya menuntut pake asupan kata embel-embel berlabel namanya `resultsDir`, bukannya pake nama `outputFolder`. Embrio usut asal penamaan dari nama kuncian si setelan nama ini emang nongol terlahir muaranya perasan nyedot pakem murni darisana si `ReporterConfig` sang punggawa penanggung-baku antar muka pengantarnya interface bawaan (interface) asal `allure-js-commons`, yang lantas kelak dia diseret memanjang dirantingin ngelanjut ke jeroannya pengatur si `allure-playwright` punya kepunyaanya (config). Kalo di selumbarnya pengatur opsi `outputFolder` punya si pengusung pelapor kubunya pak HTML (HTML reporter) si ntu kan emang sifat asli turunan bawaannya pakem (Playwright-native option), tapi kalo sang utusan pesuruhnya pelapor kepunyaan panji kubu si `allure-playwright` itu ibarat jas nyelubungin mbungkus mbalut badan secara lansungan (wraps) ke balutan paket pengembang (SDK) milik murni pny si mbah sang penguasannya si kubu Allure (Allure SDK) secara nyambung murni tempel menyatu tiada terpisahkan langsungannya (directly).

**Aturan Main:** tiap saat lo ikutan di panggil ngoprek pusing ikut andil campurtangan urus nyeting nyetel si kawat pen-distributor si pembawa-laporan (reporters) yang karakternya hobinya cuma modal jadi jas balutan nyelubungin ngandolin paket pasokan bongkahan tulang tulang rujukan murni milih milik si vendor pihak ketiga orang luar (third-party SDKs), buruan langsung cek teliti ceki-kroscek-intip perhatiin bener percis di surat dalil piagam pembaku nama aslinya dia (type definitions), sama sekali murni lupakan nasehat panduan nyasar kearah bukunya dokumen punya pak Playwright (Playwright docs). Soal embel embelan tulisan nama wujud panggilannya setelan nama penyetel (option name) bisa ajah dijumpain simpang bentrok melenceng tabrakan dari rupa panggilan apa-apa-nya kebiasan sang tetangga-tetangganya deret pelapor pembawa kabar-pembawa-pesan sebraket rombongan sepermainannya nyang biasa lazim pada dipakenya digunainnya.

---

## Alur Workflow per-debug-an: penggeledahan penyisiran ngudak bongkar usut ala tim penyidik detektip panggil sesuka (on-demand forensic investigation)

Kita numpangkin ke rombongan ini nge-tambel tambahan masuk masukin susulan bungkusan alur ketiga Workflow, `e2e-debug.yml`, dipake disiapin sebagai senjata sedia sedia kalo saat kepepet (scenario) ngebantu dimana kecangkel apes nemu bijian kejadian jatuhnya test nyangkut ambyar (failing) nyusruk maksa butuh pasokan penggelontoran turun-tumpah seutuhnya ngorek mbedah jejak rekaman runtutan penuh dari barang-barang perabot (full forensic data):

```yaml
on:
  workflow_dispatch:
    inputs:
      tag:
        description: 'Gherkin tag to filter tests (e.g. @P0, @smoke, @noauth)'
        required: true
        type: string
        default: '@P0'
      trace:
        description: 'Trace capture mode'
        required: true
        type: choice
        options: [on, retain-on-failure]
        default: on
      video:
        description: 'Video capture mode'
        required: true
        type: choice
        options: [on, retain-on-failure, off]
        default: retain-on-failure
```

Bertiga selisih tampang penampakan wajah (differences) mbedain nyempalin si full suite paket kelimpahan dari yg biasa ditetap rutin muter nyemingu bulanan mingguan (weekly full suite):

| Aspek (Aspect)                                                                                                | Si `e2e-full.yml`                                                         | Si `e2e-debug.yml`                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pemicu tarikan (Trigger)                                                                                      | cron + manual                                                             | cuma bisanya pake dorongan manual only                                                                                                                                        |
| Saringan peras (Filter)                                                                                       | sapu rata kabeh melahap ngebabad smua all 37 tests                        | ngunci masukan patokan label tag doang di (tag input)                                                                                                                         |
| Pilihan awal default bawaan penyala jejak bongkaran rekam (Trace)                                             | setir keposisi ngendon nyimpen di `retain-on-failure`                     | paten kekunci manteng di pas nyala murni full slalu `on` (full trace always)                                                                                                  |
| Sumbangan sisa jepret-jejak peniggalan rekam saat kelar-lulus mulus lolos tes (Artifacts on pass)             | kikir-pelit cuman ninggalin nyumbang laporan ngasihin html + allure doang | kelewat-pemurah baik-harti nyumbang html + allure + berhadian mbagin sisa jatah test-results (nge-jembreng buka jejak traces/ngasihin nonton videos)                          |
| Ujian penjaga Pintu palang gerbang Mutu kualitas saringan pameran periksa peng-check kualitas (Quality gates) | dijawab iya dong yes                                                      | **kaga beneran bolong no** (di slonong boi dilewatin dilangkahin-diterjang dilewatin demi kejar-setoran waktu buruan ditikung ditabrak-langkah kejar kelar skipped for speed) |

Senggolan saklar sabetan cengkraman penyusup dari panji-bendera palang patokan tanda bawaan-parameter luar si panji umbul umbul pelontar barisan kodenya dari parameter flags kelengkapan si `--trace on --video on` ini dengan rakus keji nekat mendepak numpang nyeleding ninju neken paksa banting haluan mutusin mutlak nimpa giles nimpal ngedobrak mendepak (override) kepakem aslinya bawaannya setingan-kepunyaannya dalem Playwright pas mendarat saat tepat di pertengahannya proses ngerun-sedang berputar (runtime) — sama sekalian kaga dibutuhin (no config changes needed) sedetik campur andil secuil barispun ngotak ngatik merubah ganti daleman isinya si file peraturannya (config) buat ngubahin si rubahan-peraturannya settingannya config changes needed. Dampak rupa kekuasaan mutlak hak-preogratif barusan-ini ngebawa arti kalo sewaktu ada insinyurnya-tim-kaum sang quality ngukur dari regu QA (QA engineer) kesambet pengen napsu nyobak mancing mecetin tuas muter roda si tarikan pemicu (trigger) ngarah ke (a run) uji tanding ngehantem tabrak nembus men-target sasaran (against) test inceran si-target bertanda label sang pelabelan si embel `@P0` dikawin komplit gawan dituntun dititipin-sekalian full komplit nyeret lengkap jejak rentetan tumpahan tumpukannya si sisa ngurek dom ngulik jejak trace (with full traces), mampir ngunduh ngeraup mungut mendownload artepak pungutan sedekah si bongkahan artefaknya buntelan hadiah ulih-ulihan sang bingkisanya warisanya `test-results-debug` 5 menitan setelah jeda waktu nyusul selesainya berselang later kelar berjalannya si laju run kelarannya ngeberhentinya perhentianya berdiamannya (5 minutes later), ngalanjut tinggal sekadar nyalain santai sambil ngebuka gelar bentang masuk ke lapaknya peragaan mesin pamer si mesin Playwright trace viewer (Playwright trace viewer) buat mbedah pelan satu tahapan per tiap segeraknya-loncatan langkah kakinya ngikut di urutin step (to step through) daleman ngeliatin-mengkaji per-jantungnya wujud nyawa kediaman urat nadinya posisi (the DOM state) penampakan posisi ngerubah-rubah pada kondisi dari (at every interaction) per ketiap persinggungannya seluru sempetan pas dilakonin.

---

## Tabel lengkap Workflow matrix (Matriks keseluruhan si jalur Workflow the complete workflow matrix)

| Alur Workflow (Workflow)      | File tempatnya  | Pemicu jalan-Trigger                                                                                                   | Rahasia dibalik layarnya rahasianya (Secrets)                    | Tes-tes uji nya ngerun nembak apa jalannya kemana ngerun yg apa (Tests run)                           | Ninggal barang apa wujud dari artefak yang terlempar dibuang ditinggal dari hasil pungut-artefaknya apa jadinya (Artifacts)                                                                                                              |
| ----------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI                            | `ci.yml`        | PR, push ke main                                                                                                       | Kaga ngotak sama skali None                                      | 0 nihil murni beneran (sebatas jaga pintu quality gates periksa nyekrining doang bisanya only)        | Babar-blas kopong None                                                                                                                                                                                                                   |
| Set Lengkap Ujinya Full Suite | `e2e-full.yml`  | Cron mingguan berkala, pemicuan pijat manual                                                                           | 10 perbekalan tajem komplit Semua dibawa ngangkut All 10 secrets | Menghajar nembus 37 skenario pol 37 total All 37 scenarios                                            | 3 artefak jepretan buah tangan oleh (laporan bentuk html html report, rupa tampilan laporan paras dari perupa-laporannya perwujudan allure report, sisa test-results diboyong kl misal kelak ada di kejadian gagal ngerunnya on failure) |
| Debug pembongkaran            | `e2e-debug.yml` | Manual dicolok pake pemicu dorongan Manual, filter masuk berlandaskan embel inputan berwujud dari patokan si tag input | Pake amunisi Semua ke10 ke10an-semua-biji-nyah All 10 secrets    | Mengunci Filter kepisahkan diayak Filtered ketat dilandasin di bawah by panjinya sandaran-Gherkin tag | 3 bongkahan wajib mutlak disodorin slalu always (tergabung nyawur sekalian traces/file ngrekam tayangan videos kl ampe ber-nasib dilulusin on pass)                                                                                      |

Masing dari ke-tiap jalannya rutetan rentetannya alurnya dari workflow-workflow di deret jajaran tadi dipilah dipake ngemban bakti ngabdi perihal menuntaskan dahaga penuhi kewajiban tujuannya panggilan-memasok panggilan nugas ke pemirsa tujuan pelanggannya yang berlainan rupa tujuanya nyasar masing: porsi murni tukang nguli pembangun barisan pembuat ngode ngetik kodenya ngembang pengembang (developers (CI)), regu pelapis penyortir si penarik pelatuk Quality nyiap si mandor kualitasnya nyuruh ngajuin lapor QA leads (full suite), sampai murni disiap nglakuin si-urusan ke polisi penyidik nyari tersangka perusuh para ngurek usut kroscek daleman investigators (debug).

---

## Inti sari bongkaran hikmah yang kecatet dari artikel perihal (Key takeaways)

| Pelajaran apa dari sini                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Kenapa perihal ngurus ini tu bener penting dipentingin buat diperhatin banget nyah                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pecah misahin Pintu penyekat-saringan Palang PR ngejauhin rombongan full suites**                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Aliran selang (pipeline) PR-lo haram mutlak ga-boleh ngelirik ngintip mencium tau urusan bersentuh apalagi ngeliat nyorot sedeket sedetil setitik kredensial kepunyaannya ngakses punya production (production credential). Gerbang gawang Mutu pengecek-pintu (Quality gates kek misal (typecheck, lint, bddgen) ampun daya nya bisa nangkep tangkal-nyabet njaring musuh mbunuh cegah nyekik nangkep nangkap 90% biang ngerusaknya issues ampe modar mampus mati kutu tanpa kudu kesinggung nembus ngegesek sekecil secuil browser pun apalagi menyentuh. Laju Rombongan gelaran alat tanding tempur Full suites ditempelin bumbu rahasia tempur rahasiannya amunisi bawaan auth itu dilesatin-diluncurin ngerun berpacu di lintasan sirkuit nyantol jadwal on schedule kalopun butuh saat ngerasa pas butuh dipanggil ngeluar (or on demand).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Cucuk kawat ikat nyambung si variabel sakti `TEST_MODE` colok ngiket muter mblesep nembus kedaleman urat-fixturenya, kaga usah diiket nyolok paku kecantol kenceng di test nya**                                                                                                                                                                                                                                                                                                                                                     | Ngandelin penjagaan cuma persekali baris serdadu penangkis halauan nyantol dalih dari perintah guard perisai sebates kodenya kawan sebiji di sebiji `test.skip()` pas dijaga ngeblok depan di gerbang lapisan si perwira palang pintu di garda palang di pos jaga lapis si per-fixture (fixture level) ini ampuh memagar menghadang (gates) nyekat segala sebiji per sekujur-tesnya yang berani nyangkut manja ngeggandul bawa bawa gandengan di punggung-nyah nge-gantungan narik seret ngegantung gandulan nyangkut ke perbekalannya perabot bergantung (sandbox-dependent test). Jamin bersih-rapi Ngga kudu merlu repot nempelin capek baris-baris ngotorin selipin capek stiker coret-per-test ngecoretin si test coretan tambahan berwujud embelan di depannya kek pake `@noauth` annotations sekedar tempelan di-need dibutuhin needed. Terhindar aman luput-bebas Ngga ada urusan sama utang perawatan nyapu pusing pening beresin keruwetan pemeliharaan perawatannya daleman kodenya nyusahin maintenance seumpamanya pas besok nambahin nge-add test test srenario barunya nanti skenario (as you add scenarios).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Nama embelnya fixture itu `page` belom nyatanya-itu ngebuat dia jadi bener 100% jadi anonim (anonymous) murni gara cuman-alesan nyatanya lo nyantumin nama julukin dy namain-ngecap dy jadi nge-named nempelin si doi-dy `anonymousPage`**                                                                                                                                                                                                                                                                                           | Di peristiwa-saat nggelinding berputernya gerbong roda nya `mergeTests` nabrak nimpa mblesek niban ngegeser ngeluluh (overrides) kedudukan-milik dari wujud jatah `page` fixture, seketika setiap rentang rombongan gerbong buntut gerbong bawahan-rentetannya nyambung keturutan-warisannya aliran turunan di bawah aliran yang nyambung ngekor ber-bawah nyangkut kepanjangan-tali downstream iketannya fixture ngegandeng-waris nangkep nurunin tu si-tekanan sifat nimbrak nimpaan berasa ngewaris neken override-nya mblesep (inherits the override). Maksa perbudak-Paksa meres-kerjain Pakai aja kuncian sakti rahasian jurus perwujud pake gembok si gembok murni dari fitur-kunci nyuruh `browser.newContext()` pancingan pamungkas sejati-penyedia wujud pamungkas jago buat (for) melucuti wujud mutlak si kurungan murni ngusir ngisolasi aslinya-sesungguh sejati (true isolation). Mantepin pasangin paku tancep ujian ngaju nyekik ngehajar nguji serang ulik Assert si pagenya langsung ngedarat dipantengin ngotot bidik nembak ke (on) punggungnya murni badannya milik propertinya si barang-bendanya Object kepunyaan milik-nya Page yg-ngena bener pas bener (the correct `Page` object) saat ngorek mbongkar di rumusan langkah uji langkahannya (in step definitions).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Gunakan-Akalin Pake jalur dalem murninya pakemnya sakti properti murni miliknya jeroan aslinya bawaannya si `testInfo.tags`, haram-pantang nyentuh maksa narik ngorek ngeker (not) ngerakit alat mesin parser regex pas ngorek ngeruk narik dari si judul teks murninya si `testInfo.title`**                                                                                                                                                                                                                                        | Kerangka dari cetakan playwright-bdd edisi cetakan ke v8 lolosin mbuka ngedorong ngejebol nyeret giring Gherkin tags di-ngegas mbabat bablas giring nembus (passes) diangkut muter selang jeroannya-nembus (through) fasilitas layanan native resminya-pabrikan orisinalitas punya tunggangan jagoannya si pak Playwright punya si perabot jalur ngakses alat-gawai `testInfo.tags` API. Ngulik ngoprek maksa mesinin ngeker regex (Regex title parsing) sekedar narik-titel murni itu rapuh rawan mropol getas mlempem remuk (is fragile) dan tau-tau langsung ambyar jebol rontok seketika hancur pecah mbuka kedok rombengannya (breaks) pas lagi nama tes nyah test names tanpa sadar berganti namain ngerubah-namanya kesentuh ganti ngotak-atik ke-ubah tanpa dirasa nyadar nggantinya names change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **5 langkah rentetan jurus lingkar puseran putaran si roda gerigi simpan cache-sejarah cache cycle nyabet nyopot ngedorong mbuka kunci segel ngebuka mbongkar rahasianya kunci-jebol si (unlocks) pajangan jajaran berbaris-baris lukisan jejak grafik-ngetren sejarah ngalir nampak berjejer rentang lampau nyerat jejak penampakan-sejarah historical trend graphs**                                                                                                                                                                 | Sedot-Balik pulihin Restore → nyuntik cipratin nyorong nyiram inject → ngebangkit njalani membangkitkan generate → menguras comot nyabut sedot ngeluar (extract) → mengurung ngejaga memasuk numpuk nandur (save). Riwayat nggulung sejarah kenangan masa sisa lalunya nya Allure Allure history mantera ampuh perubah pen-jebrot nyulap satu porsian tayang bidik sisa-ngejepret sak krecep doang sebates sekejap (one-off snapshots) mbentuk diubah dibentuk njelma menyatu utuh menyusun kumpul menjelma membengkak kedalam papan hamparan-ngelitik papan penampang pajangan layar monitor dasboard tren-pajang pajangan grafik berentet nggulung bersusulan (into trend dashboards) nan sedia mantep ngetawain mejeng siap tempur nyaji nyumbang umpan suapan ngejawabin ngejawab ngisi prsoalan cecaran njawab penuhi nanya (that answer) "tuh mbok pengetesannya lgi-tesnya lgi-pada ngerangkak naik membaik kualitet mutunye are the tests getting better atokah sebaliknya malah makin blangsak terperosok busuk nungsep or worse?"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Silau cek-kroscek mata mbaca nama colokan setelanya pilihan setingan kepunyaan si wartawannya sang si pembuat panggung pembawa pelapor pengirim pesannya saklarnya (reporter option names) ngebidik tandingin adu patokan (against) ngelawan mencok percis menembus kearah rujukan asli jeroan dari tulangan murni asal dalil si tulang pakem pembungkus intinya the SDK, jauh-jauhin ngebuang (not) jangan sekali baca acuan berpedoman pegangan nebak di petunjuk arah pituduh (the) panduan manual bukunyah the Playwright docs** | Kerangka si pelapor pengangkut pesuruh pesuruh si kubu `allure-playwright` menuntut lo buat uses manggil mbakar (uses) panggil pakenya pasang embel `resultsDir` (turunan sanad muasal darisananya sedot ngembik (from) tulangan akar si turunan akar rumput `allure-js-commons`), mutlak jangan malah keliru nyetel not bukan masang masang (not) setingan embel colok pakem pakuan ngikut embel `outputFolder` (nyang notabene merupakan sejatinya murni yang emang isinya adalah bawaan darah kentel aseli (which is a) saklar setingan cetakan setelan murni pletik-tetesan bawan-lahir orisinil darah asli cetakan dr bapaknyah pak Playwright-native option). Salah panggil meleset milih pasang sebut nama setelan (Wrong option) = jatuhnya kejeblos melayang diem diem terjerembab kesesat salah mendarat sunyi mleset melorot amblas turun (silent fallback) balik nongkrong diam-diam nggloso ngendon jatoh kearah balik nyasar (to) lapak tempat sarang asal mula bawaan patokan seting pangkalan default asalan default directory.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Cincang ngakalin Giring Gabung leburin Kumpulin jadi satu persatu tempat direktori nyampur aduk pangkalan sarang hasil lapaknya (report directories) dipepet mepet sesegera secepat dari awal sebisa mula mungin gas pol sesegera di muka (early)**                                                                                                                                                                                                                                                                                  | Nancepin ngorbitin manjangin nongol 1 lapak Sarang sebiji 1 bangunan tunggal satu pangkalan sentral tugu tempat direktori A single `reports/` directory beramunisi bersenjatakan bermodalkan di-sanding dikawal dipagari seutas dobel tali perbekalan sebarisan satu-bijian nyang sisa sak strip coretan (with a single) barisan aturan penangkis tolak cegat penghalang `.gitignore` nangkring pas-pasan barisan pos-jaga pintu masuk penjagaan pendaftaran entry jelas terasa-is gampang mringis mbikin gampangan empuk ngentengin mikirnya ngejalan-nya jalan mbacanya jalan logika-pikir gampang nerima masuk gampang dirunut dinalar ngarti ngeyakinin direnung nalar diusut dilacak rasionalkan mikirinya nalar dirasio dirasain akal dilogika to reason about, kehitung kelewat mangkas mbikin nyanteh berasa sepele urusan perihal gampang meresan gampang beberes diurusi mudah (easier) ngosek bersih nyapu nge-lap-nyah ngebersiin to clean, sekalian gampang enteng nyodor enteng gampang mulus gampangan ngoper ngelemparin operan ngeril ngoper oper (and easier to pass) mbalang nyeberang ngelewatin (between) selangan sela step tahapan pletik-lompatan langkahnya tangga tangga rentetan di CI steps ketimbang ngotot maksa harus misahin milah keteteran capek capek berurusan nengok ribet megangin the keteter nenteng megang harus dari pada ngejagain than njagain serabutan than mantengin ngrumat empat 4 lapak direktori beda mencar buyar nyebar amburadul terpencar pisah nyebar pating kocar kacir ngglundung nyerak (scattered directories).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Bumbu tambahan tambel colok paksa Add pasangin suntik buatin selipin sedia sedia A debug workflow kelengkapan senjatain bawa dibekali komplit berpelet embel si tameng bawa bawaan bawa senjatanya parameter `trace: on` sama kombo sabetan sekalian `if: always()` demi mengangkut narik manggil nebus maksa paksain mungutin paksain mungutin paksakan sisa bongkahan bangkai peninggalan reruntuhan tumpukan barang bawaaan pengangkut bawa perabotan mumbul ngunggah unggahan (artifact uploads)**                               | Tiap kalinya (When) ngerasain nangkep ada si oknum seekor siluman penyusup hasil-ujian test bedebah lagi kesambet lagi kesurupan ngerasa-jatoh-nyungsep ngejatuhin diri gagal nyusruk fails nyengir kembang kempis labil ga stabil nyala idup (intermittently), lu pada sejati-nyah nyatanya bakal mutlak kepepet ngebet laper butuh njawil butuh bange nyari si barang itu nyari butuh nangkep njaring butuh (you need) ngumpulin ngiket barang jejak rongsok si rentengan si kawat-sidik runut pengusut si bongkahan-usut (the trace) ditarik diculik murni ngejaring mungut comotan ngorek cabutan perasan ditarik darimana si biang biang sumber murninya (from the) sarangnya reruntuhan ambyarnya kecelakaan ambruk gagal mbleduk-nya tempat jatohnya si-kegagalan failure dirinyah seutuhnya secara murni (itself), bkan mlah ngeloyor konyol ngarep ngunduh (not) daripd ngorek dr tong sampah buangan murni turunan pengulangan coba ulang larian jilid dua-nyah dri balikan buangan hasil uji sisaan rentetan-mengulang panggulan coba ulang (from the retry). Sebiji rakitan lintasan wujud A khusus beneran terdedikasi buat ngebenerin ngurus kusus debug khusus mbedah-mengulik si-alur (dedicated debug workflow) nggandeng ngebonceng dikawin sereret diiket ditenteng bareng gandengan serangkul lengkeng berbekal sekalian mboyong sama serenteng komplit set (with) paketan bingkisan bawa perbekal bongkahan bawaan paketan ngunggah mumbul tumpukan peninggalan peninggalannya barang sisa jejak peninggalan bongkahan koper rongsok ngangkut hasil ngunduh mumbulin ngangkat mbopong brang koper artifact uploads nekat diangkut tampa tanpa pake rem ditahan cegah tanpa ngasi tanpa syarat (unconditional) lho ya, niscaya ngulung nyodor-mbeslah nyumbang ngasihin nyodorin ngasih-numpahin (gives) ke elu elunya elo lu (you) ngluberin muntahin tumpahin suguhan sajian itu limpahan suguhan hantaran sajen sajian persembahan kucuran piringan muntahan perasan tumpahan curahan kucuran pasokan tu data seonggok ngamuk-liar sejuta itu bergepok kepalan data bungkusan gumpalan sekongkal si mbludak (that data) sebuas-buas seliar di semua lapak tiap celah di masing masing-tiap on every berputar muter pelarian putar uji tes mumbul lari rentet meluncur (run). |

---

Fase 6 berhasil ngerapetin lingkaran yang tadinya mbuka (closed the loop): satu gumpal set perbekalan tes suit-lokal alat tanding uji coba test suite (local test suite) yang sebelonnya dipuja diagung agung sempet megah pamer koar teruji kebuktian nyang sebenernya terbukti lulus uji sah dijamin mujarab paten sakti lulus (was provably correct) secumak numpang mampang mentok numpang idup numpang unjuk jago kandang berasa jago mbangkis (on) sebates mesin lapak mesin tunggangan mesin PC gawai tempur leptop punya si developernya doang (one developer's machine) saat ini beralih kodrat pindah ngeloncat naek tingkat naik derajat is now ngejelma menetas lahir berubah sah-mutlak seutuhnya ganti seragam bener-nyah murni kepatok cap stempel sahh bisa bener mujarab paten (provably correct) dijalan di jagat langit angkasa awan tawang jagat awan nirwana belantara alam mayapada langit jagad in the cloud — nggeleng ngekor urut-urut jalan ngikut tertib rapi sesuai patuh (on schedule), ngawasin siaga sedia melek nunggu mampang merem melek standby jegat mantengin (on PR), dan dipepet di saat sekepepet apa sewaktu-waktu digedor pintu pas kepaksa ngundang sewaktu diutus diundang dipencet narik tombol saat dibutuhkan dadakan mndadak dicari butuh and on demand. Rombongan serentet lakon-lakon ke-37 The 37-skenario jejeran plot test plan dengan pongah petentengan angkuh tetep gas maju menderu melaju mlaku-mengaspal nggelundung muter ngejalanin-hidup berjalan menempuh takdirnya runs gundulan gundul botak tanpa perlu narik pasang njengat muka tanpa buka kelir tanpa kepala headless setiap jumatan mingguan (every week) diarak diarak mboyong iringan pengawal full kasta pelindung pamungkas berselimut rompi auth murni tanpa sunat komplit full auth, dipayung naungan payung komplit full sejarah-lampaunya history, serentetan nyeret dan ngeret rentengan panjang full kereta perlengkapan usut sidik bekal perabotan peninggalan full bungkusan komplit-komplit mbongkar data penyidik forensik nyelidik and full forensic data tatkala mentok njebluk ngejungkel meleset celaka nyium tanah nyungsep jatoh nabrak on failure.

Corak-corak wujud-corak jajaran polah tingkah rupa The patterns susunan pernak-pernik ukiran the patterns polah tingkah ukir-ukiran ornamen ukiran corak rupa The patterns bentukan pahatan disini — conditional fixture gating pengekangan pembatas gerbang fixture fixture gating, context isolation jurus pisah misah ruang memisah isolasi context context isolation, structured label mapping perakitan pemetaan penunjuk pemandu alur rakit pemetaan penyusunan structured label mapping terstruktur rakitan pemaetan mapping, and sekawan gandengan pasangannya cache-cycle history roda rentetan roda-putar gulungan muteran siklus daur-mutar perulangan siklus simpen-cache rentetan riwayat cache-cycle history — semuanya aren't ga ada yg murni ga kusus sekedar aren't specific buat to GitHub atokah si or Playwright. Mereka tuh murni sesungguhnya wujud bentuk sebongkah ukiran pahatan jajaran They're architectural cetakan seni-arsitektur murni perwujudan pakem arsitektural aseli architectural patterns yang dengan enteng tulus lentur luwes pas-nempel mlepek klop nyocok gampang bisa kepake (that apply) ditempel ditancep diaplikasi terapin pas-bener to any membalut segala segala perwujudan nempel any wujud rupa apa aja bentuk rupanya raga per-wujud rupa segala bentuk nyah rakitan rupa rakitan raga test E2E E2E test wadah pengemas suite setelan perangkat set uji test suite manapun yang ngerasa (that needs) ngebet neken ronta butuh untuk lulus muncak mumbul naik kasta mumbul mumbul mekar berkembang nglulusin kembang wisuda mumbul mumbul naek (to graduate) manjat lepas landas sedari (from) sebates pangkuan mesin a developer's lep-top laptop merangkak ngerambat mbentang manjat manjat nyundul nyantol tembus ke sebuah nyampe (to a) saringan talang pipa pralon lintasan rute sirkuit CI jalan saluran saringan aliran pipa selang CI pipeline tanpa ngedropin mbledukin nyungsepin ancur ngeruntuhin ngorbanin ngorbanin kompromiin ngegadein tanpa ngutang merugikan (without compromising) urusan ketatnya pintu keamanan perlindungan perisai sekuriti security, gila gilaan laju kilat daya pacu ngebut nyah kenceng speed, sekalian bareng-ikutan or ngedegradasi nyunatin ngikis pangkas ngeruk ngegerus turun pamor mutu pamer melotot mampang daya awas liat-nya mampang daya tembus daya-terawang ngamatin kepantau keterlihatan (or observability).

_Pangggung berikutnya lakon selanjutnya nantikan kelanjutannya di babak berikut (Next up): pameran tanding adu nyali uji sorot tes visual (visual regression tests) serentak-serta plus kawinan bareng and saringan cek-ricek penjaga-pintu nguji kemudahan rambat nyelusup masuk penyandang khusus disabilitas urusan akses (accessibility checks)._
