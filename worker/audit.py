from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlsplit

def inspect_page(url, html, status, elapsed_ms):
    soup = BeautifulSoup(html, 'html.parser')
    title = soup.title.get_text(' ', strip=True)[:1000] if soup.title else None
    description = soup.find('meta', attrs={'name': 'description'})
    viewport = soup.find('meta', attrs={'name': 'viewport'})
    findings = []
    def add(category, classification, observation, recommendation, evidence, confidence=1.0):
        findings.append(dict(category=category, classification=classification, observation=observation, recommendation=recommendation, sourceUrl=url, evidence=evidence, confidence=confidence))
    add('Page availability', 'VERIFIED', f'This inspected page returned HTTP {status}.', 'Review individual HTTP failures; this result does not represent all pages.', {'statusCode': status})
    add('Search metadata', 'VERIFIED' if description else 'POTENTIAL ISSUE', 'A meta description is present.' if description else 'No meta description was found in the rendered page.', 'Review the description for relevance and accuracy.' if description else 'Consider adding an accurate, page-specific meta description.', {'description': description.get('content', '')[:1000] if description else None})
    add('Mobile configuration', 'VERIFIED' if viewport else 'POTENTIAL ISSUE', 'A viewport meta tag is present.' if viewport else 'No viewport meta tag was observed.', 'Verify the layout on real mobile devices; a meta tag alone does not establish responsiveness.', {'viewport': viewport.get('content', '') if viewport else None})
    forms = soup.find_all('form')
    add('Public forms', 'VERIFIED' if forms else 'NOT OBSERVABLE', f'{len(forms)} form elements were observed.' if forms else 'No form element was observed on this page.', 'Confirm the enquiry journey with the prospect. No form was submitted.', {'formCount': len(forms)})
    add('Internal business systems', 'REQUIRES MANUAL REVIEW', 'A public website inspection cannot establish whether a CRM, ERP or internal workflow exists.', 'Ask which internal systems are currently used and where the team experiences friction.', {'method': 'Public website inspection only'})
    add('Performance signal', 'VERIFIED', f'The inspection took {elapsed_ms} ms in this crawler environment.', 'Use a dedicated controlled performance audit before making performance claims.', {'crawlerElapsedMs': elapsed_ms, 'isCoreWebVitals': False}, 0.9)
    links = []
    for a in soup.select('a[href]'):
        target = urljoin(url, a['href']).split('#')[0]
        if urlsplit(target).scheme in ('http', 'https') and urlsplit(target).hostname == urlsplit(url).hostname and target not in links:
            links.append(target)
    emails = sorted({a['href'][7:].split('?')[0].strip() for a in soup.select('a[href^="mailto:"]') if a.get('href', '')[7:].strip()})[:10]
    phones = sorted({a['href'][4:].split('?')[0].strip() for a in soup.select('a[href^="tel:"]') if a.get('href', '')[4:].strip()})[:10]
    add('Public contact channels', 'VERIFIED' if emails or phones else 'NOT OBSERVABLE', f'{len(emails)} public email link(s) and {len(phones)} public phone link(s) were observed.' if emails or phones else 'No public mailto or tel links were observed on this page.', 'Verify the best contact route before outreach.', {'publicEmails': emails, 'publicPhones': phones})
    metadata = {'publicEmails': emails, 'publicPhones': phones, 'description': description.get('content', '')[:1000] if description else None, 'viewport': viewport.get('content', '') if viewport else None, 'formCount': len(forms), 'h1': [h.get_text(' ', strip=True)[:300] for h in soup.find_all('h1')[:10]], 'elapsedMs': elapsed_ms}
    return {'url': url, 'title': title, 'statusCode': status, 'metadata': metadata}, findings, links
