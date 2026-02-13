import { describe, expect, it } from 'vitest';
import { analyzeAEO } from './aeo-analyzer';

const baseContext = {
  robotsTxt: null,
  llmsTxt: null,
  llmsFullTxt: null,
  openApiSpec: null,
  origin: 'https://example.com',
};

describe('analyzeAEO', () => {
  it('fails authentication docs check when auth content is missing', () => {
    const result = analyzeAEO({
      ...baseContext,
      allPages: [
        {
          url: 'https://example.com/docs/getting-started',
          title: 'Getting started',
          html: '<html><body><h1>Getting Started</h1><p>Hello world docs.</p></body></html>',
        },
      ],
    });

    const finding = result.apiDocumentation.findings.find(
      f => f.check === 'Authentication documentation'
    );

    expect(finding).toBeDefined();
    expect(finding?.status).toBe('fail');
  });

  it('passes authentication docs check when auth docs are present', () => {
    const result = analyzeAEO({
      ...baseContext,
      allPages: [
        {
          url: 'https://example.com/api/authentication',
          title: 'Authentication',
          html: '<html><body><h1>Authentication</h1><p>Use a bearer token in the Authorization header.</p></body></html>',
        },
      ],
    });

    const finding = result.apiDocumentation.findings.find(
      f => f.check === 'Authentication documentation'
    );

    expect(finding).toBeDefined();
    expect(finding?.status).toBe('pass');
  });
});
