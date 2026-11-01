// 梦境换肤 · 浏览器控制台（macOS 版的界面；Windows 也能用）。
// 只监听 127.0.0.1 的随机端口，带一次性令牌；所有动作都转给 skin-cherry.mjs 命令行，和 Windows 总控台走同一套逻辑。
//   node panel.mjs [--no-open]
// 页面关掉约 2 分钟后自动退出。
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, resolve, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootDir } from './lib/cherry-env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'skin-cherry.mjs');
const TOKEN = randomBytes(16).toString('hex');
const ROOT = resolve(rootDir());
const UPLOADS = join(ROOT, 'uploads');
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const STYLES = ['全部', '二次元', '真人', '风景', '城市', '国风', '游戏影视', '科幻', '极简', '萌趣', '其他'];

// 跑一条 skin-cherry.mjs 命令。apply 会拉起常驻 watch 子进程，所以等 exit 而不是 close。
function run(args, timeout = 150000) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, timeout);
    child.on('exit', (code) => { clearTimeout(timer); setTimeout(() => done({ code: code ?? 1, out, err }), 50); });
    child.on('error', (e) => { clearTimeout(timer); done({ code: 1, out, err: String(e.message) }); });
  });
}
const firstJson = (s) => { const l = String(s).split('\n').find((x) => x.trim().startsWith('{')); try { return l ? JSON.parse(l) : null; } catch { return null; } };
const lines = (s) => String(s).split('\n').map((x) => x.trim()).filter((x) => /^(SUCCESS|FAILED|UNCERTAIN|NEEDS_RESTART|WARN|ERROR):/.test(x));
const appArg = (q) => (q.get('app') === 'zcode' ? 'zcode' : 'cherry');

async function status(app) {
  const r = await run(['status', '--app', app], 30000);
  let j = null; try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch {}
  return { running: !!j?.running, port: j?.debugPort || 0, skin: !!(j?.running && j?.debugPort && j?.skinActive), exe: j?.exe || null, preset: j?.preset || '' };
}

async function body(req, limit) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw new Error('文件太大'); chunks.push(c); }
  return Buffer.concat(chunks);
}

function sendJson(res, obj, code = 200) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }

