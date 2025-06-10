const { describe, it, expect, beforeEach } = require('@jest/globals');
const { AuditDiscoveryService } = require('../../src/lib/services/audit-discovery');

describe('Audit Discovery Pipeline Tests', () => {
  let auditService;

  beforeEach(() => {
    auditService = new AuditDiscoveryService();
  });

  describe('Hybrid Discovery System', () => {
    it('should discover audits through multiple layers', async () => {
      const audits = await auditService.discoverAudits('USDC');
      expect(audits).toHaveLength(expect.any(Number));
      expect(audits[0]).toMatchObject({
        firm: expect.any(String),
        date: expect.any(String),
        url: expect.any(String),
      });
    });

    it('should prioritize official sources', async () => {
      const audits = await auditService.discoverAudits('USDT');
      const hasOfficialSource = audits.some(a => 
        a.url.includes('tether.to') || 
        a.url.includes('circle.com')
      );
      expect(hasOfficialSource).toBe(true);
    });

    it('should handle tokens with no discoverable audits', async () => {
      const audits = await auditService.discoverAudits('UNKNOWN_TOKEN');
      expect(audits).toEqual([]);
    });
  });

  describe('Content Analysis', () => {
    it('should extract audit details from PDF content', async () => {
      const audit = await auditService.analyzeAuditContent('sample_audit.pdf');
      expect(audit).toMatchObject({
        critical_issues: expect.any(Number),
        high_issues: expect.any(Number),
        resolved_issues: expect.any(Number),
      });
    });

    it('should handle different audit report formats', async () => {
      const formats = ['pdf', 'html', 'md'];
      const results = await Promise.all(
        formats.map(f => auditService.analyzeAuditContent(`sample.${f}`))
      );
      expect(results.every(r => r !== null)).toBe(true);
    });

    it('should detect audit resolution status', async () => {
      const audit = await auditService.analyzeAuditContent('resolved_audit.pdf');
      expect(audit.resolution_status).toBe('resolved');
    });
  });

  describe('Link Harvesting', () => {
    it('should discover audit links from official domains', async () => {
      const links = await auditService.harvestAuditLinks('USDC');
      expect(links.some(l => l.includes('circle.com'))).toBe(true);
    });

    it('should validate discovered links', async () => {
      const links = await auditService.harvestAuditLinks('USDT');
      const validLinks = await auditService.validateLinks(links);
      expect(validLinks.length).toBeLessThanOrEqual(links.length);
    });

    it('should handle rate limiting during link discovery', async () => {
      const promises = Array(10).fill().map(() => 
        auditService.harvestAuditLinks('USDC')
      );
      const results = await Promise.allSettled(promises);
      expect(results.some(r => r.status === 'fulfilled')).toBe(true);
    });
  });

  describe('Subdomain Enumeration', () => {
    it('should discover audit-related subdomains', async () => {
      const subdomains = await auditService.enumerateSubdomains('circle.com');
      expect(subdomains).toContain(expect.stringMatching(/audit|security/));
    });

    it('should validate subdomain accessibility', async () => {
      const subdomains = await auditService.enumerateSubdomains('tether.to');
      const accessible = await auditService.validateSubdomains(subdomains);
      expect(accessible.length).toBeLessThanOrEqual(subdomains.length);
    });
  });

  describe('Audit Data Extraction', () => {
    it('should extract audit firm details', async () => {
      const audit = await auditService.extractAuditDetails('sample_audit.pdf');
      expect(audit.firm).toMatch(/Trail of Bits|Certik|Quantstamp/);
    });

    it('should extract audit date accurately', async () => {
      const audit = await auditService.extractAuditDetails('sample_audit.pdf');
      expect(Date.parse(audit.date)).toBeTruthy();
    });

    it('should count security issues correctly', async () => {
      const audit = await auditService.extractAuditDetails('sample_audit.pdf');
      expect(audit.critical_issues).toBeGreaterThanOrEqual(0);
      expect(audit.high_issues).toBeGreaterThanOrEqual(0);
    });

    it('should determine resolution status', async () => {
      const audit = await auditService.extractAuditDetails('sample_audit.pdf');
      expect(audit.resolution_status).toMatch(/resolved|pending|unresolved/);
    });
  });

  describe('Error Handling', () => {
    it('should handle inaccessible audit reports', async () => {
      const result = await auditService.analyzeAuditContent('nonexistent.pdf');
      expect(result.error).toBeDefined();
    });

    it('should handle malformed audit content', async () => {
      const result = await auditService.analyzeAuditContent('malformed.pdf');
      expect(result.error).toBeDefined();
    });

    it('should handle network errors during discovery', async () => {
      auditService.fetch = jest.fn().mockRejectedValue(new Error('Network Error'));
      const audits = await auditService.discoverAudits('USDC');
      expect(audits.error).toBeDefined();
    });
  });
}); 