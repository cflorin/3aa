# STORY-001 — Setup GitHub Repository with Version Control Foundation

## Epic
EPIC-001 — Platform Foundation & Deployment

## Purpose
Establish version-controlled source code repository with proper branch protection, access control, and versioning strategy to enable collaborative development and automated deployment.

## Story
As a **development team**,
I want **a GitHub repository with branch protection and semantic versioning**,
so that **code changes are tracked, reviewed, and versioned consistently**.

## Outcome
- GitHub repository exists and is accessible with SSH key
- Main branch is protected (requires PR, no direct commits)
- Semantic versioning strategy is documented
- Initial commit includes foundational files (.gitignore, README skeleton, CHANGELOG.md)
- Repository is ready to receive application code

## Scope In
- Create GitHub repository (3aa-monitoring or user-specified name)
- Configure user SSH key access
- Initialize main branch with initial commit
- Create .gitignore (Node.js, TypeScript, .env files)
- Configure branch protection rules (main branch: require PR, require reviews)
- Document semantic versioning convention (v1.0.0 format, MAJOR.MINOR.PATCH)
- Create CHANGELOG.md template
- Create initial README.md skeleton
- Commit and push initial files

## Scope Out
- Application code (handled in later stories)
- CI/CD integration (STORY-006)
- Deployment configuration (STORY-006)
- Development environment setup (STORY-009)
- Multiple branch strategies (V1 uses main only, feature branches created as needed)
- GitHub Actions workflows (using Cloud Build instead)

## Dependencies
- **Epic:** EPIC-001 (Platform Foundation & Deployment)
- **PRD:** Section 9C (Deployment & Platform Architecture)
- **RFCs:** RFC-006 (Platform & Deployment Architecture)
- **ADRs:** ADR-010 (TypeScript + Next.js + Prisma)
- **Upstream stories:** None (foundational)

## Preconditions
- User has GitHub account
- User has SSH key generated and ready to provide
- User has permissions to create repositories in GitHub account/organization

## Inputs
- GitHub account credentials
- User's SSH public key
- Repository name (default: "3aa-monitoring")
- GitHub organization/user namespace (if applicable)

## Outputs
- GitHub repository URL (e.g., git@github.com:user/3aa-monitoring.git)
- Repository accessible via SSH clone
- Main branch protected with branch protection rules
- Initial commit with .gitignore, README.md, CHANGELOG.md
- Versioning strategy documented in README.md

## Acceptance Criteria
- [ ] GitHub repository created and accessible
- [ ] User SSH key added to GitHub account (can clone repository)
- [ ] Main branch initialized with initial commit
- [ ] .gitignore includes Node.js, TypeScript, .env patterns (node_modules/, .env*, dist/, .next/, *.log)
- [ ] Branch protection enabled on main (require pull request before merging, require 1 approval)
- [ ] Direct commits to main branch blocked (enforcement tested)
- [ ] README.md includes project title, versioning convention, placeholder sections
- [ ] CHANGELOG.md created with v1.0.0 section template
- [ ] Semantic versioning convention documented (MAJOR.MINOR.PATCH, changelog format)
- [ ] Repository clone via SSH succeeds

## Test Strategy Expectations

**Unit tests:**
- N/A (GitHub configuration is manual/scripted setup)

**Integration tests:**
- Repository clone test (git clone via SSH succeeds)
- Branch protection enforcement test (attempt direct commit to main → rejected)
- SSH access test (git push succeeds with SSH key)

**Contract/schema tests:**
- .gitignore completeness (verify Node.js, .env, build artifacts excluded)
- README.md structure validation (required sections present: Project, Versioning, Setup)
- CHANGELOG.md format validation (follows Keep a Changelog format)

**BDD acceptance tests:**
- "Given user with SSH key, when cloning repository, then clone succeeds"
- "Given developer attempts direct commit to main, when pushing, then push rejected with branch protection error"
- "Given initial repository state, when checking .gitignore, then node_modules and .env excluded"

**E2E tests:**
- Full workflow: Clone repo → create feature branch → commit → push → create PR → merge to main

## Regression / Invariant Risks

**Branch protection bypass:**
- Risk: Main branch protection disabled accidentally, unreviewed code committed
- Protection: Integration test verifies protection enforcement, document protection rules

**SSH access loss:**
- Risk: SSH key rotated, repository becomes inaccessible
- Protection: Document SSH key management, test clone access

**.gitignore gaps:**
- Risk: Secrets (.env files) or build artifacts committed to repository
- Protection: Contract test validates .gitignore patterns, pre-commit hooks (future)

**Versioning confusion:**
- Risk: Inconsistent version tagging (v1.0 vs 1.0.0 vs v1.0.0)
- Protection: Document canonical format, examples in CHANGELOG.md

**Invariants to protect:**
- Main branch always protected (no direct commits, PR required)
- Semantic versioning format consistent (vMAJOR.MINOR.PATCH)
- Secrets never committed (.env files always gitignored)
- Repository accessible via SSH (user SSH key configured)

## Key Risks / Edge Cases

**Repository creation edge cases:**
- Repository name already taken (choose unique name or use organization namespace)
- User lacks GitHub permissions (admin must create repository)
- SSH key already in use (GitHub allows multiple keys)

**Branch protection edge cases:**
- Repository admin can override branch protection (acceptable, document risk)
- Branch protection rules change (audit protection settings periodically)
- First commit to main before protection enabled (enable protection immediately after repo creation)

**Versioning edge cases:**
- Pre-release versions (v1.0.0-alpha, v1.0.0-beta acceptable for pre-V1 releases)
- Hotfix versioning (increment PATCH version: v1.0.1)
- Breaking changes (increment MAJOR version: v2.0.0, out of scope for V1)

**SSH access edge cases:**
- User has multiple SSH keys (specify correct key in ~/.ssh/config)
- SSH agent not running (start agent, add key)
- GitHub SSH fingerprint verification (document expected fingerprint)

## Definition of Done

- [ ] GitHub repository created and accessible via SSH
- [ ] User SSH key configured and clone tested
- [ ] Main branch protection rules configured and tested (direct commit blocked)
- [ ] Initial commit includes .gitignore, README.md, CHANGELOG.md
- [ ] Semantic versioning convention documented in README.md
- [ ] Branch protection enforcement verified (integration test or manual verification)
- [ ] Repository URL documented (in epic completion notes)
- [ ] Traceability links recorded (README references PRD Section 9C)

## Traceability

- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **PRD:** Section 9C (Deployment & Platform Architecture)
- **RFC:** RFC-006 (Platform & Deployment Architecture)
- **ADR:** ADR-010 (TypeScript + Next.js + Prisma - repository structure)

---

**END STORY-001**
