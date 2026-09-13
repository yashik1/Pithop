// Browser regression test for the Pithop Score UI (Phase 1).
//
// Lives in the repo on purpose: an earlier generation of these suites was kept
// in a scratch directory and was lost when the container was reclaimed, taking
// the only regression coverage of the results list with it.
//
// Needs Playwright available and a built preview server running:
//   npm run build && npx vite preview --port 4200 --strictPort &
//   node tests/browser/score-ui.cjs 4200
// Chromium path is overridable with CHROMIUM_PATH.

const { chromium } = require('playwright');
const PORT = process.argv[2] || process.env.PORT || '4200';
const BASE = `http://localhost:${PORT}`;
const json = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const A = [-97.7431, 30.2672], B = [-96.797, 32.7767];
const leg = (a,b,n=40)=>Array.from({length:n},(_,i)=>[a[0]+((b[0]-a[0])*i)/(n-1),a[1]+((b[1]-a[1])*i)/(n-1)]);
const ok = (l,c,x='') => console.log(`${c?'PASS':'FAIL'}  ${l}${x?' | '+x:''}`);

(async () => {
  const br = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const ctx = await br.newContext({ viewport: { width: 900, height: 950 } });
  await ctx.route(/geocode\/autocomplete/, r => r.fulfill(json({features:[]})));
  await ctx.route(/geocode\/search/, r => { const t=(new URL(r.request().url()).searchParams.get('text')||'').toLowerCase();
    const p = t.includes('austin')?{c:A,f:'Austin, TX'}:{c:B,f:'Dallas, TX'};
    r.fulfill(json({features:[{geometry:{coordinates:p.c},properties:{formatted:p.f}}]})); });
  await ctx.route(/v1\/routing/, r => r.fulfill(json({features:[{geometry:{type:'MultiLineString',coordinates:[leg(A,B)]},properties:{distance:320000,time:11000,legs:[{steps:[]}]}}]})));
  // A mix: photogenic viewpoints, restaurants, and a fuel stop, at varying detours.
  await ctx.route(/v2\/places/, r => {
    const m=/circle:([-\d.]+),([-\d.]+),/.exec(decodeURIComponent(new URL(r.request().url()).searchParams.get('filter')||''));
    if(!m) return r.fulfill(json({features:[]}));
    const lng=Number(m[1]), lat=Number(m[2]);
    const mk=(i,cat,name,off)=>({properties:{place_id:`${lng.toFixed(2)}-${i}`,name,lat:lat+off,lon:lng,
      categories:[cat],datasource:{raw:{description:'A place along the way.'}}}});
    r.fulfill(json({features:[
      mk(0,'tourism.sights','Scenic Overlook '+lng.toFixed(2),0.01),
      mk(1,'catering.restaurant','Roadside Diner '+lng.toFixed(2),0.02),
      mk(2,'service.vehicle.fuel','Fuel Stop '+lng.toFixed(2),0.005),
      mk(3,'leisure.park','Riverside Park '+lng.toFixed(2),0.03),
    ]}));
  });
  await ctx.route(/maps\.geoapify|cartocdn|tile\./, r => r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
  await ctx.route(/en\.wikipedia\.org/, r => r.fulfill(json({query:{pages:{1:{pageid:1,title:'Old Mill Museum',description:'museum in Texas',coordinates:[{lat:31.4,lon:-97.3}]}}}})));
  await ctx.route(/en\.wikivoyage\.org/, r => r.fulfill(json({query:{pages:{}}})));
  await ctx.route(/\/api\/community/, r => r.fulfill({status:503,body:'{}'}));
  await ctx.route(/_vercel\/insights/, r => r.fulfill({status:200,contentType:'application/javascript',body:''}));

  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(String(e)));
  await p.goto(`${BASE}/`);
  await p.locator('.from-row input').fill('Austin, TX');
  await p.locator('.place-input input').nth(1).fill('Dallas, TX');
  await p.locator('.go-btn').click();
  await p.waitForSelector('.stop-card', { timeout: 30000 });
  await p.waitForTimeout(1800);

  // Score UI present
  ok('score badges rendered', (await p.locator('.score-badge').count()) > 0,
     await p.locator('.score-badge').first().textContent());
  ok('verdict shown', (await p.locator('.verdict').count()) > 0,
     await p.locator('.verdict').first().textContent());
  ok('total extra time shown', /extra in total/.test(await p.locator('.score-extra').first().textContent()));
  ok("Don't Miss rail rendered", (await p.locator('.dm-card').count()) > 0,
     `${await p.locator('.dm-card').count()} cards`);
  ok('13 personality chips', (await p.locator('.vibe-chip:not(.gem)').count()) === 13,
     `${await p.locator('.vibe-chip:not(.gem)').count()}`);

  // Scores must be sorted descending in the list.
  const scores = await p.evaluate(() =>
    [...document.querySelectorAll('.stop-card .score-badge')].map(e => Number(e.textContent.match(/(\d+)$/)[1])));
  ok('list sorted by score (desc)', scores.every((v,i)=>i===0||v<=scores[i-1]), scores.slice(0,6).join(','));

  // Personality must change the ranking.
  const topBefore = await p.locator('.stop-card .stop-name').first().textContent();
  await p.locator('.vibe-chip', { hasText: 'Foodie' }).first().click();
  await p.waitForTimeout(700);
  const topFoodie = await p.locator('.stop-card .stop-name').first().textContent();
  ok('Foodie personality changes the top result', /diner/i.test(topFoodie || ''), `${topBefore} -> ${topFoodie}`);
  ok('category filter narrowed to food', (await p.locator('.stop-card').count()) > 0);

  // Multi-select: adding Scenic should widen the set again.
  const foodieCount = await p.evaluate(() => Number(document.querySelector('.list-header').textContent.match(/(\d+)/)[1]));
  await p.locator('.vibe-chip', { hasText: 'Scenic Explorer' }).first().click();
  await p.waitForTimeout(700);
  const bothCount = await p.evaluate(() => Number(document.querySelector('.list-header').textContent.match(/(\d+)/)[1]));
  ok('personalities are multi-select (set widens)', bothCount > foodieCount, `${foodieCount} -> ${bothCount}`);
  ok('two chips active at once', (await p.locator('.vibe-chip.active').count()) === 2);

  // Hidden gems filter
  await p.locator('.vibe-chip.gem').click();
  await p.waitForTimeout(700);
  const gemCount = await p.evaluate(() => Number(document.querySelector('.list-header').textContent.match(/(\d+)/)[1]));
  ok('hidden-gems filter narrows the list', gemCount < bothCount, `${bothCount} -> ${gemCount}`);
  await p.locator('.vibe-chip.gem').click();
  await p.waitForTimeout(500);

  // Reasons appear when a card is expanded.
  await p.locator('.stop-card').first().click();
  await p.waitForTimeout(600);
  ok('reasons listed on the expanded card', (await p.locator('.score-why li').count()) > 0,
     (await p.locator('.score-why li').first().textContent() || '').slice(0,50));

  // /_vercel/insights/script.js only exists on Vercel's edge; `vite preview`
  // answers with index.html, which is not JS. Local-only, never in production.
  const real = errs.filter((e) => !/Unexpected token '<'/.test(e));
  ok('no page errors', real.length === 0, real.join('; ').slice(0, 140));
  await br.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
