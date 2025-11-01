# Frontend UI Layer - Component Context

## Purpose

The `src/app/` directory implements the **Next.js 15 App Router** frontend layer for Finish Finder, providing a mobile-first UFC-themed interface for browsing upcoming fight events, viewing AI-powered entertainment predictions, and accessing admin performance monitoring.

**Key Responsibilities:**
- Render UFC event schedules with fight cards organized by position (main/preliminary/early preliminary)
- Fetch and display AI predictions (fun factor, finish probability, entertainment analysis)
- Manage client-side application state (event selection, fight modals, loading/error states)
- Provide admin dashboard for database performance monitoring (`/admin`)
- Handle graceful degradation (API → static JSON fallback)

## Current Status: Production-Ready (Nov 2025)

**Evolution Context:**
- Sep 2024: Initial Next.js 15 migration with Turbopack
- Sep 2024: Sentry error tracking integration (client/server/edge)
- Sep 2024: Database API connection established with fallback logic
- Oct 2024: Admin dashboard with query performance monitoring
- **Current**: Stable production deployment on Vercel with static GitHub Pages mirror

**Status Indicators:**
- ✅ TypeScript strict mode enforced
- ✅ Sentry error boundary active in root layout
- ✅ API fallback to static JSON functional
- ✅ Mobile-responsive with UFC-themed design (Tailwind CSS 4)
- ⚠️ Admin dashboard uses demo password (not production-secure)
- ⚠️ No authentication on public API endpoints

## Component-Specific Development Guidelines

### Next.js 15 App Router Patterns

**Server vs. Client Components:**
```typescript
// Client components (interactive UI)
'use client'  // Top of file
import { useState, useEffect } from 'react'

// Server components (default, data fetching in layout/pages)
// No 'use client' directive
```

**API Route Handlers:**
```typescript
// force-dynamic disables caching for real-time data
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  // Route handler implementation
}
```

### React 19 Conventions

**State Management:**
- Local state only (`useState`) - no Redux/Zustand
- `useEffect` for data fetching with cleanup
- `useMemo`/`useCallback` for performance optimization
- `memo()` wrapper for expensive components (e.g., `FightList`)

**Component Composition:**
```typescript
// Props interface with explicit types
interface ComponentProps {
  data: UFCEvent
  onSelect?: (id: string) => void
}

// Memoized functional component
const Component = memo(({ data, onSelect }: ComponentProps) => {
  // Implementation
})
```

### Styling with Tailwind CSS 4

**UFC Theme Variables:**
```css
/* globals.css */
--ufc-red: #d20a0a
--ufc-gold: #f1c40f
--ufc-dark: #1a1a1a
```

**Responsive Breakpoints:**
- Mobile-first: base styles for <640px
- Tablet: `md:` prefix (768px+)
- Desktop: `lg:` prefix (1024px+)
- Wide: `xl:` prefix (1280px+)

### Error Handling Strategy

**Graceful Degradation Pattern:**
```typescript
try {
  // 1. Try database API
  const apiResponse = await fetch('/api/db-events')
  if (apiResponse.ok) {
    const apiData = await apiResponse.json()
    if (apiData?.data?.events?.length > 0) {
      return apiData.data.events
    }
  }
} catch (error) {
  // 2. Fallback to static JSON
  const staticResponse = await fetch('/data/events.json')
  return staticResponse.json()
}
```

**Error States:**
- Display user-friendly messages (no stack traces)
- Provide actionable instructions (reload, check connection)
- Log errors to Sentry with context

## Major Subsystem Organization

### Directory Structure

```
src/app/
├── page.tsx                     # Main home page (client component)
├── layout.tsx                   # Root layout with Sentry + metadata
├── globals.css                  # Tailwind base + UFC theme variables
├── admin/
│   └── page.tsx                 # Admin dashboard (password-protected)
├── api/
│   ├── db-events/route.ts       # Events API (force-dynamic)
│   ├── health/route.ts          # System health check
│   ├── performance/route.ts     # Query performance metrics
│   ├── fighter-image/route.ts   # Fighter images (disabled)
│   └── admin/
│       └── wipe-database/route.ts  # DB reset utility (admin)
└── favicon.ico                  # Site icon
```

### Component Organization (src/components/)

