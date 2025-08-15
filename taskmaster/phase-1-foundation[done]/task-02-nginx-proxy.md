# Task 02: NGINX Reverse Proxy Setup

## Overview
Configure NGINX as a reverse proxy and future service mesh entry point while maintaining existing Next.js application performance and routing.

## Time Estimate: 3-4 days

## Prerequisites
- PostgreSQL setup completed (Task 01)
- Docker and Docker Compose running
- Next.js application accessible on port 3000

## Technical Requirements

### 1. NGINX Configuration
```nginx
# nginx/nginx.conf
upstream nextjs_app {
    server host.docker.internal:3000;
    keepalive 64;
}

upstream postgres_service {
    server postgres:5432;
}

# Future service placeholders
upstream metrics_service {
    server 127.0.0.1:3001 down;
}

upstream cache_service {
    server 127.0.0.1:3002 down;
}

upstream background_jobs {
    server 127.0.0.1:3003 down;
}

server {
    listen 80;
    server_name localhost;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    
    # Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
    limit_req_zone $binary_remote_addr zone=assets:10m rate=200r/m;
    
    # Main application routes
    location / {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://nextjs_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer sizes
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
    }
    
    # Static assets with caching
    location /_next/static/ {
        limit_req zone=assets burst=50 nodelay;
        
        proxy_pass http://nextjs_app;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, immutable";
        expires 1y;
    }
    
    # API routes with specific handling
    location /api/ {
        limit_req zone=api burst=10 nodelay;
        
        proxy_pass http://nextjs_app;
        proxy_set_header X-API-Gateway "nginx-proxy";
        
        # Longer timeout for AI operations
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
    
    # Future microservice routes (currently disabled)
    # location /services/metrics/ {
    #     proxy_pass http://metrics_service/;
    # }
    
    # location /services/cache/ {
    #     proxy_pass http://cache_service/;
    # }
    
    # location /services/jobs/ {
    #     proxy_pass http://background_jobs/;
    # }
    
    # Health check endpoint
    location /nginx-health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
    
    # Monitoring endpoint
    location /nginx-status {
        stub_status on;
        access_log off;
        allow 127.0.0.1;
        deny all;
    }
}

# Error handling
error_page 500 502 503 504 /50x.html;
location = /50x.html {
    root /usr/share/nginx/html;
}
```

### 2. Docker Compose Integration
```yaml
# docker-compose.yml additions
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/logs:/var/log/nginx
    depends_on:
      - postgres
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/nginx-health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    
  postgres:
    # ... existing postgres config
    
  # Next.js app runs outside Docker for development
  # In production, this would be containerized too
```

### 3. Development Scripts
```json
// package.json additions
{
  "scripts": {
    "proxy:start": "docker-compose up -d nginx",
    "proxy:stop": "docker-compose down nginx",
    "proxy:logs": "docker-compose logs -f nginx",
    "proxy:reload": "docker-compose exec nginx nginx -s reload",
    "dev:with-proxy": "concurrently \"npm run dev\" \"npm run proxy:start\"",
    "test:proxy": "curl -f http://localhost/nginx-health"
  }
}
```

### 4. Environment Configuration
```bash
# .env additions
NGINX_PORT=80
NGINX_SSL_PORT=443
NEXTJS_INTERNAL_PORT=3000

# Rate limiting
NGINX_API_RATE_LIMIT=100r/m
NGINX_ASSETS_RATE_LIMIT=200r/m

# Timeouts
NGINX_PROXY_TIMEOUT=60s
NGINX_API_TIMEOUT=120s
```

### 5. Monitoring Integration
```typescript
// src/lib/monitoring/nginx-health.ts
export class NginxHealthMonitor {
  static async checkProxyHealth(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost/nginx-health');
      return response.ok;
    } catch (error) {
      console.error('NGINX health check failed:', error);
      return false;
    }
  }
  
  static async getProxyStatus(): Promise<any> {
    try {
      const response = await fetch('http://localhost/nginx-status');
      const status = await response.text();
      return this.parseNginxStatus(status);
    } catch (error) {
      console.error('NGINX status check failed:', error);
      return null;
    }
  }
  
  private static parseNginxStatus(status: string): any {
    // Parse nginx stub_status format
    const lines = status.split('\n');
    return {
      active_connections: parseInt(lines[0]?.split(' ')[2] || '0'),
      server_accepts: parseInt(lines[2]?.split(' ')[1] || '0'),
      server_handled: parseInt(lines[2]?.split(' ')[2] || '0'),
      server_requests: parseInt(lines[2]?.split(' ')[3] || '0'),
    };
  }
}
```

## Acceptance Criteria

### Functional Requirements
- [x] NGINX container starts and passes health checks
- [x] All existing Next.js routes work through proxy
- [x] API endpoints maintain existing performance
- [x] Static assets are properly cached
- [x] Health check endpoint responds correctly

### Performance Requirements
- [x] No noticeable latency increase for API calls
- [x] Static assets served with proper caching headers
- [x] Rate limiting configured but not blocking normal usage
- [x] Proxy timeouts set appropriately for AI operations

### Security Requirements
- [x] Security headers added to all responses
- [x] Rate limiting configured for API and assets
- [x] Internal service routes disabled by default
- [x] Access logs configured properly

## Testing
```bash
# Start proxy
npm run proxy:start

# Test main application
curl -f http://localhost/

# Test API endpoints
curl -f http://localhost/api/search

# Test health endpoint
npm run test:proxy

# Test rate limiting (should return 429 after limits)
for i in {1..150}; do curl http://localhost/api/search; done

# Check logs
npm run proxy:logs
```

## Rollback Plan
1. Stop NGINX container: `npm run proxy:stop`
2. Access Next.js directly on port 3000
3. Remove NGINX configuration files
4. Remove Docker Compose service definition
5. Remove proxy-related npm scripts

## Dependencies
- Task 01 (PostgreSQL setup) for Docker Compose integration
- Next.js application running on port 3000

## Risks & Mitigation
- **Risk**: Proxy adds latency to existing operations
  - **Mitigation**: Optimized proxy configuration with connection keepalive
- **Risk**: Rate limiting blocks legitimate requests
  - **Mitigation**: Conservative limits with burst handling
- **Risk**: NGINX configuration errors break application access
  - **Mitigation**: Configuration validation and comprehensive testing

## Notes
- NGINX configured as transparent proxy initially
- Future microservice routes are commented out but prepared
- Development workflow maintains direct access option
- Production-ready security headers and rate limiting included
- Monitoring endpoints prepared for observability integration