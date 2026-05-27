# GraphQL Schema Archaeology: Finding the Right Mutation When Docs Aren't Enough

> **Part 8 of the Playwright E2E series.**
> [Part 1](/blog/01-why-real-websites.md) — Why real websites beat demo apps
> [Part 2](/architecture-tour) — Architecture of a production-grade E2E suite
> [Part 3](/fixtures-over-basetest) — Why fixtures over BaseTest
> [Part 4](/blog/04-authentication-without-2fa.md) — Authentication without the 2FA nightmare
> [Part 5](/blog/05-building-label-tests-with-ui-discovery.md) — Building E2E label tests with UI discovery
> [Part 6](/blog/06-assignees-milestones.md) — Assignees & Milestones: The Sidebar Pattern Pays Off
> [Part 7](/blog/07-real-world-e2e-gotchas.md) — 4 real-world E2E gotchas from GitHub Projects

---

## The premise: 5 new GraphQL mutations, 4 of them undocumented

After completing the UI scenarios in Phases 1–4, Phase 5 of our test plan tackled the backend-heavy domains — the features that require programmatic data manipulation before any UI verification makes sense:

| ID         | Scenario                                   | GraphQL Dependency                                                |
| ---------- | ------------------------------------------ | ----------------------------------------------------------------- |
| ARC-01/02  | Archive and restore items                  | `archiveProjectV2Item`, `unarchiveProjectV2Item`                  |
| DRFT-01/02 | Draft item creation and conversion         | `addProjectV2DraftIssue`, `convertProjectV2DraftIssueItemToIssue` |
| FLD-01/02  | Set and filter by custom field values      | Generalized `updateProjectV2ItemFieldValue`                       |
| TDATE-01   | Date field via API                         | Same `updateProjectV2ItemFieldValue` with Date value type         |
| ITER-01    | Iteration field setup and value assignment | `createProjectV2Field` with `ITERATION` data type                 |

GitHub's [official Projects V2 API guide](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects) documents the basic CRUD operations: `addProjectV2ItemById`, `updateProjectV2ItemFieldValue`, `deleteProjectV2Item`.

