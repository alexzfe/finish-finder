# Documentation Hub

Welcome to the Finish Finder documentation. This hub organizes all project documentation by topic and audience.

---

## Quick Navigation

| I want to... | Go to... |
|--------------|----------|
| **Set up the project** | [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) |
| **Understand the system** | [ARCHITECTURE.md](../ARCHITECTURE.md) |
| **Deploy to production** | [DEPLOYMENT.md](../DEPLOYMENT.md) |
| **Run daily operations** | [OPERATIONS.md](../OPERATIONS.md) |
| **Learn about AI predictions** | [AI_DOCUMENTATION_INDEX.md](AI_DOCUMENTATION_INDEX.md) |
| **Work with the scraper** | [scraper/ARCHITECTURE.md](scraper/ARCHITECTURE.md) |
| **Contribute code** | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| **Run tests** | [TESTING.md](../TESTING.md) |

---

## Documentation by Audience

### For New Developers

1. Start with [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for complete setup
2. Review [ARCHITECTURE.md](../ARCHITECTURE.md) for system overview
3. Check [CONTRIBUTING.md](../CONTRIBUTING.md) for workflow guidelines

### For DevOps/Operations

1. [DEPLOYMENT.md](../DEPLOYMENT.md) - Deployment procedures
2. [OPERATIONS.md](../OPERATIONS.md) - Daily operations runbook
3. [SECURITY.md](../SECURITY.md) - Security practices

### For AI/ML Engineers

1. [AI_DOCUMENTATION_INDEX.md](AI_DOCUMENTATION_INDEX.md) - AI system overview
2. [ai/RESEARCH.md](ai/RESEARCH.md) - Research findings and best practices
3. [CODEBASE_EXPLORATION_SUMMARY.md](CODEBASE_EXPLORATION_SUMMARY.md) - Deep dive into AI components

### For Data Engineers

1. [scraper/ARCHITECTURE.md](scraper/ARCHITECTURE.md) - Scraper architecture
2. [scraper/OPERATIONS.md](/scraper/OPERATIONS.md) - Scraper operations
3. [OPERATIONS.md](../OPERATIONS.md) - Database operations

---

## Documentation Structure

```
docs/
├── README.md                          # This file - navigation hub
├── ARCHITECTURE.md                    # System architecture (from root)
├── DEVELOPER_GUIDE.md                 # Developer onboarding
├── AI_DOCUMENTATION_INDEX.md          # AI system navigation
├── AI_SYSTEM_QUICK_REFERENCE.md       # Quick AI commands
├── AI_FILES_MANIFEST.md               # AI file locations
├── CODEBASE_EXPLORATION_SUMMARY.md    # Deep architecture dive
├── DOCUMENTATION_CLEANUP_ANALYSIS.md  # Cleanup analysis
├── ai/
│   └── RESEARCH.md                    # AI research findings
├── ai-context/
│   └── key-factors-generation.md      # Implementation details
└── scraper/
    └── ARCHITECTURE.md                # Complete scraper guide
```

Root level documentation:
```
├── README.md              # Main project readme
├── CLAUDE.md              # Current project state (for Claude)
├── ARCHITECTURE.md        # System architecture
├── DEPLOYMENT.md          # Deployment guide
├── OPERATIONS.md          # Operations runbook
├── ROADMAP.md             # Project roadmap
├── CONTRIBUTING.md        # Contributor guide
├── TESTING.md             # Testing guide
├── STYLEGUIDE.md          # Code style guide
└── SECURITY.md            # Security practices
```

---

## Archived Documentation

Historical documentation is organized in [`archive/docs-historical/`](/archive/docs-historical/):

- **2025-01-migrations/** - Completed migration plans
- **2025-09-handoffs/** - Historical handoffs and audits
- **2025-11-ai-legacy/** - Legacy AI documentation
- **2025-12-research/** - Superseded research documents

---

## Updating Documentation

When adding new documentation:

1. Place in appropriate directory (docs/ or root)
2. Add entry to this README
3. Update relevant index files (AI_DOCUMENTATION_INDEX.md, etc.)
4. Use clear, descriptive filenames
5. Include table of contents for long documents

---

**Last Updated**: 2026-02-01
**Status**: Active - 70% reduction completed
