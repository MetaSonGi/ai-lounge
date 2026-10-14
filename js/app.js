/* AI라운지 — 현장이 묻고, AI가 돕다 */
'use strict';

/* ---------- 상수 ---------- */
const IMG_EXT = ['jpg','jpeg','png','webp','gif','bmp'];
const VID_EXT = ['mp4','webm','mov','m4v'];

const CONCEPT_KEYWORDS = {
  '로봇·자동화':   ['로봇','robot','cobot','협동','arm','팔','자동화','automation','manipulator'],
  '물류·컨베이어': ['컨베이어','conveyor','belt','물류','logistics','amr','agv','박스','box','창고','warehouse','pallet','파렛트','이송'],
  '데이터·대시보드': ['대시보드','dashboard','twin','디지털트윈','모니터','monitor','kpi','데이터','data','차트','chart','관제'],
  '작업자·AR':     ['작업자','worker','ar','글래스','glass','점검','안전','safety','헬멧','helmet','홀로그램'],
  '용접·가공':     ['용접','weld','스파크','spark','가공','cutting','절단','가공기'],
  '야간·전경':     ['야간','night','전경','exterior','건물','building','야경','외관','전망'],
  '제어·PLC':      ['plc','제어','control','센서','sensor','hmi','제어반','panel','캐비닛','신호'],
};
const DEFAULT_CONCEPT = '기타';

/* ---------- 상태 ---------- */
const state = {
  items: [],          // {id,name,title,type,url,poster,tags,concept,desc,source}
  filter: '전체',
  style: 'grid',
  curation: null,     // {title,summary,picks:[{id,reason}],mode:'ai'|'offline'}
  seq: 0,
};
let wall3dCleanup = null;
const cinema = { list: [], idx: 0, timer: null };

/* ---------- 헬퍼 ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer = null;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.hidden = true, 2600);
}
const getKey = () => (localStorage.getItem('ai_lounge_gemini_key') || '').trim();

/* ---------- 미디어 로드 ---------- */
function extOf(name){
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}
function prettyTitle(name){
  const base = (name || '').replace(/\.[a-z0-9]+$/i, '');
  const t = base.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t || '이름 없음';
}
function autoTag(name, title){
  const hay = ((name || '') + ' ' + (title || '')).toLowerCase();
  const found = [];
  for (const [concept, kws] of Object.entries(CONCEPT_KEYWORDS)){
    if (kws.some(k => hay.includes(k))) found.push(concept);
  }
  return found.length ? found : [DEFAULT_CONCEPT];
}

function addItems(files){
  let added = 0;
  for (const f of files){
    const ext = extOf(f.name || f.webkitRelativePath);
    const type = IMG_EXT.includes(ext) ? 'image' : VID_EXT.includes(ext) ? 'video' : null;
    if (!type) continue;
    const name = f.name;
    const title = prettyTitle(name);
    const tags = autoTag(name, title);
    state.items.push({
      id: 'm' + (++state.seq),
      name, title, type,
      url: URL.createObjectURL(f),
      poster: null,
      tags, concept: tags[0],
      desc: '폴더에서 불러온 미디어입니다.',
      source: 'folder',
    });
    added++;
  }
  return added;
}

async function loadDemo(){
  try{
    const res = await fetch('assets/demo/manifest.json');
    if (!res.ok) throw new Error('manifest');
    const data = await res.json();
    // 기존 데모 제거 후 다시 로드
    state.items = state.items.filter(i => i.source !== 'demo');
    for (const m of data.items){
      state.items.push({
        id: 'm' + (++state.seq),
        name: m.file, title: m.title, type: m.type,
        url: 'assets/demo/' + m.file,
        poster: m.poster ? 'assets/demo/' + m.poster : null,
        tags: m.tags, concept: m.concept || m.tags[0] || DEFAULT_CONCEPT,
        desc: m.desc || '',
        source: 'demo',
      });
    }
    state.filter = '전체'; state.curation = null; hideCuration();
    renderAll();
    toast(`데모 미디어 ${data.items.length}개를 불러왔어요`);
  }catch(e){
    toast('데모를 불러오지 못했어요. 폴더를 직접 열어보세요.');
  }
}

function handleFolderInput(e){
  const files = [...(e.target.files || [])];
  const n = addItems(files);
  e.target.value = '';
  if (n){
    state.filter = '전체'; state.curation = null; hideCuration();
    renderAll();
    toast(`${n}개의 미디어를 불러왔어요`);
  } else toast('영상·이미지 파일이 없어요');
}

