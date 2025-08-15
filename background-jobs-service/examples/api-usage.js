/**
 * Background Jobs Service API Usage Examples
 * 
 * This file demonstrates how to interact with the Background Jobs Service API
 * using Node.js and the fetch API.
 */

const API_BASE_URL = 'http://localhost:3001';
const API_KEY = 'test-api-key-123';
const ADMIN_API_KEY = 'admin-test-key-456';

// Utility function to make API requests
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`API Error ${response.status}: ${error.message || response.statusText}`);
  }

  return response.json();
}

// Example 1: Check Service Health
async function checkHealth() {
  console.log('🔍 Checking service health...');
  
  try {
    const health = await apiRequest('/health');
    console.log('✅ Service Health:', health);
    
    // Detailed health check
    const detailedHealth = await apiRequest('/health/detailed');
    console.log('📊 Detailed Health:', detailedHealth);
    
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }
}

// Example 2: Submit a Single Job
async function submitSingleJob() {
  console.log('📤 Submitting single job...');
  
  try {
    const jobRequest = {
      type: 'collect-stablecoin-data',
      data: {
        ticker: 'USDC',
        sources: ['coingecko', 'coinmarketcap'],
        urgent: false
      },
      options: {
        priority: 'high',
        attempts: 3,
        delay: 0,
        timeout: 180000
      }
    };

    const result = await apiRequest('/jobs/submit', {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(jobRequest)
    });

    console.log('✅ Job submitted:', result);
    return result.jobId;
    
  } catch (error) {
    console.error('❌ Job submission failed:', error.message);
  }
}

// Example 3: Submit Bulk Jobs
async function submitBulkJobs() {
  console.log('📦 Submitting bulk jobs...');
  
  try {
    const bulkRequest = {
      jobs: [
        {
          type: 'collect-stablecoin-data',
          data: { ticker: 'USDC' }
        },
        {
          type: 'collect-stablecoin-data',
          data: { ticker: 'USDT' }
        },
        {
          type: 'analyze-transparency',
          data: { 
            ticker: 'USDC',
            url: 'https://www.centre.io/usdc-transparency'
          }
        }
      ]
    };

    const result = await apiRequest('/jobs/bulk', {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(bulkRequest)
    });

    console.log('✅ Bulk jobs submitted:', result);
    return result.jobIds;
    
  } catch (error) {
    console.error('❌ Bulk job submission failed:', error.message);
  }
}

// Example 4: Check Job Status
async function checkJobStatus(jobId) {
  console.log(`🔍 Checking status for job ${jobId}...`);
  
  try {
    const job = await apiRequest(`/jobs/${jobId}`, {
      headers: {
        'X-API-Key': API_KEY
      }
    });

    console.log('📊 Job status:', job);
    return job;
    
  } catch (error) {
    console.error('❌ Failed to get job status:', error.message);
  }
}

// Example 5: List Jobs with Filtering
async function listJobs() {
  console.log('📋 Listing jobs...');
  
  try {
    // List completed jobs
    const completed = await apiRequest('/jobs?status=completed&limit=10', {
      headers: {
        'X-API-Key': API_KEY
      }
    });

    console.log('✅ Completed jobs:', completed);

    // List failed jobs
    const failed = await apiRequest('/jobs?status=failed&limit=5', {
      headers: {
        'X-API-Key': API_KEY
      }
    });

    console.log('❌ Failed jobs:', failed);
    
  } catch (error) {
    console.error('❌ Failed to list jobs:', error.message);
  }
}

// Example 6: Get Queue Statistics
async function getQueueStats() {
  console.log('📈 Getting queue statistics...');
  
  try {
    const stats = await apiRequest('/jobs/stats/queue', {
      headers: {
        'X-API-Key': API_KEY
      }
    });

    console.log('📊 Queue Statistics:', stats);
    
  } catch (error) {
    console.error('❌ Failed to get queue stats:', error.message);
  }
}

