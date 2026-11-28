/* Sacola salva no aparelho, estoque, cupom e pedidos na conta. Os preços cobrados vêm sempre do banco. */
(() => {
const L = window.LOJA, KEY = 'rc_bag', MAX = 10;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
let stock = null;                      // só é consultado com as vendas abertas
const vkey = (id, c, s) => id + '|' + c + '|' + s;
const limit = (p, c, s) => Math.min(MAX, stock ? stock.get(vkey(p.id, c, s)) || 0 : MAX);
async function loadStock() {
  if (!L.vendasAtivas) return;
  try {
    const r = await fetch(L.supabaseUrl + '/rest/v1/product_variants?select=product_id,color,size,stock,available', {headers:{apikey: L.supabaseKey}});
    if (!r.ok) throw 0;
    stock = new Map((await r.json()).map(v => [vkey(v.product_id, v.color, v.size), v.available ? v.stock : 0]));
  } catch { stock = null; toast('Não foi possível conferir o estoque agora'); }
}

/* guarda só o código, cor, tamanho e quantidade: o preço nunca vem do aparelho */
function persist() { try { localStorage.setItem(KEY, JSON.stringify(bag.map(b => ({id: b.p.id, c: b.c, s: b.s, q: b.q})))); } catch {} }
function restore() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(KEY)) || []; } catch {}
  bag = (Array.isArray(saved) ? saved : []).slice(0, 40).flatMap(i => {
    const p = P.find(x => x.id === i?.id), q = Math.min(MAX, Math.floor(i?.q));
    return p && COLORS[i.c] && ['P','M','G','GG'].includes(i.s) && q > 0 ? [{p, c: i.c, s: i.s, q}] : [];
  });
}

const draw = renderBag;
renderBag = function () {
  draw();                              // atualiza contador e total
  persist();
  const box = $('#lines');
  box.querySelectorAll('.ln').forEach((row, i) => {
    const b = bag[i];
    row.querySelector('small').textContent = `Tamanho ${b.s} · ${brl(b.p.price)} cada`;
    row.querySelector('.qty').before(el('small', 'sub', 'Subtotal: ' + brl(b.q * b.p.price)));
    row.querySelector('[data-a="-"]').setAttribute('aria-label', 'Diminuir quantidade');
    const plus = row.querySelector('[data-a="+"]');
    plus.setAttribute('aria-label', 'Aumentar quantidade');
    plus.disabled = b.q >= limit(b.p, b.c, b.s);
  });
  if (bag.length) box.append(el('p', 'frete', 'Frete não incluído no total.'));
};
/* confirma antes de tirar a peça (no X ou ao diminuir de 1) */
$('#lines').addEventListener('click', e => {
  const a = e.target.closest('[data-a]'); if (!a) return;
  const row = a.closest('.ln'), i = [...$('#lines').querySelectorAll('.ln')].indexOf(row), b = bag[i];
  if (b && (a.dataset.a === 'x' || (a.dataset.a === '-' && b.q === 1)) && !confirm('Remover esta peça da sacola?')) e.stopPropagation();
}, true);

const add = addToBag;
addToBag = function (p, c, s, from) {
  const have = bag.find(b => b.p === p && b.c === c && b.s === s)?.q || 0;
  if (have >= limit(p, c, s)) { toast(stock && !limit(p, c, s) ? 'Tamanho esgotado' : 'Limite de unidades dessa peça'); return false; }
  add(p, c, s, from);
};
/* esgotados aparecem riscados */
function markSizes() {
  if (!stock || !curP) return;
  $$('#sizes .sz').forEach(b => {
    const out = !limit(curP, curP.color, b.textContent);
    b.disabled = out; b.classList.toggle('esgotado', out);
    b.setAttribute('aria-label', b.textContent + (out ? ' (esgotado)' : ''));
    if (out && selSize === b.textContent) { selSize = null; b.classList.remove('sel'); }
  });
}
$('#swatches').addEventListener('click', () => setTimeout(markSizes));
const openP = openProduct;
openProduct = function (p) { openP(p); markSizes(); loadStock().then(markSizes); };

/* um toque por vez no botão de adicionar */
let adding = false;
$('#addBtn').addEventListener('click', e => {
  if (adding) { e.stopImmediatePropagation(); return; }
  if (selSize) { adding = true; setTimeout(() => adding = false, 1500); }
}, true);

/* cupom: aparece só com as vendas abertas; o desconto é calculado e conferido no banco */
if (L.vendasAtivas) {
  const wrap = el('label', 'cupom', 'Cupom de desconto (aplicado no pagamento)'), input = el('input');
  input.id = 'cupom'; input.maxLength = 30; input.autocomplete = 'off';
  wrap.append(input); $('.dfoot').prepend(wrap);
}

