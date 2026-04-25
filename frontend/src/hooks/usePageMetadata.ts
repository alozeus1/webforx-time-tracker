import { useEffect } from 'react';

type PageMetadata = {
  title: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  canonical?: string;
  noIndex?: boolean;
};

const ensureMetaTag = (selector: string, attrs: Record<string, string>) => {
  let tag = document.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    Object.entries(attrs).forEach(([key, value]) => tag?.setAttribute(key, value));
    document.head.appendChild(tag);
  }
  return tag;
};

const toAbsoluteUrl = (value: string) => {
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value, window.location.origin).toString();
};

export const usePageMetadata = (metadata: PageMetadata) => {
  useEffect(() => {
    document.title = metadata.title;

    const descriptionTag = ensureMetaTag('meta[name="description"]', { name: 'description' });
    if (metadata.description) descriptionTag.setAttribute('content', metadata.description);

    const ogTitleTag = ensureMetaTag('meta[property="og:title"]', { property: 'og:title' });
    ogTitleTag.setAttribute('content', metadata.ogTitle ?? metadata.title);

    const ogDescriptionTag = ensureMetaTag('meta[property="og:description"]', { property: 'og:description' });
    ogDescriptionTag.setAttribute('content', metadata.ogDescription ?? metadata.description ?? '');

    const ogTypeTag = ensureMetaTag('meta[property="og:type"]', { property: 'og:type' });
    ogTypeTag.setAttribute('content', 'website');

    if (metadata.ogImage) {
      const ogImageTag = ensureMetaTag('meta[property="og:image"]', { property: 'og:image' });
      ogImageTag.setAttribute('content', toAbsoluteUrl(metadata.ogImage));
    }

    const twitterCardTag = ensureMetaTag('meta[name="twitter:card"]', { name: 'twitter:card' });
    twitterCardTag.setAttribute('content', metadata.twitterCard ?? (metadata.ogImage ? 'summary_large_image' : 'summary'));

    const twitterTitleTag = ensureMetaTag('meta[name="twitter:title"]', { name: 'twitter:title' });
    twitterTitleTag.setAttribute('content', metadata.ogTitle ?? metadata.title);

    const twitterDescriptionTag = ensureMetaTag('meta[name="twitter:description"]', { name: 'twitter:description' });
    twitterDescriptionTag.setAttribute('content', metadata.ogDescription ?? metadata.description ?? '');

    if (metadata.ogImage) {
      const twitterImageTag = ensureMetaTag('meta[name="twitter:image"]', { name: 'twitter:image' });
      twitterImageTag.setAttribute('content', toAbsoluteUrl(metadata.ogImage));
    }

    const canonicalHref = metadata.canonical ? toAbsoluteUrl(metadata.canonical) : window.location.href;
    let canonicalTag = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalTag) {
      canonicalTag = document.createElement('link');
      canonicalTag.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalTag);
    }
    canonicalTag.setAttribute('href', canonicalHref);

    const ogUrlTag = ensureMetaTag('meta[property="og:url"]', { property: 'og:url' });
    ogUrlTag.setAttribute('content', canonicalHref);

    const robotsTag = ensureMetaTag('meta[name="robots"]', { name: 'robots' });
    robotsTag.setAttribute('content', metadata.noIndex ? 'noindex, nofollow' : 'index, follow');
  }, [metadata]);
};