/* ---------- 필터 / 칩 ---------- */
function conceptCounts(){
  const map = new Map();
  for (const it of state.items) map.set(it.concept, (map.get(it.concept) || 0) + 1);
  return [...map.entries()].sort((a,b) => b[1]-a[1]);
}
function renderChips(){
  const row = $('#chipRow');
  const counts = conceptCounts();
  const videoN = state.items.filter(i => i.type === 'video').length;
  let html = `<button class="chip${state.filter==='전체'?' active':''}" data-chip="전체">전체<span class="n">${state.items.length}</span></button>`;
  for (const [c, n] of counts){
    html += `<button class="chip${state.filter===c?' active':''}" data-chip="${esc(c)}">${esc(c)}<span class="n">${n}</span></button>`;
  }
  if (videoN) html += `<button class="chip${state.filter==='🎬 영상만'?' active':''}" data-chip="🎬 영상만">🎬 영상만<span class="n">${videoN}</span></button>`;
  if (state.curation) html += `<button class="chip${state.filter==='✨ 선별 결과'?' active':''}" data-chip="✨ 선별 결과">✨ 선별 결과<span class="n">${state.curation.picks.length}</span></button>`;
  row.innerHTML = html;
  row.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    state.filter = b.dataset.chip;
    renderChips(); renderGallery();
  }));
}
function filteredItems(){
  if (state.filter === '전체') return state.items;
  if (state.filter === '🎬 영상만') return state.items.filter(i => i.type === 'video');
  if (state.filter === '✨ 선별 결과' && state.curation){
    const ids = new Set(state.curation.picks.map(p => p.id));
    return state.items.filter(i => ids.has(i.id));
  }
  return state.items.filter(i => i.concept === state.filter);
}

/* ---------- 갤러리 렌더 ---------- */
function cardHTML(it){
  const media = it.type === 'image'
    ? `<img class="thumb" src="${esc(it.url)}" alt="${esc(it.title)}" loading="lazy">`
    : `<video class="thumb" src="${esc(it.url)}"${it.poster?` poster="${esc(it.poster)}"`:''} muted loop playsinline preload="metadata"></video>`;
  return `<article class="card" data-id="${it.id}">
    ${media}
    <span class="type-badge">${it.type === 'video' ? '▶ 영상' : '🖼 이미지'}</span>
    <div class="meta"><h3>${esc(it.title)}</h3><div class="concept">${esc(it.concept)}</div></div>
  </article>`;
}
function filmCardHTML(it){
  const media = it.type === 'image'
    ? `<img class="thumb" src="${esc(it.url)}" alt="${esc(it.title)}" loading="lazy">`
    : `<video class="thumb" src="${esc(it.url)}"${it.poster?` poster="${esc(it.poster)}"`:''} muted loop playsinline preload="metadata"></video>`;
  return `<article class="card" data-id="${it.id}">
    ${media}
    <span class="type-badge">${it.type === 'video' ? '▶ 영상' : '🖼 이미지'}</span>
    <div class="meta"><h3>${esc(it.title)}</h3><div class="concept">${esc(it.concept)}</div>
    <p class="desc">${esc(it.desc)}</p></div>
  </article>`;
}
function bindCards(container){
  container.querySelectorAll('.card').forEach(c => {
    c.addEventListener('click', () => openLightbox(c.dataset.id));
  });
  // 그리드/필름 호버 미리보기 재생
  container.querySelectorAll('video.thumb').forEach(v => {
    const card = v.closest('.card');
    card.addEventListener('mouseenter', () => v.play().catch(()=>{}));
    card.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 0; });
  });
}

