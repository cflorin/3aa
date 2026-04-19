# ADR-008: Platform Choice - Google Cloud

**Status:** ACCEPTED
**Date:** 2026-04-19
**Deciders:** Product Team
**Related:** RFC-006 (Platform Architecture), ADR-009 (Modular Monolith), ADR-002 (Nightly Batch)

---

## Context

The 3AA Monitoring Product V1 requires a cloud platform for:
- Web application hosting
- Database hosting (Postgres)
- Background job scheduling (nightly batch processing)
- Secrets management
- Build/deploy automation
- Observability (logging, monitoring)

**The Question:** Which cloud platform should V1 use?

### V1 Constraints

- **Scale:** 10-100 users initially, potentially 10K users later
- **Data:** 1000 stocks, nightly batch processing (not real-time)
- **Operational burden:** Minimize service count, prefer managed services
- **Autonomy:** Claude should be able to deploy with minimal hand-holding
- **Existing access:** Team has existing Google Cloud account

### Platform Options

**Google Cloud Platform (GCP):**
- Managed services: Cloud Run, Cloud SQL, Cloud Scheduler, Secret Manager, Cloud Build
- "Good defaults" philosophy (less knob-turning)
- Existing account access

**Amazon Web Services (AWS):**
- Broader ecosystem, more services
- Managed services: ECS/Fargate, RDS, EventBridge, Secrets Manager, CodeBuild
- More configuration required (more knobs, more decisions)

**Azure:**
- Strong enterprise focus
- Managed services: Container Apps, Azure Database, Logic Apps
- Less common for startups/small teams

---

## Decision

V1 shall use **Google Cloud Platform (GCP)** as the primary cloud platform.

### Core Services

| Service | Purpose |
|---------|---------|
| **Cloud Run** | Web application hosting + background job execution |
| **Cloud SQL (Postgres)** | Managed Postgres database |
| **Cloud Scheduler** | Nightly batch job triggers (cron-like) |
| **Secret Manager** | API keys, database credentials, session secrets |
| **Cloud Build** | Docker builds, CI/CD pipeline |
| **Cloud Logging** | Application logs, error logs |
| **Cloud Monitoring** | Metrics, uptime monitoring, alerting |
| **Artifact Registry** | Docker image storage |
| **VPC** | Private networking (Cloud SQL → Cloud Run) |

### Optional Services (V2+)

| Service | Future Use |
|---------|------------|
| **Cloud Storage** | Historical data archival, backups |
| **Cloud Pub/Sub** | Event-driven architecture (if needed) |
| **Cloud Tasks** | Task queues (if needed) |
| **Firebase** | Mobile app (if built) |

---

## Rationale

### Why Google Cloud?

**1. Existing Account Access**
- Team already has GCP account
- Lower friction than setting up new AWS account
- Billing, IAM, project structure already established

**2. Simpler Managed Services**
- **Cloud Run**: Serverless containers with zero instance management (simpler than AWS ECS/Fargate)
- **Cloud SQL**: One-click Postgres with automatic backups, HA (same features as RDS but easier setup)
- **Cloud Scheduler**: Dead-simple cron (no need for EC2 instances or Lambda orchestration)
- **Secret Manager**: Straightforward secret storage (simpler than AWS Secrets Manager)

**3. "Good Defaults" Philosophy**
- GCP services have fewer configuration knobs than AWS
- Sensible defaults reduce decision fatigue
- Example: Cloud Run auto-configures health checks, auto-scaling, load balancing

**4. Better Developer Experience**
- `gcloud` CLI is more intuitive than `aws` CLI
- Cloud Console UI is cleaner than AWS Console
- Cloud Build integrates seamlessly with Cloud Run (no cross-service glue needed)

**5. Cost Efficiency at V1 Scale**
- Cloud Run pay-per-use (idle = free, unlike AWS Fargate minimum charges)
- Cloud SQL free tier for small instances
- Cloud Scheduler free tier (3 jobs free)
- Overall: Lower cost for <100 concurrent users

**6. Appropriate for Scale**
- Cloud Run scales from 0 to thousands of requests/sec
- Cloud SQL scales vertically to 96 cores, 624GB RAM (far beyond V1 needs)
- If V1 outgrows Cloud Run, GKE (Kubernetes) is available
- Platform supports 10 users → 10K users without re-architecture

