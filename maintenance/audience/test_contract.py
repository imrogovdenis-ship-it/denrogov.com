from pathlib import Path
import unittest,re,json,hashlib
W=Path(__file__).parent
class Contract(unittest.TestCase):
 def test_audience_four_locales(self):
  for prefix,lang in [('', 'ru'),('es/','es'),('en/','en'),('zh/','zh-Hans')]:
   p=W/'public'/prefix/'audience/index.html'
   self.assertTrue(p.exists(),f'Missing audience page {lang}')
   s=p.read_text(); self.assertIn(f'lang="{lang}"',s)
   self.assertIn('/audience-data/audience.json',s)
   self.assertEqual(s.count('rel="alternate"'),5)
   self.assertIn('data-audience',s)
if __name__=='__main__':unittest.main()
