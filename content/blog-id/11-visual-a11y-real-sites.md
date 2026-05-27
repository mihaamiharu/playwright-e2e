# Jadi Lo Pengen Nge-Screenshot GitHub: Visual Regression sama WCAG di Website yang Bukan Punya Lo

> **Part 11 dari seri Playwright E2E.**
> [Part 1](/blog-id/01-why-real-websites.md) — Kenapa website beneran lebih baik dari demo app
> [Part 2](/architecture-tour) — Arsitektur dari production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Kenapa pakai fixtures daripada BaseTest
> [Part 4](/blog-id/04-authentication-without-2fa.md) — Autentikasi tanpa mimpi buruk 2FA
> [Part 5](/blog-id/05-building-label-tests-with-ui-discovery.md) — Bikin E2E test buat label lewat penelusuran UI
> [Part 6](/blog-id/06-assignees-milestones.md) — Assignees & Milestones: Pola sidebar beneran berguna
> [Part 7](/blog-id/07-real-world-e2e-gotchas.md) — 4 masalah asli E2E dari GitHub Projects
> [Part 8](/blog-id/08-graphql-schema-archaeology.md) — Arkeologi Skema GraphQL: Nyari Mutasi yang Pas
> [Part 9](/blog-id/09-scaling-playwright-cli-discovery.md) — Dari Sekali Klik ke Full Workflow: Scaling playwright-cli
> [Part 10](/blog-id/10-cicd-allure-caching-isolation.md) — CI/CD Buat QA yang Paranoid

---

## Premisnya: 37 skenario, nol gerbang penjaga urusan non-fungsional

Abis kelar Fase 6, kita punya pipeline CI yang sukses ngerun 37 skenario Gherkin ngelawan GitHub Projects asli tiap minggu pagi. Rangkaian tesnya berhasil ngebuktiin kalo lo bisa bikin isu (issue), nggeser pindahin kartunya ngelewatin board kanban, masang label, nunjuk assignee, nutup kartunya — bener-bener seluruh siklus layaknya pakai Jira. Ini ngebuktiin secara **fungsionalitas** (functionality) jalan semua.

Yang luput dari cek mereka:

| Celah (Gap)                                                         | Kenapa ini berabe (Why it matters)                                                                                                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emangnya board-nya **keliatan** (look) bener?                       | GitHub rajin ngelepas (ships) build CSS anyar mingguan. Tata letak (layout) amburadul bisa aja rilis tanpa ketauan kita.                                                               |
| Apakah pagenya **bisa diakses** (accessible)?                       | Pelanggaran WCAG itu ga kasat mata (invisible) kalo cuma diuji fungsional. Pengguna pembaca-layar (screen-reader user) bisa aja mendadak kehilangan akses ke board-nya semalem suntuk. |
| Kita bakalan tau ngga kalo hasil gambarnya (**rendering**) berubah? | Test fungsional ya nyantai-nyantai ngelewatin (pass) mulu asal teks keliatan sama tombol bisa diklik. Penyimpangan wujud (Visual drift) bakal numpuk tanpa ketara diem-diem.           |

Ini tuh bukan sekedar ngebayang doang (hypotheticals). Di Juni 2025 kemaren, GitHub ngegelar rilis susunan board project baru yang ngegeser rubah lebar ukuran pilar kolom seukuran 8px. Seluruh test fungsionalnya mah tetep aja enteng dapet pass — porsi tajuk ya tetep tajuk, tombol ya pencetan tombol. Sayangnya ketukan (rhythm) visual irama susunan sang kanban patah, dan parahnya kita nggak dapetin secuil alarm peringatan (signal) apapun.

Fase 7 diutus hadir nambal nutup lobang kelengahan celah ini: **uji visual regresi (visual regression tests)** murni bawaanya si Playwright `toHaveScreenshot()`, disuntik bareng sama **cek aksesibilitas WCAG (WCAG accessibility checks)** ngebonceng fasilitas `@axe-core/playwright`. Sepasang jagoan ini beraksi ngelawan panggung kotak pasir sandbox test si GitHub betulan nyang sama. Berdua ini dipasangin plat stiker tag `@P2` — narik pemicu (trigger) pakai dorongan tangan manual aja, ga nembus lintasan CI.

Dan ini ringkasan pelajaran yang kita serap.

---

## Bagian 1: Visual regression numpang nongkrong nguji di situs orang

### Ekspektasinya

Alat ukur wujud (visual regression) bawaannya Playwright lewat fungsi `toHaveScreenshot()` itu simpelnya agak ngebohong nipu dikit:

```typescript
await expect(page.locator('.board')).toHaveScreenshot('board.png');
```

Sekali start lari (run) ngelempar bawaan bendera `--update-snapshots` langsung aja nyetakin jebrolin (creates) patokan dasar cetakan aselinya berformat PNG numpuk kedalem foldernya `visual-baselines/`. Putaran lomba lari (runs) ronde kedepan kelak nanti tugas kerjanya ngebandingin bener adu periksa piksel lawan se-pikselnya (pixel-by-pixel). Apabila ternyata ngelunjak melampaui bates maksimal beda toleransi dari si rasio persentase kumpulannya pikel (pixels differ), maka jatohlah itu tes gagal hancur (fails).

