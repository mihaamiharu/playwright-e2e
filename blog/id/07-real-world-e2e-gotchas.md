# Waktu DOM Ngajak Ribut: 4 Masalah Asli E2E dari GitHub Projects

> **Part 7 dari seri Playwright E2E.**
> [Part 1](/blog-id/01-why-real-websites.md) — Kenapa website beneran lebih baik dari demo app
> [Part 2](/architecture-tour) — Arsitektur dari production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Kenapa pakai fixtures daripada BaseTest
> [Part 4](/blog-id/04-authentication-without-2fa.md) — Autentikasi tanpa mimpi buruk 2FA
> [Part 5](/blog-id/05-building-label-tests-with-ui-discovery.md) — Bikin E2E test buat label lewat penelusuran UI
> [Part 6](/blog-id/06-assignees-milestones.md) — Assignees & Milestones: Pola sidebar beneran berguna

---

## Premisnya: 7 skenario baru, 4 domain baru

Setelah kelar masalah label, assignee, dan milestone, Fase 4 dari test plan kita adalah ngerjain **Views & Collaboration** — layout tabel, komentar, operasi bulk (massal), dan fitur cari (search) di dalam project:

| ID      | Skenario                                                             |
| ------- | -------------------------------------------------------------------- |
| TBL-01  | Ganti ke table view → verifikasi kolom ngerender                     |
| TBL-02  | Urutkan (sort) tabel dari suatu kolom → verifikasi urutannya berubah |
| TBL-03  | Filter tabel pakai suatu field → verifikasi barisnya cocok           |
| CMT-01  | Tambahin komen lewat API → verifikasi muncul di timeline             |
| CMT-02  | Edit komen lewat API → verifikasi teksnya ke-update                  |
| BULK-01 | Update status massal lewat API → verifikasi semuanya berubah         |
| SRCH-01 | Cari pake keyword → verifikasi hasil yang cocok                      |

Kita udah punya data lifecycle utuh (seed → verifikasi → cleanup), layer API udah siapin `addComment()`/`updateComment()`, dan project sandbox udah penuh sama data yang siap pakai. Kita mikirnya cuma bakal nulis beberapa definisi step terus kelar sejam.

Kenyataannya: ada 4 ranjau beda di tiap domain, yang masing-masing maksa kita ganti arah di tengah-tengah implementasi.

---

## Masalah 1: Pencocokan substring di `getByRole` — "Unsaved" berarti "Save"

### Awal masalahnya

Setelah ganti view project dari layout Board ke Table, kita masang filter status:

```typescript
await page.getByRole('combobox', { name: 'Filter' }).click();
await page.getByRole('option', { name: 'Status, Filter' }).click();
await page.getByRole('option', { name: 'Backlog, Status' }).click();
await page.getByRole('button', { name: 'Save' }).click();
```

Error-nya muncul:

```
Error: strict mode violation: getByRole('button', { name: 'Save' }) resolved to 2 elements:
  1) <button>Save</button>
  2) <button>Unsaved changes View</button>
```

Tunggu dulu — **"Unsaved changes View"** cocok sama `{ name: 'Save' }`? Coba perhatiin lebih deket:

```
"Unsave d changes View"
       ^^^^
```

Fungsi `getByRole(..., { name })` punya Playwright itu jalan dengan sistem **substring matching yang case-insensitive** (nggak peduli huruf besar kecil) secara default. Kata `"Unsaved"` emang ngandung kata `"save"` di dalemnya. Jadinya `{ name: 'Save' }` nangkep dua-duanya: tombol Save punya filter dan tombol "Unsaved changes View" punya menu View.

### Solusinya

Tambahin `exact: true` buat maksain (constrain) pencarian persis sesuai nama yang diminta:

```diff
- await page.getByRole('button', { name: 'Save' }).click();
+ await page.getByRole('button', { name: 'Save', exact: true }).click();
```

Cuma perlu rubah itu doang, tapi bayarannya 30 menit pusing debugging lewat tiga kali retry test. Filternya terus-terusan nemu elemen ganda, action `click` terus-terusan ngelempari strict-mode violation, dan pesan error-nya sendiri malah nyesatin — dia nunjukin elemen kedua sebagai `aka getByRole('button', { name: 'Unsaved changes View' })`, yang nggak njelasin _kenapa_ kok itu bisa nyangkut pas nyari `'Save'`.

