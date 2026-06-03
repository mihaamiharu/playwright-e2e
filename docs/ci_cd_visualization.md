# Playwright E2E CI/CD Visualization

Here is the exact logical flow of your advanced `.github/workflows/e2e-full.yml` pipeline. This visualization makes it extremely easy to understand the `--last-failed` caching and Auth State encryption.

## The Pipeline Flow (Mermaid Diagram)

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

    subgraph "State Preservation (The Flex)"
        FetchCache
        DecryptAuth
        EncryptAuth
        UploadCache
    end
```

### How to use this:

You can take a screenshot of this Mermaid diagram (or copy the code into a Mermaid live editor) and include it in your blog post or LinkedIn carousel to visually prove your architectural claims!