function renderGallery(){
  if (wall3dCleanup){ wall3dCleanup(); wall3dCleanup = null; }
  const g = $('#gallery');
  const items = filteredItems();
  $('#emptyState').style.display = state.items.length ? 'none' : 'block';
  g.style.display = state.items.length ? '' : 'none';

  if (state.style === 'cinema'){
    // 시네마는 오버레이로 즉시 실행하고 스타일은 이전으로 복귀
    document.querySelector('#styleSwitch .active')?.classList.remove('active');
    document.querySelector('#styleSwitch [data-style="grid"]')?.classList.add('active');
    state.style = 'grid';
    openCinema();
    renderGallery();
    return;
  }

  g.className = 'gallery fade g-' + (state.style === 'wall3d' ? 'wall' : state.style);

  if (state.style === 'grid'){
    g.innerHTML = items.map(cardHTML).join('') || emptyMsg();
    bindCards(g);
  } else if (state.style === 'masonry'){
    g.innerHTML = items.map(cardHTML).join('') || emptyMsg();
    bindCards(g);
  } else if (state.style === 'film'){
    g.innerHTML = items.map(filmCardHTML).join('') || emptyMsg();
    bindCards(g);
  } else if (state.style === 'wall3d'){
    g.innerHTML = items.length
      ? `<div class="wall-hint">드래그로 회전 · 클릭으로 크게 보기</div>`
      : emptyMsg();
    if (items.length) buildWall3D(g, items);
  }
}
function emptyMsg(){
  return `<div class="empty" style="margin:20px auto"><p>이 필터에 해당하는 미디어가 없어요.</p></div>`;
}
function renderAll(){
  renderChips();
  renderGallery();
  updateAiBadge();
}

/* ---------- 3D 월 (Three.js) ---------- */
function buildWall3D(container, items){
  if (typeof THREE === 'undefined'){ toast('3D 라이브러리를 불러오지 못했어요'); return; }
  const W = container.clientWidth, H = 560;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d0f14, 9, 20);
  const camera = new THREE.PerspectiveCamera(55, W/H, 0.1, 100);
  camera.position.set(0, 0.5, 7.4);
  camera.lookAt(0, 0.2, 0);
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.insertBefore(renderer.domElement, container.firstChild);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const spot = new THREE.SpotLight(0xf5a524, 1.1, 30, Math.PI/5);
  spot.position.set(0, 6, 8); scene.add(spot);

  const group = new THREE.Group(); scene.add(group);
  const loader = new THREE.TextureLoader();
  const list = items.slice(0, 28);
  const R = 9, spread = Math.PI * 1.1;
  const pickMeshes = [];

  list.forEach((it, i) => {
    const ang = list.length === 1 ? 0 : (i/(list.length-1) - 0.5) * spread;
    const pw = 1.9, ph = 1.07;
    const geo = new THREE.PlaneGeometry(pw, ph);
    let tex;
    if (it.type === 'video'){
      const v = document.createElement('video');
      v.src = it.url; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
      v.play().catch(()=>{});
      tex = new THREE.VideoTexture(v);
      tex.minFilter = THREE.LinearFilter;
      it._wallVideo = v;
    } else {
      tex = loader.load(it.url);
    }
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.sin(ang)*R, 0.2, -Math.cos(ang)*R + R - 1.2);
    mesh.lookAt(0, 0.2, 8);
    // 프레임
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(pw+0.1, ph+0.1),
      new THREE.MeshBasicMaterial({ color: 0x232838, side: THREE.DoubleSide })
    );
    frame.position.z = -0.02;
    mesh.add(frame);
    mesh.userData.itemId = it.id;
    group.add(mesh); pickMeshes.push(mesh);
  });

  let targetRot = 0, dragging = false, lastX = 0, moved = 0;
  const el = renderer.domElement;
  const onDown = e => { dragging = true; lastX = e.clientX ?? e.touches?.[0]?.clientX; moved = 0; };
  const onMove = e => {
    if (!dragging) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    const dx = x - lastX; lastX = x; moved += Math.abs(dx);
    targetRot += dx * 0.004;
  };
  const onUp = () => dragging = false;
  el.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const onClick = e => {
    if (moved > 8) return;
    const r = el.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left)/r.width)*2 - 1;
    ptr.y = -((e.clientY - r.top)/r.height)*2 + 1;
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pickMeshes)[0];
    if (hit) openLightbox(hit.object.userData.itemId);
  };
  el.addEventListener('click', onClick);

  let raf = 0, alive = true;
  const animate = () => {
    if (!alive) return;
    group.rotation.y += (targetRot - group.rotation.y) * 0.08;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  };
  animate();

  wall3dCleanup = () => {
    alive = false; cancelAnimationFrame(raf);
    el.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    el.removeEventListener('click', onClick);
    list.forEach(it => { if (it._wallVideo){ it._wallVideo.pause(); it._wallVideo.src=''; delete it._wallVideo; } });
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material){ (o.material.map)?.dispose?.(); o.material.dispose(); }
    });
    renderer.dispose();
    if (el.parentNode) el.parentNode.removeChild(el);
  };
}

