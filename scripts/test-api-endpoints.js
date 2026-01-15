#!/usr/bin/env node

/**
 * Direct API endpoint testing script
 * Tests the specific API endpoints with better error reporting
 */

// Test Devin API v3
async function testDevinAPI() {
  console.log('🧪 Testing Devin API v3...');
  
  const apiKey = process.env.DEVIN_API_KEY;
  if (!apiKey) {
    console.log('❌ DEVIN_API_KEY not set');
    return;
  }
  
  console.log(`✅ API Key: ${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`);
  
  const orgId = process.env.DEVIN_ORG_ID;
  if (!orgId) {
    console.log('❌ DEVIN_ORG_ID not set (required for v3)');
    return;
  }
  console.log(`✅ Org ID: ${orgId}`);
  
  try {
    const response = await fetch(`https://api.devin.ai/v3beta1/organizations/${orgId}/sessions`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Hachiko/1.0',
      }
    });
    
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log(`📋 Headers:`, Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log(`📄 Response: ${text}`);
    
    if (response.ok) {
      console.log('✅ Devin API: Connected!');
    } else {
      console.log('❌ Devin API: Authentication failed');
    }
    
  } catch (error) {
    console.log(`💥 Devin API Error: ${error.message}`);
  }
}

// Test Cursor API
async function testCursorAPI() {
  console.log('\n🧪 Testing Cursor API...');
  
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.log('❌ CURSOR_API_KEY not set');
    return;
  }
  
  console.log(`✅ API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
  
  try {
    const response = await fetch('https://api.cursor.com/v0/agents', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Hachiko/1.0',
      }
    });
    
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log(`📋 Headers:`, Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log(`📄 Response: ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`);
    
    if (response.ok) {
      console.log('✅ Cursor API: Connected!');
    } else {
      console.log('❌ Cursor API: Authentication failed');
    }
    
  } catch (error) {
    console.log(`💥 Cursor API Error: ${error.message}`);
  }
}

// Test OpenAI API  
async function testOpenAIAPI() {
  console.log('\n🧪 Testing OpenAI API...');
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('❌ OPENAI_API_KEY not set');
    return;
  }
  
  console.log(`✅ API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
  
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Hachiko/1.0',
      }
    });
    
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log(`📋 Headers:`, Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log(`📄 Response: ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`);
    
    if (response.ok) {
      console.log('✅ OpenAI API: Connected!');
    } else {
      console.log('❌ OpenAI API: Authentication failed');
    }
    
  } catch (error) {
    console.log(`💥 OpenAI API Error: ${error.message}`);
  }
}

async function main() {
  console.log('🔍 Direct API Endpoint Testing');
  console.log('===============================');
  
  await testDevinAPI();
  
  // Only test other APIs if keys are present
  if (process.env.CURSOR_API_KEY) {
    await testCursorAPI();  
  } else {
    console.log('\n⏭️ Skipping Cursor API (no key provided)');
  }
  
  if (process.env.OPENAI_API_KEY) {
    await testOpenAIAPI();
  } else {
    console.log('\n⏭️ Skipping OpenAI API (no key provided)');
  }
  
  console.log('\n✨ Testing complete! Check the detailed responses above.');
}

main().catch(console.error);