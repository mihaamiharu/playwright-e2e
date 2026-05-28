# Arkeologi Skema GraphQL: Nyari Mutasi yang Pas Kalau Dokumentasi Aja Nggak Cukup

> **Part 8 dari seri Playwright E2E.**
> [Part 1](/blog-id/01-why-real-websites.md) — Kenapa website beneran lebih baik dari demo app
> [Part 2](/architecture-tour) — Arsitektur dari production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Kenapa pakai fixtures daripada BaseTest
> [Part 4](/blog-id/04-authentication-without-2fa.md) — Autentikasi tanpa mimpi buruk 2FA
> [Part 5](/blog-id/05-building-label-tests-with-ui-discovery.md) — Bikin E2E test buat label lewat penelusuran UI
> [Part 6](/blog-id/06-assignees-milestones.md) — Assignees & Milestones: Pola sidebar beneran berguna
> [Part 7](/blog-id/07-real-world-e2e-gotchas.md) — 4 masalah asli E2E dari GitHub Projects

---

## Premisnya: 5 mutasi GraphQL baru, 4 di antaranya nggak ada di dokumentasi

Setelah beres nyelesein semua skenario UI di Fase 1-4, Fase 5 dari test plan kita beralih ngerjain area backend yang berat — fitur-fitur yang wajib nyiapin data secara terprogram (programmatic) sebelum verifikasi di UI bisa dilakuin:

| ID         | Skenario                               | Dependensi GraphQL                                                |
| ---------- | -------------------------------------- | ----------------------------------------------------------------- |
| ARC-01/02  | Archive dan restore item               | `archiveProjectV2Item`, `unarchiveProjectV2Item`                  |
| DRFT-01/02 | Bikin dan ngubah draft item jadi issue | `addProjectV2DraftIssue`, `convertProjectV2DraftIssueItemToIssue` |
| FLD-01/02  | Pasang dan filter pakai custom field   | `updateProjectV2ItemFieldValue` yang lebih general                |
| TDATE-01   | Date field lewat API                   | `updateProjectV2ItemFieldValue` yang sama tapi dengan tipe Date   |
| ITER-01    | Bikin Iteration field dan ngasih nilai | `createProjectV2Field` dengan tipe data `ITERATION`               |

Panduan resmi [Projects V2 API guide dari GitHub](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects) udah nyediain dokumentasi operasi CRUD dasar: `addProjectV2ItemById`, `updateProjectV2ItemFieldValue`, `deleteProjectV2Item`.

