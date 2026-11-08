import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeList,decodeList,shareUrl,readingListHtml} from '../src/sharing.js';

test('shared snapshots roundtrip Unicode names, deduplicate IDs, and clear sender filters',()=>{
  const url=shareUrl('https://example.com/?q=robots&year=2026#old','触覚 · café',['abc','pmlr-v78-paper17a','abc']);
  assert.equal(new URL(url).search,'');
  assert.deepEqual(decodeList(new URL(url).hash),{v:1,name:'触覚 · café',ids:['abc','pmlr-v78-paper17a']});
});

test('malformed, unsupported and empty shared payloads fail safely',()=>{
  assert.equal(decodeList(''),null);
  assert.throws(()=>decodeList('#list=%%%'));
  assert.throws(()=>decodeList('#list='+btoa(JSON.stringify({v:2,name:'x',ids:['a']}))));
  assert.throws(()=>encodeList('empty',[]));
  assert.throws(()=>encodeList('bad',['<script>']));
});

test('download is a standalone escaped document with separate verified source links',()=>{
  const html=readingListHtml('<script>alert(1)</script>',[{year:2025,title:'Robots < humans',authors:['A & B'],tldr:'A summary.',pdfUrl:'https://example.com/p.pdf',forumUrl:'https://openreview.net/forum?id=abc',arxivUrl:'https://arxiv.org/abs/1234.56789'}]);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Robots &lt; humans'));
  assert.ok(html.includes('https://openreview.net/forum?id=abc'));
  assert.ok(html.includes('https://arxiv.org/abs/1234.56789'));
  assert.ok(html.includes('For curious minds and wondrous machines.'));
});

test('original proceedings IDs containing spaces can be shared without changing paper identity',()=>{
 const id='pmlr-v78-frederik ebert17a';
 assert.deepEqual(decodeList('#list='+encodeList('Visual planning',[id])).ids,[id]);
});
