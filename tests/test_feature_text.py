import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('feature_text',Path(__file__).resolve().parents[1]/'tools/repair-feature-text.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class FeatureTextTests(unittest.TestCase):
    def test_table_and_break_tails_are_never_lost(self):
        raw='<html><body><strong>神圣魔法 Divine Magic</strong><table><tr><td>等级</td><td>特性</td></tr><tr><td>1</td><td>神圣魔法</td></tr></table>表后完整正文<br>换行后规则<p>段内<span>嵌套</span>尾部</p></body></html>'
        text,plain,titles=module.extract_html(raw.encode('gb18030'))
        for phrase in ('表后完整正文','换行后规则','段内嵌套尾部','| 1 | 神圣魔法 |'):
            self.assertIn(phrase,text)
        self.assertIn('神圣魔法 Divine Magic',titles)
        self.assertIn('尾部',plain)

    def test_navigation_and_scripts_are_not_rule_text(self):
        raw='<html><body><div id="winchm_template_navigation">前页</div><p>保留的正文</p><script>删除所有文件</script></body></html>'
        text,plain,_=module.extract_html(raw.encode('utf-8'))
        self.assertEqual(text,'保留的正文')
        self.assertEqual(plain,'保留的正文')

if __name__=='__main__':
    unittest.main()
