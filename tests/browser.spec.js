import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/');await expect(page.locator('.paper-card')).toHaveCount(24)});

test('grid and stack preserve search and show concise summaries',async({page})=>{
  await page.getByRole('textbox',{name:'Search papers'}).fill('Being-H0.5');
  await expect(page.locator('.paper-card')).toHaveCount(1);
  await expect(page.locator('.authors')).toContainText('Hao Luo +');
  await expect(page.locator('.paper-links a').first()).toHaveAttribute('href','https://openreview.net/forum?id=cfzFrOJmKA');
  await expect(page.locator('.paper-links a').last()).toHaveAttribute('href','https://arxiv.org/abs/2601.12993');
  await page.getByRole('button',{name:'Stack view',exact:true}).click();
  await expect(page.locator('.paper-stack')).toBeVisible();
  await expect(page.locator('.tldr')).toBeVisible();
  expect((await page.locator('.tldr p').innerText()).length).toBeLessThanOrEqual(120);
  await page.reload();
  await expect(page.locator('.paper-stack .paper-card')).toHaveCount(1);
  await expect(page.getByRole('textbox',{name:'Search papers'})).toHaveValue('Being-H0.5');
});

test('task filters, empty search, reset, and historical editions',async({page})=>{
  await page.getByLabel('Robot task',{exact:true}).selectOption('grasping');
  const count=await page.locator('.paper-card').count();expect(count).toBeGreaterThan(0);
  await page.getByRole('textbox',{name:'Search papers'}).fill('no-matching-paper-zzzz');
  await expect(page.getByText('No papers on this frequency.')).toBeVisible();
  await page.getByRole('button',{name:'Show all papers'}).click();
  await expect(page.locator('.paper-card')).toHaveCount(24);
  await page.getByLabel('Conference year',{exact:true}).selectOption('2025');
  await expect(page.locator('#results-heading')).toHaveText('The 2025 Collection');
  await expect(page.locator('#results-count')).toContainText('263 PAPERS');
  await page.getByLabel('Conference year',{exact:true}).selectOption('2017');
  await expect(page.locator('#results-count')).toContainText('49 PAPERS');
  await expect(page.locator('.paper-card')).toHaveCount(24);
});

test('reading list persists across reloads and supports removal',async({page})=>{
  const first=page.locator('[data-save]').first();const id=await first.getAttribute('data-save');
  await first.click();await page.locator('#saved-papers').click();
  await expect(page.locator('.paper-card')).toHaveCount(1);
  await page.reload();await page.locator('#saved-papers').click();
  await expect(page.locator(`[data-save="${id}"]`)).toHaveAttribute('aria-pressed','true');
  await page.locator(`[data-save="${id}"]`).click();
  await expect(page.getByText('Room for your next big idea.')).toBeVisible();
});

test('paper opens a PDF reader with usable external links and keyboard close',async({page})=>{
  await page.getByRole('textbox',{name:'Search papers'}).fill('Being-H0.5');
  await page.locator('.paper-card h3 button').click();
  await expect(page.locator('#reader')).toBeVisible();
  await expect(page.locator('#reader iframe')).toHaveAttribute('src',/arxiv.org\/pdf\/2601.12993/);
  await expect(page.getByRole('link',{name:'arXiv preprint',exact:false}).last()).toHaveAttribute('href','https://arxiv.org/abs/2601.12993');
  await expect(page.getByRole('link',{name:'Open PDF',exact:true})).toHaveAttribute('target','_blank');
  await expect(page.getByRole('link',{name:'OpenReview discussion'})).toHaveAttribute('href','https://openreview.net/forum?id=cfzFrOJmKA');
  await page.keyboard.press('Escape');await expect(page.locator('#reader')).not.toBeVisible();
  await expect(page.locator('.paper-card h3 button')).toBeFocused();
});

test('pagination and search shortcut work without console errors',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'Load more papers'}).click();
  await expect(page.locator('.paper-card')).toHaveCount(48);
  await page.keyboard.press('/');await expect(page.getByRole('textbox',{name:'Search papers'})).toBeFocused();
  expect(errors).toEqual([]);
});