Tapi gimana dengan mutasi (mutation) yang advanced? Mutasi-mutasi yang kita butuhin buat urusan draft, archive, dan pembuatan custom field secara dinamis? Halaman [referensi mutasi](https://docs.github.com/en/graphql/reference/mutations) emang nyebutin semua nama mutasinya — `convertProjectV2DraftIssueItemToIssue` ada di situ, `createProjectV2Field` juga ada. Tapi sekadar tau namanya bukan berarti tau cara makainya. Apa aja field input yang dia terima? Apa itu wajib (required)? Tipe union (union type) apa yang ngebungkus responnya? Halaman referensi itu cuma ngasih tau kalo mutasinya ada. Tapi nggak ngasih tau gimana cara lo bertahan hidup makainya.

Berikut adalah tiga babak arkeologi (penggalian) GraphQL yang terpaksa kita lakuin buat bisa ngerilis Fase 5.

---

## Babak 1: Mutasi yang ternyata nggak ada

### "convertProjectV2DraftIssueToIssue" — ampir bener, tapi gagal di-query

Fase 3 udah berhasil ngerilis `addDraftItem` yang pake mutasi pasangannya (asumsi kita). Implementasi awal kita bentuknya kayak gini:

```typescript
const query = `
  mutation($projectId: ID!, $itemId: ID!, $repositoryId: ID!) {
    convertProjectV2DraftIssueToIssue(input: {
      projectId: $projectId
      itemId: $itemId
      repositoryId: $repositoryId
    }) {
      issue { number id }
    }
  }
`;
```

Responnya:

```
Error: GraphQL errors: Field 'convertProjectV2DraftIssueToIssue'
doesn't exist on type 'Mutation'
```

Oke — GitHub entah mindahin dia, ganti namanya, atau emang dari awal namanya bukan itu. Dokumentasinya nggak nulis persis namanya apa. Kita mesti nyari tau nama mutasi aslinya.

### Penggalian arkeologi: nge-query skema (schema) itu sendiri

GraphQL punya sistem introspeksi bawaan (built-in introspection). Lo bisa nanya langsung ke skema _soal_ skema itu sendiri:

```graphql
{
  __type(name: "Mutation") {
    fields {
      name
      description
    }
  }
}
```

Query ini ngebalikin semua mutasi yang didefinisiin di server. Kita filter buat nyari kata `draft` sama `convert`:

```bash
for (const f of fields) {
  if (f.name.toLowerCase().includes('draft') ||
      f.name.toLowerCase().includes('convert')) {
    console.log(f.name, '-', f.description);
  }
}
```

Outputnya:

```
addProjectV2DraftIssue          — Creates a new draft issue
convertProjectV2DraftIssueItemToIssue — Converts a projectV2 draft item to an issue
```

Tuh kan: **`convertProjectV2DraftIssueItemToIssue`**. Beda satu kata doang dari tebakan awal kita — yaitu kata `Item`. Kehilangan satu kata itu sukses ngilangin 20 menit waktu debugging.

### Penggalian rekursif: sekarang cari input-nya

Nama mutasi itu baru separuh jalan. Kita kudu tau argumen apa aja yang dia terima. Introspeksi ngemungkinin lo ngelacak rantaian inputnya (input chain):

```graphql
{
  __type(name: "ConvertProjectV2DraftIssueItemToIssueInput") {
    inputFields {
      name
      type {
        name
        kind
      }
    }
  }
}
```

Balikannya:

```
itemId:       ID!
projectId:    ID!
repositoryId: ID!
```

Ada tiga field, dan semuanya wajib (required). Berbekal nama mutasi yang bener dan format input yang pas, mutasi yang akhirnya jalan adalah:

```typescript
mutation($projectId: ID!, $itemId: ID!, $repositoryId: ID!) {
  convertProjectV2DraftIssueItemToIssue(input: {
    projectId: $projectId
    itemId: $itemId
    repositoryId: $repositoryId
  }) {
    item { ... on ProjectV2Item { id content { ... on Issue { number } } } }
  }
}
```

---

## Babak 2: Enum yang ganti nama secara diam-diam

### Bikin Iteration field — versi 1

Project sandbox kita butuh field `Iteration` buat skenario ITER-01. Percobaan pertama kita:

```typescript
mutation($projectId: ID!, $dataType: ProjectV2FieldDataType!, $name: String!) {
  createProjectV2Field(input: {
    projectId: $projectId
    dataType: $dataType
    name: $name
  }) {
    projectV2Field { id name }
  }
}
```

Variabel-nya: `{ dataType: "ITERATION", name: "Iteration" }`.

Responnya:

```
Error: ProjectV2FieldDataType isn't a defined input type (on $dataType)
```

`ProjectV2FieldDataType` ternyata nggak eksis sebagai tipe variabel. Tapi anehnya, nilai enum-nya (TEXT, NUMBER, ITERATION, dll) jelas-jelas ada — bahkan sering disebutin di seluruh dokumentasi. Fix, _nama tipe-nya (type name)_ yang salah.

### Penggalian kedua: cek apa yang beneran diterima sama mutasi ini

```graphql
{
  __type(name: "CreateProjectV2FieldInput") {
    inputFields {
      name
      type {
        name
        kind
        ofType {
          name
        }
      }
    }
  }
}
```

Rantai tipe dari field `dataType`:

```
type.kind: NON_NULL
  → ofType.name: ProjectV2CustomFieldType
```

Ternyata enum yang bener itu **`ProjectV2CustomFieldType`**, bukan `ProjectV2FieldDataType`. Mari kita pastiin kalau nilai (value)-nya cocok:

```graphql
{
  __type(name: "ProjectV2CustomFieldType") {
    enumValues {
      name
    }
  }
}
```

Balikannya:

```
TEXT, SINGLE_SELECT, NUMBER, DATE, ITERATION
```

Nilainya persis sama. Tapi nama tipe-nya beda. Jadi `createProjectV2Field` emang nerima `ITERATION` — tapi lo nggak bisa ngoper nilai itu sebagai variabel bertipe `ProjectV2FieldDataType`. Lo harus pake `ProjectV2CustomFieldType`.

Kita ngebenerin tipe variabelnya dan mutasinya sukses di-compile. Tapi tetep aja belum jalan.

---

## Babak 3: Sarang yang ngilang — sub-object wajib yang nggak didokumentasiin

### "Argument 'iterations' is required"

Setelah ngeberesin enum, mutasi berhasil di-compile tapi malah ngembaliin error:

```
Error: Argument 'iterations' on InputObject
'ProjectV2IterationFieldConfigurationInput' is required.
Expected type [ProjectV2Iteration!]!
```

Mutasi `createProjectV2Field` ternyata punya field opsional bernama `iterationConfiguration` — di mana, kalau lo masukin field itu, dia bakal jadi objek input yang _di dalemnya_ punya field wajib lagi (required). Dokumentasi standar cuma nampilin signature dari mutasi utama di lapisan atas (top-level). Dokumentasinya nggak sudi ngeliatin tipe yang tersarang di dalemnya (nested types).

### Rantai penggalian selengkapnya

Kita ngelacak rantai kebutuhan (requirement chain) ini ngelewatin tiga tahap query introspeksi:

**Langkah 1**: Cek `ProjectV2IterationFieldConfigurationInput`:

```graphql
{
  __type(name: "ProjectV2IterationFieldConfigurationInput") {
    inputFields {
      name
      type {
        name
        kind
      }
    }
  }
}
```

Balikannya:

```
startDate:  Date!     (wajib)
duration:   Int!      (wajib)
iterations: [ProjectV2Iteration!]!  (wajib)
```

Ketiga-tiganya wajib diisi. Field `iterations` juga nerima array yang isinya objek `ProjectV2Iteration`.

**Langkah 2**: Cek `ProjectV2Iteration`:

```graphql
{
  __type(name: "ProjectV2Iteration") {
    inputFields {
      name
      type {
        name
        kind
      }
    }
  }
}
```

Balikannya:

```
startDate: Date!   (wajib)
duration:  Int!    (wajib)
title:     String! (wajib)
```

Setiap iteration di dalam array butuh `title`, `startDate`, dan `duration`. Ketiganya nggak boleh kosong (non-null).

**Langkah 3**: Responnya adalah union type. Field buatan `createProjectV2Field` ngebalikin `ProjectV2FieldConfiguration`, bukan tipe yang konkrit. Lo butuh inline fragment buat ngorek data dari varian spesifiknya:

```graphql
createProjectV2Field(input: { ... }) {
  projectV2Field {
    ... on ProjectV2IterationField { id name }
  }
}
```

Tanpa nambahin `... on ProjectV2IterationField`, GraphQL langsung nolak:

```
Selections can't be made directly on unions
(see selections on ProjectV2FieldConfiguration)
```

### Mutasi yang akhirnya berhasil jalan

```graphql
mutation ($projectId: ID!) {
  createProjectV2Field(
    input: {
      projectId: $projectId
      name: "Iteration"
      dataType: ITERATION
      iterationConfiguration: {
        startDate: "2026-06-01"
        duration: 14
        iterations: [
          { title: "Sprint 1", duration: 14, startDate: "2026-06-01" }
          { title: "Sprint 2", duration: 14, startDate: "2026-06-15" }
        ]
      }
    }
  ) {
    projectV2Field {
      ... on ProjectV2IterationField {
        id
        name
      }
    }
  }
}
```

Kedalaman tiga lapis cuy. Sama sekali nggak ada satupun informasi dari sarang nesting ini yang ditunjukin di dokumentasi mutasi top-level. Lo murni nemuin ini lewat instropeksi, berbekal satu per satu pesan error yang muncul.

---

## Pola umum (Pattern) yang bisa dipake

Semua proses pencarian mutasi di Fase 5 ngelewatin pola rekursif yang sama. Ini ringkasannya buat panduan lo ke depannya:

```bash
# 1. Cari nama-nama mutasi
curl -s https://api.github.com/graphql -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ __type(name:\"Mutation\") { fields { name description } } }"}'

# 2. Buat mutasi yang lo incar, cari apa input type-nya
#    Pola umumnya: <NamaMutasi>Input  (contoh: CreateProjectV2FieldInput)
curl -s https://api.github.com/graphql -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ __type(name:\"CreateProjectV2FieldInput\") { inputFields { name type { name kind ofType { name } } } } }"}'

# 3. Kalo tipe input-nya berantai dan nyarang (nested), lakuin iterasi lagi (recurse)
curl -s https://api.github.com/graphql -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ __type(name:\"ProjectV2IterationFieldConfigurationInput\") { inputFields { name type { name kind ofType { name } } } } }"}'

# 4. Buat tiap referensi enum, cek nilai apa aja yang ada
curl -s https://api.github.com/graphql -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ __type(name:\"ProjectV2CustomFieldType\") { enumValues { name } } }"}'

# 5. Buat respon yang tipenya union, cek varian (variant) apa aja yang tersedia
curl -s https://api.github.com/graphql -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ __type(name:\"ProjectV2FieldConfiguration\") { possibleTypes { name } } }"}'
```

---

## Inti dari artikel ini (Key takeaways)

| Pelajaran                                                                      | Kenapa ini penting                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nama mutasi nggak bisa sekadar ditebak**                                     | `convertProjectV2DraftIssueToIssue` vs `convertProjectV2DraftIssueItemToIssue` — beda satu kata doang. Selalu pake query `__type(name:"Mutation")` buat mastiin nama aslinya.                                                                                                                                    |
| **Nama tipe enum bisa berubah seiring versi skemanya**                         | `ProjectV2FieldDataType` udah nggak ada di skema yang baru — gantinya `ProjectV2CustomFieldType`. Valuenya sama, tapi namanya beda. Mengurut rantai dari `inputFields` → `ofType` pas instropeksi adalah satu-satunya cara akurat.                                                                               |
| **Field wajib (Required fields) bisa sembunyi di dalem 3+ lapis**              | `iterationConfiguration` itu opsional buat mutasinya, tapi kalau lo pake, anak-anaknya (`startDate`, `duration`, `iterations`) otomatis wajib semua. Terus setiap elemen di dalam array `iterations` juga punya field wajib SENDIRI. Dokumentasi cuma ngasih liat luarnya — introspeksi ngebongkar kedalamannya. |
| **Respon union types butuh inline fragments**                                  | `createProjectV2Field` ngebalikin `ProjectV2FieldConfiguration`, yang merupakan gabungan (union) dari `ProjectV2Field`, `ProjectV2SingleSelectField`, dan `ProjectV2IterationField`. Lo butuh nambahin `... on ProjectV2IterationField { id }` buat ngekstrak data spesifiknya.                                  |
| **Workflow instropeksi harusnya jadi langkah pertama, bukan pilihan terakhir** | Tiap kali mau integrasi API GraphQL baru, biasain mulai dari `__type(name:"Mutation")`. Nyari tau nama, ngelacak rantaian tipe, dan susun query-nya dari nol (bottom-up). Nebak-nebak sambil trial-and-error ke server malah makan waktu lebih lama daripada query introspeksi 30-detik.                         |

---

Fase 5 akhirnya ngerilis 13 skenario dari 7 domain baru, disokong sama 5 operasi GraphQL baru dan 1 perluasan endpoint REST. Layer API kita bengkak dari 7 method jadi 12. Tapi setiap method ngikutin pola yang konsisten sama: cari mutasinya → lacak inputnya → urutkan tipe nested-nya → rilis.

_Selanjutnya: [Part 9](/blog-id/09-scaling-playwright-cli-discovery.md) — Scaling playwright-cli buat nganalisa alur UI multi-langkah (Saved Views)._