Secara teoritis cara ini lurus (straightforward) banget dah bwt situ yang emang posisinya mandor punya situsnya ndiri. Rangkaian kelompok nama kelas CSS lo pasti diem anteng (stable). Muatan isi kontennya udah pasti ajeg bisa ditebak ketauan (deterministic). Lha ukuran rentang dimensi panjang lebar komponen elmen (element dimensions) kagak bakal ada ceritanya mencla mencle berubah-berubah di sela gantinya perpindahan sesi ngerun-tes lantaran lo sndiri yang ngunci masok nilai angka tetepnya the (test data is fixed).

Eh si GitHub malah kebalikannya.

### Masalah 1: Semua-muanya itu jalan seenaknya sendiri dinamis (Everything is dynamic)

Lembaran halaman (pages) kepunyaannya si GitHub entu bernyawa, benda hidup aplikasinya seakan bernapas ngeden. Setiap embusan napas tarikan muatan laman awal masuk-halaman (page load) doi nyuntikin nancepin:

- **Ketokan jam (Timestamps)** nyang detakannya ngitung laju maju kedepan tiada jeda ("2 minutes ago" → "3 minutes ago")
- **Spanduk-spanduk pemberitahuan pengumuman (Notification banners)** timbul ilang ga beraturan suka-suka nongol nimbul ilang (appear and disappear)
- **Sisipan sisipan Iklan berbaur gedoran pancingan-CTA (Ads and promotional CTAs)** kalo sewaktu lo nengokin tampilannya dlm mode kaga pake akun tamu-kosong (unauthenticated views)
- **Tumpukan cacahan bumbu nama kelas CSS-hashed CSS class names** yang tiap edisi nongol ganti terus (change on every deploy) (e.g. `Box-sc-g0xbh4-0 gWHNVC`)

Kalopun ngebayangin iseng nyoba nge-jepret tangkep layar satu halaman utuh segede gaban (full-page screenshot) mbedil sasaran arah rute `/github/project/1/views/1` and ngadu ngebandingin berantemin hasil jepretanya nandingi (compare) nandingin ukuran patok baseline bekasan peninggalan sisa sisa kemaren, ujungnya bakal panen kebanjiran ribuan selisih cacat meleset di ribuan pixelnya (pixel diffs) — nihil boro boro tiada satupun yg berguna ngasih makna murni (meaningful). Ya orang boardnya mah ga ngapa ngapa masi jalan (works). Emang cuma urusan penunjuk waktu jame aje nyang muter ke-update.

Solusinya gampang kebaca di kepala cuman tetep wajib disampein benderang blak blakan terucap (explicitly): **jepretin capture wujud si elemennya, usah mikir nangkep page-lamannya melulu (screenshot elements, not pages)**. Sunat sempitin (Narrow) lingkup tangkepannya merapat batasin mengarah sasar ngarah per bidikan daerah daratan ngincar wilayah yang nyusun badannya tegap struktur susunan ngadeg berdiri kokoh kokoh (structurally stable):

```typescript
// ❌ Kalo ngejepret sebongkah utuh Full page — abis babak belur gara timestam, spanduk, baretan iklannya kocar kacir ngerubah (change) mulu
await expect(page).toHaveScreenshot('full-board.png');

// ✅ Jauh lebih beradab bidik tiang kolom si Board sajah — nyang nyokong layout sturktur, rentangan lebarnya lempeng ngga berubah ubah (stable width)
const boardArea = page.locator('[data-board-column]').first().locator('..');
await expect(boardArea).toHaveScreenshot('board-kanban-columns.png');
```

Kita ngentungin 3 titik pangkal stabil aman dari goncangan:

| Uji Test          | Sasaran (Element)                                                                       | Ngapa lu milihnya beralesan anteng stabil kok (Why stable)                                                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sisi Board kanban | Tempat ngumpet wada si pembungkus panggung utama parent container `[data-board-column]` | Berupa rak tiang kisi kisi grid murni rentangan kaku nyang ukurannya dipanteng mati. Tiang leber pilar-pilar Kolom-kolom lebar (Column widths) ogah ikut mulur mengembang mengecil ngganti ukur (change) cuman buat ngikutin ngepas isinya si muatan kartunyah.                                                           |
| Wujud Table view  | Lapak kisi-kisi peran si tabel the `role="grid"`                                        | Pola tatanan cetakan si bentuk susun rentangan lebarnya Tabel udah mateng dari awal-awal digaris-rentang dari sononya. Isian ngisi masalah ngurut urutan isunya (Seeded issue) juga ngotot ngengkel nyantol mepet ngisi sa barisan tok satu rentet mendatar (one row).                                                    |
| Kolom Issue body  | Titik area id `data-testid="issue-body-viewer"`                                         | Area wilayah bak tampungan pemajang teks markdwon mati. Rentang ukuranya ngotot ngunci dipaten kaku lebarnya (Fixed-width). Cetakan text daleman si isinya juga turun nemplok di tanem bibitin warisan disumbang pas dari bekal perwujudan contoh tamplate utuh nyang kita setel kenal bae dari sononye (known template). |