### Why NOT AWS?

**More Complexity:**
- ECS/Fargate requires more configuration than Cloud Run
- EventBridge + Lambda for cron-like jobs is more complex than Cloud Scheduler
- IAM is more granular but also more confusing
- More services = more decisions = more operational burden

**No Existing Access:**
- Would require new account setup
- New billing setup
- New IAM/project structure

**Higher Operational Burden:**
- More knobs to tune
- More services to connect
- More troubleshooting surface area

**Not Necessary for V1:**
- AWS's broader ecosystem is valuable for complex/large-scale systems
- V1 doesn't need that complexity
- Can migrate to AWS later if truly needed (unlikely)

### Why NOT Azure?

**Less Common for Startups:**
- Smaller developer community
- Fewer tutorials, less documentation
- Less familiar to Claude (autonomy goal)

**Enterprise-Focused:**
- Pricing/UX optimized for enterprises, not small teams
- More complex than needed for V1

---

## Consequences

### Positive ✅

**Operational Simplicity:**
- Managed services = no server management
- Cloud Run = no instance provisioning, auto-scaling, load balancing
- Cloud SQL = automatic backups, HA, patch management
- Cloud Scheduler = no cron servers

**Cost Efficiency:**
- Pay-per-use model (Cloud Run charges only when processing requests)
- Free tiers cover V1 development and small-scale production
- Estimated monthly cost for 100 users: $50-100 (Cloud Run + Cloud SQL small instance)

**Developer Velocity:**
- Simple deployment: `gcloud run deploy`
- Quick iteration: Cloud Build auto-deploys on git push
- Good local dev experience: Docker + Postgres locally mirrors prod

**Scalability Headroom:**
- Cloud Run: 0 → thousands of concurrent requests
- Cloud SQL: Tiny → 96 cores without re-architecture
- Supports 10 users → 10K users organically

**Autonomy-Friendly:**
- Well-documented, common patterns
- Claude familiar with GCP stack
- Minimal manual intervention needed for deployment

### Negative ⚠️

**Vendor Lock-In:**
- Cloud Run uses Google-specific deployment model (not Kubernetes standard)
- Cloud SQL is managed Postgres (but standard SQL, so portable)
- **Mitigation:** Application code is platform-agnostic (TypeScript + Postgres); can migrate if needed

**Limited Advanced Features:**
- AWS has more services (e.g., more ML services, IoT, etc.)
- But V1 doesn't need these
- **Mitigation:** Can integrate AWS services selectively if needed (e.g., S3 for archival)

**Regional Availability:**
- GCP has fewer regions than AWS
- But V1 is US-focused initially (no concern)
- **Mitigation:** Use `us-central1` or `us-east4` for low latency

**Less Ecosystem Maturity for Some Tools:**
- Some third-party tools have better AWS integrations
- But most tools support both GCP and AWS
- **Mitigation:** Verify critical tool compatibility during implementation

---

## Alternatives Considered

### Alternative 1: Amazon Web Services (AWS)

**Approach:**
- Use AWS ECS/Fargate for application hosting
- Use RDS (Postgres) for database
- Use EventBridge + Lambda for nightly batch
- Use Secrets Manager, CodeBuild

**Rejected Because:**
- ❌ More complex service landscape (ECS requires task definitions, service definitions, load balancer config)
- ❌ No existing account (setup friction)
- ❌ Higher operational burden (more knobs to tune)
- ❌ Lambda cold starts worse than Cloud Run for HTTP workloads
- ❌ EventBridge + Lambda orchestration more complex than Cloud Scheduler
- ✅ Would be appropriate if V1 needed AWS-specific services (not the case)

---

### Alternative 2: Azure

**Approach:**
- Use Azure Container Apps for hosting
- Use Azure Database for Postgres
- Use Azure Logic Apps for scheduling
- Use Azure Key Vault, Azure Pipelines

**Rejected Because:**
- ❌ Less common in startup/small-team ecosystem
- ❌ Smaller developer community (fewer tutorials, less documentation)
- ❌ Less familiar to Claude (autonomy goal)
- ❌ Enterprise-focused (overkill for V1)
- ✅ Would be appropriate for enterprise/Microsoft-heavy environments (not V1 context)

---

