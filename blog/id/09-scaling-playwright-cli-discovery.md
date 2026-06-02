# Dari Sekali Klik ke Full Workflow: Scaling playwright-cli buat Alur UI Multi-Langkah

> **Part 9 dari seri Playwright E2E.**
> [Part 1](/blog-id/01-why-real-websites.md) — Kenapa website beneran lebih baik dari demo app
> [Part 2](/architecture-tour) — Arsitektur dari production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Kenapa pakai fixtures daripada BaseTest
> [Part 4](/blog-id/04-authentication-without-2fa.md) — Autentikasi tanpa mimpi buruk 2FA
> [Part 5](/blog-id/05-building-label-tests-with-ui-discovery.md) — Bikin E2E test buat label lewat penelusuran UI
> [Part 6](/blog-id/06-assignees-milestones.md) — Assignees & Milestones: Pola sidebar beneran berguna
> [Part 7](/blog-id/07-real-world-e2e-gotchas.md) — 4 masalah asli E2E dari GitHub Projects
> [Part 8](/blog-id/08-graphql-schema-archaeology.md) — Arkeologi Skema GraphQL: Nyari Mutasi yang Pas

---

## Premisnya: satu fitur, lima langkah UI, nol locator yang ketahuan

Skenario Saved Views di Fase 5 nawarin tantangan baru. Beda dari label (Part 5 — satu dialog, satu aksi) atau assignees (Part 6 — pattern dialog sama, cuma beda field), saved views nuntut (require) alur yang urut dan berlapis di mana state (kondisi) halaman berubah di setiap langkahnya:

| Langkah | Aksi                              | State Halaman Sesudahnya                                                       |
| ------- | --------------------------------- | ------------------------------------------------------------------------------ |
| 1       | Navigasi ke view kanban           | Board yang ada kolom, tab view, toolbar                                        |
| 2       | Bikin board view baru             | Tab baru "View N" muncul di tablist, URL berubah ke `/views/N`                 |
| 3       | Terapin filter (Status = Backlog) | Chip filter nongol di toolbar, URL ketambahan `?filterQuery=status%3ABacklog`  |
| 4       | Ganti nama (rename) view-nya      | Nama tab berubah, tombol "View options for View N" → "View options for {name}" |
| 5       | Reload & mastiin tetep kesimpen   | URL sama, nama tab sama, filter sama sort tetep kesimpen (persist)             |

Part 5 ngajarin kita: buka browser lewat playwright-cli, interaksi sama halamannya, ambil snapshot struktur ARIA (locator tree), dan catet locator-nya. Itu emang jalan buat dialog tunggal. Buat alur lima-langkah kayak gini, kita butuh **sesi penelusuran (discovery session)** — semacam jalan-jalan terstruktur di mana tiap langkah interaksi bakal ngungkap set locator berikutnya dan setiap transisi kondisi tercatet.

---

## Langkah 1: Navigasi dan orientasi

```bash
playwright-cli open --browser=chrome
playwright-cli state-load auth/github.json
playwright-cli goto https://github.com
playwright-cli goto https://github.com/users/mihaamiharu/projects/8/views/1
playwright-cli snapshot
```

Snapshot awal ngungkap struktur board secara utuh. Elemen-elemen kunci buat alur kita:

```yaml
navigation "Select view":
  tablist:
    tab "Backlog" [selected]
    tab "Priority board"
    tab "Team items"
    tab "Roadmap"
    tab "My items"
    tab "New view"           ← titik awal kita

region "View filters":
  combobox "Filter"          ← buat nerapin filter

button "View options for Backlog" ← buat rename/delete
```

Langsung ketahuan satu hal penting: view (tampilan) itu nggak dikelola lewat panel "Views" khusus. Mereka eksis sebagai **tab** di dalam `tablist`, dan masing-masing tab punya sebuah `button` (tombol) yang ngebuka menu opsinya sendiri. Pattern interaksi sama sebuah view itu gini: klik tab-nya → interaksi ke board → klik tombol opsi-nya buat ganti nama/hapus (rename/delete).

---

## Langkah 2: Menu "New view" itu bukan halaman — itu cuma menu

```bash
playwright-cli click "getByRole('tab', { name: 'New view' })"
playwright-cli snapshot --depth=8
```

Nge-klik tab-nya ternyata nggak langsung bikin view baru. Dia ngebuka sebuah **menu**:

```yaml
menu "New view":
  group "Layout":
    menuitem "Table" [active]
    menuitem "Board"
    menuitem "Roadmap"
  menuitem "Duplicate view"
```

Tombol "New view" nawarin opsi layout. Memilih layout barulah nyiptain view itu:

```bash
playwright-cli click "getByRole('menuitem', { name: 'Board' })"
```

Tindakan ini navigasi halamannya ke `/views/6` — view baru pun lahir. Bagian tablist sekarang nunjukin:

```yaml
tab "Backlog"
tab "Priority board"
tab "Team items"
tab "Roadmap"
tab "My items"
tab "View 6" [selected]      ← view baru, otomatis dinamain "View 6"
tab "New view"
button "View options for View 6"
```

**Pelajaran**: Ngeklik tab nggak selamanya berujung navigasi pindah halaman. Kadang malah cuma ngebuka menu. Alur locator-nya: `getByRole('tab')` → `getByRole('menuitem')` → pilih layout → lalu URL pun berganti.

---

## Langkah 3: Nerapin filter dan nyatet transisi kondisi halaman

```bash
playwright-cli click "getByRole('combobox', { name: 'Filter' })"
playwright-cli snapshot --depth=10
```

Combobox filternya ngebuka opsi kategori filter. Part 7 (Gotcha 1) ngasih paham kita soal ancaman pencocokan substring di penamaan opsi filter, jadi kita tetep pake pattern regex:

```bash
playwright-cli click "getByRole('option', { name: /Status/ })"
playwright-cli click "getByRole('option', { name: /Backlog/ })"
```

URL langsung ganti saat itu juga: `?filterQuery=status%3ABacklog`. Ada dua transisi state yang terjadi:

| Transisi              | Sebelum (Before)    | Sesudah (After)                         |
| --------------------- | ------------------- | --------------------------------------- |
| Nilai combobox Filter | Kosong              | `status:Backlog`                        |
| Parameter query URL   | `/views/6`          | `/views/6?filterQuery=status%3ABacklog` |
| Tombol di toolbar     | Cuma "Filter" doang | Nambah tombol "Discard" sama "Save"     |
| Isi konten board      | Semua kolom nampak  | Cuma kolom Backlog yang ada isinya      |

Tombol "Save" sama "Discard" muncul gara-gara ganti filter di view baru memicu status "Unsaved changes" (Perubahan belum disimpen). Definisi step kita antara butuh:

1. Nge-klik "Save" biar filternya kekunci (persist), atau
2. Nge-klik "Discard" buat batalin.

Praktiknya, biarpun kita nyuekin (unsaved) filternya, itu bakal tetep nongkrong utuh di URL — GitHub ngelakuin auto-save modifikasi view pas satu rentang sesi (session). Tombol "Save" bener-bener butuh diklik kalo lo pengen ngerubah default view-nya (view definition) sampe pas lo bolak-balik pindah tab filternya masih nempel. Karena reload doang tetep nge-load halaman view itu sendiri, filter hasil auto-save udah cukup buat ngetestnya.

Tapi biar aman dan bener-bener nyontoh alur aslinya pengguna (actual flow), step-nya kita rancang buat klik Save setelah terpasang:

```typescript
await page.getByRole('option', { name: /Status, Filter/ }).click();
await page.getByRole('option', { name: new RegExp(`${value}, Status`) }).click();
```

---

## Langkah 4: Rename (ganti nama) view lewat dialog

```bash
playwright-cli click "getByRole('button', { name: /View options for/ })"
playwright-cli snapshot --depth=8
```

Menu opsi kebuka:

```yaml
menu "View options for View 6": menuitem "Rename view"
  menuitem "Move view"
  menuitem "Save changes to new view"
  menuitem "Delete view"
  menuitem "Generate chart"
  menuitem "Export view data"
```

Memilih "Rename view" ngebuka dialog modal:

```bash
playwright-cli click "getByRole('menuitem', { name: 'Rename view' })"
playwright-cli snapshot --depth=10
```

```yaml
dialog "Rename view":
  heading "Rename view" [level=1]
  button "Close"
  textbox "View name" [active]: "View 6"
  button "Cancel"
  button "Save"
```

Alur rename ini adalah pattern dialog umum (standard): `dialog "Rename view"` → `textbox "View name"` → ketik nama barunya → `button "Save"`. Tapi hati-hati sama scope (pembatasan area). Bisa aja ada beberapa tombol "Save" nongkrong di halaman yang sama (bar filter juga punya satu). Tanpa membatasi scope-nya ke si dialog, lo langsung kena strict-mode violation:

```typescript
// ❌ Rapuh — Ada tombol "Save" ganda di halamannya
await page.getByRole('button', { name: 'Save' }).click();

// ✅ Aman cuma dituju ke kotak rename dialognya
await page
  .getByRole('dialog', { name: 'Rename view' })
  .getByRole('button', { name: 'Save' })
  .click();
```

Setelah di-rename, title halamannya ke-update:

```
Title: "View 6 · kanban-board"  →  "E2E Test View · kanban-board"
Tab:    "View 6"                 →  "E2E Test View"
Button: "View options for View 6" → "View options for E2E Test View"
```

Tahap langkah rename lengkapnya:

```typescript
When('I create a new board view named {string}', async ({ page }, baseName) => {
  // Step 2: bikin view
  await page.getByRole('tab', { name: 'New view' }).click();
  await page.getByRole('menuitem', { name: 'Board' }).click();
  await page.waitForURL(/\/views\/\d+/);

  // Step 4: rename (ganti nama)
  await page.getByRole('button', { name: /View options for/ }).click();
  await page.getByRole('menuitem', { name: 'Rename view' }).click();

  const dialog = page.getByRole('dialog', { name: 'Rename view' });
  const textbox = dialog.getByRole('textbox', { name: 'View name' });
  await textbox.clear();
  await textbox.fill(baseName + ' ' + Date.now()); // ngasih unik string
  await dialog.getByRole('button', { name: 'Save' }).click();
});
```

---

## Langkah 5: Reload dan mastiin data tetep nyimpen (persistence)

```bash
playwright-cli reload
playwright-cli snapshot --depth=6
```

Sehabis ngereload, kita mastiin tiga hal:

1. **URL**: Masih `?filterQuery=status%3ABacklog` — filternya tetep.
2. **Title**: `E2E Test View · kanban-board` — namanya juga tetep nyimpen.
3. **Status Tab**: `tab "E2E Test View" [selected]` — tab yang aktifnya juga tetep posisinya.

```typescript
Then(
  'the current view should show filter {string} with value {string}',
  async ({ page }, field, value) => {
    await expect(page).toHaveURL(new RegExp(`filterQuery=${field.toLowerCase()}%3A${value}`));
    await expect(page.getByRole('combobox', { name: 'Filter' })).toHaveValue(new RegExp(value));
  },
);
```

---

## Pelajaran soal Scoping: overflow menus biang strict-mode violation

Waktu kita pertama kali nulis langkah verifikasi tab, kita make pencarian level halaman (page-level locator):

```typescript
const tab = page.getByRole('tab', { name: viewName });
await expect(tab).toHaveAttribute('aria-selected', 'true');
```

Malah ancur dan muncul ini:

```
Error: strict mode violation: getByRole('tab', { name: 'E2E Test View' })
resolved to 6 elements
```

Ada enam biji tab yang punya nama kembar? Board-nya kan cuma nampilin satu tab per view. Biang keroknya: test run yang sebelumnya udah berhasil nyetak view dengan nama yang sama persis, dan pas mekanisme tab meluap (overflow) milik GitHub jalan — waktu tab kebanyakan buat mejeng layarnya, tab sisa masuk ke **menu limpahan tersembunyi (hidden overflow menu)** dan isinya masih sama berstatus elemen `role="tab"`. Jadinya biarpun tersembunyi, tetep nyangkut (match) di pemanggilan locator `getByRole('tab', { name: '...' })`.

Benerinnya: batasin area (scope) ke dalem `tablist` yang cuma tampil (visible):

```typescript
// ✅ Cuma `tablist` yang nongol di pandangan, bukan di menu overflow
const tab = page.getByRole('tablist').getByRole('tab', { name: viewName });
await expect(tab).toHaveAttribute('aria-selected', 'true');
```

---

## Pelajaran Keunikan (Uniqueness): nama pake buntut timestamp aman dari tabrakan run

File feature aslinya nyuruh pakai nama view yang udah mati (static):

```gherkin
When I create a new board view named "E2E Test View"
```

Tiap run dari test ngebangun (create) view bernama gitu-gitu aja. Di run ke 6 kalinya, kita panen 6 tab bernama "E2E Test View" ngendon dalam overflow menu, memancing munculnya error strict mode barusan.

Benerinnya: bikin view selalu terlahir unik tiap sesinya:

```typescript
let currentViewName = '';

When('I create a new board view named {string}', async ({ page }, baseName) => {
  currentViewName = `${baseName} ${Date.now()}`;
  // ... bikin dan ganti pake variabel nama currentViewName ...
});
```

Skenario dari Gherkin tetep jalan pakai string nama statik biasa, cuman bagian definisi step menyuntiknya buntut (suffix) pake timestamp waktu sekarang. Step Then yang jalan verifikasinya juga ikutan make dari nilai simpenan `currentViewName` dibanding asal pake Gherkin parameternya langsung:

```typescript
Then('the created view tab should be visible', async ({ page }) => {
  await expect(page).toHaveTitle(new RegExp(currentViewName));
  const tab = page.getByRole('tablist').getByRole('tab', { name: currentViewName });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
});
```

Ini ngebedain kalau cek tahap VIEW-01 murni urusan step tunggal (`then the created view tab should be visible`), kebalikannya tahapan uji coba alih-view dari test VIEW-02 ngandalin step parameter utuh (`then the current view tab should be named {string}`). Teknik bedain yang modelnya kayak gitu nyetop penamaan nyuntik waktu-timestamp bocor ke step berbasis-parameter sembarangan.

---

## Pindah antar tab-view hasil nyimpen

Pengujian VIEW-02 justru butuh jalan simpel — cuma ngeklik tiap tab nyangkut (existing tabs):

```bash
playwright-cli click "getByRole('tab', { name: 'Priority board' })"
# URL → /views/2, title → "Priority board · kanban-board"

playwright-cli click "getByRole('tab', { name: 'Backlog' })"
# URL → /views/1, title → "Backlog · kanban-board"
```

Tindakan perpindahan tabnya gantiin jalur path (/views/N) sama judul halamannya. Step konfigurasinya:

```typescript
When('I switch to the {string} view', async ({ page }, viewName) => {
  await page.getByRole('tab', { name: viewName }).click();
  await page.waitForURL(/\/views\/\d+/);
});
```

Verifikasinya dobel nancepin cek di nilai title dan status `aria-selected` tabnya itu:

```typescript
Then('the current view tab should be named {string}', async ({ page }, viewName) => {
  await expect(page).toHaveTitle(new RegExp(viewName));
  const tab = page.getByRole('tablist').getByRole('tab', { name: viewName });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
});
```

---

## Tabel locator yang kita dapetin

| Elemen UI               | Locator                                                         | Catatan (Notes)                             |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| Daftar View tab         | `getByRole('tablist')`                                          | Ngebatasin tab ke yang visible aja          |
| Nyari View tab spesifik | `getByRole('tab', { name: viewName })`                          | Ini butuh navigasi pertukaran               |
| Tab New view            | `getByRole('tab', { name: 'New view' })`                        | Kebukanya ke menu kok, gak nyalain navigasi |
| Pilihan Board layout    | `getByRole('menuitem', { name: 'Board' })`                      | Letaknya dalem si opsi menu New view        |
| Pilihan Table layout    | `getByRole('menuitem', { name: 'Table' })`                      | Dalem New view menu opsi                    |
| View opsi-opsi          | `getByRole('button', { name: /View options for/ })`             | Regex bisa nangkep judul bebas              |
| Opsi Rename             | `getByRole('menuitem', { name: 'Rename view' })`                | Kepanggil di dalem menu opsinya             |
| Dialog Rename           | `getByRole('dialog', { name: 'Rename view' })`                  | Buat ngebatesin tombol save nya lo          |
| Kotak View name input   | `getByRole('textbox', { name: 'View name' })`                   | Ya nyangkut dalem rename dialog             |
| Filter combobox         | `getByRole('combobox', { name: 'Filter' })`                     | Pelajaran di Part 7, Gotcha 1               |
| Tipe Status Filter      | `getByRole('option', { name: /Status, Filter/ })`               | Nyari buat filter                           |
| Nilai Status Filter     | `getByRole('option', { name: new RegExp(value + ', Status') })` | Buat netapin nilai                          |
| Cek status pencet       | `toHaveAttribute('aria-selected', 'true')`                      | Cek dari elemen tab-nya                     |
| Cek page title          | `toHaveTitle(new RegExp(viewName))`                             | Buat cek awal active tab nya bener          |
| Cek URL Filter          | `toHaveURL(new RegExp(\`filterQuery=\`))`                       | Nyoba yakinin kalo parameter terapel        |
| Delete View ops         | `getByRole('menuitem', { name: 'Delete view' })`                | Ini penting buat clean-upnya nanti          |
| Konfirmasi Hapus        | `getByRole('alertdialog', { name: 'Delete view?' })`            | Tekan tombol click ke tombol hapus di dalam |

