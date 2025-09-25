// Quick test of the improved date parsing logic
const { TapologyUFCService } = require('./dist/lib/scrapers/tapologyService.js')

async function testDateParsing() {
  const service = new TapologyUFCService()

  const testDates = [
    'Saturday, December 13, 6:00 PM ET',
    'Dec 13, 6pm',
    'December 13',
    'Jan 15',
    'UFC Fight Night: Royval vs. Kape',
    'Saturday, November 30, 8:00 PM',
    'Nov 30'
  ]

  console.log('🧪 Testing date parsing logic...\n')

  for (const testDate of testDates) {
    console.log(`Input: "${testDate}"`)
    try {
      const result = service.parseTapologyDate(testDate)
      console.log(`Result: ${result}`)
    } catch (error) {
      console.log(`Error: ${error.message}`)
    }
    console.log('---')
  }
}

testDateParsing()