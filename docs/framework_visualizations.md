# Playwright Framework Visualizations

Here are three Mermaid diagrams that perfectly visualize the core concepts discussed in `12-from-manual-to-framework.md`. You can screenshot these and embed them directly into the blog post or your LinkedIn carousel to make the dense technical concepts easy to understand at a glance.

---

## 1. The Bridge: Behavior vs. Implementation (BDD Architecture)

This diagram visualizes how the framework separates "what we test" from "how we test it", avoiding the trap of coupling test logic directly to the DOM.

```mermaid
flowchart LR
    %% Styles
    classDef manual fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff
    classDef behavior fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff
    classDef step fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff
    classDef pom fill:#8b5cf6,stroke:#6d28d9,stroke-width:2px,color:#fff
    classDef browser fill:#1f2937,stroke:#111827,stroke-width:2px,color:#fff

    subgraph "The Problem Definition"
        Manual[Manual Test Case\n'Verify user can update issue']:::manual
    end

    subgraph "The Behavior (What)"
        Gherkin[Gherkin Feature File\n'When I update the issue description...']:::behavior
    end

    subgraph "The Implementation (How)"
        StepDef[Step Definition\n'issuePage.updateDescription()']:::step
        POM[Page Object Model\n'page.getByRole(...)']:::pom
    end

    Browser((Browser DOM)):::browser

    Manual -- Translated to --> Gherkin
    Gherkin -- Mapped to --> StepDef
    StepDef -- Calls --> POM
    POM -- Interacts with --> Browser
```

---

## 2. The SDET Flex: Data Lifecycle & Test Isolation

This diagram contrasts the "junior" way of setting up tests (clicking through the UI) versus the "SDET" way (bypassing the UI with GraphQL and ensuring automatic cleanup).

```mermaid
sequenceDiagram
    participant Test as Playwright Test
    participant API as GraphQL API
    participant UI as GitHub UI
    participant DataManager as Data Manager (LIFO)

    Note over Test,DataManager: The SDET Setup (Bypassing the UI)

    Test->>API: 1. Seed: send GraphQL mutation (create issue)
    API-->>Test: Returns seeded data (Issue ID)
    Test->>DataManager: 2. Register Cleanup: queue API delete call

    Note over Test,UI: The Actual Verification
    Test->>UI: 3. Verify: Navigate to issue and check behavior
    UI-->>Test: Assertions pass/fail

    Note over Test,DataManager: Guaranteed Cleanup
    Test->>DataManager: 4. Test ends (Pass or Fail)
    DataManager->>API: 5. Execute LIFO Queue (Delete issue)
    API-->>DataManager: Data destroyed
```

---

## 3. The CI/CD Flex: Re-run Failed Only & Auth Caching

This diagram shows the logic of `.github/workflows/e2e-full.yml`, specifically how it handles test failures and authentication intelligently on a rerun.

```mermaid
flowchart TD
    %% Define styles
    classDef trigger fill:#2a2a2a,stroke:#666,stroke-width:2px,color:#fff
    classDef process fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#fff
    classDef cache fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#fff
    classDef test fill:#7f1d1d,stroke:#ef4444,stroke-width:2px,color:#fff
    classDef decision fill:#701a75,stroke:#d946ef,stroke-width:2px,color:#fff

    Start([Trigger: Schedule / Manual]):::trigger --> CheckAttempt{Is Run Attempt > 1?}:::decision

    %% Path: Fresh Run
    CheckAttempt -- No (Attempt 1) --> CleanRun[Initialize Clean Environment]:::process
    CleanRun --> BddGen[Run bddgen]:::process
    BddGen --> FreshTest[Run ALL Tests]:::test

    %% Path: Rerun Failed
    CheckAttempt -- Yes (Rerun) --> FetchCache[gh run download: .last-run.json]:::cache
    FetchCache --> DecryptAuth[Decrypt auth/github.json.enc]:::cache
    DecryptAuth --> RestoreState[Playwright Restores Auth State]:::process
    RestoreState --> RerunTest[Run --last-failed tests only]:::test

    %% Convergence
    FreshTest --> StripSecrets[Strip PAT Secrets from Traces]:::process
    RerunTest --> StripSecrets

    %% Post-Test
    StripSecrets --> EncryptAuth[Encrypt auth/github.json]:::cache
    EncryptAuth --> UploadCache[Upload test-cache & encrypted auth to Actions]:::cache
    UploadCache --> GenerateAllure[Generate Allure Report w/ History]:::process
    GenerateAllure --> DeployGH[Deploy Report to GitHub Pages]:::process

    %% Subgraphs for clarity
    subgraph "Playwright Execution Phase"
        FreshTest
        RerunTest
    end

    subgraph "State Preservation"
        FetchCache
        DecryptAuth
        EncryptAuth
        UploadCache
    end
```