### Masalah 2: Bentrok adu selisih dimensi nimbulin tamatan maut hard fail

Ganjalan atu nyang perih nggigit. Uji cobe rintisan sasar langkah VIS-02 mbentang nangkeppin jepret kearah pucuk kepala tajuk header punya issue halamanya:

```typescript
const heading = page.getByRole('heading', { name: issueTitle, level: 1 });
const headerArea = heading.locator('..'); // mbah eyang empunya induk si pembungkus the parent <div>
await expect(headerArea).toHaveScreenshot('issue-header.png', {
  maxDiffPixelRatio: 0.1,
});
```

Kejadian nyang nimpa meluncur nampol jatoh melenceng tuh begini ini:

- **Edisi Run awalan (Baseline):** Sebuah Issue nempel label julukan title berwujud nyebut `e2e-1779868130115-vzcl` mbrojol ketampil wujud gambarnya merender pamer rupa dengan rentang **457px × 48px**
- **Edisi perbandingan lari lawanya-run perbandingan (Comparison run):** Si Issue nyang mbawa judul panggilan `e2e-1779868455751-momv` tayang manggung ketangkap ke-render dpt bentangan ngebelah wujud luasan **493px × 48px**
- **Sisa ujung nasibnya (Result):** Keok mutlak ngadat (Hard fail). Hilang lenyap udah tu kaga sempet ada perwujudan itung itungan kalkulasi jumlah selisihan itungan pixelnya (No pixel diff calculated).

Sistem perakitan nalar logika timbang-bandingnya (comparison logic) si mesin Playwright mbedah langkahnya nurut lewat rute 2 babak tingkatan:

