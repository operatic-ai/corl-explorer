import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('matcher',Path(__file__).with_name('match-arxiv.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class MatchingTests(unittest.TestCase):
    def setUp(self):
        self.paper={'title':'CARLA: An Open Urban Driving Simulator','year':2017,'authors':['Alexey Dosovitskiy','German Ros','Felipe Codevilla','Antonio Lopez','Vladlen Koltun']}
        self.candidate={'title':self.paper['title'],'published':'2017-11-10','authors':self.paper['authors'][:]}
    def test_exact_title_and_authors(self):
        self.assertTrue(m.assess(self.paper,self.candidate)['accepted'])
    def test_same_title_wrong_authors_rejected(self):
        self.candidate['authors']=['Jane Smith','John Smith']
        self.assertFalse(m.assess(self.paper,self.candidate)['accepted'])
    def test_common_initial_does_not_match_different_full_names(self):
        self.assertFalse(m.author_matches('Hao Wang','Hong Wang'))
        self.assertTrue(m.author_matches('Hao Wang','H. Wang'))
    def test_accents_and_punctuation(self):
        self.candidate['authors'][3]='Antonio López'
        self.candidate['title']='CARLA — An Open Urban Driving Simulator'
        self.assertTrue(m.assess(self.paper,self.candidate)['accepted'])
    def test_related_followup_rejected(self):
        self.candidate['title']='CARLA 2: A New Urban Driving Simulator'
        self.assertFalse(m.assess(self.paper,self.candidate)['accepted'])
    def test_implausible_date_rejected(self):
        self.candidate['published']='2024-01-01'
        self.assertFalse(m.assess(self.paper,self.candidate)['accepted'])
    def test_no_author_evidence_rejected(self):
        self.paper['authors']=[]
        self.assertFalse(m.assess(self.paper,self.candidate)['accepted'])
    def test_author_count_cannot_be_inflated(self):
        self.paper['authors']=['Hao Wang','Hong Wang','Other Author']
        self.candidate['authors']=['H. Wang']
        self.assertFalse(m.assess(self.paper,self.candidate)['accepted'])
    def test_atom_id_is_canonical_and_invalid_feeds_fail(self):
        xml='<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/1711.03938v3</id><title>CARLA</title><author><name>Alexey Dosovitskiy</name></author><published>2017-11-10</published></entry></feed>'
        self.assertEqual(m.parse_feed(xml)[0]['arxivUrl'],'https://arxiv.org/abs/1711.03938')
        with self.assertRaises(ValueError):m.parse_feed('<html/>')

if __name__=='__main__':unittest.main()