/* ---------- 라이트박스 ---------- */
const lb = { list: [], idx: 0 };
function openLightbox(id){
  lb.list = filteredItems();
  lb.idx = Math.max(0, lb.list.findIndex(i => i.id === id));
  renderLb();
  $('#lightbox').hidden = false;
  document.body.style.overflow = 'hidden';
}
function renderLb(){
  const it = lb.list[lb.idx];
  if (!it){ closeLightbox(); return; }
  $('#lbMedia').innerHTML = it.type === 'image'
    ? `<img src="${esc(it.url)}" alt="${esc(it.title)}">`
    : `<video src="${esc(it.url)}" controls autoplay playsinline></video>`;
  $('#lbTitle').textContent = it.title;
  $('#lbTags').innerHTML = [it.concept, ...it.tags.filter(t => t !== it.concept)]
    .map(t => `<span>${esc(t)}</span>`).join('');
  $('#lbDesc').textContent = it.desc || '';
}
function closeLightbox(){
  $('#lightbox').hidden = true;
  $('#lbMedia').innerHTML = '';
  document.body.style.overflow = '';
}
function lbNav(d){
  if (!lb.list.length) return;
  lb.idx = (lb.idx + d + lb.list.length) % lb.list.length;
  renderLb();
}

/* ---------- 시네마 ---------- */
function openCinema(){
  cinema.list = filteredItems();
  if (!cinema.list.length){ toast('보여줄 미디어가 없어요'); return; }
  cinema.idx = 0;
  $('#cinema').hidden = false;
  document.body.style.overflow = 'hidden';
  playCinemaItem();
}
function playCinemaItem(){
  clearTimeout(cinema.timer);
  const it = cinema.list[cinema.idx];
  const stage = $('#cinemaStage');
  stage.innerHTML = '';
  if (it.type === 'image'){
    const img = document.createElement('img');
    img.src = it.url; img.alt = it.title; img.className = 'kenburns';
    stage.appendChild(img);
    cinema.timer = setTimeout(() => cinemaNav(1), 4600);
  } else {
    const v = document.createElement('video');
    v.src = it.url; v.controls = true; v.autoplay = true; v.playsInline = true;
    v.onended = () => cinemaNav(1);
    stage.appendChild(v);
  }
  $('#cinemaTitle').textContent = it.title;
  $('#cinemaTags').innerHTML = [it.concept, ...it.tags.filter(t => t !== it.concept)]
    .map(t => `<span>${esc(t)}</span>`).join('');
  $('#cinemaCount').textContent = `${cinema.idx+1} / ${cinema.list.length}`;
}
function cinemaNav(d){
  if (!cinema.list.length) return;
  cinema.idx = (cinema.idx + d + cinema.list.length) % cinema.list.length;
  playCinemaItem();
}
function closeCinema(){
  clearTimeout(cinema.timer);
  $('#cinema').hidden = true;
  $('#cinemaStage').innerHTML = '';
  document.body.style.overflow = '';
}