```
components/
├── ui/                          # UI primitives
│   ├── EventNavigation.tsx      # Event carousel (prev/next buttons)
│   ├── EventSelector.tsx        # Event dropdown selector
│   └── Header.tsx               # App header with branding
├── fight/                       # Fight card components
│   ├── FightList.tsx            # Main fight card (memoized)
│   └── FightDetailsModal.tsx    # Fight analysis modal (mobile)
├── fighter/
│   └── FighterAvatar.tsx        # Avatar with lazy loading
└── admin/                       # Admin dashboard components
    ├── PerformanceDashboard.tsx # Query metrics charts
    └── DatabaseManagement.tsx   # DB operations UI
```

## Architectural Patterns

### 1. Client-Side Data Fetching with Fallback

**Pattern:**
```typescript
// src/app/page.tsx
const [events, setEvents] = useState<UFCEvent[]>([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)

useEffect(() => {
  const fetchEvents = async () => {
    setLoading(true)
    try {
      // Primary: Database API
      const events = await fetchFromAPI()
      setEvents(events)
    } catch (err) {
      try {
        // Fallback: Static JSON
        const events = await fetchStaticData()
        setEvents(events)
      } catch (fallbackErr) {
        setError('Failed to load events')
      }
    } finally {
      setLoading(false)
    }
  }
  fetchEvents()
}, [])
```

**Benefits:**
- Resilient to API outages
- Works offline (if static JSON cached)
- Fast fallback (<100ms for local JSON)

### 2. Server Component API Routes

**Pattern:**
```typescript
// src/app/api/db-events/route.ts
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const events = await prisma.event.findMany({
      include: {
        fights: {
          include: { fighter1: true, fighter2: true }
        }
      },
      orderBy: { date: 'asc' },
      take: 50  // Pagination
    })

    // Transform Prisma output to client format
    const transformed = transformEvents(events)

    return NextResponse.json({
      success: true,
      data: { events: transformed }
    })
  } catch (error) {
    Sentry.captureException(error)
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    )
  }
}
```

**Key Decisions:**
- `force-dynamic` prevents stale cache
- `take: 50` limits query size (performance)
- Sentry captures server errors
- Client-safe error messages (no leak)

### 3. Component Memoization

**Pattern:**
```typescript
// src/components/fight/FightList.tsx
const FightListComponent = ({ event, onFightClick }: Props) => {
  const renderFight = useCallback((fight: Fight) => {
    // Expensive render logic
  }, [selectedFight])

  return (
    <div>
      {fights.map(renderFight)}
    </div>
  )
}

export const FightList = memo(FightListComponent)
```

**When to Use:**
- Component receives same props frequently
- Render is computationally expensive
- Parent re-renders often but child data unchanged

### 4. Modal/Dialog Pattern (Headless UI)

**Pattern:**
```typescript
// src/components/fight/FightDetailsModal.tsx
import { Dialog, Transition } from '@headlessui/react'

export function FightDetailsModal({ fight, isOpen, onClose }: Props) {
  return (
    <Transition show={isOpen}>
      <Dialog onClose={onClose} className="relative z-50">
        {/* Backdrop */}
        <Transition.Child
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
        >
          <div className="fixed inset-0 bg-black/80" />
        </Transition.Child>

        {/* Modal content */}
        <div className="fixed inset-0 flex items-center justify-center">
          {/* Content */}
        </div>
      </Dialog>
    </Transition>
  )
}
```

**Usage:** Mobile-only (<1024px); desktop uses sidebar

## Integration Points

### Database (via API Routes)

**Connection:**
```
Frontend (page.tsx)
  → fetch('/api/db-events')
    → API Route (route.ts)
      → Prisma Client (src/lib/database/prisma.ts)
        → PostgreSQL (Supabase)
```

**Data Flow:**
1. Client requests events
2. API queries Prisma with includes
3. Prisma returns nested events/fights/fighters
4. API transforms to client format (parseJsonArray for JSON fields)
5. Client renders normalized data

**Key Files:**
- `src/app/api/db-events/route.ts:92` - JSON parsing with `parseJsonArray`
- `src/lib/database/prisma.ts:28` - Singleton PrismaClient with monitoring
- `src/lib/utils/json.ts:15` - Safe JSON parsing utilities

### Monitoring (Sentry)

**Integration:**
```
Root Layout (layout.tsx)
  → Sentry ErrorBoundary wrapper
    → Captures uncaught errors
      → Sends to Sentry dashboard
```

