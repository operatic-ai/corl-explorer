import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('resources',Path(__file__).resolve().parents[2]/'scripts/discover-paper-resources.py')
resources=importlib.util.module_from_spec(spec)
spec.loader.exec_module(resources)

class ResourceMatchingTests(unittest.TestCase):
    def setUp(self):
        self.a='Learning Robot Manipulation with Visual Representations'
        self.b='Fast Locomotion Control through Reinforcement Learning'
        self.titles={resources.normalized(self.a):'a',resources.normalized(self.b):'b'}
        self.arxiv={'2501.12345':'a','2502.12345':'b'}

    def match(self,text):
        return resources.repository_paper(text,self.titles,self.arxiv)[0]

    def test_unique_title_and_arxiv_match(self):
        self.assertEqual(self.match('# '+self.a+'\nhttps://arxiv.org/abs/2501.12345'),'a')
        self.assertEqual(self.match('# Method name\nPaper: https://arxiv.org/abs/2501.12345'),'a')

    def test_related_work_does_not_assign_a_repository(self):
        self.assertIsNone(self.match('# Another project\n## References\n'+self.a))
        self.assertEqual(self.match('# '+self.a+'\n## Related Work\n'+self.b),'a')

    def test_ambiguous_or_conflicting_identity_is_rejected(self):
        self.assertIsNone(self.match(self.a+'\n'+self.b))
        self.assertIsNone(self.match(self.a+'\nhttps://arxiv.org/abs/2502.12345'))

    def test_urls_preserve_valid_paths_and_strip_sentence_punctuation(self):
        self.assertEqual(resources.clean_url('https://example.org/paper/.'),'https://example.org/paper')
        self.assertEqual(resources.repository_url('https://github.com/Lab/Method/tree/main?tab=readme-ov-file'),'https://github.com/Lab/Method')
        for url in ['javascript:alert(1)','file:///etc/passwd','http://127.0.0.1/a','http://host.local/a','https://example.org:8000/a']:
            self.assertIsNone(resources.clean_url(url))

    def test_paper_and_video_links_are_not_project_pages(self):
        for url in ['https://arxiv.org/abs/2501.12345','https://github.com/lab/code','https://youtu.be/123','https://example.org/paper.pdf']:
            self.assertFalse(resources.is_project(url))
        self.assertTrue(resources.is_project('https://lab.github.io/project'))

if __name__=='__main__':unittest.main()