// Example 7: Admin Operations - Get Worker Status
async function getWorkerStatus() {
  console.log('👥 Getting worker status...');
  
  try {
    const workers = await apiRequest('/admin/workers', {
      headers: {
        'X-Admin-API-Key': ADMIN_API_KEY
      }
    });

    console.log('👷 Worker Status:', workers);
    
  } catch (error) {
    console.error('❌ Failed to get worker status:', error.message);
  }
}

// Example 8: Admin Operations - Scale Workers
async function scaleWorkers(targetCount) {
  console.log(`⚖️ Scaling workers to ${targetCount}...`);
  
  try {
    const result = await apiRequest('/admin/workers/scale', {
      method: 'POST',
      headers: {
        'X-Admin-API-Key': ADMIN_API_KEY
      },
      body: JSON.stringify({
        targetWorkers: targetCount,
        reason: 'API example scaling'
      })
    });

    console.log('✅ Workers scaled:', result);
    
  } catch (error) {
    console.error('❌ Failed to scale workers:', error.message);
  }
}

// Example 9: Wait for Job Completion
async function waitForJobCompletion(jobId, maxWaitTime = 60000) {
  console.log(`⏳ Waiting for job ${jobId} to complete...`);
  
  const startTime = Date.now();
  const checkInterval = 2000; // Check every 2 seconds
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const job = await checkJobStatus(jobId);
      
      if (job && ['completed', 'failed', 'cancelled'].includes(job.status)) {
        console.log(`🏁 Job ${jobId} finished with status: ${job.status}`);
        if (job.status === 'completed') {
          console.log('📊 Result:', job.result);
        } else if (job.status === 'failed') {
          console.log('❌ Error:', job.error);
        }
        return job;
      }
      
      console.log(`⏳ Job ${jobId} is still ${job?.status || 'unknown'}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
    } catch (error) {
      console.error('❌ Error while waiting for job:', error.message);
      break;
    }
  }
  
  console.log(`⏰ Timeout: Job ${jobId} did not complete within ${maxWaitTime}ms`);
  return null;
}

// Example 10: Complete Workflow
async function completeWorkflow() {
  console.log('🚀 Starting complete workflow example...\n');
  
  // 1. Check health
  await checkHealth();
  console.log('\n');
  
  // 2. Get initial queue stats
  await getQueueStats();
  console.log('\n');
  
  // 3. Submit a job and wait for completion
  const jobId = await submitSingleJob();
  if (jobId) {
    console.log('\n');
    await waitForJobCompletion(jobId);
  }
  console.log('\n');
  
  // 4. Submit bulk jobs
  const jobIds = await submitBulkJobs();
  console.log('\n');
  
  // 5. List all jobs
  await listJobs();
  console.log('\n');
  
  // 6. Check worker status
  await getWorkerStatus();
  console.log('\n');
  
  // 7. Get final queue stats
  await getQueueStats();
  
  console.log('✅ Workflow completed!');
}

// Run examples based on command line argument
async function main() {
  const example = process.argv[2] || 'complete';
  
  try {
    switch (example) {
      case 'health':
        await checkHealth();
        break;
      case 'submit':
        await submitSingleJob();
        break;
      case 'bulk':
        await submitBulkJobs();
        break;
      case 'list':
        await listJobs();
        break;
      case 'stats':
        await getQueueStats();
        break;
      case 'workers':
        await getWorkerStatus();
        break;
      case 'scale':
        await scaleWorkers(parseInt(process.argv[3]) || 3);
        break;
      case 'complete':
      default:
        await completeWorkflow();
        break;
    }
  } catch (error) {
    console.error('💥 Example failed:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  console.log('Background Jobs Service API Examples\n');
  console.log('Usage: node examples/api-usage.js [example]');
  console.log('Examples: health, submit, bulk, list, stats, workers, scale, complete\n');
  
  main();
}

module.exports = {
  checkHealth,
  submitSingleJob,
  submitBulkJobs,
  checkJobStatus,
  listJobs,
  getQueueStats,
  getWorkerStatus,
  scaleWorkers,
  waitForJobCompletion,
  completeWorkflow
};