### Prinsip yang didapat

| Kasus                                           | Cocok pakai `{ name }`      |
| ----------------------------------------------- | --------------------------- |
| `name: 'Save'` nangkap `"Unsaved changes View"` | Substring, case-insensitive |
| `name: 'Status'` bisa nangkap `"No Status"`     | Sama                        |
| `name: 'Title'` bisa nangkap `"Sub-title"`      | Sama                        |

**Aturan**: setiap kali error strict-mode dari `getByRole` nunjukin elemen yang teksnya nggak jelas kenapa bisa nyangkut nama lo, langsung curigain pencocokan substring. Tambahin `exact: true` dan coba lagi.

---

## Masalah 2: Filter bar GitHub itu nimpa, bukan nambah

### Awal masalahnya

TBL-03 awalnya ditargetin buat ngetest filtering lebih dari satu field (multi-field):

```gherkin
Scenario: Filter table by status AND label → verify intersection works
  Given issue "A" exists with status "Backlog" and label "bug"
  And issue "B" exists with status "Done" and label "bug"
  When I filter the view by status "Backlog" and label "bug"
  Then only issue "A" should be visible
```

Implementasi lugunya masang dua filter berurutan:

```typescript
// Step 1: filter dari status
await page.getByRole('combobox', { name: 'Filter' }).click();
await page.getByRole('option', { name: 'Status, Filter' }).click();
await page.getByRole('option', { name: 'Backlog, Status' }).click();
await page.getByRole('button', { name: 'Save', exact: true }).click();
// URL: ?filterQuery=status%3ABacklog

// Step 2: nambahin filter label
await page.getByRole('combobox', { name: 'Filter' }).click();
// ... milih Label, milih "bug" ...
await page.getByRole('button', { name: 'Save', exact: true }).click();
// URL: ?filterQuery=label%3Abug   ← filter status ngilang!
```

Setelah ngeklik Save di langkah ke-2, URL-nya cuma ngandung `filterQuery=label%3Abug`. Filter status malah ketimpa, bukannya tergabung.

Kita ngetest dua teori:

1. **Lebih dari satu param `filterQuery` di URL**: `?filterQuery=status%3ABacklog&filterQuery=label%3Abug` — GitHub ngebiarin (ignore) nilai yang kedua.

2. **Ngetik langsung ke dalem combobox filter yang lagi aktif**: ngisi `label:bug` pas kondisi `status:Backlog` lagi aktif — GitHub tetep nimpa filter lamanya, sama aja kayak pas klik Save.

Dua-duanya gagal. Filter bar itu cuma nerima **satu `filterQuery` sekaligus**, titik.

### Banting setir (Pivot)

Kita ngedesain ulang TBL-03 buat ngetest filtering buat single-field aja tapi pake skenario negatif yang kuat:

```gherkin
Scenario: Filter table by a field and verify matching rows
  Given issue "A" exists with status "Backlog" and label "bug"
  And issue "B" exists with status "Done" and no label
  When I filter the table by label "bug"
  Then issue "A" should be visible
  And issue "B" should not be visible
```

Test ini tetep bisa ngebuktiin kalau filternya emang beneran fungsi — cuma batas ngebuktiin buat satu kriteria doang (nggak intersect). Intersection multi-field masih nggak bisa ditest lewat UI filter GitHub sekarang ini.

### Prinsip yang didapat

**Sebelum lo bikin rentetan 3 langkah filter di Gherkin**, cobain dulu di playwright-cli. Buka browser, pasang dua filter pakai tangan, terus liat URL-nya. Kalo URL cuma nampilin satu `filterQuery`, berarti test lo butuh desain ulang — jangan nyoba diakalin (workaround).

---

## Masalah 3: Layar Backdrop "Unsaved changes" yang ngehalangin pemandangan

### Awal masalahnya

Mindahin view project dari layout Board ke layout Table bakal ngebuka menu dropdown "View" GitHub. Alurnya gini:

```typescript
await page.getByRole('button', { name: 'View', exact: true }).click();
await page.getByRole('button', { name: 'Table' }).click();
await page.waitForURL(/layout=table/);
await expect(page.getByRole('grid')).toBeVisible(); // Tabel berhasil ngerender
```

