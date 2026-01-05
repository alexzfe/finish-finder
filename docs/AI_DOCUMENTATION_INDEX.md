# AI Prediction System - Documentation Index

Welcome! This index guides you through all available documentation for the Finish-Finder AI Prediction System.

## Quick Start (Start Here!)

**New to the codebase?** Start here:
1. Read: **[AI System Quick Reference](./AI_SYSTEM_QUICK_REFERENCE.md)** (5 minutes)
   - Command syntax
   - Key components
   - Common tasks
   - Pricing & metrics

2. Read: **[Codebase Exploration Summary](./CODEBASE_EXPLORATION_SUMMARY.md)** (15 minutes)
   - Full architecture overview
   - All major components explained
   - Database schema details
   - How data flows through the system

3. Reference: **[AI Files Manifest](./AI_FILES_MANIFEST.md)** (as needed)
   - Complete list of all AI-related files
   - File purposes and locations
   - Key classes and exports
   - File organization structure

## Deep Dives by Topic

### Architecture & Design

- **[AI Prediction Implementation Plan](./AI_PREDICTION_IMPLEMENTATION_PLAN.md)**
  - Complete 4-phase implementation roadmap
  - Database schema design
  - Prompt engineering details
  - Success metrics and timelines
  - Cost estimates

- **[Codebase Exploration Summary](./CODEBASE_EXPLORATION_SUMMARY.md)** (Section 3-6)
  - Full system architecture
  - Component interactions
  - Data flow diagrams
  - Integration points

### AI Prediction Algorithms

- **[Codebase Exploration Summary](./CODEBASE_EXPLORATION_SUMMARY.md)** (Section 4-5)
  - **Finish Probability Prediction**
    - 4-step chain-of-thought reasoning
    - Input data structure
    - Output format
    - Analysis framework
  
  - **Fun Score Prediction**
    - Weighted factor analysis
    - 7 weighted components
    - Entertainment scoring methodology
    - Fighter style classification

### Prompt Engineering

- **[AI System Quick Reference](./AI_SYSTEM_QUICK_REFERENCE.md)** (Section: Prompt Engineering Notes)
  - Temperature settings
  - Token limits
  - JSON validation rules

- **[AI Prediction Implementation Plan](./AI_PREDICTION_IMPLEMENTATION_PLAN.md)** (Section 2)
  - Complete prompt templates
  - Prompt structure details
  - Weight class base rates
  - Analysis frameworks

- **[Key Factors Generation](./ai-context/key-factors-generation.md)**
  - Two-step extraction approach
  - Reliability improvements
  - Implementation details

### Database & Data Models

- **[Codebase Exploration Summary](./CODEBASE_EXPLORATION_SUMMARY.md)** (Section 6)
  - Fighter model (60+ fields)
  - Fight model
  - PredictionVersion model
  - Prediction model (NEW)
  - Relations and constraints

- **[Prisma Schema](../prisma/schema.prisma)**
  - Source of truth for database design
  - All model definitions
  - Indexes and constraints

### Running Predictions

- **[AI System Quick Reference](./AI_SYSTEM_QUICK_REFERENCE.md)** (Sections: Typical Workflow, Common Tasks)
  - How to run the prediction runner
  - Command-line options explained
  - Monitoring costs and tokens
  - Database verification

- **[Codebase Exploration Summary](./CODEBASE_EXPLORATION_SUMMARY.md)** (Section 7)
  - Complete runner flow
  - Execution steps
  - Rate limiting details
  - Progress reporting

### Cost & Performance

- **[AI System Quick Reference](./AI_SYSTEM_QUICK_REFERENCE.md)** (Section: Pricing, Performance Tips)
  - Token costs per fight
  - Cost per event
  - Monthly budgets
  - Rate limiting strategy
  - Caching strategies

- **[Codebase Exploration Summary](./CODEBASE_EXPLORATION_SUMMARY.md)** (Section 14)
  - Detailed cost breakdown
  - Performance considerations
  - Optimization strategies

### Version Control & Evaluation

- **[AI System Quick Reference](./AI_SYSTEM_QUICK_REFERENCE.md)** (Section: Version Control, Monitoring)
  - Prompt version tracking via SHA256
  - A/B testing methodology
  - Accuracy metrics
  - Where to find metrics

- **[AI Prediction Implementation Plan](./AI_PREDICTION_IMPLEMENTATION_PLAN.md)** (Section 4)
  - Evaluation metrics system
  - Accuracy calculation
  - Brier score
  - Outcome recording

### Troubleshooting

- **[AI System Quick Reference](./AI_SYSTEM_QUICK_REFERENCE.md)** (Section: Troubleshooting)
  - Common error messages
  - Solutions for each error
  - Debug strategies

