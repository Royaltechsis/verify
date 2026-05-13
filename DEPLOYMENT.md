# TaskVerify Backend - Deployment Guide

## Production Deployment

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 12+
- Docker & Docker Compose (optional)
- Nginx or similar reverse proxy

### Deployment Steps

#### 1. Build Application
```bash
npm install
npm run build
npm run type-check
```

#### 2. Configure Environment
Create `.env` with production credentials:
```bash
DATABASE_URL=postgresql://prod_user:prod_pass@prod_host/taskverify_db
NODE_ENV=production
PORT=3001
SQUAD_API_KEY=prod_squad_key
SQUAD_WEBHOOK_SECRET=prod_webhook_secret
ANTHROPIC_API_KEY=prod_anthropic_key
```

#### 3. Initialize Database
```bash
npm run migrate
```

#### 4. Start Application
```bash
npm start
```

Or with PM2:
```bash
pm2 start dist/server.js --name taskverify-backend
pm2 save
pm2 startup
```

### Docker Deployment

#### Build Image
```bash
docker build -t taskverify-backend:latest .
docker tag taskverify-backend:latest your-registry/taskverify-backend:latest
docker push your-registry/taskverify-backend:latest
```

#### Docker Compose (All Services)
```bash
docker-compose up -d
```

Monitor:
```bash
docker-compose logs -f backend
docker-compose ps
```

### Nginx Configuration

```nginx
upstream taskverify_backend {
    server localhost:3001;
    keepalive 64;
}

server {
    listen 80;
    server_name api.taskverify.app;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.taskverify.app;

    ssl_certificate /etc/letsencrypt/live/api.taskverify.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.taskverify.app/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # CORS headers
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
    limit_req zone=api_limit burst=10 nodelay;

    location / {
        proxy_pass http://taskverify_backend;
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
    }

    # Webhook endpoint (no rate limit)
    location /api/v1/webhooks {
        proxy_pass http://taskverify_backend;
        limit_req off;
    }
}
```

### Health Check & Monitoring

```bash
# Check API health
curl https://api.taskverify.app/health

# Monitor with curl
watch -n 5 'curl -s https://api.taskverify.app/health | jq .'

# Monitor with PM2
pm2 monit

# Check logs
pm2 logs taskverify-backend
tail -f logs/taskverify-backend.log
```

### Database Backups

#### PostgreSQL Backup
```bash
pg_dump taskverify_db > taskverify_db_backup_$(date +%Y%m%d_%H%M%S).sql
```

#### Automated Backups
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups"
DB_NAME="taskverify_db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

pg_dump $DB_NAME | gzip > $BACKUP_DIR/taskverify_db_$DATE.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/taskverify_db_$DATE.sql.gz"
```

Add to crontab:
```
0 2 * * * /path/to/backup.sh
```

### Performance Optimization

#### Database Connection Pool
Already configured in `src/db/pool.ts`:
- Max connections: 20
- Idle timeout: 30 seconds
- Connection timeout: 2 seconds

Adjust in production:
```typescript
max: 50,           // For high traffic
idleTimeoutMillis: 60000,  // 60 seconds
connectionTimeoutMillis: 5000,  // 5 seconds
```

#### Caching Strategy (Future)
```typescript
import redis from 'redis';
const redisClient = redis.createClient();

// Cache worker matches for 5 minutes
app.get('/api/v1/tasks/:id/matches', async (req, res) => {
  const cached = await redisClient.get(`task_matches:${req.params.id}`);
  if (cached) return res.json(JSON.parse(cached));
  
  const matches = await getWorkerMatches(...);
  await redisClient.setex(`task_matches:${req.params.id}`, 300, JSON.stringify(matches));
  res.json(matches);
});
```

### Security Checklist

- [x] Environment variables not in code
- [ ] HTTPS/SSL configured
- [ ] API rate limiting enabled
- [ ] CORS properly configured
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (using parameterized queries)
- [ ] Secret rotation procedure
- [ ] Database backup automation
- [ ] Error logging without sensitive data
- [ ] API authentication (JWT/OAuth to be implemented)
- [ ] Webhook signature verification
- [ ] DDoS protection (Cloudflare/WAF)

### Monitoring & Alerts

#### Application Monitoring
```bash
# PM2 Plus
pm2 install pm2-auto-pull
pm2 install pm2-logrotate

# Application Insights (Azure)
npm install applicationinsights
```

#### Database Monitoring
```sql
-- Slow queries
SELECT * FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC;

-- Connection count
SELECT count(*) FROM pg_stat_activity;

-- Table sizes
SELECT 
  schemaname, tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### Alert Rules
1. **High API Error Rate**: > 5% errors in 5 minutes
2. **High Response Time**: > 500ms p95
3. **Database Warnings**: Connection count > 40
4. **Disk Space**: < 10% free
5. **Memory Usage**: > 80%

### Troubleshooting

#### High Memory Usage
```bash
# Check process memory
ps aux | grep node

# Heap dump
node --inspect dist/server.js
# Visit chrome://inspect
```

#### Database Slow Queries
```bash
# Enable logging
ALTER DATABASE taskverify_db SET log_min_duration_statement = 100;

# Check slow queries
SELECT query, calls, mean_time FROM pg_stat_statements 
ORDER BY mean_time DESC LIMIT 10;
```

#### Webhook Failures
Check `squad_webhook_logs` table:
```sql
SELECT event_type, status, created_at 
FROM squad_webhook_logs 
WHERE status != 'processed' 
ORDER BY created_at DESC;
```

### Rollback Procedure

1. **Keep Previous Version**
   ```bash
   cp -r dist dist.backup
   cp -r node_modules node_modules.backup
   ```

2. **Revert on Error**
   ```bash
   rm -rf dist node_modules
   cp -r dist.backup dist
   cp -r node_modules.backup node_modules
   npm start
   ```

3. **Database Migration Rollback**
   ```bash
   psql taskverify_db < migration_backup.sql
   ```

## Performance Targets

- API Response Time: < 200ms (p95)
- Database Query: < 100ms
- Task Creation: < 500ms (including AI matching)
- Worker Listing: < 300ms
- Uptime: > 99.5%

## Cost Optimization

1. **Database**: Use managed PostgreSQL (AWS RDS, Azure Database)
2. **Caching**: Implement Redis for frequently accessed data
3. **CDN**: Use CloudFront for static assets
4. **Monitoring**: Use AWS CloudWatch or similar
5. **Scaling**: Configure auto-scaling groups

## Support & Resources

- Deployment Logs: `journalctl -u taskverify-backend -f`
- PM2 Documentation: https://pm2.keymetrics.io
- Docker Hub: https://hub.docker.com
- Nginx Guide: https://nginx.org/en/docs
