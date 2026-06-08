# Bikin E2E Test Buat Label: Dari Gherkin Sampai Hijau

> **Part 5 dari seri Playwright E2E.**
> [Part 1](/blog-id/01-why-real-websites.md) — Kenapa website beneran lebih baik dari demo app
> [Part 2](/architecture-tour) — Arsitektur dari production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Kenapa pakai fixtures daripada BaseTest
> [Part 4](/blog-id/04-authentication-without-2fa.md) — Autentikasi tanpa mimpi buruk 2FA

---

## Masalahnya: empat skenario label, nol locator yang ketahuan

Setelah kelar bikin test buat workflow board, target selanjutnya di test plan kita adalah **Labels & Metadata** — ada empat skenario P1:

| ID     | Skenario                                                                        |
| ------ | ------------------------------------------------------------------------------- |
| LBL-01 | Nambahin label ke issue lewat UI, mastiin labelnya muncul                       |
| LBL-02 | Nambahin beberapa label lewat UI, mastiin semuanya muncul                       |
| LBL-03 | Ngehapus label lewat UI, mastiin labelnya hilang                                |
| LBL-04 | Filter kanban board berdasarkan label, mastiin cuma item yang cocok yang muncul |

Siklus data-nya sih udah terbukti jalan — `github-project.fixture.ts` kita udah bisa bikin seed data issues, masukin ke project board, dan ngelakuin auto-cleanup. Layer API juga udah punya `addLabels()` dan `removeLabel()` yang siap pakai. Pertanyaannya: **gimana cara kita interaksi sama UI label picker-nya GitHub?**

Codebase-nya GitHub selalu ngerilis class CSS yang di-hash setiap kali deploy. Lo nggak bisa cuma nge-inspect DOM terus nulis `page.locator('.label-picker-dropdown-v3')`. Lo harus nyari tau **role-based locators** yang diekspos sama struktur ARIA — dan satu-satunya cara buat nyari tau itu adalah dengan buka browser beneran dan nelusurin halamannya.

Inilah saatnya `playwright-cli` beraksi.

---

## Sesi pencarian (Discovery session)

### Step 1: Buka issue beneran yang udah ada labelnya

Kita bikin temporary issue di test repo terus dikasih label `bug` lewat API, load state auth kita, dan buka issue-nya di playwright-cli:

```bash
playwright-cli open
playwright-cli state-load auth/github.json
playwright-cli goto https://github.com/mihaamiharu/github-projects-e2e/issues/122
playwright-cli snapshot
```

Snapshot itu ngungkapin struktur sidebar-nya. Elemen kunci di bagian label:

```yaml
- heading "Labels" [level=3]
- button "Edit Labels" [ref=e290] [cursor=pointer]
```

`button "Edit Labels"` — itu murni role-based locator. Nggak ada class CSS, nggak ada XPath, dan nggak ada yang bakal rusak (break) pas deploy selanjutnya.

### Step 2: Buka label picker

```bash
playwright-cli click "getByRole('button', { name: 'Edit Labels' })"
playwright-cli snapshot
```

Picker-nya muncul dalam bentuk dialog:

```yaml
- dialog "Apply labels to this issue" [ref=e541]:
    - heading "Apply labels to this issue" [level=1]
    - combobox "Filter labels" [expanded]
    - listbox "Label results":
        - group "Selected labels":
            - option "bug" [selected]
        - group "Suggestions":
            - option "documentation"
            - option "enhancement"
            - option "help wanted"
            - ...
```

Ada dua grup label: **Selected** (yang lagi kepasang) dan **Suggestions** (yang tersedia). Tiap label bentuknya `option` dengan nama labelnya.

### Step 3: Toggle label (pasang/lepas)

```bash
# Tambahin "enhancement"
playwright-cli click "getByRole('option', { name: 'enhancement' })"

# Tekan Escape buat nutup dialog
playwright-cli press Escape
```

Setelah ditutup, sidebar-nya ke-update:

```yaml
- link "bug Something isn't working"
- link "enhancement New feature or request"
```

Labelnya muncul sebagai elemen `link` dengan format `<name> <description>`. Buat mastiin label ada di halaman issue, kita bisa pake `page.getByRole('link', { name: new RegExp(label) })`.

### Step 4: Hapus label

Buka picker-nya lagi terus klik opsi yang lagi `[selected]` buat nge-deselect (lepas) label itu:

```bash
playwright-cli click "getByRole('button', { name: 'Edit Labels' })"
playwright-cli click "getByRole('dialog', { name: 'Apply labels to this issue' }).getByRole('option', { name: 'bug' })"
playwright-cli press Escape
```

Link "bug" hilang dari sidebar. Ternyata klik di `option` yang sama berlaku buat milih atau ngelepas label — sistemnya kayak toggle.