test('mobile layout fits the viewport and stack keeps titles and summaries accessible',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button',{name:'Stack view',exact:true}).click();
  await expect(page.locator('.tldr').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'/tmp/corl-mobile.png',fullPage:false});
});

test('shared lists span years, preserve recipient bookmarks, and export a portable file',async({page,browser})=>{
  await page.getByRole('textbox',{name:'Search papers'}).fill('Being-H0.5');
  await page.locator('[data-save]').click();
  await page.getByRole('button',{name:'Clear search'}).click();
  await page.getByLabel('Conference year',{exact:true}).selectOption('2017');
  const historicalId=await page.locator('[data-save]').first().getAttribute('data-save');
  await page.locator('[data-save]').first().click();
  await page.locator('#share-list').click();
  await page.getByLabel('List name').fill('Robots & curiosity');
  const url=await page.getByRole('textbox',{name:'Share link',exact:true}).inputValue();
  expect(url).toContain('#list=');
  const downloadEvent=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download reading list'}).click();
  const download=await downloadEvent;
  expect(download.suggestedFilename()).toBe('corl-reading-list.html');
  const stream=await download.createReadStream();let html='';for await(const chunk of stream)html+=chunk;
  expect(html).toContain('Robots &amp; curiosity');
  expect(html).toContain('CoRL 2017');expect(html).toContain('CoRL 2026');
  const recipientContext=await browser.newContext();
  const recipient=await recipientContext.newPage();
  await recipient.goto('http://127.0.0.1:5173');
  await recipient.locator('.paper-card').first().waitFor();
  await recipient.evaluate(()=>localStorage.setItem('corl-saved',JSON.stringify(['NHE9q2cz1n'])));
  await recipient.goto(url);
  await expect(recipient.locator('#results-heading')).toHaveText('Robots & curiosity');
  await expect(recipient.locator('.paper-card')).toHaveCount(2);
  await expect(recipient.locator('#saved-count')).toHaveText('1');
  await recipient.getByRole('button',{name:'Save to my reading list'}).click();
  await expect(recipient.locator('#saved-count')).toHaveText('3');
  await recipient.reload();
  await expect(recipient.locator('.paper-card')).toHaveCount(2);
  await expect(recipient.locator(`[data-save="${historicalId}"]`)).toHaveAttribute('aria-pressed','true');
  await recipientContext.close();
});

