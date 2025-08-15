#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating PostgreSQL setup...\n');

// Check required files
const requiredFiles = [
  'docker-compose.yml',
  'sql/init/01_events_schema.sql',
  'src/lib/db/connection.ts',
  'src/lib/db/index.ts',
  'src/lib/db/utils.ts',
  'src/app/api/health/db/route.ts',
  'scripts/test-db-connection.js',
  'scripts/migrate.js',
  'scripts/verify-schema.js'
];

let allFilesPresent = true;

console.log('📋 Checking required files:');
for (const file of requiredFiles) {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    allFilesPresent = false;
  }
}

// Check package.json scripts
console.log('\n📋 Checking package.json scripts:');
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const requiredScripts = [
  'test:db-connection',
  'db:migrate', 
  'db:verify-schema'
];

let allScriptsPresent = true;
for (const script of requiredScripts) {
  if (packageJson.scripts[script]) {
    console.log(`  ✅ ${script}: ${packageJson.scripts[script]}`);
  } else {
    console.log(`  ❌ ${script} - MISSING`);
    allScriptsPresent = false;
  }
}

// Check dependencies
console.log('\n📋 Checking dependencies:');
const requiredDeps = ['pg', '@types/pg'];
let allDepsPresent = true;

for (const dep of requiredDeps) {
  if (packageJson.dependencies[dep] || packageJson.devDependencies?.[dep]) {
    const version = packageJson.dependencies[dep] || packageJson.devDependencies[dep];
    console.log(`  ✅ ${dep}: ${version}`);
  } else {
    console.log(`  ❌ ${dep} - MISSING`);
    allDepsPresent = false;
  }
}

// Check environment configuration
console.log('\n📋 Checking environment configuration:');
const envExamplePath = path.join(__dirname, '..', '.env.example');
const envContent = fs.readFileSync(envExamplePath, 'utf8');

const requiredEnvVars = [
  'DB_HOST',
  'DB_PORT', 
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DATABASE_URL',
  'DB_POOL_MIN',
  'DB_POOL_MAX'
];

let allEnvVarsPresent = true;
for (const envVar of requiredEnvVars) {
  if (envContent.includes(`${envVar}=`)) {
    console.log(`  ✅ ${envVar}`);
  } else {
    console.log(`  ❌ ${envVar} - MISSING from .env.example`);
    allEnvVarsPresent = false;
  }
}

// Summary
console.log('\n📊 SETUP VALIDATION SUMMARY:');
console.log(`📁 Files: ${allFilesPresent ? '✅ All present' : '❌ Some missing'}`);
console.log(`📜 Scripts: ${allScriptsPresent ? '✅ All present' : '❌ Some missing'}`);
console.log(`📦 Dependencies: ${allDepsPresent ? '✅ All present' : '❌ Some missing'}`);
console.log(`🔧 Environment: ${allEnvVarsPresent ? '✅ All configured' : '❌ Some missing'}`);

const overallSuccess = allFilesPresent && allScriptsPresent && allDepsPresent && allEnvVarsPresent;

if (overallSuccess) {
  console.log('\n🎉 PostgreSQL setup validation PASSED!');
  console.log('\n📋 Next steps:');
  console.log('1. Start Docker daemon');
  console.log('2. Run: docker-compose up -d postgres');
  console.log('3. Run: npm run test:db-connection');
  console.log('4. Run: npm run db:verify-schema');
  console.log('5. Test health endpoint: curl http://localhost:3000/api/health/db');
} else {
  console.log('\n❌ PostgreSQL setup validation FAILED!');
  console.log('Please resolve the missing components above.');
  process.exit(1);
}

process.exit(0);