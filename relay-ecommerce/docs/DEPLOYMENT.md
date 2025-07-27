# Relay E-commerce Deployment Guide

This guide covers deploying the Relay-based e-commerce platform to production using Vercel.

## Prerequisites

- Node.js 18+ installed locally
- Vercel CLI installed (`npm i -g vercel`)
- PostgreSQL database for event catalog
- Redis instance for event bus
- Accounts for external services (Stripe, SendGrid, etc.)

## Environment Setup

### 1. Database Setup

First, create the event catalog database:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE event_catalog;

# Run migrations
psql -U postgres -d event_catalog -f migrations/001_event_catalog.sql
psql -U postgres -d event_catalog -f migrations/002_initial_events.sql
```

### 2. Redis Setup

For production, use a managed Redis service like:
- Redis Cloud
- AWS ElastiCache
- Vercel KV Storage

### 3. Environment Variables

Create environment variables in Vercel:

```bash
# Database
vercel env add POSTGRES_HOST production
vercel env add POSTGRES_PORT production
vercel env add POSTGRES_USER production
vercel env add POSTGRES_PASSWORD production
vercel env add POSTGRES_DATABASE production

# Redis
vercel env add REDIS_HOST production
vercel env add REDIS_PORT production
vercel env add REDIS_PASSWORD production

# External Services
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add SENDGRID_API_KEY production
vercel env add TWILIO_ACCOUNT_SID production
vercel env add TWILIO_AUTH_TOKEN production
vercel env add TWILIO_FROM_NUMBER production
vercel env add MIXPANEL_TOKEN production
vercel env add DATADOG_API_KEY production

# Application
vercel env add NODE_ENV production
vercel env add ENVIRONMENT production
```

## Deployment Process

### 1. Initial Deployment

```bash
# Install dependencies
npm install

# Run type checking
npm run typecheck

# Run tests
npm test

# Deploy to Vercel
vercel --prod
```

### 2. Verify Deployment

After deployment, verify the system:

```bash
# Check event catalog
curl https://your-app.vercel.app/api/catalog/events

# Test cart functionality
curl -X POST https://your-app.vercel.app/api/actors/cart \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "ADD_TO_CART",
    "payload": {
      "userId": "test-user",
      "productId": "test-product",
      "quantity": 1,
      "price": 29.99,
      "name": "Test Product"
    }
  }'

# Check metrics
curl https://your-app.vercel.app/api/monitoring/metrics
```

### 3. Configure Monitoring

Set up Datadog monitoring:

1. Install Datadog agent on Vercel (via integration)
2. Configure dashboards using the provided configurations
3. Set up alerts based on SLOs

### 4. Set Up CI/CD

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run typecheck
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

## Rollout Strategy

### Blue-Green Deployment

1. Deploy to staging environment first:
   ```bash
   vercel --target staging
   ```

2. Run smoke tests against staging
3. Switch production traffic to new version
4. Keep old version ready for rollback

### Canary Deployment

Use Vercel's Edge Config for gradual rollout:

```javascript
// middleware.ts
export async function middleware(request: Request) {
  const canaryPercentage = await getEdgeConfig('canary_percentage') || 0;
  const isCanary = Math.random() * 100 < canaryPercentage;
  
  if (isCanary) {
    request.headers.set('x-deployment-version', 'canary');
  }
}
```

## Production Checklist

### Pre-deployment
- [ ] All tests passing
- [ ] Type checking passes
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] External services configured

### Deployment
- [ ] Deploy to staging first
- [ ] Run smoke tests
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify external integrations

### Post-deployment
- [ ] Monitor dashboards for 24 hours
- [ ] Review error logs
- [ ] Check business metrics
- [ ] Update documentation
- [ ] Notify stakeholders

## Rollback Procedures

If issues are detected after deployment:

1. **Immediate Rollback** (< 5 minutes)
   ```bash
   vercel rollback
   ```

2. **Revert via Git** (> 5 minutes)
   ```bash
   git revert HEAD
   git push origin main
   # This triggers automatic deployment of previous version
   ```

3. **Database Rollback**
   - Keep migration rollback scripts
   - Test rollback procedures regularly
   - Have point-in-time recovery enabled

## Scaling Configuration

### Vercel Function Settings

Configure in `vercel.json`:

```json
{
  "functions": {
    "api/actors/*/index.ts": {
      "maxDuration": 30,
      "memory": 1024
    }
  },
  "regions": ["iad1", "lhr1", "sin1"]
}
```

### Database Connection Pooling

Use connection pooling for PostgreSQL:

```typescript
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Redis Clustering

For high availability, use Redis Cluster mode:

```typescript
const redis = new Redis.Cluster([
  { host: 'redis-1.example.com', port: 6379 },
  { host: 'redis-2.example.com', port: 6379 },
  { host: 'redis-3.example.com', port: 6379 }
]);
```

## Troubleshooting

### Common Issues

1. **Function Timeout**
   - Increase `maxDuration` in vercel.json
   - Optimize database queries
   - Use caching where appropriate

2. **Database Connection Errors**
   - Check connection limits
   - Verify SSL certificates
   - Use connection pooling

3. **Event Processing Failures**
   - Check event catalog validation
   - Verify actor health
   - Review error logs

### Debug Mode

Enable debug logging:

```bash
vercel env add DEBUG relay:* production
```

### Support Contacts

- **On-call Engineer**: Use PagerDuty
- **Database Issues**: DBA team
- **Infrastructure**: Platform team
- **Business Impact**: Product team

## Security Considerations

1. **API Security**
   - All endpoints require authentication
   - Rate limiting enabled
   - CORS configured appropriately

2. **Data Protection**
   - PII encrypted at rest
   - TLS for all connections
   - Audit logging enabled

3. **Secret Management**
   - Use Vercel environment variables
   - Rotate secrets regularly
   - Never commit secrets to git

## Performance Optimization

1. **Edge Functions**
   - Use for auth checks
   - Cache static responses
   - Geo-distributed execution

2. **Database Optimization**
   - Index frequently queried fields
   - Use read replicas
   - Implement query caching

3. **CDN Configuration**
   - Cache static assets
   - Use Vercel's Edge Network
   - Implement proper cache headers

## Maintenance Windows

Schedule maintenance during low-traffic periods:
- Tuesdays 2-4 AM UTC
- Notify users 48 hours in advance
- Have rollback plan ready

## Documentation Updates

After each deployment:
1. Update CHANGELOG.md
2. Document any new environment variables
3. Update API documentation
4. Review and update runbooks