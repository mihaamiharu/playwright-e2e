# Test Plan — Playwright E2E (Real-World Targets)

> **Primary target:** GitHub (github.com)  
> **Secondary targets:** Wikipedia, Hacker News  
> **Test modes:** `read-only` (CI-safe) | `full` (authenticated, local-only)  
> **Last updated:** 2026-05-10

---

## Status Legend

| Icon | Meaning     |
| ---- | ----------- |
| 📝   | Planned     |
| 🔧   | In Progress |
| ✅   | Automated   |
| ❌   | Blocked     |
| ⏸️   | Deferred    |

## Priority

| Level  | Criteria                                             |
| ------ | ---------------------------------------------------- |
| **P0** | Critical path — must pass before any release/ship    |
| **P1** | Core functionality — run on every PR                 |
| **P2** | Edge cases / nice-to-have — run nightly or on-demand |

## Type

| Tag       | Description                                 |
| --------- | ------------------------------------------- |
| `E2E`     | Browser-driven end-to-end test (UI only)    |
| `E2E+API` | Hybrid — API seed/cleanup + UI verification |
| `Visual`  | Screenshot comparison                       |
| `A11y`    | Accessibility audit (axe-core)              |
| `API`     | Pure API test (no browser)                  |

---

## 1. Authentication (GitHub)

| ID      | Scenario                                        | Priority | Type | Mode      | Status      |
| ------- | ----------------------------------------------- | -------- | ---- | --------- | ----------- |
| AUTH-01 | Login with valid credentials                    | P0       | E2E  | full      | 📝 Planned  |
| AUTH-02 | Login fails with wrong password                 | P1       | E2E  | full      | 📝 Planned  |
| AUTH-03 | Login with empty fields shows validation        | P1       | E2E  | read-only | 📝 Planned  |
| AUTH-04 | 2FA prompt appears after valid password         | P2       | E2E  | full      | 📝 Planned  |
| AUTH-05 | Session persists across page navigation         | P1       | E2E  | full      | 📝 Planned  |
| AUTH-06 | Logout clears session                           | P2       | E2E  | full      | 📝 Planned  |
| AUTH-07 | Rate-limit page appears after too many attempts | P2       | E2E  | full      | ⏸️ Deferred |

**Notes:**

- AUTH-03 is read-only (no credentials needed — just validates form behavior)
- AUTH-04 cannot be fully automated (2FA code); test asserts the prompt appears, then skips
- AUTH-07 is deferred — testing rate limits risks account lockout

---

## 2. Dashboard (GitHub — Authenticated)

| ID      | Scenario                               | Priority | Type | Mode      | Status     |
| ------- | -------------------------------------- | -------- | ---- | --------- | ---------- |
| DASH-01 | Dashboard loads after login            | P0       | E2E  | full      | 📝 Planned |
| DASH-02 | Repository list is visible             | P1       | E2E  | full      | 📝 Planned |
| DASH-03 | "Explore repositories" section renders | P1       | E2E  | read-only | 📝 Planned |
| DASH-04 | Navigation bar links are functional    | P1       | E2E  | read-only | 📝 Planned |
| DASH-05 | User avatar and dropdown menu work     | P2       | E2E  | full      | 📝 Planned |

---

## 3. Repository (GitHub)

| ID      | Scenario                                        | Priority | Type | Mode      | Status     |
| ------- | ----------------------------------------------- | -------- | ---- | --------- | ---------- |
| REPO-01 | Public repository page loads                    | P0       | E2E  | read-only | 📝 Planned |
| REPO-02 | README renders correctly                        | P1       | E2E  | read-only | 📝 Planned |
| REPO-03 | File tree navigation works                      | P1       | E2E  | read-only | 📝 Planned |
| REPO-04 | Tabs (Code, Issues, PRs, Actions) are clickable | P1       | E2E  | read-only | 📝 Planned |
| REPO-05 | Commit history loads                            | P2       | E2E  | read-only | 📝 Planned |
| REPO-06 | "About" section displays repo description       | P2       | E2E  | read-only | 📝 Planned |
| REPO-07 | Star count is visible                           | P2       | E2E  | read-only | 📝 Planned |

**Target repos:**

- `microsoft/playwright` (large, active, stable layout)
- `facebook/react` (large, has wiki, discussions)

---

## 4. Search (GitHub)

| ID      | Scenario                                         | Priority | Type | Mode      | Status     |
| ------- | ------------------------------------------------ | -------- | ---- | --------- | ---------- |
| SRCH-01 | Search repositories by keyword returns results   | P0       | E2E  | read-only | 📝 Planned |
| SRCH-02 | Empty search shows guidance                      | P2       | E2E  | read-only | 📝 Planned |
| SRCH-03 | Search with no-matching query shows "no results" | P2       | E2E  | read-only | 📝 Planned |
| SRCH-04 | Search suggestions appear while typing           | P2       | E2E  | read-only | 📝 Planned |

---

## 5. Issues (GitHub — Authenticated)