But the advanced mutations? The ones we needed for drafts, archives, and dynamic field creation? The [mutation reference](https://docs.github.com/en/graphql/reference/mutations) lists every mutation by name — `convertProjectV2DraftIssueItemToIssue` is there, `createProjectV2Field` is there. But knowing a name is not knowing how to call it. What input fields does it accept? Are they required? What union type wraps the response? The reference page tells you the mutation exists. It doesn't tell you how to survive it.

What follows are the three rounds of GraphQL archaeology we had to perform to ship Phase 5.

---

## Round 1: The mutation that wasn't there

### "convertProjectV2DraftIssueToIssue" — close, but no query

Phase 3 had already shipped `addDraftItem` using what we assumed was the companion mutation. Our first implementation looked like this:

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

The response:

```
Error: GraphQL errors: Field 'convertProjectV2DraftIssueToIssue'
doesn't exist on type 'Mutation'
```

OK — GitHub moved it, renamed it, or never had it. The docs don't list this exact name. We needed to find the actual mutation.

### The archaeological dig: querying the schema itself

GraphQL has a built-in introspection system. You can ask the schema _about_ the schema:

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

This returns every mutation defined on the server. We filtered for `draft` and `convert`:

```bash
for (const f of fields) {
  if (f.name.toLowerCase().includes('draft') ||
      f.name.toLowerCase().includes('convert')) {
    console.log(f.name, '-', f.description);
  }
}
```

The output:

```
addProjectV2DraftIssue          — Creates a new draft issue
convertProjectV2DraftIssueItemToIssue — Converts a projectV2 draft item to an issue
```

There it is: **`convertProjectV2DraftIssueItemToIssue`**. One word difference from what we guessed — the word `Item`. That single word cost 20 minutes of debugging.

### The recursive dig: now find its inputs

The mutation name is only half the story. We need to know what arguments it accepts. Introspection lets you trace the input chain:

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

Returns:

```
itemId:       ID!
projectId:    ID!
repositoryId: ID!
```

Three fields, all required. Armed with the correct name and input shape, the working mutation was:

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

## Round 2: The enum that changed its own name

### Creating an iteration field — version 1

The sandbox project needed an `Iteration` field for ITER-01. Our first attempt:

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

Variables: `{ dataType: "ITERATION", name: "Iteration" }`.

The response:

```
Error: ProjectV2FieldDataType isn't a defined input type (on $dataType)
```

`ProjectV2FieldDataType` doesn't exist as a variable type. But the enum values (TEXT, NUMBER, ITERATION, etc.) clearly do — they're referenced throughout the docs. The _type name itself_ is wrong.

### Dig two: check what the mutation actually accepts

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

The `dataType` field's type chain:

```
type.kind: NON_NULL
  → ofType.name: ProjectV2CustomFieldType
```

The correct enum is **`ProjectV2CustomFieldType`**, not `ProjectV2FieldDataType`. Let's verify the values match:

```graphql
{
  __type(name: "ProjectV2CustomFieldType") {
    enumValues {
      name
    }
  }
}
```

Returns:

```
TEXT, SINGLE_SELECT, NUMBER, DATE, ITERATION
```

Same values. Different type name. So `createProjectV2Field` accepts `ITERATION` — you just can't pass it as a variable typed `ProjectV2FieldDataType`. Use `ProjectV2CustomFieldType` instead.

We fixed the variable type and the mutation compiled. But it didn't work.

---

## Round 3: The missing nest — required sub-objects that aren't documented

### "Argument 'iterations' is required"

After fixing the enum, the mutation compiled but returned:

```
Error: Argument 'iterations' on InputObject
'ProjectV2IterationFieldConfigurationInput' is required.
Expected type [ProjectV2Iteration!]!
```

The `createProjectV2Field` mutation has an optional field called `iterationConfiguration` — which, if you include it at all, is an input object that _itself_ has required fields. The standard docs show the top-level mutation signature. They don't show the nested types.

### The full dig chain

We traced the requirement chain through three introspection queries:

**Step 1**: Check `ProjectV2IterationFieldConfigurationInput`:

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

Returns:

```
startDate:  Date!     (required)
duration:   Int!      (required)
iterations: [ProjectV2Iteration!]!  (required)
```

All three are required. The `iterations` field takes an array of `ProjectV2Iteration` objects.

**Step 2**: Check `ProjectV2Iteration`:

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

Returns:

```
startDate: Date!   (required)
duration:  Int!    (required)
title:     String! (required)
```

Every iteration in the array needs a title, start date, and duration. All three are non-null.

**Step 3**: The response is a union type. The field created by `createProjectV2Field` returns `ProjectV2FieldConfiguration`, not a concrete type. You need an inline fragment to extract data from the specific variant:

```graphql
createProjectV2Field(input: { ... }) {
  projectV2Field {
    ... on ProjectV2IterationField { id name }
  }
}
```

Without `... on ProjectV2IterationField`, GraphQL returns:

```
Selections can't be made directly on unions
(see selections on ProjectV2FieldConfiguration)
```

### The working mutation

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

Three layers deep. None of this nesting is shown in the top-level mutation reference. You discover it through introspection, one error message at a time.

---

## The generalizable pattern

Every mutation discovery in Phase 5 followed the same recursive pattern. Here it is, for future reference:

```bash
# 1. Find the mutation names
curl -s https://api.github.com/graphql -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ __type(name:\"Mutation\") { fields { name description } } }"}'

# 2. For each interesting mutation, find its input type
#    Convention: <MutationName>Input  (e.g. CreateProjectV2FieldInput)
curl -s https://api.github.com/graphql -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ __type(name:\"CreateProjectV2FieldInput\") { inputFields { name type { name kind ofType { name } } } } }"}'

# 3. For each nested input type in the chain, recurse
curl -s https://api.github.com/graphql -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ __type(name:\"ProjectV2IterationFieldConfigurationInput\") { inputFields { name type { name kind ofType { name } } } } }"}'

# 4. For each enum reference, check available values
curl -s https://api.github.com/graphql -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ __type(name:\"ProjectV2CustomFieldType\") { enumValues { name } } }"}'

# 5. For union response types, check variant names
curl -s https://api.github.com/graphql -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ __type(name:\"ProjectV2FieldConfiguration\") { possibleTypes { name } } }"}'
```

---

## The key takeaways

| Lesson                                                                         | Why it matters                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mutation names are not guessable**                                           | `convertProjectV2DraftIssueToIssue` vs `convertProjectV2DraftIssueItemToIssue` — one missing word. Always query `__type(name:"Mutation")` to verify the exact name.                                                                                                                    |
| **Enum type names change between schema versions**                             | `ProjectV2FieldDataType` doesn't exist in the current schema — it's `ProjectV2CustomFieldType`. Same values, different name. The introspection `inputFields` → `ofType` chain is the only reliable source.                                                                             |
| **Required fields can be nested 3+ levels deep**                               | `iterationConfiguration` is optional on the mutation, but if you include it, its children (`startDate`, `duration`, `iterations`) are all required. And each element in the `iterations` array has its OWN required fields. The docs show the surface — introspection shows the depth. |
| **Union response types need inline fragments**                                 | `createProjectV2Field` returns `ProjectV2FieldConfiguration`, which is a union of `ProjectV2Field`, `ProjectV2SingleSelectField`, and `ProjectV2IterationField`. You need `... on ProjectV2IterationField { id }` to extract field-specific data.                                      |
| **The introspection workflow should be your first move, not your last resort** | For every new GraphQL integration, start with `__type(name:"Mutation")`. Discover names, trace types, and build the query bottom-up. Trial-and-error against the endpoint is slower than a 30-second introspection query.                                                              |

---

Phase 5 shipped 13 scenarios across 7 new domains, backed by 5 new GraphQL operations and 1 expanded REST endpoint. The API layer grew from 7 methods to 12. Every method followed the same pattern: find the mutations → trace the inputs → chain the nested types → ship.

_Next up: [Part 9](/blog/09-scaling-playwright-cli-discovery.md) — Scaling playwright-cli to multi-step UI flows (Saved Views)._