---

## Inti dari artikel ini (Key takeaways)

| Pelajaran                                                                                 | Kenapa ini penting                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alur langkah jamak (Multi-step) butuh discovery bertahap, ga bisa asal jepret tembak**  | Snapshotan doang gabakal buka rahasia dalemnya dialog ganti-nama, menu dropdown, sampe ke overlay nyangkut (unsaved changes). Lo perlu nyelam ke setiap sudut jalan urut satu per satu, sambil simpen rekam tiap ada manuver barunya.                                                                 |
| **Cangkum tab kudu ngeliat wilayah `tablist`**                                            | Fitur menu ngumpet meluap (Overflow menus) gampang bener numpuk-numpuk komponen tab-elemen kloningan di mana-mana. Kode `getByRole('tablist').getByRole('tab', { name })` inilah tembok bedain mana hasil nyala yang lolos uji dibanding strict-mode ngeri dari enam hasil tab numpuk ngembeng.       |
| **Area batas dialog kunci ngunci nama button amannya**                                    | Di satu panggung HTML bisa ngeroyok lebih dari satu tombol yang nyebutin "Save" bareng (filter menu bar + area ketik rename tabnya). Jaring batasan aksi ke dalem dialog biar klik aman: `dialog.getByRole('button', { name: 'Save' })`.                                                              |
| **Buntut stempel penunjuk waktu (timestamp) biar nyimpen memori seumur sisa ngerun-nya**  | View-view buatan lo kan tetep awet melintas waktu ngerun sesi page-nya. Kl testing ngotot makai nama statik murni tanpa bersih-bersih murni, ya otomatis numbuh kembaran gak berenti ngerusak locator kodenya lu nanti. Solusi wajib selalau nempelin buntut penunjuk `${Date.now()}`.                |
| **Kaji transisinya abis mutusin tiap satu perjalan aksi-langkah-nya**                     | Pas buka/bikin view (tampilan), cek jalan url-nya berubah nga. Begitu kelar sabetan masang nama filter baru (apply filter), liat embel-embel apaan yang nempatin url. Tiap baris `assertion` itu laksana rekam jejak yang nolong pusing debugging lo ketika alur sesudahnya tau-tau ambruk gagal.     |
| **Playwright-cli alat teliti bongkar (research tool), bukan sekadar alat debugin belaka** | Dalam kurun cuman sekedar sesi observasi 15-menit pencarian view di terminalnya playwright-cli nyetak seutuh dokumen table list locator ngupas kelima jurus di langkah-langkah rumit barusan. Sampai saking kerennya kita engga sekalipun butuh nge-run periksa ngebuka interface runner-nya sendiri. |

---

Testing fituran tampilan (saved views) tuntas cuma modal penelusuran (discovery) kisaran di bawah setengah jam sajah — yang malahan hasil ngaduk-ngaduk sendirilah ujung ujungnya yang nulis step-definitionnya itu sendri ke kita. Pada detik nge-close perambah CLI itu barusan kita dapet rapet seluruh seluk-beluk locatornya, jejak perpindah transisinya dan segala rekam validasinya dalam wujud dokumentasi mantep. Kegiatan nyalin test ngerakit feature and step-file di saat ini malah ngasa main jiplak nyalin nyantai, ngak kaya kelabakan puyeng mecahin debug ngadat sembari gulingguling.

Dari sisa bagian kelima Fase lima barusan, menuntaskan keseluruhan alur perjalanan plan test nyangkut angka 37 total rentetan, diwarnain ngirim (delivered) seenggaknya 13 sisa skenario masuk lintas ketujuh domain baru. Skor akhirnya tembus di pencapaian berikut ini: Total 11 set file Gherkin, 11 rantaian File Step (Step files), melahir-ciptain Lima (5) operasi API sistem-GraphQL termutakhir baru dan yang paling sakti 2 momen keemasan sesi telusuran playwright-cli itu sendiri ngeubah citra uji coba antar-muka berlapis urutan yang tadinya serasa ibarat masuk alam jin — jadi semudah sekadar masalah biasa-biasa gampang dikerjain.
