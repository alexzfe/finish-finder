#!/usr/bin/env node

// Simple test script to verify VPN + Sherdog connectivity
const axios = require('axios');

async function testSherdogAccess() {
  console.log('Testing Sherdog access...');

  try {
    // Get external IP first
    const ipResponse = await axios.get('https://ipinfo.io/ip', { timeout: 10000 });
    console.log(`Current external IP: ${ipResponse.data}`);

    // Check if we're using Mullvad
    try {
      const mullvadCheck = await axios.get('https://am.i.mullvad.net/json', { timeout: 10000 });
      console.log(`Mullvad status:`, mullvadCheck.data);
    } catch (error) {
      console.log('Could not check Mullvad status');
    }

    // Test Sherdog access
    console.log('Attempting to access Sherdog...');
    const sherdogResponse = await axios.get('https://www.sherdog.com/events/UFC-311-Makhachev-vs-Moicano-100761', {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });

    if (sherdogResponse.status === 200) {
      console.log('✅ SUCCESS: Sherdog access successful!');
      console.log(`Response length: ${sherdogResponse.data.length} characters`);

      // Check if we got the actual content or a block page
      if (sherdogResponse.data.includes('UFC 311') || sherdogResponse.data.includes('Makhachev')) {
        console.log('✅ Content appears valid - found UFC 311 event data');
      } else if (sherdogResponse.data.includes('blocked') || sherdogResponse.data.includes('403')) {
        console.log('❌ Received blocked/403 content');
      } else {
        console.log('⚠️ Received content but unclear if valid');
      }
    }

  } catch (error) {
    if (error.response) {
      console.log(`❌ BLOCKED: Sherdog returned ${error.response.status} ${error.response.statusText}`);
      if (error.response.status === 403) {
        console.log('This confirms IP blocking is active');
      }
    } else if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
      console.log('❌ Connection reset/timeout - possible blocking');
    } else {
      console.log(`❌ Network error: ${error.message}`);
    }
  }
}

// Run the test
testSherdogAccess()
  .then(() => {
    console.log('Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });