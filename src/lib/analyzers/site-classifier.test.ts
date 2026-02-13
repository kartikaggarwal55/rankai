import { describe, expect, it } from 'vitest';
import { classifySite } from './site-classifier';

describe('classifySite', () => {
  it('classifies as saas-api when OpenAPI spec is present', () => {
    const siteType = classifySite({
      origin: 'https://example.com',
      robotsTxt: null,
      openApiSpec: '{"openapi":"3.0.0"}',
      pages: [
        {
          url: 'https://example.com',
          title: 'Home',
          html: '<html><body><h1>Platform</h1></body></html>',
        },
      ],
    });

    expect(siteType).toBe('saas-api');
  });

  it('classifies as ecommerce when Product schema is present', () => {
    const siteType = classifySite({
      origin: 'https://store.example.com',
      robotsTxt: null,
      openApiSpec: null,
      pages: [
        {
          url: 'https://store.example.com/products/widget',
          title: 'Widget',
          html: `
            <html>
              <head>
                <script type="application/ld+json">
                  { "@context": "https://schema.org", "@type": "Product", "name": "Widget" }
                </script>
              </head>
              <body><h1>Widget</h1></body>
            </html>
          `,
        },
      ],
    });

    expect(siteType).toBe('ecommerce');
  });
});