/* ---------- 현장이 묻다 ---------- */
function hideCuration(){ $('#curationPanel').hidden = true; }
function showCurationLoading(){
  const p = $('#curationPanel');
  p.hidden = false;
  $('#curationTag').textContent = '⏳ 고르는 중';
  $('#curationTitle').textContent = '미디어를 고르고 있어요…';
  $('#curationSummary').textContent = '';
  $('#curationPicks').innerHTML = '';
  p.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function scoreOffline(q, it){
  const hay = (it.title + ' ' + it.name + ' ' + it.tags.join(' ') + ' ' + it.concept + ' ' + (it.desc||'')).toLowerCase();
  let s = 0;
  // 질문을 2글자 이상 토큰으로 나눔
  const tokens = q.toLowerCase().split(/[\s,?.!~…·/]+/).filter(t => t.length >= 2);
  for (const t of tokens){
    if (hay.includes(t)) s += 3;
    // 컨셉 키워드 사전 매칭
    for (const kws of Object.values(CONCEPT_KEYWORDS)){
      if (kws.some(k => t.includes(k) || k.includes(t)) && kws.some(k => hay.includes(k))) s += 2;
    }
  }
  if (it.type === 'video' && /영상|동영상|video|움직/.test(q)) s += 2;
  return s;
}
function curateOffline(q){
  const scored = state.items
    .map(it => ({ it, s: scoreOffline(q, it) }))
    .filter(x => x.s > 0)
    .sort((a,b) => b.s - a.s)
    .slice(0, 8);
  const picks = scored.map(x => ({ id: x.it.id, reason: `태그 매칭: ${x.it.tags.slice(0,3).join(' · ')}` }));
  const concepts = scored.map(x => x.it.concept);
  const topConcept = concepts.sort((a,b) =>
    concepts.filter(c => c===a).length - concepts.filter(c=>c===b).length).pop();
  return {
    title: topConcept ? `${topConcept} 모음` : '관련 미디어',
    summary: `"${q}" — 질문 속 키워드와 태그가 겹치는 미디어 ${picks.length}개를 골랐어요. (오프라인 키워드 매칭)`,
    picks, mode: 'offline',
  };
}

async function curateWithGemini(q){
  const key = getKey();
  const catalog = state.items.map(i => ({
    file: i.name, title: i.title, type: i.type,
    tags: i.tags, concept: i.concept, desc: i.desc,
  }));
  const prompt = `당신은 스마트팩토리 미디어 큐레이터입니다. 아래 미디어 목록과 사용자의 질문을 보고, 질문에 가장 잘 맞는 미디어를 골라 JSON으로만 답하세요.

미디어 목록:
${JSON.stringify(catalog, null, 1)}

질문: "${q}"

반환 형식 (JSON만, 다른 텍스트 금지):
{"concept":"컨셉 제목(짧게, 예: 로봇·자동화 현장)","summary":"2~3문장으로 왜 이 미디어들을 골랐는지 설명","picks":[{"file":"파일명","reason":"선별 이유 한 문장"}]}
picks는 최대 8개, 관련도 높은 순으로.`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
    { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
        generationConfig:{ responseMimeType:'application/json' } }) }
  );
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
  const byName = new Map(state.items.map(i => [i.name, i]));
  const picks = (parsed.picks || [])
    .map(p => byName.has(p.file) ? { id: byName.get(p.file).id, reason: p.reason || '' } : null)
    .filter(Boolean).slice(0, 8);
  return { title: parsed.concept || 'AI 선별', summary: parsed.summary || '', picks, mode: 'ai' };
}

function renderCuration(c){
  state.curation = c;
  $('#curationTag').textContent = c.mode === 'ai' ? '✨ AI 선별' : '🔌 오프라인 선별';
  $('#curationTitle').textContent = c.title;
  $('#curationSummary').textContent = c.summary;
  const box = $('#curationPicks');
  box.innerHTML = c.picks.map(p => {
    const it = state.items.find(i => i.id === p.id);
    if (!it) return '';
    const media = it.type === 'image'
      ? `<img src="${esc(it.url)}" alt="" loading="lazy">`
      : `<video src="${esc(it.url)}"${it.poster?` poster="${esc(it.poster)}"`:''} muted playsinline preload="metadata"></video>`;
    return `<div class="pick" data-id="${it.id}">${media}
      <div class="pick-title">${esc(it.title)}</div>
      <div class="pick-reason">${esc(p.reason)}</div></div>`;
  }).join('') || '<p style="color:var(--muted);font-size:14px">관련 미디어를 찾지 못했어요. 다른 말로 물어보세요.</p>';
  box.querySelectorAll('.pick').forEach(el =>
    el.addEventListener('click', () => openLightbox(el.dataset.id)));
  renderChips();
}

async function onAsk(){
  const q = $('#askInput').value.trim();
  if (!q){ toast('질문을 입력해 주세요'); return; }
  if (!state.items.length){ toast('먼저 미디어 폴더를 열어주세요'); return; }
  showCurationLoading();
  const key = getKey();
  try{
    const c = key ? await curateWithGemini(q) : curateOffline(q);
    renderCuration(c);
    if (c.mode === 'ai') toast('AI가 컨셉에 맞춰 골랐어요');
  }catch(e){
    console.warn(e);
    const c = curateOffline(q);
    c.summary += ' (AI 호출 실패 — 오프라인으로 대체)';
    renderCuration(c);
    toast('AI 호출에 실패해 오프라인으로 골랐어요');
  }
}

/* ---------- 설정 ---------- */
function updateAiBadge(){
  const b = $('#aiBadge');
  if (getKey()){ b.textContent = '✨ AI 큐레이션'; b.classList.add('on'); b.title = 'Gemini API 키가 설정되어 AI가 큐레이션합니다'; }
  else { b.textContent = '🔌 오프라인 모드'; b.classList.remove('on'); b.title = 'API 키 없음 — 키워드 매칭으로 동작합니다'; }
}