### Integration

- **[AI System Quick Reference](./AI_SYSTEM_QUICK_REFERENCE.md)** (Section: Integration Points)
  - Scraper integration
  - UI integration
  - API endpoints

- **[Codebase Exploration Summary](./CODEBASE_EXPLORATION_SUMMARY.md)** (Section 8)
  - Fighter context service
  - Web search enrichment
  - Context caching

## File-by-File Documentation

### Core Service Files

- **`/src/lib/ai/newPredictionService.ts`**
  - Read: [AI System Quick Reference](./AI_SYSTEM_QUICK_REFERENCE.md#main-service)
  - Read: [Codebase Exploration](./CODEBASE_EXPLORATION_SUMMARY.md#32-core-ai-service)

- **`/src/lib/ai/prompts/finishProbabilityPrompt.ts`**
  - Read: [AI System Quick Reference](./AI_SYSTEM_QUICK_REFERENCE.md#finish-probability)
  - Read: [Codebase Exploration Section 4](./CODEBASE_EXPLORATION_SUMMARY.md#4-finish-probability-prediction)

- **`/src/lib/ai/prompts/funScorePrompt.ts`**
  - Read: [AI System Quick Reference](./AI_SYSTEM_QUICK_REFERENCE.md#fun-score)
  - Read: [Codebase Exploration Section 5](./CODEBASE_EXPLORATION_SUMMARY.md#5-fun-score-prediction)

- **`/src/lib/ai/fighterContextService.ts`**
  - Read: [Codebase Exploration Section 8](./CODEBASE_EXPLORATION_SUMMARY.md#8-fighter-context-service)

### Runner Scripts

- **`/scripts/new-ai-predictions-runner.ts`**
  - Read: [AI System Quick Reference - Typical Workflow](./AI_SYSTEM_QUICK_REFERENCE.md#typical-workflow)
  - Read: [Codebase Exploration Section 7](./CODEBASE_EXPLORATION_SUMMARY.md#71-main-runner-script)

### Database

- **`/prisma/schema.prisma`**
  - Read: [Codebase Exploration Section 6](./CODEBASE_EXPLORATION_SUMMARY.md#6-database-schema--models)

### CI/CD

- **`.github/workflows/ai-predictions.yml`**
  - Read: [AI System Quick Reference - GitHub Actions](./AI_SYSTEM_QUICK_REFERENCE.md#github-actions)
  - Read: [Codebase Exploration Section 11](./CODEBASE_EXPLORATION_SUMMARY.md#11-cicd-integration)

## Learning Paths

### For Backend Developers

1. **Understand the system**: [Quick Reference](./AI_SYSTEM_QUICK_REFERENCE.md)
2. **Deep dive into architecture**: [Codebase Summary](./CODEBASE_EXPLORATION_SUMMARY.md)
3. **Study database design**: [Codebase Section 6](./CODEBASE_EXPLORATION_SUMMARY.md#6-database-schema--models)
4. **Learn the runner**: [Codebase Section 7](./CODEBASE_EXPLORATION_SUMMARY.md#71-main-runner-script)
5. **Reference file locations**: [Files Manifest](./AI_FILES_MANIFEST.md)

### For Prompt Engineers

1. **Understand scoring**: [Quick Reference - Finish/Fun sections](./AI_SYSTEM_QUICK_REFERENCE.md#3-prompt-templates)
2. **Deep dive into prompts**: [Codebase Sections 4-5](./CODEBASE_EXPLORATION_SUMMARY.md#4-finish-probability-prediction)
3. **Study implementation details**: [Implementation Plan Section 2](./AI_PREDICTION_IMPLEMENTATION_PLAN.md#phase-2-ai-prompt-templates-week-2)
4. **Learn about key factors**: [Key Factors Generation](./ai-context/key-factors-generation.md)
5. **Understand evaluation**: [Implementation Plan Section 4](./AI_PREDICTION_IMPLEMENTATION_PLAN.md#phase-4-evaluation-system-week-3-4)

### For DevOps/Ops

1. **Quick reference**: [AI System Quick Reference](./AI_SYSTEM_QUICK_REFERENCE.md)
2. **Cost and performance**: [Quick Reference - Pricing section](./AI_SYSTEM_QUICK_REFERENCE.md#pricing)
3. **Monitoring**: [Quick Reference - Monitoring section](./AI_SYSTEM_QUICK_REFERENCE.md#monitoring)
4. **CI/CD**: [Codebase Section 11](./CODEBASE_EXPLORATION_SUMMARY.md#11-cicd-integration)
5. **Troubleshooting**: [Quick Reference - Troubleshooting](./AI_SYSTEM_QUICK_REFERENCE.md#troubleshooting)

### For Data Scientists

1. **Understand predictions**: [Codebase Sections 4-5](./CODEBASE_EXPLORATION_SUMMARY.md#4-finish-probability-prediction)
2. **Study accuracy metrics**: [Implementation Plan Section 4](./AI_PREDICTION_IMPLEMENTATION_PLAN.md#phase-4-evaluation-system-week-3-4)
3. **Learn about calibration**: [Codebase Section 10](./CODEBASE_EXPLORATION_SUMMARY.md#10-risk-level-classification)
4. **Understand evaluation**: [Codebase Section 15](./CODEBASE_EXPLORATION_SUMMARY.md#15-current-status--next-steps)

## Context Documents

### Project Context

- **[Project Structure Overview](./ai-context/project-structure.md)**
  - Overall project organization
  - Directory structure
  - Component relationships

- **[Handoff Documentation](./ai-context/HANDOFF.md)**
  - Knowledge transfer information
  - Key decisions and rationale
  - Current limitations and workarounds

### Detailed Specifications

- **[Docs Overview](./ai-context/docs-overview.md)**
  - Available documentation
  - How to use documentation
  - Where to find specific info

- **[Key Factors Generation](./ai-context/key-factors-generation.md)**
  - Detailed analysis of factor extraction
  - Multiple solutions compared
  - Implementation approach chosen

- **[Prompt Context](../src/lib/ai/prompts/CONTEXT.md)**
  - Specific notes about prompt files
  - Design decisions
  - Calibration details

## Common Questions

**Q: How do I run predictions?**
A: See [AI System Quick Reference - Typical Workflow](./AI_SYSTEM_QUICK_REFERENCE.md#typical-workflow)

**Q: How much does this cost?**
A: See [AI System Quick Reference - Pricing](./AI_SYSTEM_QUICK_REFERENCE.md#pricing)

**Q: What's the current accuracy?**
A: See [Codebase Summary - Key Metrics](./CODEBASE_EXPLORATION_SUMMARY.md#16-key-metrics--targets)

**Q: How does finish probability work?**
A: See [Codebase Summary Section 4](./CODEBASE_EXPLORATION_SUMMARY.md#4-finish-probability-prediction)

**Q: How does fun score work?**
A: See [Codebase Summary Section 5](./CODEBASE_EXPLORATION_SUMMARY.md#5-fun-score-prediction)

**Q: Where are the prompt templates?**
A: See [Files Manifest - Prompt Templates](./AI_FILES_MANIFEST.md#prompt-templates--builders)

**Q: How do I modify prompts?**
A: See [Implementation Plan Section 2](./AI_PREDICTION_IMPLEMENTATION_PLAN.md#phase-2-ai-prompt-templates-week-2)

**Q: How is version control handled?**
A: See [Quick Reference - Version Control](./AI_SYSTEM_QUICK_REFERENCE.md#version-control)

**Q: What if predictions fail?**
A: See [Quick Reference - Troubleshooting](./AI_SYSTEM_QUICK_REFERENCE.md#troubleshooting)

## Documentation Statistics

| Document | Type | Length | Focus |
|-----------|------|--------|-------|
| AI_SYSTEM_QUICK_REFERENCE.md | Guide | 20 pages | Commands, quick answers |
| CODEBASE_EXPLORATION_SUMMARY.md | Reference | 23 pages | Architecture, all components |
| AI_FILES_MANIFEST.md | Index | 15 pages | Files, locations, exports |
| AI_PREDICTION_IMPLEMENTATION_PLAN.md | Plan | 40 pages | Implementation phases, detailed specs |
| QUICK_START.md | Tutorial | 5 pages | Getting started |
| ai-context/* | Context | 10+ pages | Detailed domain knowledge |

**Total Pages**: 130+
**Total Words**: 30,000+

## Maintenance

**Last Updated**: 2025-11-15
**Maintained by**: Claude Code
**Review Frequency**: After significant code changes
**Next Review**: After prompt optimization cycle

### How to Update These Docs

1. Edit the relevant .md files in `/docs/`
2. Update this index if adding new sections
3. Run: `git add docs/ && git commit -m "docs: update AI documentation"`
4. Push to repository

## Navigation Tips

- **Use Ctrl+F / Cmd+F** to search within documents
- **Click on section links** in this index to jump directly to topics
- **Check the Summary section** of any major document first
- **Reference the Files Manifest** when looking for specific code locations
- **Use the Quick Reference** for syntax and common commands

---

**Last Updated**: 2025-11-15
**Version**: 1.0
**Status**: Complete

This documentation provides comprehensive coverage of the Finish-Finder AI Prediction System. For questions not answered here, please check the inline code comments or reach out to the development team.