let lastPing = Date.now();
const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://127.0.0.1');
    const q = u.searchParams;
    if (u.pathname === '/') {
      if (q.get('t') !== TOKEN) { res.writeHead(403); res.end('forbidden'); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(PAGE.replace('__TOKEN__', TOKEN).replace('__STYLES__', JSON.stringify(STYLES)));
      return;
    }
    if (q.get('t') !== TOKEN && req.headers['x-token'] !== TOKEN) { res.writeHead(403); res.end('forbidden'); return; }
    lastPing = Date.now();
    const app = appArg(q);
    switch (u.pathname) {
      case '/api/ping': return sendJson(res, { ok: true });
      case '/api/status': return sendJson(res, await status(app));
      case '/api/presets': {
        const r = await run(['presets', '--app', app], 30000);
        return sendJson(res, firstJson(r.out) || { palettes: [] });
      }
      case '/api/gallery': {
        const a = ['gallery-list', '--app', app, '--sort', q.get('sort') || 'popular', '--offset', String(Number(q.get('offset')) || 0), '--limit', '24'];
        if (q.get('q')) a.push('--q', q.get('q').slice(0, 40));
        if (q.get('style') && STYLES.includes(q.get('style')) && q.get('style') !== '全部') a.push('--style', q.get('style'));
        const r = await run(a, 120000);
        return sendJson(res, firstJson(r.out) || { ok: false, msg: '主题库没有响应' });
      }
      case '/api/apply': {
        const a = ['apply', '--app', app, '--preset', String(q.get('preset') || 'ink-gold')];
        if (q.get('gallery') === '1') {
          const g = await run(['gallery-get', '--app', app, '--id', String(q.get('preset'))], 120000);
          const gj = firstJson(g.out);
          if (!gj?.ok) return sendJson(res, { code: 1, lines: ['FAILED: ' + (gj?.msg || '下载主题失败')] });
        }
        const img = q.get('image');
        if (img) {
          const p = resolve(img);
          if (!p.startsWith(UPLOADS + sep) || !existsSync(p)) return sendJson(res, { code: 1, lines: ['FAILED: 壁纸文件不见了，请重新选择'] });
          a.push('--image', p);
        }
        if (q.get('restart') === '1') a.push('--restart');
        const r = await run(a);
        return sendJson(res, { code: r.code, lines: lines(r.out + '\n' + r.err) });
      }
      case '/api/launch': { const r = await run(['launch', '--restart', '--app', app]); return sendJson(res, { code: r.code, lines: lines(r.out + '\n' + r.err) }); }
      case '/api/restore': { const r = await run(['restore', '--app', app]); return sendJson(res, { code: r.code, lines: lines(r.out + '\n' + r.err) }); }
      case '/api/shortcut': { const r = await run(['shortcut', '--app', app], 30000); return sendJson(res, { code: r.code, lines: lines(r.out + '\n' + r.err) }); }
      case '/api/upload': {
        if (req.method !== 'POST') return sendJson(res, { ok: false }, 405);
        const buf = await body(req, 40 * 1024 * 1024);
        let ext = '';
        if (buf[0] === 0xff && buf[1] === 0xd8) ext = '.jpg';
        else if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) ext = '.png';
        else if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') ext = '.webp';
        if (!ext) return sendJson(res, { ok: false, msg: '只支持 JPG / PNG / WebP' });
        mkdirSync(UPLOADS, { recursive: true });
        const f = join(UPLOADS, createHash('sha256').update(buf).digest('hex').slice(0, 16) + ext);
        if (!existsSync(f)) writeFileSync(f, buf);
        return sendJson(res, { ok: true, path: f });
      }
      case '/file': {
        // 只给数据目录里的图片（缩略图、主题库壁纸、上传的壁纸）。
        const p = resolve(String(q.get('p') || ''));
        if (!p.startsWith(ROOT + sep) || !MIME[extname(p).toLowerCase()] || !existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()], 'cache-control': 'max-age=3600' });
        createReadStream(p).pipe(res);
        return;
      }
      case '/api/quit': sendJson(res, { ok: true }); setTimeout(() => process.exit(0), 200); return;
      default: res.writeHead(404); res.end();
    }
  } catch (e) {
    try { sendJson(res, { code: 1, ok: false, lines: ['ERROR: ' + e.message], msg: e.message }, 500); } catch {}
  }
});

server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/?t=${TOKEN}`;
  console.log('梦境换肤控制台：' + url);
  if (!process.argv.includes('--no-open')) {
    if (process.platform === 'darwin') execFile('/usr/bin/open', [url], () => {});
    else if (process.platform === 'win32') execFile('cmd.exe', ['/c', 'start', '', url.replace(/&/g, '^&')], { windowsHide: true }, () => {});
    else execFile('xdg-open', [url], () => {});
  }
});
// 页面关了就退出（页面每 20 秒 ping 一次）。
setInterval(() => { if (Date.now() - lastPing > 120000) process.exit(0); }, 15000).unref();

const PAGE = String.raw`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>梦境换肤</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#141418;--card:#1e1e25;--hover:#2a2a33;--text:#ece8df;--muted:#9a968e;--gold:#d6b266;--green:#5fbf8f;--red:#e0716b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
header{display:flex;align-items:center;gap:16px;padding:16px 24px;border-bottom:1px solid #26262e;position:sticky;top:0;background:var(--bg);z-index:2}
h1{font-size:20px;margin:0;color:var(--gold)}h1 small{color:var(--muted);font-weight:400;font-size:12px;margin-left:6px}
.seg,.chips{display:flex;gap:6px;flex-wrap:wrap}.seg button,.chips button,.btn{border:1px solid #33333d;background:var(--card);color:var(--muted);border-radius:999px;padding:6px 14px;cursor:pointer;font:inherit}
.seg button.on,.chips button.on{color:var(--gold);border-color:var(--gold);background:#2b2618}.btn{border-radius:8px;color:var(--text)}.btn:hover{background:var(--hover)}.btn.gold{background:var(--gold);color:#1a1408;border-color:var(--gold)}
#state{color:var(--muted);font-size:13px}#state b{font-weight:500}main{padding:16px 24px 120px;max-width:1180px;margin:0 auto}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-top:12px}
.tile{background:var(--card);border-radius:12px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:.15s}.tile:hover{border-color:#44444f}.tile.on{border-color:var(--gold)}
.tile .pic{height:104px;background-size:cover;background-position:center;position:relative}.tile .sw{position:absolute;left:8px;bottom:8px;display:flex;gap:4px}.tile .sw i{width:14px;height:14px;border-radius:50%;border:1px solid #0006}
.tile .nm{padding:8px 10px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tile .nm span{color:var(--muted);font-size:11px;margin-left:4px}
input[type=search]{background:var(--card);border:1px solid #33333d;color:var(--text);border-radius:8px;padding:7px 10px;width:220px;font:inherit}
#log{position:fixed;left:0;right:0;bottom:0;background:#0f0f12ee;border-top:1px solid #26262e;padding:10px 24px;font-size:13px;max-height:110px;overflow:auto}
#log div{margin:2px 0}.ok{color:var(--green)}.bad{color:var(--red)}.warn{color:var(--gold)}#wall{color:var(--muted);font-size:13px}
</style></head><body>
<header><h1>梦境换肤<small>Dream Skin</small></h1><div class="seg" id="apps"><button data-a="cherry" class="on">Cherry Studio</button><button data-a="zcode">ZCode</button></div>
<span id="state">检测中…</span><span style="flex:1"></span>
<button class="btn" id="launch">用皮肤启动</button><button class="btn" id="restore">还原原版</button><button class="btn" id="shortcut">桌面快捷方式</button><button class="btn" id="quit">退出</button></header>
<main>
<div class="row"><div class="seg" id="tabs"><button data-t="all" class="on">全部</button><button data-t="mine">★ 我的</button><button data-t="dark">夜</button><button data-t="light">昼</button><button data-t="gallery">主题库</button></div>
<span style="flex:1"></span><label class="btn">选择壁纸…<input type="file" id="file" accept="image/jpeg,image/png,image/webp" hidden></label><button class="btn" id="nowall">不用壁纸</button><span id="wall">未选壁纸（主题库主题自带壁纸）</span></div>
<div id="gbar" hidden><div class="row"><div class="seg" id="sort"><button data-s="popular" class="on">热门</button><button data-s="favorites">收藏</button><button data-s="recent">最新</button></div>
<input type="search" id="q" placeholder="搜索主题"><button class="btn" id="go">搜索</button></div><div class="chips" id="styles"></div></div>
<div class="grid" id="grid"></div><div class="row" style="justify-content:center"><button class="btn" id="more" hidden>加载更多</button></div>
</main><div id="log"></div>
<script>
const T='__TOKEN__',STYLES=__STYLES__;let app='cherry',tab='all',sort='popular',style='全部',wall='',presets=[],gItems=[],gTotal=0,current='',busy=false;
const $=s=>document.querySelector(s);const api=(p,o={})=>fetch(p+(p.includes('?')?'&':'?')+'t='+T+'&app='+app,o).then(r=>r.json());
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function log(l){const d=document.createElement('div');d.textContent=l;d.className=/^SUCCESS/.test(l)?'ok':/^(FAILED|ERROR)/.test(l)?'bad':/^(WARN|UNCERTAIN|NEEDS)/.test(l)?'warn':'';$('#log').prepend(d)}
function seg(id,attr,cb){document.querySelectorAll(id+' button').forEach(b=>b.onclick=()=>{document.querySelectorAll(id+' button').forEach(x=>x.classList.toggle('on',x===b));cb(b.dataset[attr])})}
async function refresh(){const s=await api('/api/status');current=s.preset||'';$('#state').innerHTML=!s.exe?'<b class="bad">● 没找到应用</b>':s.skin?'<b class="ok">● 皮肤生效中</b>':s.running?'<b>● 运行中（原版）</b>':'<b>● 未运行</b>';draw()}
async function loadPresets(){const j=await api('/api/presets');presets=j.palettes||[];draw()}
async function loadGallery(more){if(!more){gItems=[];gTotal=-1;draw()}const p=new URLSearchParams({sort,offset:gItems.length,style,q:$('#q').value.trim()});
 const j=await api('/api/gallery?'+p);if(!j.ok){log('FAILED: '+(j.msg||'主题库加载失败'));return}gItems=gItems.concat(j.palettes||[]);gTotal=j.total;draw()}
function tile(p){const img=p.image?'url("/file?t='+T+'&p='+encodeURIComponent(p.image)+'")':'linear-gradient(135deg,'+p.bg+','+p.panel+' 60%,'+p.accent+')';
 return '<div class="tile'+(p.key===current?' on':'')+'" data-k="'+esc(p.key)+'" data-g="'+(p.group==='gallery'?1:0)+'"><div class="pic" style="background-image:'+img+'"><div class="sw"><i style="background:'+p.bg+'"></i><i style="background:'+p.accent+'"></i><i style="background:'+p.text+'"></i></div></div><div class="nm">'+esc(p.name)+'<span>'+esc(p.group==='gallery'?(p.author||''):(p.groupName||''))+'</span></div></div>'}
function draw(){const g=tab==='gallery';$('#gbar').hidden=!g;let list=g?gItems:presets.filter(p=>tab==='all'||(tab==='mine'?p.group==='mine':p.group!=='mine'&&(tab==='dark'?p.dark:!p.dark)));
 $('#grid').innerHTML=list.length?list.map(tile).join(''):'<div style="color:var(--muted)">'+(g&&gTotal<0?'载入中…':tab==='mine'?'还没有自己的皮肤（在 Windows 版保存的皮肤不会自动带过来）':'没有结果')+'</div>';
 $('#more').hidden=!(g&&gItems.length<gTotal);document.querySelectorAll('.tile').forEach(t=>t.onclick=()=>choose(t.dataset.k,t.dataset.g==='1'))}
async function act(path,label){if(busy)return;busy=true;log(label+'…');try{const r=await api(path);(r.lines||[]).forEach(log);if(!r.lines?.length)log(r.code===0?'SUCCESS: 完成':'FAILED: 退出码 '+r.code);return r}finally{busy=false;refresh()}}
async function choose(key,gallery,restart){const p=new URLSearchParams({preset:key});if(gallery)p.set('gallery','1');if(wall)p.set('image',wall);if(restart)p.set('restart','1');
 const r=await act('/api/apply?'+p,'应用 '+key);if(r&&r.code===3&&confirm((r.lines||[]).join('\n')+'\n\n现在重启它吗？'))choose(key,gallery,true)}
seg('#apps','a',a=>{app=a;refresh();loadPresets();if(tab==='gallery')loadGallery(false)});seg('#tabs','t',t=>{tab=t;if(t==='gallery'&&!gItems.length)loadGallery(false);draw()});
seg('#sort','s',s=>{sort=s;loadGallery(false)});$('#styles').innerHTML=STYLES.map((s,i)=>'<button data-y="'+s+'"'+(i?'':' class="on"')+'>'+s+'</button>').join('');seg('#styles','y',y=>{style=y;loadGallery(false)});
$('#go').onclick=()=>loadGallery(false);$('#q').onkeydown=e=>{if(e.key==='Enter')loadGallery(false)};$('#more').onclick=()=>loadGallery(true);
$('#launch').onclick=()=>act('/api/launch','用上次的皮肤启动');$('#restore').onclick=()=>act('/api/restore','还原');$('#shortcut').onclick=()=>act('/api/shortcut','创建快捷方式');
$('#quit').onclick=async()=>{await api('/api/quit');document.body.innerHTML='<p style="padding:40px;color:#9a968e">梦境换肤已退出，可以关掉这个页面。</p>'};
$('#nowall').onclick=()=>{wall='';$('#wall').textContent='未选壁纸（主题库主题自带壁纸）'};
$('#file').onchange=async e=>{const f=e.target.files[0];if(!f)return;const j=await fetch('/api/upload?t='+T,{method:'POST',body:f}).then(r=>r.json());if(j.ok){wall=j.path;$('#wall').textContent='壁纸：'+f.name+'（再点一个主题生效）'}else log('FAILED: '+j.msg)};
setInterval(()=>api('/api/ping'),20000);refresh();loadPresets();
</script></body></html>`;
