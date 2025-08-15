#!/usr/bin/env node

const { Client } = require('pg');

async function seedMetrics() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'stablerisk',
    user: process.env.DB_USER || 'stablerisk_user',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true'
  });

  try {
    console.log('Connecting to database...');
    await client.connect();

    console.log('Seeding sample metrics data...');
    
    // Insert sample metrics
    const sampleMetrics = [
      {
        name: 'api.request.duration',
        value: 150.5,
        labels: { endpoint: '/health', method: 'GET', status: '200' }
      },
      {
        name: 'api.request.count',
        value: 1,
        labels: { endpoint: '/metrics', method: 'POST', status: '201' }
      },
      {
        name: 'database.query.duration',
        value: 25.3,
        labels: { table: 'metrics.metric_data', operation: 'SELECT' }
      },
      {
        name: 'system.memory.usage',
        value: 512.0,
        labels: { type: 'heap', unit: 'MB' }
      },
      {
        name: 'system.cpu.usage',
        value: 45.2,
        labels: { core: 'total', unit: 'percent' }
      }
    ];

    for (const metric of sampleMetrics) {
      await client.query(
        'INSERT INTO metrics.metric_data (name, value, labels) VALUES ($1, $2, $3)',
        [metric.name, metric.value, JSON.stringify(metric.labels)]
      );
    }

    console.log(`Seeded ${sampleMetrics.length} sample metrics successfully!`);

  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  seedMetrics();
}

module.exports = seedMetrics;