# Assignees & Milestones: Pola Sidebar Beneran Berguna

> **Part 6 dari seri Playwright E2E.**
> [Part 1](/blog-id/01-why-real-websites.md) — Kenapa website beneran lebih baik dari demo app
> [Part 2](/architecture-tour) — Arsitektur dari production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Kenapa pakai fixtures daripada BaseTest
> [Part 4](/blog-id/04-authentication-without-2fa.md) — Autentikasi tanpa mimpi buruk 2FA
> [Part 5](/blog-id/05-building-label-tests-with-ui-discovery.md) — Bikin E2E test buat label lewat penelusuran UI

---

## Premisnya: lima skenario, nol pattern baru buat dipelajari

Setelah berhasil ngirim test suite label, fase berikutnya di test plan kita adalah **Assignees & Milestones** — lima skenario yang mencakup kepemilikan (ownership) dan rilis pelacakan:

| ID     | Skenario                                                                    | Tipe    |
| ------ | --------------------------------------------------------------------------- | ------- |
| ASN-01 | Assign issue ke user → verifikasi avatar/nama muncul di kartu               | E2E+API |
| ASN-02 | Unassign issue → verifikasi assignee hilang dari kartu                      | E2E+API |
| ASN-03 | Filter kanban board pake assignee → verifikasi cuma issue-nya yang muncul   | E2E+API |
| MIL-01 | Bikin milestone pake due date → verifikasi muncul di sidebar issue          | E2E+API |
| MIL-02 | Link issue ke milestone → verifikasi progress bar nunjukin sebagian selesai | E2E+API |

Fase label sebelumnya ngajarin kita sesuatu yang penting: **Sidebar GitHub pake pattern dialog yang sama buat semua field metadata**. Labels, assignees, milestones, projects — semuanya pakai `button "Edit X"` → `dialog "Select X"` → `option { name }` → `Escape`.

Artinya, kita nggak mulai dari nol. Kita cuma perlu ngeverifikasi apakah pattern itu tetep berlaku.

---

## Sesi pencarian: 20 menit, dua dialog

### Dialog assignee

Kita nge-load auth state, buka test issue, dan buka assignee picker:

```bash
playwright-cli open
playwright-cli state-load auth/github.json
playwright-cli goto https://github.com/mihaamiharu/github-projects-e2e/issues/200
playwright-cli click "getByRole('button', { name: 'Edit Assignees' })"
```

Snapshot-nya nunjukin hal yang bener-bener kita duga:

```yaml
- dialog "Select assignees" [ref=e540]:
    - heading "Select assignees" [level=1]
    - combobox "Filter assignees" [expanded]
    - listbox "User results":
        - option "ekkisyam23"
        - option "mihaamiharu"
```

Pattern yang sama kayak label — sebuah dialog, combobox filter, dan opsi-opsi yang bisa di-toggle. Memilih assignee:

```bash
playwright-cli click "getByRole('option', { name: 'ekkisyam23' })"
playwright-cli press Escape
```

Setelah nutup dialog, sidebar ke-update. Sang assignee muncul di sebuah bagian khusus dengan `data-testid="sidebar-assignees-section"`. Username-nya bentuk link di dalem `data-testid="issue-assignees"`.

### Dialog milestone

Alur yang sama, cuma beda tombol:

```bash
playwright-cli click "getByRole('button', { name: 'Edit Milestone' })"
```

```yaml
- dialog "Set milestone" [ref=e718]:
    - heading "Set milestone" [level=1]
    - combobox "Filter milestones" [expanded]
    - generic: No milestones were found
```

Dialog-nya kosong — test repo kita emang belum punya milestone. Itu tujuannya: API bikin data pertamanya (seed), terus UI ngeverifikasi.

Pas milestone udah ada, dia bakal muncul sebagai `data-testid="issue-milestone-container"` di dalam `data-testid="sidebar-milestones-section"`, lengkap sama teks judul dan due date.

### Filter board berdasarkan assignee

Filter board buat assignee sedikit beda dari label. Label pake filter modal dengan tombol "Save". Board project pake bar filter sejajar (inline):

```bash
playwright-cli goto https://github.com/users/mihaamiharu/projects/8/views/1
playwright-cli click "getByRole('combobox').first()"
```

Bar filternya kebuka dengan tipe opsi ini:

```
- option "Is"
- option "Assignee"
- option "Label"
- option "Status"
- option "Milestone"
- ...
```

Milih "Assignee" bakal ngerucut ke sub-opsi:

```
- option "No assignee"
- option "Has assignee"
- option "Me"
```

URL langsung ke-update jadi `?filterQuery=assignee%3A` di pilihan pertama, lalu kelar penuh di pilihan kedua. Nggak ada tombol "Save" — filter langsung jalan saat itu juga.

### Tabel locator lengkap