Sejauh ini aman. Tapi pas langkah berikutnya nyoba nge-click combobox filter:

```
locator resolved to <input role="combobox" ... value="status:Backlog"/>
- <div class="prc-Dialog-Backdrop-5Nt2U">…</div> subtree intercepts pointer events
```

Ada elemen `prc-Dialog-Backdrop` (backdrop React dari Primer) yang ngangkang di atas halamannya, ngecegat semua action click. Dari mana datangnya?

### Akar masalah

Menu View GitHub nggak ketutup rapi abis lo ngeganti layout. Pas lo rubah dari Board ke Table:

1. Menu item ke-click → layout-nya keganti
2. Tapi menunya tetep mangap dalam mode **"Unsaved changes"**
3. Mode ini nge-render button-button ("Save view", "Discard") di dalam overlay (dialog).
4. Dialog itu ngehasilin **backdrop** segede-gede layar yang nge-blok (intercept) semua pointer event (klik).

Insting awal kita — pake `page.keyboard.press('Escape')` — nggak ngebantu. Tombol Escape cuma nutup konten di menunya tapi tetep nyisain `<div>` backdrop di dalam DOM.

### Solusinya

Solusi dua bagian:

```typescript
When('I switch to the table layout view', async ({ page }) => {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('button', { name: 'Table' }).click();
  await page.waitForURL(/layout=table/);
  await expect(page.getByRole('grid')).toBeVisible({ timeout: 15000 });

  // Singkirkan (dismiss) overlay Unsaved changes
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500); // Tungguin backdrop-nya ngilang
});
```

Terus, abis setiap Save filter, tambahin Escape kedua:

```typescript
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForURL(/filterQuery/);
await page.keyboard.press('Escape'); // Singkirkan overlay nyasar yang sisa
await page.waitForTimeout(300);
```

Tunggu (wait) yang 500ms dan 300ms ini emang disengaja — backdrop Primer pake transisi CSS buat nampilin animasi masuk dan keluar (enter/exit animations). Tanpa waktu tunggu, click berikutnya bisa kejeblos nangkep elemen pas animasi keluar lagi jalan sedangkan si backdrop-nya masih di dalam DOM.

### Prinsip yang didapat

**Dialog yang nggak nutup otomatis setelah diklik bakal nyisain backdrops.** Tiap abis ngelakuin action yang bikin UI berubah (ganti tab, ganti view, nyalain mode), cek pakai `document.querySelector('[class*="Backdrop"]')` dari playwright-cli. Kalau emang ada, lo wajib matiin dulu sebelum jalan ke tahap selanjutnya.

---

## Masalah 4: Filter bar dan opsi kolom itu dua sistem filtering yang beda

### Awal masalahnya

Pas lagi pusing debugging masalah filter TBL-03, kita ngeliat keanehan: abis nerapin filter lewat global filter bar (`combobox "Filter"`), header-header kolom di tabel nggak ngasih tanda visual kalau mereka kefilter. Tapi pas nge-click tombol "column options" di sebuah kolom nunjukin opsi "Filter by values…" tersendiri.

Ternyata ini adalah **dua sistem filtering mandiri** yang numpang idup di halaman yang sama:

| Sistem            | Pemicu (Trigger)                                    | Ruang lingkup | Pengaruh ke URL                 |
| ----------------- | --------------------------------------------------- | ------------- | ------------------------------- |
| Global filter bar | `combobox "Filter"` di toolbar                      | Seproject     | Update nilai `?filterQuery=`    |
| Column filter     | `button "X column options"` → `"Filter by values…"` | Cuma di kolom | Cuma ngerubah setingan internal |

Global filter bar nimpa parameter URL `filterQuery` dan buang barisan yang nggak cocok di grid. Filter kolom ngubah konfigurasi internal layout tanpa nyentuh URL sama sekali.

### Gimana ini bisa bikin kita kebingungan

Kita habisin 20 menit nyari akal biar opsi "Status, Filter" di global bar gabung sama "Label, Filter" (Ini di Gotcha 2). Padahal cara benernya udah mejeng depan muka kita daritadi:

