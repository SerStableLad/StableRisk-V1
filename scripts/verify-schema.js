#!/usr/bin/env node

const { Client } = require('pg');
require('dotenv').config();

async function verifySchema() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'stablerisk',
    user: process.env.DB_USER || 'stablerisk_user',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
  });

  try {
    console.log('🔍 Verifying database schema...');
    await client.connect();

    // Check schemas
    console.log('\n📋 Checking schemas...');
    const schemasResult = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name IN ('events', 'analytics', 'cache_metadata')
      ORDER BY schema_name
    `);
    
    const expectedSchemas = ['analytics', 'cache_metadata', 'events'];
    const actualSchemas = schemasResult.rows.map(row => row.schema_name);
    
    for (const schema of expectedSchemas) {
      if (actualSchemas.includes(schema)) {
        console.log(`  ✅ Schema '${schema}' exists`);
      } else {
        console.log(`  ❌ Schema '${schema}' missing`);
      }
    }

    // Check tables
    console.log('\n📋 Checking tables...');
    const tablesResult = await client.query(`
      SELECT schemaname, tablename 
      FROM pg_tables 
      WHERE schemaname IN ('events', 'analytics', 'cache_metadata')
      ORDER BY schemaname, tablename
    `);

    const expectedTables = [
      { schema: 'events', table: 'event_log' },
      { schema: 'analytics', table: 'stablecoin_metrics' },
      { schema: 'cache_metadata', table: 'invalidation_log' }
    ];

    for (const expected of expectedTables) {
      const exists = tablesResult.rows.some(
        row => row.schemaname === expected.schema && row.tablename === expected.table
      );
      
      if (exists) {
        console.log(`  ✅ Table '${expected.schema}.${expected.table}' exists`);
      } else {
        console.log(`  ❌ Table '${expected.schema}.${expected.table}' missing`);
      }
    }

    // Check indexes
    console.log('\n📋 Checking indexes...');
    const indexesResult = await client.query(`
      SELECT 
        schemaname,
        tablename,
        indexname
      FROM pg_indexes 
      WHERE schemaname IN ('events', 'analytics', 'cache_metadata')
      AND indexname NOT LIKE '%_pkey'
      ORDER BY schemaname, tablename, indexname
    `);

    console.log(`  📊 Found ${indexesResult.rows.length} custom indexes:`);
    for (const index of indexesResult.rows) {
      console.log(`    ✅ ${index.schemaname}.${index.tablename}.${index.indexname}`);
    }

    // Test basic operations
    console.log('\n🧪 Testing basic operations...');
    
    // Test event log insert
    await client.query(`
      INSERT INTO events.event_log (aggregate_id, aggregate_type, event_type, event_data, version)
      VALUES ('test-001', 'test', 'verification_test', '{"test": true}', 1)
    `);
    console.log('  ✅ Event log insert test passed');

    // Test analytics insert
    await client.query(`
      INSERT INTO analytics.stablecoin_metrics (ticker, last_updated, risk_score, metadata)
      VALUES ('TEST', NOW(), 85.5, '{"test": true}')
      ON CONFLICT (ticker) DO UPDATE SET last_updated = EXCLUDED.last_updated
    `);
    console.log('  ✅ Analytics metrics insert test passed');

    // Test cache invalidation insert
    await client.query(`
      INSERT INTO cache_metadata.invalidation_log (cache_key, reason, related_ticker)
      VALUES ('test-cache-key', 'verification test', 'TEST')
    `);
    console.log('  ✅ Cache invalidation insert test passed');

    // Clean up test data
    await client.query("DELETE FROM events.event_log WHERE aggregate_id = 'test-001'");
    await client.query("DELETE FROM analytics.stablecoin_metrics WHERE ticker = 'TEST'");
    await client.query("DELETE FROM cache_metadata.invalidation_log WHERE reason = 'verification test'");
    console.log('  🧹 Test data cleaned up');

    console.log('\n🎉 Schema verification completed successfully!');
    
  } catch (error) {
    console.error('❌ Schema verification failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔚 Database connection closed');
  }
}

verifySchema();