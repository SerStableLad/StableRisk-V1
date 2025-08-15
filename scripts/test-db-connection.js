#!/usr/bin/env node

const { Client } = require('pg');
require('dotenv').config();

async function testConnection() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'stablerisk',
    user: process.env.DB_USER || 'stablerisk_user',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    connectionTimeoutMillis: parseInt(process.env.DB_QUERY_TIMEOUT || '10000'),
  });

  try {
    console.log('🔄 Testing PostgreSQL connection...');
    await client.connect();
    
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Database connection successful!');
    console.log(`📅 Current time: ${result.rows[0].current_time}`);
    console.log(`🐘 PostgreSQL version: ${result.rows[0].pg_version.split(' ')[0]}`);
    
    // Test connection pool info
    const poolInfo = await client.query(`
      SELECT 
        count(*) as active_connections,
        current_database() as database_name
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `);
    
    console.log(`🔗 Active connections: ${poolInfo.rows[0].active_connections}`);
    console.log(`📊 Connected to database: ${poolInfo.rows[0].database_name}`);
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔚 Connection closed');
  }
}

testConnection();