```yaml
# Ngeklik header Status di tabel nunjukin:
- menuitem "Filter by values…"
```

Harusnya kita bisa nge-filter status lewat filter bawaan dari column header-nya, terus nambahin filter label pake bar global-nya. Dua sistem terpisah jalan bareng — nggak perlu rebutan nimpa-nimpa.

Tapi sewaktu sadar, test-nya telanjur kita desain ulang (banting setir Gotcha 2). Filter per kolom emang bisa dicoba, tapi malah ngelahirin masalah baru: filter dari **Labels** nggak bakal ada kalo lo nggak nambahin kolom Labels ke tampilan tabel (secara default nggak kelihatan). Nyari akal nambahinnya pake tombol "Add field" malah nambah kerjaan sampe tiga langkah ekstra.

### Prinsip yang didapat

**Pelajarin seutuhnya struktur ARIA (locator tree) sebelum nulis kode selaris pun.** Cuma pake `playwright-cli snapshot` 30 detik di tabel headernya bisa langsung kasih info keberadaan column filter options daritadi, jadinya hemat 2 jam pusing nyari solusi filter bar.

---

## Apa aja yang mulus (berjalan lancar)

Gak semua hal ngajak berantem kok. Tiga skenario langsung sukses nembus dari percobaan pertama:

**Komentar (CMT-01/02)** adalah urusan termudah seantero project. Fungsi method API-nya udah siap dari dulu:

```typescript
// src/utils/api-client.ts — method yang nganggur berpekan-pekan
async addComment(repo, issueNumber, body): Promise<GitHubComment>
async updateComment(repo, commentId, body): Promise<GitHubComment>
```

Definisi step-nya cukup satu baris:

```typescript
When('I add a comment {string} via the API', async ({ githubAPI, seededProjectIssue }, body) => {
  await githubAPI.addComment(env.github.testRepo, seededProjectIssue.number, body);
});
```

Dan pembuktian cukup nebak (match) kata/teks:

```typescript
Then('I should see the comment {string} on the issue', async ({ page }, body) => {
  await expect(page.getByText(body)).toBeVisible();
});
```

Dua skenario, dua API call, dan nol kebutuhan pake playwright-cli session. Infratruktur test kita balik modal banyak dari bagian ini.

**Operasi massal (BULK-01)** dan **pencarian (SRCH-01)** itu test murni jalur cepat nguji API (API-first tests): sebar seed data via REST/GraphQL, terus buktiin di UI. Ujian operasi massal nendang mindahin (move) dua isu barengan pake `moveItemToStatus`, dan ujian pencariannya (search) maken opsi "Title, Filter" di filter bar lalu disusul sama aksi `page.keyboard.type()`. Keduanya lulus pada kali pertama dicoba.

---

## Tabel locator yang kita dapetin

| Elemen UI          | Locator                                                           | Masalah (Gotcha)                                     |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------- |
| Buka menu View     | `getByRole('button', { name: 'View', exact: true })`              | #3                                                   |
| Ganti ke Table     | `getByRole('button', { name: 'Table' })`                          | #3                                                   |
| Grid (Tabel)       | `getByRole('grid')`                                               | Nunggu ngerender (wait) kelar layot                  |
| Header kolom       | `getByRole('columnheader', { name: /^Title/ })`                   | Nama gabungan: "Title Title column options"          |
| Opsi kolom         | `getByRole('button', { name: 'Title column options' })`           | #4                                                   |
| Urut menaik (Asc)  | `getByRole('menuitem', { name: 'Sort ascending' })`               | Tunggu parameter `sortedBy` muncul di URL            |
| Urut turun (Desc)  | `getByRole('menuitem', { name: 'Sort descending' })`              | Sama juga                                            |
| Barisan Tabel      | `getByRole('row').filter({ hasText: title })`                     | Data yang nyempil dari lama ngerusak (pollute)       |
| Link di row        | `getByRole('rowheader').getByRole('link')`                        | Dipake pas ngebuktiin urutan sorting (sort)          |
| Combobox Filter    | `getByRole('combobox', { name: 'Filter' })`                       | #2, #3                                               |
| Tipe Status Filter | `getByRole('option', { name: 'Status, Filter' })`                 | Bukan "Status, Filter, Filter by status"             |
| Nilai Status       | `getByRole('option', { name: 'Backlog, Status' })`                | Nggak usah ada `exact: true` ke nilainya             |
| Tipe Filter Label  | `getByRole('option', { name: 'Label, Filter, Filter by label' })` | #2                                                   |
| Nilai Label        | `getByRole('option', { name: 'bug, Label' })`                     | Begitu juga sama                                     |
| Pencarian Judul    | `getByRole('option', { name: 'Title, Filter' })`                  | Trus masukin (type) di `page.keyboard.type(keyword)` |
| Apply Filter       | `getByRole('button', { name: 'Save', exact: true })`              | #1                                                   |
| Dismiss Overlay    | `page.keyboard.press('Escape')`                                   | #3 — plusin pake `waitForTimeout(500)`               |
| Teks Komentar      | `page.getByText(body)`                                            | Fungsi pas ngedit atau cuma hasil original           |

