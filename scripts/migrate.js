#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigrations() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'stablerisk',
    user: process.env.DB_USER || 'stablerisk_user',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
  });

  try {
    console.log('🔄 Starting database migration...');
    await client.connect();

    const sqlDir = path.join(__dirname, '..', 'sql', 'init');
    
    if (!fs.existsSync(sqlDir)) {
      throw new Error(`Migration directory not found: ${sqlDir}`);
    }

    const sqlFiles = fs.readdirSync(sqlDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`📂 Found ${sqlFiles.length} migration files`);

    for (const file of sqlFiles) {
      const filePath = path.join(sqlDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      
      console.log(`⚡ Executing migration: ${file}`);
      
      try {
        await client.query(sqlContent);
        console.log(`✅ Successfully executed: ${file}`);
      } catch (error) {
        console.error(`❌ Failed to execute ${file}:`, error.message);
        throw error;
      }
    }

    console.log('🎉 All migrations completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔚 Database connection closed');
  }
}

runMigrations();