test('dark mode respects the system, persists a choice, and uses the requested heading and footer',async({page})=>{
  await page.emulateMedia({colorScheme:'dark'});await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('button',{name:'Dark mode',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.locator('.main-footer')).toHaveText('For curious minds and wondrous machines.');
  await expect(page.getByText('About the index',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Source & coverage',{exact:false})).toHaveCount(0);
  expect(await page.locator('#results-heading').evaluate(e=>getComputedStyle(e).fontFamily)).toContain('PP Neue Machina');
  await page.screenshot({path:'/tmp/corl-neutral-light.png',fullPage:false});
  await page.getByRole('button',{name:'Dark mode',exact:true}).click();
  await page.screenshot({path:'/tmp/corl-neutral-dark.png',fullPage:false});
});

test('invalid shared links are recoverable and unknown papers are disclosed',async({page})=>{
  await page.goto('/#list=invalid');
  await expect(page.getByRole('alert')).toContainText('invalid');
  await page.getByRole('button',{name:'Dismiss'}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const hash=await page.evaluate(()=>btoa(JSON.stringify({v:1,name:'Missing paper',ids:['unknown-paper-id']})).replace(/=/g,''));
  await page.goto('/#list='+hash);
  await expect(page.locator('#shared-banner')).toContainText('1 paper is not available');
  await expect(page.locator('.paper-card')).toHaveCount(0);
});

test('trends have a separate page with working navigation and charts',async({page})=>{
 await expect(page.locator('#trends')).toHaveCount(0);
 await page.getByRole('link',{name:'Trends',exact:true}).click();
 await expect(page).toHaveURL(/trends.html/);
 await expect(page.getByRole('heading',{name:'A decade of robot learning'})).toBeVisible();
 await expect(page.locator('.paper-card')).toHaveCount(0);
 await expect(page.locator('.annual-bar')).toHaveCount(10);
 await page.reload();await expect(page.locator('#annual-metric')).toBeVisible();
 await page.locator('#annual-metric').selectOption('growth');
 await expect(page.locator('#volume-chart .chart-stat strong')).toHaveText('+161.2%');
 await page.locator('#trend-topic').selectOption('touch');
 await expect(page.locator('#topic-line-title')).toHaveText('Touch & contact as a percentage of indexed papers');
 await page.screenshot({path:'/tmp/corl-trends-light.png',fullPage:false});
 await page.getByRole('button',{name:'Dark mode',exact:true}).click();
 await page.screenshot({path:'/tmp/corl-trends-dark.png',fullPage:false});
 await page.locator('.annual-bar[data-trend-year="2017"]').click();
 await expect(page.locator('#results-heading')).toHaveText('The 2017 Collection');
 await page.goBack();await expect(page.locator('#annual-metric')).toBeVisible();
 await page.locator('[data-trend-topic="manipulation"][data-trend-year="2024"]').click();
 await expect(page.locator('#edition')).toHaveValue('2024');
 await expect(page.locator('.topic[data-topic="manipulation"]')).toHaveAttribute('aria-pressed','true');
 await page.getByRole('link',{name:'Trends',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('#annual-metric')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'/tmp/corl-trends-mobile.png',fullPage:false});
 await page.getByRole('link',{name:'Papers',exact:true}).click();
 await expect(page.locator('.paper-card')).toHaveCount(24);
});

test('historical presentation filters show verified labels and real images',async({page})=>{
 await page.getByLabel('Conference year',{exact:true}).selectOption('2023');
 await page.getByLabel('Presentation type',{exact:true}).selectOption('Oral');
 await expect(page.locator('#results-count')).toContainText('33 PAPERS');
 await expect(page.locator('.presentation').first()).toHaveText('Oral');
 await expect(page.locator('.paper-image img').first()).toBeVisible();
 await expect.poll(()=>page.locator('.paper-image img').first().evaluate(e=>e.naturalWidth)).toBeGreaterThan(0);
 await page.getByLabel('Presentation type',{exact:true}).selectOption('Poster');
 await expect(page.locator('#results-count')).toContainText('199 PAPERS');
});

test('presentation badges stay on images and task chips share their typeface',async({page})=>{
 const badge=page.locator('.paper-image .presentation').first();
 await expect(badge).toBeVisible();
 const fonts=await page.evaluate(()=>({badge:getComputedStyle(document.querySelector('.presentation')).fontFamily,task:getComputedStyle(document.querySelector('.chips button')).fontFamily}));
 expect(fonts.task).toBe(fonts.badge);
 const bookmark=page.locator('[data-save]').first();
 const before=await bookmark.evaluate(e=>getComputedStyle(e).color);
 await bookmark.click();
 await expect(bookmark).toHaveAttribute('aria-pressed','true');
 expect(await bookmark.evaluate(e=>getComputedStyle(e).color)).not.toBe(before);
});

test('3D actuator stays visible and rotates with scroll on both pages',async({page})=>{
 const logo=page.locator('.actuator-logo');
 await expect(logo).toHaveAttribute('data-renderer','webgl');
 const before=await logo.screenshot();
 await page.evaluate(()=>scrollTo(0,650));
 await expect(logo).toBeInViewport();
 await expect.poll(async()=>!(await logo.screenshot()).equals(before)).toBe(true);
 await page.screenshot({path:'/tmp/corl-actuator-scrolled.png'});
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:'/tmp/corl-actuator.png'});
 await page.getByRole('link',{name:'Trends',exact:true}).click();
 await expect(logo).toHaveAttribute('data-renderer','webgl');
 await page.evaluate(()=>scrollTo(0,500));
 await expect(logo).toBeInViewport();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.reload();await expect(logo).toHaveAttribute('data-renderer','webgl');
 const still=await logo.screenshot();
 await page.evaluate(()=>scrollTo(0,0));
 expect((await logo.screenshot()).equals(still)).toBe(true);
});