/* ---------- pedidos na conta ---------- */
const KIND = {cancelamento:'Cancelamento', troca:'Troca', devolucao:'Devolução'};
const REQ = {aberto:'em análise', aprovado:'aprovado', recusado:'recusado', concluido:'concluído'};
let loading = 0;
async function renderOrders() {
  let box = $('#acOrders');
  if (!box) { box = el('div'); box.id = 'acOrders'; $('#acList').after(box); }
  const mine = ++loading;
  box.replaceChildren(el('p', 'frete', 'Carregando pedidos…'));
  let orders, reqs;
  try {
    [orders, reqs] = await Promise.all([
      rest('orders?select=id,status,total_cents,created_at,tracking_code,carrier,order_items(product_name,color,size,quantity)&order=created_at.desc&limit=20'),
      rest('order_requests?select=order_id,kind,status,admin_reply&order=created_at.desc&limit=100')]);
  } catch {
    if (mine !== loading) return;
    const again = el('button', 'alink', 'Tentar de novo'); again.type = 'button'; again.onclick = renderOrders;
    box.replaceChildren(el('p', 'frete', 'Não foi possível carregar os pedidos.'), again); return;
  }
  if (mine !== loading) return;
  box.replaceChildren();
  const last = $('#acList').lastElementChild;   // a lista completa substitui o resumo
  if (orders?.length && last?.previousElementSibling?.textContent === 'Pedidos') { last.previousElementSibling.remove(); last.remove(); }
  if (orders?.length) box.append(el('h3', null, 'Meus pedidos'));
  (orders || []).forEach(o => {
    const d = el('details', 'ped');
    d.append(el('summary', null, `Nº ${o.id} · ${brl(o.total_cents / 100)} · ${STATUS[o.status] || o.status}`));
    d.append(el('p', null, new Date(o.created_at).toLocaleDateString('pt-BR')));
    (o.order_items || []).forEach(i => d.append(el('p', null, `${i.quantity}× ${i.product_name} ${i.color} ${i.size}`)));
    if (o.tracking_code) d.append(el('p', null, `Rastreio${o.carrier ? ' (' + o.carrier + ')' : ''}: ${o.tracking_code}`));
    const sent = (reqs || []).filter(r => r.order_id === o.id);
    sent.forEach(r => d.append(el('p', null, `${KIND[r.kind]} ${REQ[r.status]}${r.admin_reply ? ': ' + r.admin_reply : ''}`)));
    const kinds = ({aguardando_pagamento:['cancelamento'], pago:['cancelamento'], enviado:['troca','devolucao'], entregue:['troca','devolucao']}[o.status] || []).filter(k => !sent.some(r => r.kind === k && r.status === 'aberto'));
    if (kinds.length) {
      const f = el('form'), sel = el('select'), txt = el('textarea'), btn = el('button', 'alink', 'Enviar pedido de análise');
      kinds.forEach(k => sel.add(new Option(KIND[k], k))); sel.setAttribute('aria-label', 'Tipo de solicitação');
      txt.required = true; txt.minLength = 5; txt.maxLength = 1000; txt.placeholder = 'Conte o motivo'; txt.setAttribute('aria-label', 'Motivo');
      f.append(sel, txt, btn);
      f.onsubmit = async e => {
        e.preventDefault(); if (btn.disabled) return; btn.disabled = true;
        try { await rest('order_requests', {method:'POST', body:{order_id: o.id, kind: sel.value, reason: txt.value.trim()}}); toast('Solicitação enviada'); renderOrders(); }
        catch { toast('Não foi possível enviar. Tente de novo.'); btn.disabled = false; }
      };
      d.append(f);
    }
    box.append(d);
  });
}
const account = openAccount;
openAccount = async function () { await account(); if (authUser && $('#auth').classList.contains('on')) renderOrders(); };

/* volta do Mercado Pago: a confirmação de verdade vem do servidor, não deste endereço */
const back = new URLSearchParams(location.search).get('payment');
restore();
if (back === 'success' || back === 'pending') { bag = []; setTimeout(() => toast('Acompanhe a confirmação do pagamento em Minha conta'), 3000); }
if (back) history.replaceState(null, '', location.pathname);
renderBag();
addEventListener('storage', e => { if (e.key === KEY) { restore(); renderBag(); } });
addEventListener('offline', () => toast('Você está sem internet'));
loadStock().then(renderBag);
})();
