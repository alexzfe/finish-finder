const { PrismaClient } = require('@prisma/client')
const fs = require('fs')

async function generateCSVReport() {
  const prisma = new PrismaClient()

  try {
    console.log('📊 Generating comprehensive CSV report of enriched data...')

    const events = await prisma.event.findMany({
      include: { fights: { include: { fighter1: true, fighter2: true } } },
      orderBy: { date: 'asc' }
    })

    // Generate Events CSV
    const eventsCsvHeader = 'Event Name,Date,Venue,Location,Total Fights,Data Source Enriched\n'
    const eventsCsvRows = events.map(event => {
      const enriched = (event.venue !== 'TBA' && event.location !== 'TBA') ? 'Yes' : 'Partial'
      return `"${event.name}","${event.date}","${event.venue}","${event.location}",${event.fights.length},"${enriched}"`
    }).join('\n')

    const eventsCsv = eventsCsvHeader + eventsCsvRows
    fs.writeFileSync('events_report.csv', eventsCsv)
    console.log('✅ Events CSV generated: events_report.csv')

    // Generate Fights CSV
    const fightsCsvHeader = 'Event Name,Event Date,Fighter 1,Fighter 1 Nickname,Fighter 2,Fighter 2 Nickname,Weight Class,Card Position\n'
    const fightsCsvRows = []

    events.forEach(event => {
      event.fights.forEach(fight => {
        const row = `"${event.name}","${event.date}","${fight.fighter1.name}","${fight.fighter1.nickname || ''}","${fight.fighter2.name}","${fight.fighter2.nickname || ''}","${fight.weightClass}","${fight.cardPosition}"`
        fightsCsvRows.push(row)
      })
    })

    const fightsCsv = fightsCsvHeader + fightsCsvRows.join('\n')
    fs.writeFileSync('fights_report.csv', fightsCsv)
    console.log('✅ Fights CSV generated: fights_report.csv')

    // Generate Summary Statistics
    const totalEvents = events.length
    const totalFights = events.reduce((sum, e) => sum + e.fights.length, 0)
    const enrichedEvents = events.filter(e => e.venue !== 'TBA' && e.location !== 'TBA').length
    const partiallyEnrichedEvents = events.filter(e => (e.venue !== 'TBA') !== (e.location !== 'TBA')).length
    const fightersWithNicknames = events.reduce((sum, e) =>
      sum + e.fights.reduce((fSum, f) =>
        fSum + (f.fighter1.nickname ? 1 : 0) + (f.fighter2.nickname ? 1 : 0), 0), 0)

    const summary = `
UFC EVENTS & FIGHTS ENRICHMENT REPORT
=====================================

COLLECTION SUMMARY:
- Total Events Scraped: ${totalEvents}
- Total Fights Collected: ${totalFights}
- Average Fights per Event: ${(totalFights / totalEvents).toFixed(1)}

DATA ENRICHMENT QUALITY:
- Fully Enriched Events (venue + location): ${enrichedEvents} (${((enrichedEvents / totalEvents) * 100).toFixed(1)}%)
- Partially Enriched Events: ${partiallyEnrichedEvents} (${((partiallyEnrichedEvents / totalEvents) * 100).toFixed(1)}%)
- Fighters with Nicknames: ${fightersWithNicknames}

DATE RANGE:
- Earliest Event: ${events[0]?.date || 'N/A'}
- Latest Event: ${events[events.length - 1]?.date || 'N/A'}

FILES GENERATED:
- events_report.csv (${totalEvents} events)
- fights_report.csv (${totalFights} fights)

SOURCES INTEGRATED:
✅ Tapology (Primary source for events and fights)
✅ Wikipedia (Enrichment for venue, location, date validation)
`

    fs.writeFileSync('enrichment_summary.txt', summary)
    console.log('✅ Summary report generated: enrichment_summary.txt')

    console.log(summary)

  } catch (error) {
    console.error('❌ Error generating CSV report:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

generateCSVReport()