/* ---------- 드래그앤드롭 ---------- */
function setupDrop(){
  let depth = 0;
  window.addEventListener('dragenter', e => { e.preventDefault(); depth++; document.body.style.outline = '2px dashed var(--accent)'; document.body.style.outlineOffset = '-8px'; });
  window.addEventListener('dragleave', e => { e.preventDefault(); if (--depth <= 0){ depth = 0; document.body.style.outline = ''; } });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); depth = 0; document.body.style.outline = '';
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    const n = addItems(files);
    if (n){
      state.filter = '전체'; state.curation = null; hideCuration();
      renderAll();
      toast(`${n}개의 미디어를 불러왔어요`);
    } else toast('영상·이미지 파일이 없어요');
  });
}

/* ---------- 이벤트 ---------- */
function init(){
  $('#btnFolder').addEventListener('click', () => $('#folderInput').click());
  $('#btnEmptyFolder').addEventListener('click', () => $('#folderInput').click());
  $('#btnFiles').addEventListener('click', () => $('#fileInput').click());
  $('#folderInput').addEventListener('change', handleFolderInput);
  $('#fileInput').addEventListener('change', handleFolderInput);
  $('#btnDemo').addEventListener('click', loadDemo);
  $('#btnEmptyDemo').addEventListener('click', loadDemo);

  $('#btnAsk').addEventListener('click', onAsk);
  $('#askInput').addEventListener('keydown', e => { if (e.key === 'Enter') onAsk(); });

  $('#styleSwitch').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    document.querySelector('#styleSwitch .active')?.classList.remove('active');
    b.classList.add('active');
    state.style = b.dataset.style;
    renderGallery();
  }));

  $('#btnCurationClose').addEventListener('click', () => { state.curation = null; hideCuration(); renderChips(); });
  $('#btnClearCuration').addEventListener('click', () => { state.curation = null; state.filter = '전체'; hideCuration(); renderAll(); });
  $('#btnApplyCuration').addEventListener('click', () => { state.filter = '✨ 선별 결과'; renderChips(); renderGallery(); $('#gallery').scrollIntoView({behavior:'smooth'}); });

  $('#lbClose').addEventListener('click', closeLightbox);
  $('#lbPrev').addEventListener('click', () => lbNav(-1));
  $('#lbNext').addEventListener('click', () => lbNav(1));
  $('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') closeLightbox(); });

  $('#cinemaPrev').addEventListener('click', () => cinemaNav(-1));
  $('#cinemaNext').addEventListener('click', () => cinemaNav(1));
  $('#cinemaClose').addEventListener('click', closeCinema);

  document.addEventListener('keydown', e => {
    if (!$('#lightbox').hidden){
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') lbNav(-1);
      if (e.key === 'ArrowRight') lbNav(1);
    }
    if (!$('#cinema').hidden){
      if (e.key === 'Escape') closeCinema();
      if (e.key === 'ArrowLeft') cinemaNav(-1);
      if (e.key === 'ArrowRight') cinemaNav(1);
    }
    if (e.key === 'Escape' && !$('#settingsModal').hidden) $('#settingsModal').hidden = true;
  });

  // 설정 모달
  $('#btnSettings').addEventListener('click', () => {
    $('#apiKeyInput').value = getKey();
    $('#settingsModal').hidden = false;
  });
  $('#btnSettingsClose').addEventListener('click', () => $('#settingsModal').hidden = true);
  $('#settingsModal').addEventListener('click', e => { if (e.target.id === 'settingsModal') e.target.hidden = true; });
  $('#btnSaveKey').addEventListener('click', () => {
    localStorage.setItem('ai_lounge_gemini_key', $('#apiKeyInput').value.trim());
    $('#settingsModal').hidden = true;
    updateAiBadge();
    toast(getKey() ? 'AI 큐레이션이 켜졌어요' : '키가 비어 있어 오프라인 모드예요');
  });
  $('#btnClearKey').addEventListener('click', () => {
    localStorage.removeItem('ai_lounge_gemini_key');
    $('#apiKeyInput').value = '';
    updateAiBadge();
    toast('키를 지웠어요 (오프라인 모드)');
  });

  setupDrop();
  renderAll();
}
document.addEventListener('DOMContentLoaded', init);