| Elemen UI                       | Locator                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Buka assignee picker            | `getByRole('button', { name: 'Edit Assignees' })`                                    |
| Dialog assignee                 | `getByRole('dialog', { name: 'Select assignees' })`                                  |
| Pilih assignee                  | `dialog.getByRole('option', { name: username })`                                     |
| Verifikasi assignee             | `getByTestId('sidebar-assignees-section').getByRole('link', { name: username })`     |
| Verifikasi tanpa assignee       | `getByTestId('sidebar-assignees-section').getByText('No one')`                       |
| Buka milestone picker           | `getByRole('button', { name: 'Edit Milestone' })`                                    |
| Dialog milestone                | `getByRole('dialog', { name: 'Set milestone' })`                                     |
| Verifikasi milestone di sidebar | `getByTestId('sidebar-milestones-section').getByTestId('issue-milestone-container')` |
| Input board filter              | `getByRole('combobox').first()`                                                      |
| Pilih filter "Assignee"         | `getByRole('option', { name: 'Assignee' })`                                          |
| Pilih "Has assignee"            | `getByRole('option', { name: 'Has assignee' })`                                      |
| Progress bar milestone          | `locator('[role="progressbar"]')` dengan `aria-valuenow`                             |

---

## API: milestone butuh REST, assignee pake ulang kode lama

### Assignees — nol kode API baru

Assignees sebenernya emang udah jadi field utama di endpoint REST issue. Fungsi `GitHubAPI.updateIssue()` kita udah nerima `assignees: string[]` dari hari pertama. Nggak pake GraphQL, nggak perlu field resolution, nggak ada method baru. Cukup:

```typescript
// Assign
await githubAPI.updateIssue(repo, issueNumber, {
  assignees: [env.github.username],
});

// Unassign
await githubAPI.updateIssue(repo, issueNumber, {
  assignees: [],
});
```

GitHub otomatis nyinkronin assignees issue ke kartu board project, jadinya board filter bisa langsung nangkep perubahannya tanpa mutasi level project.

### Milestones — tiga method REST baru

Milestones itu adalah objek level repository (terpisah dari Project V2 Iterations). REST API GitHub punya `POST /repos/{owner}/{repo}/milestones`, dan klien kita butuh tiga fungsi method:

```typescript
// src/utils/api-client.ts
async createMilestone(repo, { title, description?, due_on? }): Promise<GitHubMilestone>
async getMilestone(repo, milestoneNumber): Promise<GitHubMilestone>
async deleteMilestone(repo, milestoneNumber): Promise<void>
```

Kita juga nambahin `milestone` ke `CreateIssueParams` biar issue baru bisa langsung terhubung ke milestone waktu pertama dibuat:

```typescript
await githubAPI.createIssue(repo, {
  title: 'e2e-mil-issue',
  milestone: milestoneNumber, // ngelink pas awal bikin
});
```

### Urutan cleanup itu penting

Milestones masuk antrean cleanup DataManager barengan sama issue dan item project. Urutan masuk LIFO ini krusial:

```
Antrean DataManager (LIFO):
  1. Hapus issue dari project
  2. Tutup issue
  3. Hapus milestone        ← cleanup ngejalanin ini PERTAMA
```

Kalau lo antreain penghapusan milestone duluan sebelum ngelepas (unlink) issue, GitHub bakal balikin error — lo nggak bisa ngehapus milestone yang masih ada tanggungan issue-nya. Solusinya: selalu tutup issue duluan (biar mereka berhenti ngaruh ke progress milestone), terus baru hapus milestone-nya.

---

## Hal licik di progress bar

MIL-02 ngebuka halaman milestone dan ngeverifikasi progress bar setengah jalan. Insting pertama soal locator-nya:

```typescript
const progressBar = page.getByRole('progressbar');
```

Ini gagal dengan pesan `Timeout 20000ms exceeded`. Tapi elemennya ada di halaman — berupa `<span role="progressbar" aria-valuenow="50" aria-valuemax="100">`. CSS selector attribute-nya malah berhasil:

```typescript
const progressBar = page.locator('[role="progressbar"]');
// Langsung ketemu
```

Fungsi `getByRole()` nyari di accessibility tree, yang ngeharusin browser buat ngitung accessible name dan state-nya. Elemen `<span>` GitHub dengan `role="progressbar"` ngerender dengan bener di DOM tapi nggak kebuka sebagai widget progressbar pas lagi dikalkulasi ke dalam accessibility tree saat dimintai. Sebaliknya, attribute selector mentah langsung nge-bypass hitungan tree ini dan tembus nyari ke DOM-nya.

Ini peringatan aja kalau `getByRole()` emang paling ideal, tapi `locator('[role="..."]')` itu fallback mantep pas accessibility tree tertinggal performanya ketimbang DOM.

---

## Gherkin-nya: lima skenario, satu Background

Kedua file feature ini saling berbagi background yang udah didefinisiin si fixture:

```gherkin
# features/github/assignees.feature
Background:
  Given a seeded project issue exists on the kanban board

Scenario: ASN-01 — Assign issue to user via API and verify on issue page
  When I assign the issue to myself via the API
  And I navigate to the issue page
  Then I should see myself as the assignee on the issue

Scenario: ASN-02 — Unassign issue and verify assignee cleared
  When I assign the issue to myself via the API
  And I unassign the issue via the API
  And I navigate to the issue page
  Then I should see no assignee on the issue

Scenario: ASN-03 — Filter board by assignee, verify only assigned shown
  When I assign the issue to myself via the API
  And I seed a second unassigned issue on the board
  And I navigate to the kanban view
  And I filter the board by assignee "Has assignee"
  Then the seeded issue should be visible on the board
  And the second unassigned issue should not be visible on the board
```