1. Nimbang nyocokin dlu tu murni urusan nge-cek klop nya aduan pas ukuran dimensinya mbleset (dimensions match) → **berujung memvonis mati mendadak nendang seketika lu kl nyatanya ngga plek cocok (fail immediately if they don't)**
2. Kalau udah lulus di palang dimensi, kelak baru lah giliran nimbang ngadu porsi ngetung meleset jumlah rasionya berantem menanding the `maxDiffPixelRatio`

Angka batas-maklum toleransi setting `maxDiffPixelRatio` nganggur nyantai plonga plongo ngga kepake nyebur turun gelanggang bertanding mbetot-nendang ikut maen (kicked in) gegara alesan utamanya nyang diadu itu ukuran patokan panjang dimensinya ngga klop udah gagal duluan the dimensions differed. Batang teks judul isunya itu hidup liar (dynamic) (kesabet sambung jam penunjuk waktu + serenceng racikan tambahan kata buntut tulisan ngacak di asupan bekal penanem si (seeded fixture)), walau itungannya sama nyatanya karakter hurufnyah panjang total sama plek, urusan hal sepele urusan pelicinan batas lengkung font-nya merender (sub-pixel anti-aliasing) ngelahirin kelakuan tabiat ugal si `<div>` wadahnya yang bertingkah ngebungkus melar melebarkan badannya menggelepar dikit lari dari cetakan (wrap slightly differently).

Obat pelurusnya: **tangkepin sasar target screenshot cuma melulu paksain nyasar ke mahluk-elemen penyandang raga dimensi ukuran yang murni beneran mati tegak ngga gerak ukur (fixed dimensions), jauh-jauhin mantang ngeker nangkep elemen-elemen abal abal yg kembang-kempis ngukur size porsinya (size) bergantung nasib sama tumpangan tempelan muatan teks yang liar brubah ubah the (dynamic text)**. Haluan pindah puter kemudi banting stir mengindar dari rongsokan si-header sang pembungkus `<div`> mbuang diri muter berbelok numpang ngadu tuas ngincer sasarannya ngarah pindah tuju body viewer nyah (the issue body viewer `getByTestId('issue-body-viewer')`), peninggalan bangunan kokoh tegap mati tegak ajeg kaku fixed-width si kawah tempat wadah sarang penampung tontonan wadah lebur the markdown rendering container. Beban angkut tumpangan muatan-isi badannya content dibibitin diguyur ngisi merata warisan sumbangan copasan maling utuh nyontek tuplak plek disalin cetak the template, dengan konsekuensi rupa ini nyebab in meskipun ntar tiap putaran (unique run ID changes), bangunan tulang rangka-rumah tontonannya tetep kokoh melengos berdiri kaku lempeng ajeg awet the structural rendering is consistent.

Bekal renungan wejangan Hikmah (Lesson): **Makhul setingan nama the `maxDiffPixelRatio` is strictly not ditakdirin haram bukanlah sebuah pelindung (tolerance) penyelamat dari urusan perkara mbleset selisih nya ukuran panjang lebar raga dimensi. Dia ntu bates ijin permisi penolong pembatas toleransi sebatas khusus murni belaka mentok nahan ukur pergeseran rincian per detil-melenceng-piksel-pixel-an dari sekelompok kumpulan tumpukan balok gambaran (images) yang dari awal dipastikkan sebangun sa-ukuran pas persis (identically-sized).** Bila raga elemen tunggangan ukuran-ruangnya mangkel ngerubah lari brubah wujud mengembang, maka kaga ade setitik the threshold nilai sisa suaka penyelamat yang ngelepas sisa nylamatin you maut saves you.

### Masalah 3: Jejak patokan cetak biru visual ituh murni barang aset baris koding (Baselines are source code)

Tumpuan jajaran cetakan master panutan ukur (Visual baselines) pada perwujudanya esensinya mbentuk seonggok kumpulan bongkahan file brang buta gumpalan (binary assets) mutlak tak tersangkal wajib diserahin dideret diiket diseret nyerah ditunduk-patuh ke tangan urusan kawalan rantai tatanan kendali rekaman pelacak riwayat pengawasan (version-controlled). Kita gelarin nyumpel the baselines bungkusan perabot ke dalam pojokan ngendon `visual-baselines/` — nyerah dikawal dilacak disorot dikungkung murni dicakar oleh the git, diproteksi HARAM dipantang NOT nyisip tersembunyi disemak nyelip in the `.gitignore`. Yg njelas-berarti ngebawa arti the means:

```bash
# Permulaan tarik ngerun First run: pengerukan nyetak produksi the baselines
npx playwright test --grep @visual --update-snapshots
git add visual-baselines/
git commit -m "feat: add visual regression baselines for board, issue, table"

# Terusan jejak larinya-langkah Subsequent runs: banding-tarung adu lawan si hasil gilingan bekasan (committed baselines)
npx playwright test --grep @visual
```

Gaya polah laku kelakuan seragam macem ini nelorin (creates) se-buntut alur garis ukiran jejak telusur nampak pamer di the git-level audit trail bongkar-pasang rupa penampakan (visual changes). Kalau di sebuah riwayat kejadian oknum bapak the developer ngerasa sengeja secara waras-sengaja ngerombak tatanan (redesigns) susunan boardnya, sang pengerombak the developer musti setor nyetorin rombakan-cetak ulangnya ke ngerombak mutakhirin masok the baselines gabung bareng dikesempatn ngaju the PR nyang sama in the same PR:

```
feat: redesign kanban column headers
- visual-baselines/board-kanban-columns.png (updated)
```

Kawanan tukang cek (Reviewers) jadinya kecipratan bisa nerawang langsung neropong gampang ngenali (see) wujud bongkaran perobahan bungkusan (binary diff) melotot dalem di sang PR. Beneran aman anti terkaget (No surprises).

Tapi jangan seneng, dibalik-berikutnya terselubung makna nyisa (also means) klu pakem rujukan-ukur baselines ntu sangat bener patuh tunduk-sifat turunan spesifik nurut ngejomblang ngikut bawaan mesin sang majikan empunya the **platform-specific**. Hasil-tangkepan jepret layar ambil dr macos (darwin) ntar hasil buntut jadinya beda banting percis the differ dari hasil tangkepan the Linux in sang panggung CI (ubuntu) kelak-nya dipertikaian gara gara murni cuman sebates nalar-pergesekan the font rendering. Kta mutusin nge-blacklist mendepak-ngebuang si seruntuyan test-visual kluar ring perbatasan the CI mutlak total-totalan (entirely):

```yaml
# e2e-full.yml (jadwal the weekly CI — nggelar tanpa secuil jepret visual whatsoever no visual)
run: npm run bddgen && npx playwright test --grep-invert @visual
```

Pertikaian uji the Visual regression sisa ngenestapa ngalih murni menjelma di the manual, murni rutinitas dalem lokal murni a local activity — dipicu kecetus-kesentil cuman mbuntutin ngelewatin kawat selang via `e2e-visual.yml` aliran the workflow atau kalo iseng dicentil ditendang nyala dijalan the run directly. Si the CI pny tiang penghadang gawang ukur nyah the CI gate is ngetes njajal cuman melulu urusan fungsi-jurus ukur kepinteran jalan murninya tuntas kelarnya functional correctness, and NOT buat nyidik ndengkul ngetest nyidik melototin-teliti kesempurnaan-tingkat murni nyaris per-piksel-pixel the pixel-perfect rendering lintas lintasan silang di per-wilayahan lintasan beda kasta sistem operating systems.

### Jajaran rangka bongkahan wujud mutakhir per-test-visual The final visual test structure

```gherkin
@github @project @visual @P2
Feature: Visual Regression
  Background:
    Given a seeded project issue exists on the kanban board

  Scenario: VIS-01 — Board kanban view matches baseline
    When I navigate to the kanban view
    Then the board kanban columns should match the baseline

  Scenario: VIS-02 — Issue detail page body area matches baseline
    When I navigate to the issue page
    Then the issue body area should match the baseline

  Scenario: VIS-03 — Table layout view matches baseline
    When I navigate to the kanban view
    And I switch to the table layout view
    Then the table view grid should match the baseline
```

Kelar Tiga urutan the Tiga skenario. Tiga-pancangan tugu tiang mantep the stable elements. Bersih lunas nol krisis the Zero CI pening-pening-sakit kepala headaches.

---

## Bagian 2: Aksesibilitas (Accessibility) nggelantang jadi palang pamungkas pengaman lapis (defense-in-depth)

### Persiapannya

Perangkat pembobol `@axe-core/playwright` sebenernya dah nangkring numpuk mendem nyesek di jejeran `devDependencies` — ketanem ngakar njamur nancep sedari jaman baheula the Phase 1, seumur idupnya kaga prnh sekalipun njajal dipanggil unjuk-nama nampang muka nampil nampang ngisi imported. Nggendon nangkring nyantai hening-sepi persis-ibarat it sat there kayak langganan tiket nggym-fitness member the gym membership numpang dibayar ditebus dibeli-mahal pas bulan January: lunas kedepak the paid for, seumur idup kaga prnh kecolek dikoar unused, dan kerjaannya cuman diem-diem ngelirik judes mencibir ngeledekin ketololan kita silently judging us.

Bukaan perwujudan the API murni the straightforward njelas-mampang tiada ribet:

```typescript
import AxeBuilder from '@axe-core/playwright';

const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  .analyze();

console.log(results.violations); // [{ id, impact, help, nodes, helpUrl }]
```

Trus lantas kita kemas balut nyelubung we wrapped benda ini di bungkus perlengkapan alat serba a utility (`src/utils/a11y.ts`) yang the:

- Muter the Runs WCAG A plus-sama AA ngudak sidik telaah nyidik the analysis ngejalan dr the by default
- Ngejeblak numplek ngamuk the Fails kalo sampe nimpa-kesamber the `critical` + the `serious` nrobos ngelunjak mbangkang violations
- Ngebikin rekaman Nyatet-Nyetakin the Logs porsi ukuran the `moderate` + the `minor` pletikan nrobos violations turun kasta dilempar peringatan as warnings
- Kudu manggut nnerima lapang Accepts tempelan kawat gembok-pesan tempelan sisipan optional rule serutan the exclusions dan jajaran the CSS selectors to loncatin buat nye-skip

### Masalah 4: `testInfo` mah kagak masup the Playwright fixture itungannya the (di ranahnya the BDD)

Usaha iseng ngawur coba kita tempel the first attempt ngotot nyoba njajal the attach jejak cipratan ngorek mbongkar hasil si axe numpang nebeng nyiprat masuk the Allure report ikutan lewat celah the `testInfo.attach()`:

```typescript
// ❌ Sia-sia Mbleset Does not work nembus urusan ranah kawasan the playwright-bdd step definitions
Then('the page has no critical WCAG violations', async ({ page, testInfo }) => {
  const results = await new AxeBuilder({ page }).analyze();
  await testInfo.attach('axe-results', { body: JSON.stringify(results) });
});
```

Barang sakral the Playwright's kepunyaan the `testInfo` mah bisa-bisa aja leluasa dicolok is usable manggung maen di-dalem kubu the `test()` pemanggilan urusan callbacks beralih nggandul the and fixture hooks — tapi kalau urusannya ngerambah belantara in playwright-bdd step definitions, si makhuk itu mendadak haram kaga laku kaga bakal ditengok-diakui the it's not recognized nyaru nyamar as a fixture. Bongkahan mesin pencetak-generator hasil rupa jilidan si the generated spec file nekat coba mblesakin nyuntikin si the tried to inject it:

```javascript
test('A11Y-01', async ({ When, Then, page, testInfo }) => {
  await Then('the page has no critical WCAG violations', null, { page, testInfo });
});
```

Trus bapaknya si Playwright mencak ngelempar nampik mbuang nendang buang the threw:

```
Test has unknown parameter "testInfo"
```

Pembenarannya the fix: cemplungin rekam jejak lemparan the log violations murninya dibrondong cemplung kearah terminal console aja ketimbang ngotot maksa the attaching nempel ngerangsek-neplok to the testInfo. Berondongan ceceran jejak terminal the Console output itu sanggup nyantol is captured by tertangkap jaring pelapor the Playwright's reporter and ujungnya kelak unjuk gigi the appears nongol ngehimpun di-dalam bungkus the both HTML sama-tuntas and the Allure reports:

```typescript
console.log(`[a11y] ${results.violations.length} violation(s), ${results.passes.length} pass(es)`);
for (const v of results.violations) {
  console.warn(`[a11y:warn] ${v.impact}: ${v.help} (${v.id})`);
}
```

Pelajaran berharga (Lesson): **Makhuk the playwright-bdd's wujud penyuntikan properti-suntik fixture the fixture injection murninya ibarat sekadar keping pecahan the is a subset bagian dr Playwright's seutuhnya. Si benda the `testInfo` itu mah itungannya is a aseli murni perabot the Playwright-internal daleman pabrik si the parameter, haram disebut the not cuman tempelan sebates user-facing wujud the fixture.** Kalao seumpamanya elu kelewat nekat kepingin make si kawat-nya the need it in langkah the steps, wajib hukumnya elu kudu the you need to blak blakan ngebongkar wujud the explicitly ndaftar mendaftarkan register it nyaru mbungkus as a jadian perabotan si alat custom fixture — atokah pancing aje manggil ngorbanin or use nyetel log ngamuk tumpahan jalan terminal console-based logging.

### Masalah 5: Nyatanya GitHub ngedapetin beneran temuan telak nggaruk asli nyah the real WCAG violations

Sisi the board kanban murni si halaman the view ngeluarin the flagged sebiji panji merah the one kebangetan pelanggaran the serious violation:

```
[a11y] 1 violation(s), 32 pass(es), 3 incomplete
[a11y:warn] serious: Interactive controls must not be nested (nested-interactive) — 2 nodes
```

Pasal larangan The `nested-interactive` ngamuk njalaran memantik njebluk the fires waktu sewaktu sebuah pentolan tombol `<button>` atau the `<a`> ditelusupin kejepit kesarang nyelip is nested ngumpet dalem the inside benda interaktif the another interactive element. Lembaran the GitHub's kartu-kartunya kanban the draggable kanban cards isinya nyatanya kepalang wujud bungkus nyaru jadian-wadah the `<div role="button">` the wrappers yang justru nanggung ngebungkus ngegandeng contain bongkahan tumpukan tempelan the inline action buttons. Jelas udh mutlak pelanggaran sah the WCAG violation — pmbaca layar the screen readers sanggup gampang kelimpungan mbulet can get confused kepater ngawur tentang nentuin makhuk yang mana precisely which element kepilih ketempelan nancep tuju-arah receives focus.

Sayang-seribukali-sayangnya nyatanya kita kaga punya hak ngegugah-merombak ngotak ngatik membenahi merombak fix GitHub. Insiden the this is a murni ketangkep basah pelanggaran the **third-party false positive** — sah bener the a real violation murni mbangkang nglanggar aturan, cuman ya bukan jangkauan kta buat nyabut ngrubah si itungan nyah the not one we control.

Pemecahan si akal budi pragmatis the pragmatic solution: gembok mretelin mberhentiin disable pasal spesifik the specific rule ntu kusus buat halaman view si the board view. The feature kita si the feature file ketambahan nyetak dapet the gained sang pangecualian embel "kecualikan" an "except" the variant:

```gherkin
Scenario: A11Y-01 — Board kanban view has no critical WCAG violations
  When I navigate to the kanban view
  Then the page has no critical WCAG violations except "nested-interactive"
```

Bagian jeroan the step definition ngijinin nrimo si the accepts the nama peratura the rule name trus mbalang nge-oper nendang the passes it to the si `AxeBuilder.disableRules()`:

```typescript
Then(
  'the page has no critical WCAG violations except {string}',
  async ({ page }, disabledRule: string) => {
    await runA11y(page, { disableRules: [disabledRule] });
  },
);
```

Racikan ini manjur ngawet njagain the keeps uji tesnya the test tetep the **useful**: kalo ujug-ujug GitHub ndatengin the introduces ancaman penyusup pelanggar murni-baru the a NEW violation mendarat numpang on the dipanggung the board page, tetep aje bakal the it still ketendang the fails. Kita ntu murni sebates ngebungkem nutup mulut are only suppressing the sebiji oknum one buronan nyang udeh ketauan the known, dan murni the unactionable biang kerok tak tertebak the false positive.

### Wujud rancangan tatanan final struktur pamungkas urusan a11y The final a11y test structure

```gherkin
@github @project @a11y @P2
Feature: Accessibility Checks (WCAG)
  Background:
    Given a seeded project issue exists on the kanban board

  Scenario: A11Y-01 — Board kanban view has no critical WCAG violations
    When I navigate to the kanban view
    Then the page has no critical WCAG violations except "nested-interactive"

  Scenario: A11Y-02 — Issue detail page has no critical WCAG violations
    When I navigate to the issue page
    Then the page has no critical WCAG violations

  Scenario: A11Y-03 — Table layout view has no critical WCAG violations
    When I navigate to the kanban view
    And I switch to the table layout view
    Then the page has no critical WCAG violations
```

### Unjukan si the axe pamer hasil nyetak bongkar-the axe results di medan kancah aslinya the in practice

| Halaman Page            | Runtuh-terlanggar the Violations | Lulus the Passes | Nggantung mbulet the Incomplete | Vonis nyah Verdict |
| ----------------------- | -------------------------------- | ---------------- | ------------------------------- | ------------------ |
| Panggung Board kanban   | 0 (1 bungkem suppressed)         | 31               | 3                               | Pass               |
| Tampilan Issue detail   | 0                                | 30               | 3                               | Pass               |
| Tampilan the Table view | 0                                | 31               | 3                               | Pass               |

Porsian angka cacahan the `incomplete` murni the counts (sebanyak 3 sebiji per laman per page) menduduki nggambarin si makhuk represent porsi the elements murni nangkep oknum that si punggawa the axe-core kelimpungan letoy the couldn't murni-seutuhnya fully mangku the evaluate — murni lazim ngewakilin sebates nangkep urusan the typically bentrokan pewarna the color-contrast gesekan cek the checks kelakuan ngotot that merluin nyedot merlu narik urat mbedah the require mbongkar paksa secara manual the manual review. Gerombolan yg ginian The these mang murni-suci ngga diset as as These are murni ngga nggagal the non-failing dari takdir awal by design.

---

## Bagian 3: Titik berat penentu the architecture si architecture decisions murni nyang yang bener the mattered

### Alesannya Kenapa kudu nyediain the dedicated lapak feature file the feature files, jangan kebalik the not main nyempilin tempelan the inline tags

Kita sempet nimbang The We considered nyoba ngecap the tagging murni jajaran the existing perwujudan tes lari pamer the functional skenario sisa The scenarios ngiket nggandeng with embel-tag the `@a11y` ditumpak-boncengin the to piggyback mbonceng numpang on turunan ngikuin the their setoran navigasi the navigation:

```gherkin
# Opsi the Option A: maksa nyempil neplok the inline tagging (ngga jd dipake rejected)
@a11y
Scenario: ISS-01 — Create issue via API and verify it appears on the board
  Given a seeded project issue exists on the kanban board
  When I navigate to the issue page
  Then I should see the issue heading  ← porsi the functional
  And the page has no critical WCAG violations  ← urusan the a11y
```

Kita mutlak nolak ngebuang We rejected makhuk the this dngan the for murni 2 (dua) ganjelan the two alasan the reasons:

1. **Memagari benteng the Failure pilar panggung the isolation**. Semisalkn the If Si ISS-01 lulus mbablas The passes di ranah The functionally tapikok ngguling nabrak the fails si ranah The a11y, cetakan rapor nyah the report ngoceh mbacot the says "ISS-01 ndlosor gagal failed." Nyatanya ini the Is murni it itungannya murni the a penyusutan-rusak kemunduran the code regression atokah porsi the or urusan kemunduran per-makhuk a WCAG regression? Elu the You kaga bakalan can't nerawang bsa the tell nembus kl tanpa nggedabel the without mbaca tuntas the reading jejak rontokan untaian The the full trace.
2. **Derajat saringan The Tag si the granularity**. Tumpak the Inline ngecap the tagging maksa the means porsinya elu ngga bkln the you can't narik ngujit test the run "sapu bersih semua the all nguji the a11y tes tests" kl gapake nyeret the without turunan ikutan nggeret nyeret ngekor also ngerunning si the running gerombolan rombongan perabot turunan sebangsa functional nyah the their turunan the functional pasangannya the companions. Sekawanan-satu kubu The A kusus-mutlak terpisah the dedicated bungkus the `@a11y` kancah The feature masokin-ngelepas numpahin ngsihin the gives pd-elu the you ruang-batas yang-bersih the clean wujud sekat the separation: tarik the `npx playwright test --grep @a11y` murni narik si the runs gerbang murni tiga penguji the three tes tests, gausa rempong the not smpe bawa nyeret nyusahin panggil ketigatujuh-tigapuluh tujuh the thirty-seven.

### Napanye ko bisa-bisanje The Why the visual master-patok the baselines malah nyungsep milih ngendon the live mondok ngekos in git

Susunan lapak-alternatif The Alternative racikan arsitekturalnya the architectures:

- **Bungkus s3 The S3 baskom the bucket numplek bareng the with stempel the timestamped urusan the baselines**: Jauuh The More membaur si The CI-friendly, tp tetep The but merelakan kecabut porsinya murni loses wewenang The git's kancah pengerjaan the review siklus nyah the workflow. Lu the You srg the can't nerawang the see setitik wujud the a bongkaran si the visual bentrokan the diff manggung in the a the PR.
- **Setelan murni ngandalin the Per-developer mas-masnya the baselines**: Gampang the Too meledak the fragile. Rujukan The Baselines must dipatok the be tetep the identical murni the across gerombolan sekompi the the team.
- **Digodok the Generated dibakar the in urusan CI, diadu the compared numbuk the against peninggalan sisa the previous gacoan the CI nyah the run**: Butuh The Requires ngebawa the persistent wadah The storage, narik the adds tanggungan The infrastructure the complexity.

Ngglontorin nyetorin nutor Committing the baselines mbongkar mbuang to git murni is jalan The the simplest pembebasan the solution tu yg The that gampang The works dipake the for kubu kelompok the a small gurem The team. Gilirn When the we megar nyebar the scale ngejamah the to gonta-ganti perambah The multi-browser (krum-mozilla the firefox, si safari the webkit), kt The we'll tambel the add iketan the `{platform}` kedlm the to wujud si The the snapshot rancangan panggulan the path the template:

```typescript
snapshotPathTemplate: '{snapshotDir}/{testFileName}/{arg}-{platform}{ext}';
// Produces: board-kanban-columns-darwin.png, board-kanban-columns-linux.png
```

### Sebabe apa the Why kita The we sengaja The don't nyetel ngga nendang jatoh the fail naruh on gundukan si the `moderate` gandeng the and the `minor` para violations

The WCAG ngelompokin ngeracik nggolongin the categorizes nyang pelanggaran the violations mbongkar ke the into kubu the four kasta efek jor the impact kubangan levels. Nendang mblangsak The Failing nimpa the on ke semua The all sekubang si the four maksa narik the means lu pny the your CI gembok the gate klepek klepek ngejepit the closes ketutup on nyang kasta sisaan the color-contrast murni the nitpicks pas murni the while sisa the your klompok the team lg The is pusing ngeracik the trying kirim mbakar the to buang ship the a perbaikan the hotfix. Kita The Our pemetaan The severity the mapping:

| Gempuran The Impact | Watak The Behavior     | Alesan Murni Rationale                                                                                                                              |
| ------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Taraf `critical`    | **Mblangsak the Fail** | Penonton pmbaca the Screen-reader si users is-ny the are secara utuh the completely murni blocked                                                   |
| Kasta `serious`     | **Ngguling the Fail**  | Dinding Major penyekat the usability pengahalang the barrier (jepitan the nested penyusup the interactives, copot-ilang nyah the missing si labels) |
| Derajat `moderate`  | **Nggertak the Warn**  | Senggolan the Usability ngaruh the impact, tp nyatanya the but wujud the content msh the remains the accessible                                     |
| Kelas `minor`       | **Melotot the Warn**   | Nyimpang dr The Best-practice pelanggaram the violations murni the with setitik sisa the minimal the impact                                         |

Lupada seumpmnya the If the you sngaja the want mksa The all gaco the four ikutan the to nggelondong the fail, paku the set aje the `A11Y_STRICT=true` kdlm The in file The your `.env` — si perabot the the utility nyruput the reads nyerap the it trus megar the and si expands the `failOn`.

---

## Urusan sisa kedepan the roadmap: sisa peninggalan the what's lgi the left

Babak the Phase sang 7 nggembok the closes the two seonggok the of dari The the kasta the four sisan the remaining the roadmap makhuk the items:

| Barang Item                                                   | Bagian Phase 7   | Sisa nyah the Remaining |
| ------------------------------------------------------------- | ---------------- | ----------------------- |
| Pengujian the Visual si regression the tests                  | ✅ VIS-01/02/03  | —                       |
| Pemeriksaan the Accessibility the checks (ranah WCAG)         | ✅ A11Y-01/02/03 | —                       |
| Saluran the GitHub kancah Actions CI/CD renteng pipeline      | ✅ Phase 6       | —                       |
| Selang seling The Multi-browser (mozilla-firefox, mac-webkit) | —                | Phase 8                 |

Urusa the Multi-browser mutlak is jlan the the logical langkah the next si step. Pasokan the Visual master the baselines mang murni the are udeh the already ketata the structured buat the to nyokong the support per-tataran the per-platform tangkepan the snapshots. Tumpahan the The axe-core results nyatanya the are lepas bebas perambah the browser-agnostic (kjdian The WCAG violations murni the are brdsr the DOM-based, jgan nyrh the not di ranah the rendering-based). Nambelin the Adding sepsang dua the two gacoan the more si browser perambah the projects nimpa the to kubangan the `playwright.bdd.config.ts` trus the and nyeret lari the running gerbong the the suite nembus the across si chromium the + firefox + nuju the webkit ntar kelak the will nggembok the close si sisa makhuk the the last kotak centangan the checkbox.

Meskipun bgt the But jgn ngarep The that's ntu murni the a makhuk The story nyang murni the for kancah The Part the 12.

---

**Sari pati the Key pelajrn the takeaways:**

1. **Jepretin the Screenshot sasar the elements, jauh jauhi the not ngebidik the pages** — di the on rimba liar the dynamic si sites, kerucut the narrow bentangan the the scope nyasar the to kancah the structurally makhuk the stable kwasn The regions. Andai the If makhuk the the element brbh The changes postur the size brg The with muat the content, ud cari the find a yg The different brngnya the element.
2. **Kasta the `maxDiffPixelRatio` ≠ bukan the dimension suaka the tolerance** — Si the Playwright ngusir the rejects mbleset nyah the dimension selisih the mismatches sedari sblm The before mbedah the computing pixel mblesetan the diffs. Nihil the No kasta the threshold nyetel the setting bsa the prevents nyegah si the this.
3. **Barang the `testInfo` ukan The is murni the not kasta the a ranah The BDD prbot the fixture** — perabot the playwright-bdd's wujud the fixture mesin the system si the doesn't bawa the include jeroan the Playwright's the internal the `testInfo` bawa the parameter. Berondongan the Console-based terminal the logging nyatanya bsa the works bareng the with makhuk the any lapor the reporter.
4. **Bungkem the Suppress pihak The third-party oknum the false nglantur the positives dengan the explicitly** — lmparkn The use makhuk The rule gembok the exclusions kedlm The in langkah the your gaco the Gherkin si steps mkny the so bhw the that larian the tests nggelondong the fail ktimpa the on makhuk the NEW pelanggar the violations tp lpas the pass klu The on the known udeh ngrti The unactionable bnrn The ones.
5. **Setor The Commit perbekalan the baselines numplek The to di git, adu The compare tanding The locally** — sisa the visual uji the regression haram the doesn't nmplok the belong di the in kawasan the CI pas the when lgi the you're the testing murni The a kancah the third-party situs the site. Panteng The Keep dia the it numpang the as lapak the a murni the manual pilar the quality penjaga the gate.

---

_Nengok the Previously: [Tengokan Part 10 — kancah CI/CD buat The for kubu The the Paranoid the QA](/blog-id/10-cicd-allure-caching-isolation.md)_