### Alternative 3: Self-Hosted (DigitalOcean, Hetzner, etc.)

**Approach:**
- Rent VPS instances
- Self-manage Postgres
- Self-manage app deployment (Docker, systemd, nginx)
- Self-manage cron jobs

**Rejected Because:**
- ❌ High operational burden (patching, backups, HA, monitoring)
- ❌ No auto-scaling (manual instance provisioning)
- ❌ Violates "minimal operational burden" constraint
- ❌ Not autonomy-friendly (requires manual server management)
- ✅ Would be appropriate for cost-sensitive, ops-heavy teams (not V1 goals)

---

### Alternative 4: Serverless-Only (Vercel + PlanetScale / Supabase)

**Approach:**
- Use Vercel for Next.js hosting
- Use PlanetScale (MySQL) or Supabase (Postgres) for database
- Use Vercel Cron for scheduling

**Rejected Because:**
- ❌ PlanetScale is MySQL (V1 uses Postgres, schemas already defined in RFC-002)
- ❌ Supabase is less mature than Cloud SQL
- ❌ Vercel Cron limited to 1 job/minute (nightly batch has complex staging)
- ❌ More fragmented (multiple vendors, more integration points)
- ✅ Would be appropriate for simple CRUD apps (V1 has complex batch processing)

---

## Implementation Notes

### GCP Project Structure

```
Project: 3aa-monitoring-v1
├── Cloud Run Services
│   ├── 3aa-web (main application)
│   └── 3aa-batch-* (background jobs, if separated)
├── Cloud SQL Instance
│   └── 3aa-db (Postgres 15)
├── Secret Manager
│   ├── DATABASE_URL
│   ├── SESSION_SECRET
│   ├── TIINGO_API_KEY
│   └── FMP_API_KEY
├── Cloud Scheduler Jobs
│   ├── price-sync (5pm ET daily)
│   ├── fundamentals-sync (6pm ET daily)
│   ├── classification-recompute (8pm ET daily)
│   └── alert-generation (8:30pm ET daily)
└── Cloud Build Triggers
    └── main-branch-deploy (auto-deploy on push)
```

### Region Selection

**Recommended Region:** `us-central1` (Iowa)

**Rationale:**
- Low latency for US users
- High availability
- All required services available
- Lower cost than `us-east4` (Northern Virginia)

**Alternative:** `us-east4` if East Coast latency preferred

### Cost Estimation (V1)

| Service | Usage | Monthly Cost |
|---------|-------|--------------|
| Cloud Run (web) | 100 users, 10K req/day | ~$10 |
| Cloud SQL (db-f1-micro) | 10GB storage, 1 core | ~$20 |
| Cloud Scheduler | 4 jobs | Free |
| Secret Manager | 10 secrets | Free |
| Cloud Build | 10 builds/day | Free tier |
| Cloud Logging | 10GB/month | Free tier |
| **Total** | | **~$30-50/month** |

**Scaling:** At 1000 users, estimated $200-300/month (still very reasonable).

---

## Migration Path (If Needed)

If V1 outgrows GCP or requires migration to AWS:

**Application Code:**
- TypeScript + Next.js + Prisma is platform-agnostic
- Database is standard Postgres (portable)
- Minimal GCP-specific code (only deployment config)

**Database:**
- Export Postgres dump from Cloud SQL
- Import to AWS RDS or self-managed Postgres
- Update `DATABASE_URL` in secrets

**Application:**
- Containerize with Docker (already done for Cloud Run)
- Deploy to AWS ECS/Fargate or Kubernetes
- Update environment variables

**Background Jobs:**
- Replace Cloud Scheduler with EventBridge + Lambda
- Or use ECS Scheduled Tasks

**Estimated Migration Effort:** 1-2 weeks (straightforward due to standard tech stack)

---

## Related Decisions

- **ADR-009:** Modular monolith architecture (single Cloud Run service for V1)
- **ADR-010:** TypeScript + Next.js stack (platform-agnostic choices)
- **ADR-002:** Nightly batch orchestration (Cloud Scheduler implementation)
- **RFC-006:** Full platform architecture specification

---

## Notes

- V1 uses single GCP project (no multi-project setup needed)
- All services in same region for low latency
- VPC connector for Cloud Run → Cloud SQL private networking
- Service accounts for least-privilege access

---

**END ADR-008**
