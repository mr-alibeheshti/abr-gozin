// Add attribution only when navigating out; keep source/evidence URLs unchanged.
export function outboundLink(href: string, content: string): string {
  try {
    const url = new URL(href);
    if (!['https:', 'http:'].includes(url.protocol)) return href;
    url.searchParams.set('utm_source', 'abrgozin');
    url.searchParams.set('utm_medium', 'referral');
    url.searchParams.set('utm_campaign', 'hosting-comparison');
    url.searchParams.set('utm_content', content);
    return url.href;
  } catch {
    return href;
  }
}