---

## Inti dari artikel ini (Key takeaways)

| Pelajaran                                                         | Kenapa ini penting                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pake `exact: true` wajib buat nama-nama yang pendek**           | Nama pendek kayak `'Save'` bakal bisa kecantol (match) di `'Unsaved'`, trus kata `'Status'` nyantol di `'No Status'`, kata `'Title'` ke `'Sub-title'`. Button apa aja yang di bawah 6 karakter gede peluangnya nyangkut masalah substring ini. Selalu defaultin ke `exact: true` kecuali kalau lo butuh pencocokan substring. |
| **Uji coba susunan filter UI-nya sebelum bikin test-nya**         | Filter bar dari GitHub itu sistemnya single-filter (satu kali eksekusi). Nggak bakalan bisa lo maksa `AND` gabung dua syarat (criteria) lewat UI-nya. Ketahuilah semua itu lebih dulu dari playwright-cli, daripada nyesel di test runner lo.                                                                                 |
| **Dialog nyisain backdrop — dan backdrop itu bikin nyangkut**     | Abis bikin perubahan (action) penting ke UI-nya (layout keganti, view ganti-gantian), periksa pelan-pelan apakah ada layar (overlay) yang nyangkut. Teken `Escape` bareng ngasih tunggu bentar (wait 500ms) udah jadi cara paling ampuh dan aman.                                                                             |
| **Filter secara keseluruhan (global) beda dari filter per kolom** | Jangan main tebak kalau mereka itu saling tindih mengganti. Telusuri dulu pohon strukturnya. Snapshot 30-detik pakai fitur snapshot tabel di awal harusnya ngungkapin cara milih kolomnya (tanpa harus ngelewatin mimpi buruk selama dua jam lamanya nyoba nembus ini).                                                       |
| **Tes infra itu sifatnya balik modal keuntungannya terus**        | Tes (CMT-01/02) butuh 5 menit aja soalnya urusan API, fixture dan sistem data (data lifecycle)-nya semua udah pernah teruji dalam keadaan kejam di domain-domain sebelumnya. Nambah domain, otomatis bakal makin ngebut yang selanjut-lanjutnya.                                                                              |

---

Fase 4 nge-handle 7 skenario nge-cover 4 domain beda, kelar dikerjakan dalam kurun waktu 3,5 jam. Semua rintangan 4 Gotchas ini buang-buang sekitar ampir 2 jam sendiri — sekaligus jadi guru ghaib ngasih ilmu buat mahamin keajaiban aneh di struktur DOM (Document Object Model) punya GitHub sendiri lebih dari 17 passing test yang digabung sebelum-sebelumnya. Kini roadmap rencana pengujian nambah sampe angka ke-24 skenario dari semua total (7 buah domain) ditambah semua tes siklus awal/akhir yang kelar kayak: create, ngelabelin (label), nunjuk-orang (assign), dan ngitung nilai (estimate). Serta track bareng semua fitur komentar kolaborasi (collaborate) sampai nyari fitur (search).

_Selanjutnya di agenda: Fase 5 — Custom Fields (Kolom kostumisasi), Draft Items (Item baru belum utuh), File Archive (Arsip Data), Penomoran iterasi Tanggal/Bulan (Date/Iteration fields), Daftar tampilan Tersimpan (Saved Views), Urutan klasemen (Ranking), sama Auto-Workflows._
