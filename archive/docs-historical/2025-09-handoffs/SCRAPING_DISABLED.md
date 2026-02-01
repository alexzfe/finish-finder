# Automated Scraping Status

## Current Status: ✅ AUTOMATED SCRAPING ENABLED (Wikipedia-first)

**Updated:** 2025-09-22
**Notes:** Sherdog remains disabled in CI due to 403 blocks; Tapology enriches fighter records.

## What Was Disabled

### GitHub Actions Workflow
- **File:** `.github/workflows/scraper.yml`
- **Schedule:** Enabled
- **Env flags:** `SHERDOG_ENABLED=false`, `TAPOLOGY_ENRICH_RECORDS=true`

### Impact
- Daily updates run without Sherdog in CI
- Events/fights sourced from Wikipedia; fighter records enriched from Tapology

## Alternative Data Collection Methods

### 1. **Local Manual Scraping** ✅
Run scraping from your local machine to avoid IP blocking:

```bash
# Set up environment variables
export DATABASE_URL="your_postgresql_connection_string"
export OPENAI_API_KEY="your_openai_api_key"

# Run scraper locally
node scripts/automated-scraper.js check

# Generate predictions
node scripts/generate-event-predictions.js
```

**Advantages:**
- Avoids GitHub Actions IP blocking
- Can use residential IP addresses
- Full control over timing and retry logic

### 2. **Manual GitHub Actions Trigger**
The workflow can be triggered manually; CI is configured to avoid Sherdog.

1. Go to GitHub repository
2. Navigate to Actions → Automated Scraper (DISABLED)
3. Click "Run workflow"

### 3. **Static Data Export** 📊 BACKUP OPTION
If scraping fails completely, use the last known good data:

```bash
# Export current database to static files
npm run pages:build

# This creates public/data/events.json for fallback
```

## Monitoring & Alerts

### Check If Sherdog Blocking Has Lifted
```bash
# Test if Sherdog is accessible from your IP
curl -I "https://www.sherdog.com/organizations/Ultimate-Fighting-Championship-UFC-2"

# Look for HTTP 200 response instead of 403
```

### Data Freshness Check
```bash
# Check when data was last updated
node scripts/automated-scraper.js status
```

## Sherdog Re-Enablement (Optional)
When CI IP blocks lift or a provider is added, Sherdog can be re-enabled:
1. Set `SHERDOG_ENABLED=true` in workflow env
2. Optionally throttle via `SHERDOG_MAX_RPS`

### Alternative Solutions (Future)
Consider implementing these to avoid future blocking:

1. **Proxy Rotation**: Use rotating proxy services
2. **Rate Limiting**: Add longer delays between requests
3. **User Agent Rotation**: Vary browser fingerprints
4. **Alternative Data Sources**: Integrate official UFC APIs
5. **Caching Layer**: Reduce scraping frequency with intelligent caching

## Troubleshooting Common Issues

### 403 Errors During Local Scraping
```bash
# Wait between attempts (rate limiting)
sleep 3600  # Wait 1 hour

# Try with different user agent
export USER_AGENT="Mozilla/5.0 (compatible; FinishFinderBot/1.0)"
```

### Database Connection Issues
```bash
# Test database connectivity
node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.event.count().then(console.log).catch(console.error)"
```

### OpenAI API Errors
```bash
# Test OpenAI connectivity
node -e "const OpenAI = require('openai'); const client = new OpenAI(); client.models.list().then(r => console.log('OpenAI OK')).catch(console.error)"
```

## Maintenance Schedule

### Daily Tasks (Manual)
- [ ] Check if new UFC events are announced
- [ ] Run local scraper if new data is available
- [ ] Verify static export is updated

### Weekly Tasks
- [ ] Test if Sherdog blocking has been lifted
- [ ] Review scraper logs for any new blocking patterns
- [ ] Update documentation if situation changes

## Contact & Escalation

If you need to re-enable automation or implement alternative solutions:

1. **Check GitHub Issues**: Review any open issues about scraping
2. **Test Connectivity**: Verify Sherdog accessibility from different IPs
3. **Update Documentation**: Keep this file current with any changes

---

**Last Updated:** 2025-09-22
**Next Review:** Weekly