### Step 5: Eksplorasi filter label di board (LBL-04)

Pindah ke tampilan kanban, bagian filter bar-nya nunjukin:

```yaml
- region "View filters":
    - form "Filter":
        - combobox "Filter"
```

Klik combobox itu bakal nampilin tipe-tipe filter sebagai opsi. Milih "Label" bakal ngebuka sub-menu yang isinya daftar label:

```bash
playwright-cli click "getByRole('combobox', { name: 'Filter' })"
playwright-cli click "getByRole('option', { name: 'Label, Filter, Filter by label' })"
```

Sub-menu itu ngedaftar label kayak `option "enhancement, Label"` dan `option "bug, Label"`. Setelah milih salah satu terus klik "Save", URL-nya berubah jadi `?filterQuery=label%3Abug`.

---

## Dari sesi CLI pindah ke step definitions

Bermodalkan semua locator yang udah kita temuin, kita nulis step definitions di `steps/github/labels.steps.ts`:

```typescript
When('I add the label {string} via the UI', async ({ page }, label: string) => {
  await page.getByRole('button', { name: 'Edit Labels' }).click();

  const dialog = page.getByRole('dialog', { name: 'Apply labels to this issue' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('option', { name: label }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

When('I remove the label {string} via the UI', async ({ page }, label: string) => {
  await page.getByRole('button', { name: 'Edit Labels' }).click();

  const dialog = page.getByRole('dialog', { name: 'Apply labels to this issue' });
  await expect(dialog).toBeVisible();

  // Klik yang sama — buat toggle pasang/lepas
  await dialog.getByRole('option', { name: label }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
```

Daftar lengkap locator-nya:

| Elemen UI                 | Locator                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| Buka label picker         | `getByRole('button', { name: 'Edit Labels' })`                    |
| Dialog label picker       | `getByRole('dialog', { name: 'Apply labels to this issue' })`     |
| Pasang/lepas label        | `dialog.getByRole('option', { name: label })`                     |
| Tutup picker              | `page.keyboard.press('Escape')`                                   |
| Verifikasi label di issue | `getByRole('link', { name: new RegExp(label) })`                  |
| Filter combobox di board  | `getByRole('combobox', { name: 'Filter' })`                       |
| Pilih tipe filter "Label" | `getByRole('option', { name: 'Label, Filter, Filter by label' })` |
| Pilih label tertentu      | `getByRole('option', { name: 'bug, Label' })`                     |
| Terapin (apply) filter    | `getByRole('button', { name: 'Save' })`                           |
| Kartu (card) di board     | `getByRole('button', { name: new RegExp(title) })`                |

4 skenario Gherkin yang pake step ini:

```gherkin
Scenario: LBL-01 — Add label via UI and verify it renders
  Given a seeded project issue exists on the kanban board
  When I navigate to the issue page
  And I add the label "bug" via the UI
  Then I should see the "bug" label on the issue

Scenario: LBL-02 — Add multiple labels via UI and verify all render
  When I navigate to the issue page
  And I add the label "bug" via the UI
  And I add the label "enhancement" via the UI
  Then I should see the "bug" label on the issue
  And I should see the "enhancement" label on the issue

Scenario: LBL-03 — Remove label via UI and verify it disappears
  When I add the label "bug" via the API
  And I navigate to the issue page
  And I remove the label "bug" via the UI
  Then I should not see the "bug" label on the issue

Scenario: LBL-04 — Filter board by label, verify matching only
  When I add the label "bug" via the API
  And I seed a second unlabeled issue on the board
  And I navigate to the kanban view
  And I filter the board by the label "bug"
  Then the seeded issue should be visible on the board
  And the second unlabeled issue should not be visible on the board
```

---

## Misi sampingan: beresin duplikasi auth

Pas lagi nerapin test buat label ini, kita nyadar ada kode ngeload cookie yang diduplikat di dua tempat:

```typescript
// Di issue-crud.steps.ts DAN board-workflow.steps.ts:
const AUTH_PATH = path.resolve('auth/github.json');
try {
  const raw = fs.readFileSync(AUTH_PATH, 'utf-8');
  const { cookies } = JSON.parse(raw);
  if (cookies?.length) {
    await page.context().addCookies(cookies);
  }
} catch {
  // Auth file-nya mungkin belum ada
}
```

Kode ini dipanggil tiap sebelum `page.goto()`. Emang jalan sih, tapi ngulang-ngulang banget.

**Solusinya**: ekstrak auth ke utility, terus override fixture `page` biar load-nya cuma sekali tiap test:

```typescript
// src/utils/github-auth.ts
export async function ensureAuthCookies(context: BrowserContext): Promise<void> {
  try {
    const raw = fs.readFileSync('auth/github.json', 'utf-8');
    const { cookies } = JSON.parse(raw);
    if (cookies?.length) {
      await context.addCookies(cookies);
    }
  } catch {
    // Auth file mungkin nggak ada pas run pertama
  }
}

// src/fixtures/github-project.fixture.ts
export const test = base.extend<ProjectFixtures>({
  page: async ({ page }, use) => {
    await ensureAuthCookies(page.context());
    await use(page);
  },
  // ... fixture lainnya
});
```

Sekarang setiap test yang pakai `github-project.fixture.ts` bakal terautentikasi otomatis — nggak perlu import, nggak perlu kode ganda, nggak perlu inject cookie manual.

---

## Bug yang ketahuan pas implementasi

### 1. `fullyParallel: true` bikin rusak playwright-bdd

Enam test gagal terus-menerus dengan pesan `bddTestData not found`. Akar masalahnya: setingan `fullyParallel: true` di konfigurasi Playwright bikin panggilan `test.use()` di level module jadi bentrok antar worker. Ganti jadi `fullyParallel: false` ngeberesin keenamnya.

### 2. `networkidle` nggak pernah resolve di GitHub

Kita nyoba nambahin `{ waitUntil: 'networkidle' }` ke `page.goto()` biar status badge nggak stale (ketinggalan info). Tiap navigasi malah jadi timeout di 60 detik. Ternyata GitHub punya koneksi WebSocket jangka panjang dan background polling yang bikin status `networkidle` nggak pernah tercapai.

**Solusi**: pake `page.reload()` aja ketimbang `waitUntil: 'networkidle'` buat kasus di mana data yang ke-cache berpotensi kedaluwarsa.

### 3. Eventual consistency di GraphQL

Test workflow board (BRD-02) mindahin satu item mundur terus mastiin perpindahannya pake `toPass`, tapi pas nyoba ngebaca API sesudahnya malah ngembaliin status lama. Lapisan GraphQL-nya GitHub punya sifat _eventual consistency_ — mutasi ngebalikin hasil sukses lebih cepet sebelum semua server replica update datanya.

**Solusi**: naikin timeout `toPass` dari 5s ke 15s, tambahin jeda (buffer) rambat 1 detik setelah sukses diverifikasi, terus ubah alur mundur board-nya supaya pake kolom yang nggak punya constraint auto-workflow (Backlog ↔ In Progress alih-alih Done → In Progress).

### 4. Verifikasi label malah nyangkut ke histori timeline

Cara polos pakai `page.getByRole('link', { name: /bug/ })` malah ketangkep dua-duanya: label di sidebar DAN info di timeline saat label itu ditambahin. Waktu label dihapus dari sidebar, ternyata nggak bikin labelnya "hilang" — soalnya jejaknya masih ada di histori timeline.

**Solusi**: batesin (scope) locator-nya cuma ke area metadata sidebar:

```typescript
const sidebar = page.getByRole('heading', { name: 'Metadata' }).locator('..');
await expect(sidebar.getByRole('link', { name: new RegExp(label) })).toBeVisible();
```

---

## Inti dari artikel ini (Key takeaways)

| Pelajaran                                   | Kenapa ini penting                                                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cari locator di browser beneran**         | Lo nggak bisa nulis test buat UI yang belum pernah lo liat. playwright-cli bantu lo nyoba seluruh flownya interaktif sebelum nulis satu baris kode pun.                                 |
| **Role-based locator tahan dari deploy**    | `button "Edit Labels"` bakal terus hidup walau GitHub ganti-ganti atau nge-refactor CSS mereka.                                                                                         |
| **Pattern dialog itu gampang dipake ulang** | Label picker, filter board, assignee selector — semua dialog di GitHub ngikutin pattern `option` + `Save`/`Escape` yang sama. Sekali tau cara nanganin satu, bisa dipake buat semuanya. |
| **Beresin duplikasi auth sebelum nyebar**   | Dua duplikasi bisa jadi tiga, terus jadi lima. Ekstrak ke level fixture sejak awal bakal nyegah lo dari pusingnya refactoring nanti.                                                    |
| **Test juga test framework-nya**            | Bug di `fullyParallel`, `networkidle`, dan masalah label ketemu gara-gara kita ngejalanin full test suite-nya, bukan cuma test yang baru ditambah.                                      |

---

Test suite label yang udah jadi nyumbang 4 skenario baru (total jadi 14), mencakup operasi UI sama API, dan kelar cuma dalam satu kali sesi dari mulai `playwright-cli open` sampe semuanya hijau (all-green). Locator yang ditemuin di sini bakal kepake lagi buat masalah assignees, milestones, sama custom fields — semuanya kan pake tombol "Edit" di sidebar dan bentuk dialog yang mirip-mirip.

_Selanjutnya: Assignees & Milestones — ngembangin pattern interaksi sidebar yang sama._
