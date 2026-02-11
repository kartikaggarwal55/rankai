import * as cheerio from 'cheerio';
import { SiteType } from '../types';

interface ClassifierInput {
  pages: { url: string; html: string; title: string }[];
  robotsTxt: string | null;
  openApiSpec: string | null;
  origin: string;
}

function extractJsonLdTypes(pages: { html: string }[]): string[] {
  const types: string[] = [];
  for (const page of pages) {
    try {
      const $ = cheerio.load(page.html);
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const raw = $(el).html();
          if (!raw) return;
          const parsed = JSON.parse(raw);
          const items = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of items) {
            if (item['@type']) {
              const itemTypes = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
              types.push(...itemTypes);
            }
            if (item['@graph'] && Array.isArray(item['@graph'])) {
              for (const node of item['@graph']) {
                if (node['@type']) {
                  const nodeTypes = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
                  types.push(...nodeTypes);
                }
              }
            }
          }
        } catch {
          // Invalid JSON-LD, skip
        }
      });
    } catch {
      // Invalid HTML, skip
    }
  }
  return types;
}

function extractBodyText(pages: { html: string }[]): string {
  const parts: string[] = [];
  for (const page of pages) {
    try {
      const $ = cheerio.load(page.html);
      parts.push($('body').text());
    } catch {
      // Skip invalid HTML
    }
  }
  return parts.join(' ').toLowerCase();
}

function countMatchingUrls(pages: { url: string }[], pattern: RegExp): number {
  return pages.filter(p => pattern.test(p.url)).length;
}

function isSaasApi(input: ClassifierInput, schemaTypes: string[], bodyText: string): boolean {
  if (input.openApiSpec) return true;

  const apiUrlPattern = /\/(docs|api|reference|sdk)(\/|$|\?|#)/i;
  if (countMatchingUrls(input.pages, apiUrlPattern) >= 3) return true;

  const hasApiKey = bodyText.includes('api key');
  const hasEndpoint = bodyText.includes('endpoint');
  const hasSdkOrDocs = bodyText.includes('sdk') || bodyText.includes('documentation');
  if (hasApiKey && hasEndpoint && hasSdkOrDocs) return true;

  return false;
}

function isEcommerce(input: ClassifierInput, schemaTypes: string[], bodyText: string): boolean {
  const ecommerceSchemas = ['Product', 'Offer', 'AggregateOffer', 'IndividualProduct', 'ProductGroup'];
  if (schemaTypes.some(t => ecommerceSchemas.includes(t))) return true;

  const shopUrlPattern = /\/(products|shop|cart|checkout)(\/|$|\?|#)/i;
  if (countMatchingUrls(input.pages, shopUrlPattern) >= 1) return true;

  const hasAddToCart = bodyText.includes('add to cart');
  const hasPriceSignal = bodyText.includes('price') || bodyText.includes('$');
  if (hasAddToCart && hasPriceSignal) return true;

  return false;
}

function isLocalBusiness(input: ClassifierInput, schemaTypes: string[], bodyText: string): boolean {
  const localSchemas = [
    'LocalBusiness', 'Restaurant', 'MedicalBusiness',
    'Dentist', 'Attorney', 'AutoRepair', 'BarOrPub',
    'BeautySalon', 'CafeOrCoffeeShop', 'DayCare',
    'Electrician', 'EmergencyService', 'FinancialService',
    'FoodEstablishment', 'GasStation', 'HealthAndBeautyBusiness',
    'HomeAndConstructionBusiness', 'InternetCafe', 'LegalService',
    'LodgingBusiness', 'MedicalClinic', 'Optician',
    'ProfessionalService', 'RealEstateAgent', 'Store',
    'VeterinaryCare',
  ];
  if (schemaTypes.some(t => localSchemas.includes(t))) return true;

  const localUrlPattern = /\/(locations|contact|about-us)(\/|$|\?|#)/i;
  const addressPattern = /\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct)\b/i;
  if (countMatchingUrls(input.pages, localUrlPattern) >= 1 && addressPattern.test(bodyText)) return true;

  const phonePattern = /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;
  if (addressPattern.test(bodyText) && phonePattern.test(bodyText)) {
    let pagesWithNap = 0;
    for (const page of input.pages) {
      try {
        const $ = cheerio.load(page.html);
        const pageText = $('body').text();
        const hasAddress = addressPattern.test(pageText);
        const hasPhone = phonePattern.test(pageText);
        if (hasAddress && hasPhone) pagesWithNap++;
      } catch {
        // Skip
      }
    }
    if (pagesWithNap >= 2) return true;
  }

  return false;
}

function isContentPublisher(input: ClassifierInput, schemaTypes: string[], _bodyText: string): boolean {
  const articleSchemas = ['Article', 'BlogPosting', 'NewsArticle', 'TechArticle', 'ScholarlyArticle', 'Report'];
  const articleSchemaCount = schemaTypes.filter(t => articleSchemas.includes(t)).length;
  if (articleSchemaCount >= 5) return true;

  const contentUrlPattern = /\/(blog|articles|news|posts)(\/|$|\?|#)/i;
  const matchingCount = countMatchingUrls(input.pages, contentUrlPattern);
  if (input.pages.length > 0 && matchingCount / input.pages.length > 0.4) return true;

  return false;
}

export function classifySite(input: ClassifierInput): SiteType {
  if (!input.pages || input.pages.length === 0) return 'general';

  const schemaTypes = extractJsonLdTypes(input.pages);
  const bodyText = extractBodyText(input.pages);

  if (isSaasApi(input, schemaTypes, bodyText)) return 'saas-api';
  if (isEcommerce(input, schemaTypes, bodyText)) return 'ecommerce';
  if (isLocalBusiness(input, schemaTypes, bodyText)) return 'local-business';
  if (isContentPublisher(input, schemaTypes, bodyText)) return 'content-publisher';

  return 'general';
}
