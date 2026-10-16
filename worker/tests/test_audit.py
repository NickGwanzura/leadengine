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