```gherkin
# features/github/milestones.feature
Scenario: MIL-01 — Create milestone with due date, verify in sidebar
  When I create a milestone with a due date via the API
  And I link the seeded issue to the milestone via the API
  And I navigate to the issue page
  Then I should see the milestone name in the issue sidebar

Scenario: MIL-02 — Link issues to milestone, verify progress bar
  When I create a milestone with a due date via the API
  And I link the seeded issue to the milestone via the API
  And I seed a second issue on the board linked to the milestone
  And I close the seeded issue via the API
  And I navigate to the milestone page
  Then I should see the milestone progress bar showing partial completion
```

ASN-03 pake ulang `Then the seeded issue should be visible on the board` dari file definisi step labels — tanpa ada duplikasi kode sedikit pun. Library step mulai berkembang banyak, tapi tiap tambahan file feature baru cuma nambah step yang unik buat domain yang butuh aja.

---

## Apa yang nggak perlu kita bangun lagi

| Komponen             | Usaha   | Alasan                                                                                      |
| -------------------- | ------- | ------------------------------------------------------------------------------------------- |
| Siklus Data          | 0 baris | `github-project.fixture.ts` nyiapin (seed) data issue, `DataManager` otomatis bersih-bersih |
| Setup Auth           | 0 baris | `ensureAuthCookies()` di override `page` fixture — di-load cuma sekali pas tiap test        |
| Navigasi Board       | 0 baris | `When I navigate to the kanban view` udah jadi definisi di step board-workflow              |
| Cek Visibility Issue | 0 baris | `Then the seeded issue should be visible on the board` udah jadi definisi di step labels    |
| API Assignee         | 0 baris | `updateIssue({ assignees })` udah ada dari Fase 1                                           |

Satu-satunya kode yang beneran baru cuma REST method-nya milestone (63 baris), lima definisi step, sama dua file feature doang. Sisa-sisanya mah udah diborong arsitektur si fixture.

---

## Inti dari artikel ini (Key takeaways)

| Pelajaran                                           | Kenapa ini penting                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pattern sidebar itu reusable banget**             | Alur dari `button "Edit X"` → `dialog` → `option` → `Escape` emang cocok dipake buat label, assignee, dan milestone. Cari nemu sekali, terapin buat apa aja.                                        |
| **Kalo bisa REST, gausah GraphQL**                  | Assignees jalan lancar di REST endpoint-nya issue — gak perlu field resolution, nggak ada mutasi pake GraphQL, nggak usah pusing eventual consistency. Kalo API ngasih REST, mending pake REST aja. |
| **Milestones itu level repo, bukan project**        | Mereka idup di `/repos/{owner}/{repo}/milestones`, nggak di API GraphQL Project V2. Paham model data-nya sebelum ngoding bikin lo aman dari nemu jalan buntu.                                       |
| **`getByRole()` bisa kelewatan nangkep DOM**        | Bagian `<span role="progressbar">` emang ada di DOM tapi gak muncul di accessibility tree. Pakai `locator('[role="progressbar"]')` bakal jadi jalur aman pas butuh banget.                          |
| **Aturan antrean LIFO gak bisa diganggu-gugat**     | Milestones nggak bakal bisa dihapus kalo isu yang terhubung belum kelar (linked). Biasain buat nutup isunya duluan, copot (unlink) dari project, lalu babat habis milestone-nya.                    |
| **Library step yang membesar gampangin kedepannya** | Tambahan 5 skenario cuma bikin 5 definisi step — sisanya nyomot dari kode sebelumnya di Fase 1 dan Fase 2. Semua proses fase yang ada malah bikin test plan selanjutnya lebih kenceng ngerjainnya.  |

---

## Perkembangan: 17 dari 37 Skenario

| Fase              | Skenario  | Status  |
| ----------------- | --------- | ------- |
| CRUD Issue        | ISS-01–04 | Done    |
| Board Workflow    | BRD-01–04 | Done    |
| Labels & Metadata | LBL-01–04 | Done    |
| Assignees         | ASN-01–03 | Done    |
| Milestones        | MIL-01–02 | Done    |
| **Total**         | **17/37** | **46%** |

Pattern UI di sidebar udah terbukti dipake buat tiga tipe metadata berbeda. Terus selanjutnya: Table views & comments — dimana kita bakal ngebuktiin apakah eksperimen yang sama juga kepake di format interface model list atau timeline, bukan cuma versi dialog aja.

---

_Part 4: [Autentikasi tanpa mimpi buruk 2FA](/blog-id/04-authentication-without-2fa.md)_
_Part 5: [Bikin E2E test buat label lewat penelusuran UI](/blog-id/05-building-label-tests-with-ui-discovery.md)_