| ID     | Scenario                               | Priority | Type    | Mode      | Status     |
| ------ | -------------------------------------- | -------- | ------- | --------- | ---------- |
| ISS-01 | Create issue via API, verify via UI    | P1       | E2E+API | full      | 📝 Planned |
| ISS-02 | Issue list displays correctly          | P1       | E2E     | full      | 📝 Planned |
| ISS-03 | Issue labels are visible               | P2       | E2E     | read-only | 📝 Planned |
| ISS-04 | Close issue via API, cleanup auto-runs | P1       | E2E+API | full      | 📝 Planned |

**Notes:**

- ISS-01 and ISS-04 use the DataManager pattern — seed → verify → auto-cleanup
- `E2E+API` type means the test uses Playwright's `request` fixture alongside `page`

---

## 6. Wikipedia (Secondary Target)

| ID      | Scenario                                | Priority | Type | Mode      | Status     |
| ------- | --------------------------------------- | -------- | ---- | --------- | ---------- |
| WIKI-01 | Search for an article by title          | P1       | E2E  | read-only | 📝 Planned |
| WIKI-02 | Article page displays title and content | P1       | E2E  | read-only | 📝 Planned |
| WIKI-03 | Language switcher shows options         | P2       | E2E  | read-only | 📝 Planned |
| WIKI-04 | Page loads in mobile viewport           | P2       | E2E  | read-only | 📝 Planned |

**Why Wikipedia:**

- Semantic HTML — ideal for role-based locators
- No auth required — always CI-safe
- Demonstrates multi-target testing with same framework

---

## 7. Hacker News (Secondary Target)

| ID    | Scenario                              | Priority | Type | Mode      | Status     |
| ----- | ------------------------------------- | -------- | ---- | --------- | ---------- |
| HN-01 | Front page loads with stories         | P2       | E2E  | read-only | 📝 Planned |
| HN-02 | Story link navigates to external site | P2       | E2E  | read-only | 📝 Planned |
| HN-03 | "New" and "Show" tabs work            | P2       | E2E  | read-only | 📝 Planned |

**Why Hacker News:**

- Minimal, old-school HTML — tests resilience against non-semantic markup
- Zero auth, zero JavaScript dependency for core content

---

## 8. Visual Regression (GitHub)

| ID     | Scenario                                  | Priority | Type   | Mode      | Status     |
| ------ | ----------------------------------------- | -------- | ------ | --------- | ---------- |
| VIS-01 | Login page layout snapshot                | P2       | Visual | read-only | 📝 Planned |
| VIS-02 | Repository page layout snapshot (desktop) | P2       | Visual | read-only | 📝 Planned |
| VIS-03 | Repository page layout snapshot (mobile)  | P2       | Visual | read-only | 📝 Planned |

**Notes:**

- Dynamic content (timestamps, avatars, repo names) is masked
- Visual tests are sensitive to GitHub deploys — run on schedule, not every PR

---

## 9. Accessibility (GitHub)

| ID      | Scenario                                           | Priority | Type | Mode      | Status     |
| ------- | -------------------------------------------------- | -------- | ---- | --------- | ---------- |
| A11Y-01 | Login page passes WCAG AA (no critical violations) | P2       | A11y | read-only | 📝 Planned |
| A11Y-02 | Public repository page passes WCAG AA              | P2       | A11y | read-only | 📝 Planned |

**Notes:**

- Production sites will have some violations — we assert zero **critical** violations only
- Axe-core results are logged, not just pass/fail

---

## Coverage Summary

| Feature Area   | Scenarios | P0    | P1     | P2     | Read-Only | Full Auth |
| -------------- | --------- | ----- | ------ | ------ | --------- | --------- |
| Authentication | 6         | 1     | 3      | 2      | 1         | 5         |
| Dashboard      | 5         | 1     | 3      | 1      | 2         | 3         |
| Repository     | 7         | 1     | 3      | 3      | 7         | 0         |
| Search         | 4         | 1     | 0      | 3      | 4         | 0         |
| Issues         | 4         | 0     | 3      | 1      | 0         | 4         |
| Wikipedia      | 4         | 0     | 2      | 2      | 4         | 0         |
| Hacker News    | 3         | 0     | 0      | 3      | 3         | 0         |
| Visual         | 3         | 0     | 0      | 3      | 3         | 0         |
| Accessibility  | 2         | 0     | 0      | 2      | 2         | 0         |
| **Total**      | **38**    | **4** | **14** | **20** | **26**    | **12**    |

**Key insight:** 26 of 38 scenarios (68%) are read-only — safe for CI without credentials.
The 12 full-auth scenarios require a test GitHub account and run locally or in a manual CI workflow.

---

## Implementation Sequence

1. **Phase 1 (Commits 3-4):** AUTH-01, AUTH-03, REPO-01, SRCH-01 — core P0 + P1 read-only
2. **Phase 2 (Commits 5-6):** WIKI-01, HN-01 — multi-target patterns
3. **Phase 3 (Commits 7-8):** ISS-01, VIS-01, A11Y-01 — advanced capabilities
4. **Phase 4:** CI pipeline, scheduled runs for visual + a11y
