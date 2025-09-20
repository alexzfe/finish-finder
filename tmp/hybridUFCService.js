"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HybridUFCService = void 0;
const openai_1 = require("openai");
class HybridUFCService {
    constructor() {
        this.openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    // Get current date for accurate searches
    getCurrentDate() {
        const now = new Date();
        // Force to use current local date
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const currentDate = `${year}-${month}-${day}`;
        console.log(`📅 Current date calculated: ${currentDate}`);
        return currentDate;
    }
    // Search for real current UFC events using web search
    async searchRealUFCEvents() {
        try {
            console.log('🔍 Searching for real current UFC events...');
            const currentDate = this.getCurrentDate();
            console.log(`📅 Current date: ${currentDate}`);
            const events = await this.queryOpenAIWebSearch(currentDate);
            console.log(`✅ Found ${events.length} real upcoming events from OpenAI web search`);
            return events;
        }
        catch (error) {
            console.error('❌ Error searching for real events:', error);
            return [];
        }
    }
    // Use OpenAI to expand real events into complete fight cards
    async expandRealEventsWithAI(realEvents) {
        try {
            console.log('🤖 Expanding real events with AI...');
            const processed = this.buildStructuredEvents(realEvents);
            console.log(`✅ Generated ${processed.events.length} events with ${processed.fighters.length} fighters`);
            return processed;
        }
        catch (error) {
            console.error('❌ Error expanding real events with AI:', error);
            return { events: [], fighters: [] };
        }
    }
    // Generate entertainment predictions for fights
    async generateFightPredictions(fights) {
        try {
            console.log('🎯 Generating entertainment predictions for real fights...');
            const fightList = fights.map(f => `${f.id}: ${f.fighter1Name} vs ${f.fighter2Name} (${f.weightClass}) - ${f.cardPosition}`).join('\n');
            const prompt = `You are a professional MMA analyst specializing in entertainment value prediction. Analyze these REAL upcoming UFC fights for fan engagement and excitement potential.

FIGHTS TO ANALYZE:
${fightList}

ENTERTAINMENT EVALUATION CRITERIA:
1. **Striking Power & Aggression**: Knockout artists, heavy hitters, volume strikers
2. **Submission Threat**: Grappling specialists, submission artists
3. **Fighting Styles Clash**: Striker vs grappler, counter-puncher vs pressure fighter
4. **Recent Form**: Win streaks, spectacular finishes, momentum
5. **Historical Performance**: Fight of the Night bonuses, finish rates
6. **Stylistic Matchup**: Fighting styles that create fireworks
7. **Title Implications**: Championship fights, rankings impact
8. **Personal Narratives**: Rivalries, comebacks, career-defining moments

FUN FACTOR SCALE (1-10):
- 1-3: Technical decision likely, low action
- 4-5: Solid fight, some excitement moments
- 6-7: Entertaining bout, good action throughout
- 8-9: Potential Fight of the Night, high entertainment
- 10: Can't-miss spectacle, guaranteed fireworks

FINISH PROBABILITY (0-100%):
- Consider knockout power, submission skills, chinny fighters
- Factor in fighting styles and typical fight patterns
- Account for recent finishes and finish rates

FORMAT AS EXACT JSON:
[
  {
    "fightId": "fight-id",
    "funFactor": 8,
    "finishProbability": 75,
    "entertainmentReason": "Detailed 2-3 sentence explanation of why this fight will be entertaining, focusing on specific fighting styles, recent performances, and what makes it must-watch.",
    "keyFactors": ["Knockout Power", "Style Clash", "Title Implications"],
    "prediction": "Brief prediction of how the fight will play out",
    "riskLevel": "high|medium|low"
  }
]

Provide specific, detailed analysis for each fight explaining the entertainment value.`;
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are a professional MMA analyst who provides insightful predictions about fight excitement and finish probability based on real fighter data."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.4,
                max_tokens: 2000,
            });
            const response = completion.choices[0]?.message?.content;
            if (!response) {
                throw new Error('No prediction response from OpenAI');
            }
            // Clean and parse the JSON response
            let cleanPredResponse = response.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim();
            // Additional cleaning for malformed JSON
            cleanPredResponse = cleanPredResponse.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
            let predictions;
            try {
                const parsed = JSON.parse(cleanPredResponse);
                predictions = Array.isArray(parsed) ? parsed : [];
            }
            catch (parseError) {
                console.error('❌ Predictions JSON parsing failed:', parseError);
                console.error('Raw predictions response:', response.substring(0, 500));
                console.error('Cleaned predictions response:', cleanPredResponse.substring(0, 500));
                return fights;
            }
            // Merge predictions back into fights with new structured data
            return fights.map(fight => {
                const prediction = predictions.find(p => p.fightId === fight.id);
                if (prediction) {
                    return {
                        ...fight,
                        finishProbability: prediction.finishProbability,
                        entertainmentReason: prediction.entertainmentReason,
                        keyFactors: prediction.keyFactors,
                        fightPrediction: prediction.prediction,
                        riskLevel: prediction.riskLevel,
                        funFactor: prediction.funFactor
                    };
                }
                return fight;
            });
        }
        catch (error) {
            console.error('❌ Error generating fight predictions:', error);
            return fights;
        }
    }
    // Main method to get upcoming UFC events with real data
    async getUpcomingUFCEvents(limit = 3) {
        try {
            console.log('🌐 Starting hybrid UFC data collection (real events + AI analysis)...');
            // Step 1: Search for real current events
            const realEvents = await this.searchRealUFCEvents();
            if (realEvents.length === 0) {
                console.log('⚠️ No real events found, cannot proceed without real data');
                return { events: [], fighters: [] };
            }
            // Step 2: Expand real events with AI
            const expandedData = await this.expandRealEventsWithAI(realEvents.slice(0, limit));
            // Step 3: Generate entertainment predictions for all fights
            for (const event of expandedData.events) {
                if (event.fightCard.length > 0) {
                    event.fightCard = await this.generateFightPredictions(event.fightCard);
                    // Update categorized fight arrays with predictions
                    event.mainCard = event.fightCard.filter(f => f.cardPosition === 'main');
                    event.prelimCard = event.fightCard.filter(f => f.cardPosition === 'preliminary');
                    event.earlyPrelimCard = event.fightCard.filter(f => f.cardPosition === 'early-preliminary');
                }
            }
            return expandedData;
        }
        catch (error) {
            console.error('❌ Error in hybrid UFC collection:', error);
            return { events: [], fighters: [] };
        }
    }
    async queryOpenAIWebSearch(currentDate) {
        const model = process.env.OPENAI_WEB_SEARCH_MODEL || 'gpt-4.1-mini';
        const prompt = `Today is ${currentDate}. Use web search to find upcoming official UFC events scheduled on or after this date. Include numbered UFC cards, UFC Fight Night, UFC on ESPN, and other officially scheduled events.

Return ONLY valid JSON in the following structure:
{
  "events": [
    {
      "name": "Event Name",
      "date": "YYYY-MM-DD",
      "location": "City, Country",
      "venue": "Venue Name",
      "status": "upcoming",
      "source": "Source URL",
      "fightCard": {
        "mainCard": [
          { "fighter1": "Name", "fighter2": "Name", "weightClass": "Weight Class", "titleFight": true|false, "mainEvent": true|false }
        ],
        "preliminaryCard": [
          { "fighter1": "Name", "fighter2": "Name", "weightClass": "Weight Class", "titleFight": false }
        ],
        "earlyPreliminaryCard": [
          { "fighter1": "Name", "fighter2": "Name", "weightClass": "Weight Class", "titleFight": false }
        ]
      }
    }
  ]
}

Rules:
- Only include events confirmed by reputable sources within the search results.
- If a full fight card is not yet announced, include the event with empty arrays.
- Ensure all dates are in YYYY-MM-DD format.
- Do not hallucinate fighters or events; rely on the retrieved sources.`;
        try {
            const response = await this.openai.responses.create({
                model,
                input: [
                    {
                        role: 'system',
                        content: [
                            {
                                type: 'text',
                                text: 'You are a UFC data analyst with access to web search. Return only strict JSON without explanatory text.'
                            }
                        ]
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: prompt
                            }
                        ]
                    }
                ],
                tools: [{ type: 'web_search' }],
                temperature: 0,
                max_output_tokens: 1200
            });
            const rawOutput = response.output_text?.trim();
            if (!rawOutput) {
                console.warn('⚠️ OpenAI web search returned no output text');
                return [];
            }
            const parsed = this.safeParseJson(rawOutput);
            if (!parsed || typeof parsed !== 'object' || parsed === null) {
                console.warn('⚠️ OpenAI web search did not return a parsable object');
                return [];
            }
            const eventsCandidate = parsed.events;
            if (!Array.isArray(eventsCandidate)) {
                console.warn('⚠️ OpenAI web search did not return events array');
                return [];
            }
            const eventsData = eventsCandidate.filter((event) => {
                if (!event || typeof event !== 'object') {
                    return false;
                }
                const candidate = event;
                return typeof candidate.name === 'string' && typeof candidate.date === 'string' && typeof candidate.location === 'string';
            });
            return eventsData.map(event => ({
                name: event.name,
                date: event.date,
                location: event.location,
                venue: event.venue || 'TBD',
                status: event.status === 'completed' ? 'completed' : 'upcoming',
                fightCard: event.fightCard,
                mainFights: event.mainFights,
                source: event.source || 'OpenAI Web Search'
            }));
        }
        catch (error) {
            console.error('❌ OpenAI web search error:', error);
            return [];
        }
    }
    safeParseJson(raw) {
        const withoutCodeFence = raw.replace(/```json\s?/g, '').replace(/```/g, '').trim();
        try {
            return JSON.parse(withoutCodeFence);
        }
        catch (error) {
            const fallbackMatch = withoutCodeFence.match(/\{[\s\S]*\}/);
            if (fallbackMatch) {
                try {
                    return JSON.parse(fallbackMatch[0]);
                }
                catch (innerError) {
                    console.error('❌ Failed to parse JSON fallback from OpenAI response', innerError);
                }
            }
            console.error('❌ Failed to parse JSON from OpenAI response', error);
            return null;
        }
    }
    buildStructuredEvents(realEvents) {
        const fighterMap = new Map();
        const events = realEvents.map((event) => {
            const eventId = this.slugify(event.name);
            const fights = [];
            const addFight = (fightData, cardPosition, index) => {
                if (!fightData || !fightData.fighter1 || !fightData.fighter2) {
                    return;
                }
                const fighter1Id = this.ensureFighter(fighterMap, fightData.fighter1, fightData.weightClass);
                const fighter2Id = this.ensureFighter(fighterMap, fightData.fighter2, fightData.weightClass);
                fights.push({
                    id: `${eventId}-${fighter1Id}-vs-${fighter2Id}-${cardPosition}-${index}`,
                    fighter1Id,
                    fighter2Id,
                    fighter1Name: fightData.fighter1,
                    fighter2Name: fightData.fighter2,
                    weightClass: fightData.weightClass || 'Unknown',
                    cardPosition,
                    scheduledRounds: fightData.scheduledRounds || (fightData.titleFight || fightData.mainEvent ? 5 : 3),
                    status: 'scheduled',
                    titleFight: fightData.titleFight,
                    fightNumber: index + 1,
                    funFactor: 0,
                    finishProbability: 0
                });
            };
            event.fightCard?.mainCard?.forEach((fight, idx) => addFight(fight, 'main', idx));
            event.fightCard?.preliminaryCard?.forEach((fight, idx) => addFight(fight, 'preliminary', idx));
            event.fightCard?.earlyPreliminaryCard?.forEach((fight, idx) => addFight(fight, 'early-preliminary', idx));
            if (fights.length === 0 && event.mainFights?.length) {
                event.mainFights.forEach((matchup, idx) => {
                    const [fighter1, fighter2] = matchup.split(/\s+vs\.\s+|\s+vs\s+/i);
                    if (fighter1 && fighter2) {
                        addFight({ fighter1: fighter1.trim(), fighter2: fighter2.trim(), mainEvent: idx === 0 }, 'main', idx);
                    }
                });
            }
            const fightCard = fights;
            return {
                id: eventId,
                name: event.name,
                date: event.date,
                location: event.location,
                venue: event.venue,
                fightCard,
                mainCard: fightCard.filter(f => f.cardPosition === 'main'),
                prelimCard: fightCard.filter(f => f.cardPosition === 'preliminary'),
                earlyPrelimCard: fightCard.filter(f => f.cardPosition === 'early-preliminary')
            };
        });
        return {
            events,
            fighters: Array.from(fighterMap.values())
        };
    }
    ensureFighter(map, name, weightClass) {
        const id = this.slugify(name);
        if (!map.has(id)) {
            map.set(id, {
                id,
                name,
                nickname: undefined,
                record: '0-0-0',
                weightClass: weightClass || 'Unknown',
                age: 0,
                height: 'Unknown',
                reach: 'Unknown',
                wins: 0,
                losses: 0,
                draws: 0,
                nationality: 'Unknown',
                fightingStyle: 'unknown'
            });
        }
        return id;
    }
    slugify(value) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
    }
}
exports.HybridUFCService = HybridUFCService;