**Configuration:**
- `sentry.client.config.ts` - Browser errors
- `sentry.server.config.ts` - API route errors
- `sentry.edge.config.ts` - Edge function errors

**Error Context:**
```typescript
Sentry.captureException(error, {
  tags: { route: '/api/db-events' },
  extra: { query: params }
})
```

### Static Export (GitHub Pages)

**Generation:**
```
scripts/export-static-data.js
  → Queries Prisma for all events
    → Writes public/data/events.json
      → GitHub Pages static mirror
```

**Fallback Chain:**
1. Vercel API (`/api/db-events`)
2. Static JSON (`/data/events.json`)
3. Error message

### Admin Dashboard

**Authentication:**
```typescript
// src/app/admin/page.tsx:21
if (password !== 'admin123') {
  return <div>Access denied</div>
}
```

**⚠️ Security Note:** Hardcoded password for demo only. Production should use OAuth/JWT.

**Metrics Displayed:**
- Query performance (slow/critical queries)
- Database connection status
- Recent query history
- Alert threshold violations

**Data Source:** `/api/performance` endpoint queries `QueryMetric` table

## Development Patterns

### Adding a New Page

1. Create `src/app/my-page/page.tsx`
2. Define as server or client component
3. Add metadata export if server component
4. Link from navigation component

**Example:**
```typescript
// src/app/my-page/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Page - Finish Finder',
  description: 'Page description'
}

export default function MyPage() {
  return <div>Content</div>
}
```

### Adding an API Route

1. Create `src/app/api/my-endpoint/route.ts`
2. Export `GET`/`POST`/etc. handlers
3. Use `force-dynamic` for real-time data
4. Add Sentry error capture
5. Return `NextResponse.json()`

**Example:**
```typescript
// src/app/api/my-endpoint/route.ts
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const data = await fetchData()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    Sentry.captureException(error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch' },
      { status: 500 }
    )
  }
}
```

### Testing Strategy

**Unit Tests:**
- Test utilities and pure functions
- Mock API responses for component tests
- Use Vitest with jsdom environment

**Integration Tests:**
- Test API routes with test database
- Verify data transformations
- Check error handling paths

**E2E Tests (Planned):**
- Playwright smoke tests
- Critical user flows (view events, select fights)
- Mobile responsive checks

**Location:** Tests colocated with components in `__tests__/` directories

### Debugging Patterns

**Client-Side:**
```typescript
// Enable verbose logging
if (process.env.NODE_ENV === 'development') {
  console.log('Event data:', events)
}

// Check Sentry for production errors
// View at: https://sentry.io/organizations/finish-finder
```

**Server-Side:**
```typescript
// API route logging
console.log('[db-events] Query started')

// Check Vercel logs
// View at: https://vercel.com/project/logs
```

**Performance:**
```typescript
// Visit admin dashboard
// http://localhost:3000/admin (password: admin123)
// View slow queries and connection pool status
```

## Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/app/page.tsx` | 288 | Main home page with event/fight display |
| `src/app/layout.tsx` | 37 | Root layout with Sentry + metadata |
| `src/app/api/db-events/route.ts` | 136 | Events API with Prisma queries |
| `src/components/fight/FightList.tsx` | 266 | Memoized fight card component |
| `src/components/fight/FightDetailsModal.tsx` | 145 | Mobile modal for fight details |
| `src/components/ui/EventNavigation.tsx` | 101 | Event carousel navigation |
| `src/app/admin/page.tsx` | 93 | Performance monitoring dashboard |
| `src/app/api/health/route.ts` | 296 | System health check endpoint |

## Related Documentation

- `/docs/ARCHITECTURE.md` - Full system architecture
- `/docs/OPERATIONS.md` - Deployment and monitoring
- `/docs/TESTING.md` - Testing strategy and patterns
- `/src/components/README.md` - Component library (if exists)
- `/src/lib/database/CONTEXT.md` - Database layer patterns

## Maintenance Notes

**Regular Updates:**
- Review Sentry errors weekly
- Monitor admin dashboard for slow queries
- Update static JSON export after scraper runs
- Test fallback chain monthly

**Known Limitations:**
- Admin password hardcoded (demo only)
- No authentication on public APIs
- Fighter images disabled (placeholder only)
- Mobile modal only (<1024px); desktop uses sidebar

**Future Enhancements:**
- OAuth/JWT authentication for admin
- WebSocket real-time updates
- Progressive Web App (PWA) support
- Fighter profile pages
