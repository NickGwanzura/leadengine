import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from audit import inspect_page

def test_absence_is_not_internal_system_claim():
    page, findings, links = inspect_page('https://example.com','<html><head><title>Example</title></head><body><a href="/about">About</a><a href="http://localhost/">Bad</a></body></html>',200,100)
    assert page['title'] == 'Example'
    assert links == ['https://example.com/about']
    assert next(f for f in findings if f['category']=='Internal business systems')['classification']=='REQUIRES MANUAL REVIEW'
    assert next(f for f in findings if f['category']=='Public forms')['classification']=='NOT OBSERVABLE'
    assert all(f['sourceUrl']=='https://example.com' for f in findings)

def test_public_contact_channels_include_structured_business_data():
    html = '''<html><body><a href="mailto:hello@example.com">Email</a>
    <script type="application/ld+json">{"@type":"Organization","email":"sales@example.com","contactPoint":{"@type":"ContactPoint","telephone":"+263 77 123 4567"}}</script></body></html>'''
    _, findings, _ = inspect_page('https://example.com/contact', html, 200, 100)
    contact = next(f for f in findings if f['category'] == 'Public contact channels')
    assert contact['evidence']['publicEmails'] == ['hello@example.com', 'sales@example.com']
    assert contact['evidence']['publicPhones'] == ['+263 77 123 4567']
    assert contact['sourceUrl'] == 'https://example.com/contact'
