const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api';

async function testJourneyFlow() {
  console.log('\n=== TESTING AT&T JOURNEY FLOW ===\n');
  
  try {
    // Step 1: Get leaf component
    console.log('Step 1: Getting leaf component for AT&T Journey...');
    const leafResp = await axios.get(`${BASE_URL}/custom-factories/leaf-component`, {
      params: { neighborhoodName: 'AT&T Journey' }
    });
    console.log('Leaf component response:', leafResp.data);
    
    const leafComponent = leafResp.data.leafComponent || 'Application';
    console.log(`Using leaf component: ${leafComponent}\n`);
    
    // Step 2: Get hierarchies
    console.log(`Step 2: Getting hierarchies for componentName=${leafComponent}...`);
    const hierResp = await axios.get(`${BASE_URL}/custom-factories/hierarchies/tree`, {
      params: { 
        neighborhoodName: 'AT&T Journey',
        componentName: leafComponent 
      }
    });
    console.log(`Hierarchies response: ${hierResp.data.totalPaths} paths`);
    if (hierResp.data.paths && hierResp.data.paths.length > 0) {
      console.log(`First hierarchy: ${hierResp.data.paths[0].pathStr}`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Response:', err.response.data);
    }
  }
}

async function testLBGUPSFlow() {
  console.log('\n=== TESTING LBGUPS FLOW ===\n');
  
  try {
    // Step 1: Get leaf component
    console.log('Step 1: Getting leaf component for LBGUPS...');
    const leafResp = await axios.get(`${BASE_URL}/custom-factories/leaf-component`, {
      params: { neighborhoodName: 'LBGUPS' }
    });
    console.log('Leaf component response:', leafResp.data);
    
    const leafComponent = leafResp.data.leafComponent || 'Application';
    console.log(`Using leaf component: ${leafComponent}\n`);
    
    // Step 2: Get hierarchies
    console.log(`Step 2: Getting hierarchies for componentName=${leafComponent}...`);
    const hierResp = await axios.get(`${BASE_URL}/custom-factories/hierarchies/tree`, {
      params: { 
        neighborhoodName: 'LBGUPS',
        componentName: leafComponent 
      }
    });
    console.log(`Hierarchies response: ${hierResp.data.totalPaths} paths`);
    if (hierResp.data.paths && hierResp.data.paths.length > 0) {
      console.log(`First hierarchy: ${hierResp.data.paths[0].pathStr}`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Response:', err.response.data);
    }
  }
}

async function run() {
  await testJourneyFlow();
  await testLBGUPSFlow();
}

run().catch(console.error);
