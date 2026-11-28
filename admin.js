/* Painel Resider. A segurança fica no banco (RLS + 2 etapas); esta tela só mostra o que o servidor libera. */
(() => {
/* o painel só abre em computador; em celular e tablet volta para a loja (conveniência, não é a proteção: essa é a senha + 2 etapas + banco) */
if (!matchMedia('(hover:hover) and (pointer:fine)').matches) { location.replace('/'); return; }
const L = window.LOJA, KEY = 'rc_admin';
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = c => ((c || 0) / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const day = d => d ? new Date(d).toLocaleDateString('pt-BR') : '';
const cents = v => Math.round(Number(String(v).trim().replace(/\./g, '').replace(',', '.')) * 100);
const dec = c => ((c || 0) / 100).toFixed(2).replace('.', ',');
const NAMES = {aguardando_pagamento:'Aguardando pagamento', pago:'Pago', enviado:'Enviado', entregue:'Entregue', cancelado:'Cancelado', aberto:'Aberto', aprovado:'Aprovado', recusado:'Recusado', concluido:'Concluído'};
const tag = s => `<span class="tag ${esc(s)}">${esc(NAMES[s] || s)}</span>`;
const PAID = ['pago','enviado','entregue'];
let ses = null, timer;
try { ses = JSON.parse(sessionStorage.getItem(KEY)); } catch {}

function say(t) { $('#msg').textContent = t; clearTimeout(timer); timer = setTimeout(() => $('#msg').textContent = '', 5000); }
function save(s) {
  ses = s && {access: s.access_token, refresh: s.refresh_token, exp: Date.now() + (s.expires_in || 3600) * 1000};
  try { ses ? sessionStorage.setItem(KEY, JSON.stringify(ses)) : sessionStorage.removeItem(KEY); } catch {}
}
async function call(path, {method = 'GET', body, auth = true, headers = {}} = {}) {
  if (auth && ses && Date.now() > ses.exp - 60000) {
    try { save(await call('/auth/v1/token?grant_type=refresh_token', {method:'POST', auth:false, body:{refresh_token: ses.refresh}})); }
    catch { save(null); login(); throw new Error('Sessão encerrada. Entre de novo.'); }
  }
  let r;
  try {
    r = await fetch(L.supabaseUrl + path, {method, headers: {apikey: L.supabaseKey, 'Content-Type':'application/json', ...(auth && ses ? {Authorization:'Bearer ' + ses.access} : {}), ...headers}, body: body && JSON.stringify(body)});
  } catch { throw new Error('Sem conexão. Confira a internet e tente de novo.'); }
  const data = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(data?.message || data?.msg || 'Não foi possível concluir.'), {status: r.status});
  return data;
}
const list = q => call('/rest/v1/' + q);
const write = async (q, method, body) => {
  const out = await call('/rest/v1/' + q, {method, body, headers: {Prefer:'return=representation'}});
  if (!out?.length) throw new Error('Nada foi alterado. Entre de novo e tente outra vez.');
  return out;
};
/* um envio por vez, sem clique duplo */
async function busy(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true;
  try { await fn(); } catch (e) { say(e.message); } finally { btn.disabled = false; }
}
function onSubmit(form, fn) { form.addEventListener('submit', e => { e.preventDefault(); busy($('button:not([type=button])', form), () => fn(Object.fromEntries(new FormData(form)))); }); }

/* ---------- entrada: senha + código de 2 etapas ---------- */
function gate(html) { $('#app').hidden = true; $('#view').innerHTML = ''; $('#gate').hidden = false; $('#gbox').innerHTML = html; }
async function logout() { try { await call('/auth/v1/logout', {method:'POST'}); } catch {} save(null); login(); }
function login() {
  gate(`<h1>Painel Resider</h1><form><label>E-mail<input name="email" type="email" autocomplete="username" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><button>Entrar</button></form><p class="mut">Acesso restrito à loja.</p>`);
  onSubmit($('#gbox form'), async f => {
    try { save(await call('/auth/v1/token?grant_type=password', {method:'POST', auth:false, body:f})); }
    catch (e) { throw new Error(e.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos.' : e.status ? 'E-mail ou senha inválidos.' : e.message); }
    await second();
  });
}
async function second() {
  const user = await call('/auth/v1/user');
  const factors = (user.factors || []).filter(f => f.factor_type === 'totp');
  const verified = factors.find(f => f.status === 'verified');

  async function enroll() {
    const factor = await call('/auth/v1/factors', {method:'POST', body:{factor_type:'totp', friendly_name:'Painel Resider'}});
    let qr = factor.totp.qr_code;
    if (!qr.startsWith('data:')) qr = 'data:image/svg+xml;utf8,' + encodeURIComponent(qr);
    gate(`<h1>Configurar autenticador</h1><p class="mut">Abra o Google Authenticator ou Microsoft Authenticator no celular e escaneie este QR Code. O aplicativo mostrará um código de 6 dígitos, que muda aproximadamente a cada 30 segundos.</p><img class="qr" alt="QR Code para configurar o autenticador" src="${esc(qr)}"><p class="mut">Mantenha esta tela aberta até escanear o código e confirmar o primeiro número gerado.</p><form><label>Código temporário de 6 dígitos<input name="code" placeholder="000000" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label><button>Confirmar configuração</button></form>`);
    onSubmit($('#gbox form'), async data => {
      const ch = await call(`/auth/v1/factors/${factor.id}/challenge`, {method:'POST', body:{}});
      let verifiedSession;
      try { verifiedSession = await call(`/auth/v1/factors/${factor.id}/verify`, {method:'POST', body:{challenge_id:ch.id, code:data.code}}); }
      catch { throw new Error('Código incorreto ou vencido. Confira o aplicativo e tente novamente.'); }
      save(verifiedSession);
      if (verified) await call('/auth/v1/factors/' + verified.id, {method:'DELETE'}).catch(() => {});
      await enter();
    });
  }

  if (!verified) {
    await enroll();
    return;
  }

  gate(`<h1>Verificação em duas etapas</h1><p class="mut">Se você ainda precisa do QR Code, toque no botão abaixo para configurar o Google Authenticator ou Microsoft Authenticator. Se já configurou, informe o código atual de 6 dígitos.</p><button type="button" id="showQr">GERAR QR CODE AGORA</button><form><label>Código temporário<input name="code" placeholder="000000" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label><button>Confirmar código</button></form>`);
  onSubmit($('#gbox form'), async data => {
    const ch = await call(`/auth/v1/factors/${verified.id}/challenge`, {method:'POST', body:{}});
    try { save(await call(`/auth/v1/factors/${verified.id}/verify`, {method:'POST', body:{challenge_id:ch.id, code:data.code}})); }
    catch { throw new Error('Código incorreto ou vencido.'); }
    await enter();
  });
  $('#showQr').addEventListener('click', async () => { const btn = $('#showQr'); btn.disabled = true; btn.textContent = 'GERANDO QR CODE...'; try { await enroll(); } catch (e) { btn.disabled = false; btn.textContent = 'TENTAR GERAR QR CODE NOVAMENTE'; say('Não foi possível gerar o QR Code: ' + e.message); } });
}
async function enter() {
  if (await call('/rest/v1/rpc/am_i_admin', {method:'POST', body:{}}) !== true) {
    await logout(); say('Esta conta não tem acesso ao painel.'); return;
  }
  $('#gate').hidden = true; $('#gbox').innerHTML = ''; $('#app').hidden = false;
  show(current);
}

/* ---------- telas ---------- */
/* anotações ficam numa tabela que só o admin lê */
const note = o => [].concat(o.order_notes || [])[0]?.note || '';
const orders = () => list('orders?select=*,order_items(*),order_notes(note)&order=created_at.desc&limit=1000');
const card = (title, html) => `<div class="card"><h2>${title}</h2>${html}</div>`;
const table = (head, rows, empty = 'Nada por aqui ainda.') => rows.length ? `<div class="scroll"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="mut">${empty}</p>`;
const kpis = a => `<div class="kpis">${a.map(([n, v]) => `<div class="card"><span>${n}</span><strong>${v}</strong></div>`).join('')}</div>`;
const sum = a => a.reduce((t, o) => t + o.total_cents, 0);
const key = d => new Date(d).toLocaleDateString('sv-SE');
function chart(points) {
  const max = Math.max(1, ...points.map(p => p[1]));
  return `<div class="chart">${points.map(([l, v]) => `<div title="${esc(l)}: ${money(v)}"><i data-h="${Math.round(v / max * 80)}"></i>${esc(l)}</div>`).join('')}</div>`;
}
function top(entries, n = 5) { return Object.entries(entries).sort((a, b) => b[1] - a[1]).slice(0, n); }
const who = o => o.shipping?.name || 'Cliente';
const sale = o => o.paid_at || o.created_at;
const orderTable = a => table(['Pedido','Data','Cliente','Total','Status',''], a.map(o => [`#${o.id}${note(o).startsWith('ATENCAO') ? ' ⚠️' : ''}`, day(o.created_at), esc(who(o)), money(o.total_cents), tag(o.status), `<button class="sec" data-order="${o.id}">Abrir</button>`]));

const VIEWS = {
  Resumo: async () => {
    const [os, vs, rq] = await Promise.all([orders(), list('product_variants?select=stock,available'), list('order_requests?select=id&status=eq.aberto')]);
    const paid = os.filter(o => PAID.includes(o.status)), today = key(Date.now());
    const week = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5); return [d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}), sum(paid.filter(o => key(sale(o)) === key(d)))]; });
    const prod = {}, cli = {};
    paid.forEach(o => { cli[who(o)] = (cli[who(o)] || 0) + o.total_cents; o.order_items.forEach(i => prod[i.product_name] = (prod[i.product_name] || 0) + i.quantity); });
    const count = {}; os.forEach(o => count[o.status] = (count[o.status] || 0) + 1);
    return kpis([['Pedidos', os.length], ['Vendas hoje', money(sum(paid.filter(o => key(sale(o)) === today)))], ['Faturamento', money(sum(paid))], ['Ticket médio', money(paid.length ? sum(paid) / paid.length : 0)], ['Estoque baixo (≤2)', vs.filter(v => v.available && v.stock <= 2).length], ['Solicitações abertas', rq.length]])
      + `<div class="cols">${card('Vendas nos últimos 7 dias', chart(week))}${card('Pedidos por status', table(['Status','Qtd.'], Object.entries(count).map(([s, n]) => [tag(s), n])))}${card('Produtos mais vendidos', table(['Produto','Unid.'], top(prod).map(([n, q]) => [esc(n), q])))}${card('Melhores clientes', table(['Cliente','Total'], top(cli).map(([n, v]) => [esc(n), money(v)])))}</div>`
      + card('Últimos pedidos', orderTable(os.slice(0, 8)));
  },
  Pedidos: async () => card('Todos os pedidos', orderTable(await orders())),
  Clientes: async () => card('Clientes', table(['Nome','E-mail','Telefone','Cidade','Desde','Pedidos','Pago'], (await call('/rest/v1/rpc/admin_customers', {method:'POST', body:{}})).map(c => [esc(c.name || '—'), esc(c.email), esc(c.phone), esc([c.city, c.state].filter(Boolean).join('/')), day(c.created_at), c.orders, money(c.paid_cents)]))),
  Produtos: async () => {
    const ps = await list('products?select=*&order=sort_order');
    const form = (p, isNew) => `<form class="card" data-product="${isNew ? '' : esc(p.id)}"><h2>${isNew ? 'Adicionar produto' : esc(p.name)}</h2>${isNew ? '<label>Código (letras minúsculas, sem espaço)<input name="id" pattern="[a-z0-9\\-]{2,40}" required></label>' : ''}<label>Nome<input name="name" maxlength="80" value="${esc(p.name)}" required></label><label>Descrição<textarea name="description" maxlength="600" rows="3">${esc(p.description)}</textarea></label><div class="row"><label>Preço (R$)<input name="price" inputmode="decimal" value="${isNew ? '' : dec(p.price_cents)}" required></label><label>Ordem<input name="sort_order" type="number" value="${p.sort_order || 0}"></label><label>Ativo<input name="active" type="checkbox" ${p.active ? 'checked' : ''}></label></div><button>Salvar</button></form>`;
    return `<p class="mut">O preço daqui vale na cobrança. A vitrine (fotos e textos da página inicial) ainda é editada no código do site.</p><div class="cols">${ps.map(p => form(p)).join('')}${form({}, true)}</div>`;
  },
  Estoque: async () => {
    const vs = await list('product_variants?select=id,product_id,color,size,stock,available&order=product_id,color,id');
    const rows = vs.map(v => {
      const mode = !v.available ? 'empty' : Number(v.stock) === -1 ? 'unlimited' : 'units';
      return [esc(v.product_id), esc(v.color), esc(v.size),
        `<select data-stock-mode="${v.id}" data-old-mode="${mode}" aria-label="Classificar estoque de ${esc(v.product_id)} ${esc(v.color)} ${esc(v.size)}"><option value="unlimited" ${mode === 'unlimited' ? 'selected' : ''}>Ilimitado</option><option value="units" ${mode === 'units' ? 'selected' : ''}>Por unidades</option><option value="empty" ${mode === 'empty' ? 'selected' : ''}>Sem estoque</option></select>`,
        `<input type="number" min="0" max="100000" value="${Math.max(0, Number(v.stock) || 0)}" data-stock-qty="${v.id}" data-old-stock="${v.stock}" ${mode !== 'units' ? 'disabled' : ''} aria-label="Quantidade de ${esc(v.product_id)} ${esc(v.color)} ${esc(v.size)}">`,
        `<span data-stock-status="${v.id}">${mode === 'unlimited' ? 'Ilimitado' : mode === 'empty' ? 'Sem estoque' : 'Por unidades'}</span>`,
        `<input type="hidden" data-old-available="${v.id}" value="${v.available ? 'true' : 'false'}">`];
    });
    return card('Estoque por cor e tamanho',
      '<p class="mut">Ilimitado não reduz a quantidade durante a compra. Escolha o controle de cada variação e salve tudo de uma vez.</p>' +
      '<div class="row"><button id="saveAllStock">Salvar alterações</button></div>' +
      table(['Produto','Cor','Tam.','Classificar por','Unidades','Situação',''], rows));
  },
  Cupons: async () => {
    const cs = await list('coupons?select=*&order=created_at.desc');
    return `<form class="card" id="newCoupon"><h2>Novo cupom</h2><div class="row"><label>Código<input name="code" pattern="[A-Za-z0-9_\\-]{3,30}" required></label><label>Tipo<select name="type"><option value="percent">% de desconto</option><option value="amount">Valor em R$</option></select></label><label>Desconto<input name="value" inputmode="decimal" required></label><label>Compra mínima (R$)<input name="min" inputmode="decimal" value="0"></label><label>Máx. de usos<input name="max" type="number" min="1"></label><label>Válido até<input name="exp" type="date"></label></div><button>Criar cupom</button></form>`
      + card('Cupons', table(['Código','Desconto','Mínimo','Usos','Validade','Situação',''], cs.map(c => [esc(c.code), c.percent ? c.percent + '%' : money(c.amount_cents), money(c.min_cents), c.uses + (c.max_uses ? '/' + c.max_uses : ''), day(c.expires_at) || '—', c.active ? 'Ativo' : 'Pausado', `<button class="sec" data-toggle="${esc(c.code)}" data-active="${c.active}">${c.active ? 'Pausar' : 'Ativar'}</button> <button class="sec" data-del="${esc(c.code)}">Excluir</button>`])));
  },
  Vendas: async () => {
    const paid = (await orders()).filter(o => PAID.includes(o.status));
    const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); const m = key(d).slice(0, 7), a = paid.filter(o => key(sale(o)).startsWith(m)); return [d.toLocaleDateString('pt-BR', {month:'short'}), sum(a), a.length]; });
    return kpis([['Faturamento total', money(sum(paid))], ['Vendas pagas', paid.length], ['Descontos dados', money(paid.reduce((t, o) => t + o.discount_cents, 0))]]) + card('Últimos 6 meses', chart(months) + table(['Mês','Vendas','Faturamento'], months.map(m => [esc(m[0]), m[2], money(m[1])]))) + '<p class="mut">Valores brutos, sem taxas do Mercado Pago nem custo de frete.</p>';
  },
  Entregas: async () => { const os = await orders(); return card('Para enviar', orderTable(os.filter(o => o.status === 'pago'))) + card('A caminho', orderTable(os.filter(o => o.status === 'enviado'))); },
  Devoluções: async () => {
    const rs = await list('order_requests?select=*&order=created_at.desc&limit=300');
    return '<p class="mut">Cancelamentos, trocas e devoluções. O reembolso do dinheiro é feito no Mercado Pago; aqui você registra a decisão.</p>' + (rs.length ? rs.map(r => `<form class="card" data-request="${r.id}"><h2>#${r.order_id} · ${esc(r.kind)} ${tag(r.status)}</h2><p>${esc(r.reason)}</p><p class="mut">${day(r.created_at)}</p><div class="row"><label>Situação<select name="status">${['aberto','aprovado','recusado','concluido'].map(s => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${NAMES[s]}</option>`).join('')}</select></label><label>Valor reembolsado (R$)<input name="refund" inputmode="decimal" value="${r.refund_cents == null ? '' : dec(r.refund_cents)}"></label></div><label>Resposta ao cliente<textarea name="reply" maxlength="1000">${esc(r.admin_reply)}</textarea></label><button>Salvar</button> <button type="button" class="sec" data-order="${r.order_id}">Ver pedido</button></form>`).join('') : card('Solicitações', '<p class="mut">Nenhuma solicitação.</p>'));
  },
  Configurações: async () => card('Situação da loja', table(['Item','Estado'], [['Cadastro de clientes', L.contasAtivas ? 'Ligado' : 'Desligado'], ['Vendas', L.vendasAtivas ? 'Abertas' : 'Fechadas'], ['E-mail de atendimento', esc(L.email || '—')]])) + '<p class="mut">Abrir cadastro e vendas depende também do banco, do e-mail e do Mercado Pago. Chaves secretas ficam só nos Secrets do Supabase.</p><div><button id="out2">Sair do painel</button></div>'
};

async function detail(id) {
  const [o] = await list(`orders?select=*,order_items(*),order_notes(note)&id=eq.${Number(id)}`);
  if (!o) return say('Pedido não encontrado.');
  const next = {aguardando_pagamento:['cancelado'], pago:['enviado','cancelado'], enviado:['entregue','cancelado'], entregue:[], cancelado:[]}[o.status];
  const a = o.shipping || {};
  $('#view').innerHTML = `<div><button class="sec" data-back>← Voltar</button></div><h1>Pedido #${o.id} ${tag(o.status)}</h1><div class="cols">${card('Itens', table(['Produto','Cor','Tam.','Qtd.','Valor'], o.order_items.map(i => [esc(i.product_name), esc(i.color), esc(i.size), i.quantity, money(i.unit_price_cents * i.quantity)])) + `<p>Desconto: ${money(o.discount_cents)} ${esc(o.coupon_code)}<br>Frete: ${money(o.shipping_cents)}<br><b>Total: ${money(o.total_cents)}</b></p><p class="mut">Pagamento: ${o.paid_at ? 'confirmado em ' + day(o.paid_at) + ' · MP ' + esc(o.mercadopago_payment_id) : 'não confirmado'}</p>`)}${card('Entrega', `<p>${esc(a.name)}<br>${esc(a.street)}, ${esc(a.number)} ${esc(a.complement)}<br>${esc(a.district)} · ${esc(a.city)}/${esc(a.state)}<br>CEP ${esc(a.cep)}<br>Telefone ${esc(a.phone)}<br>CPF ${esc(a.cpf)}</p>`)}</div><form class="card" id="editOrder"><div class="row"><label>Transportadora<input name="carrier" maxlength="60" value="${esc(o.carrier)}"></label><label>Código de rastreio<input name="tracking_code" maxlength="60" value="${esc(o.tracking_code)}"></label><label>Mudar status<select name="status"><option value="">Manter</option>${next.map(s => `<option value="${s}">${NAMES[s]}</option>`).join('')}</select></label></div><label>Anotação interna<textarea name="admin_note" maxlength="1000">${esc(note(o))}</textarea></label><button>Salvar</button><p class="mut">“Pago” só é marcado pelo Mercado Pago. Cancelar é definitivo.</p></form>`;
  onSubmit($('#editOrder'), async f => {
    if (f.status === 'cancelado' && !confirm('Cancelar o pedido? Não dá para desfazer. Se já foi pago, faça o reembolso no Mercado Pago.')) return;
    if (!f.status) delete f.status;
    const {admin_note, ...data} = f;
    await write('orders?id=eq.' + o.id, 'PATCH', data);
    await call('/rest/v1/order_notes', {method:'POST', body:{order_id: o.id, note: admin_note}, headers:{Prefer:'resolution=merge-duplicates'}});
    say('Pedido salvo.'); await detail(o.id);
  });
}

let current = 'Resumo', turn = 0;
async function show(name) {
  current = name; const mine = ++turn;
  $('#menu').innerHTML = '<b>RESIDER</b>' + Object.keys(VIEWS).map(n => `<button data-view="${n}" ${n === name ? 'aria-current="page"' : ''}>${n}</button>`).join('');
  $('#view').innerHTML = `<h1>${name}</h1><p class="mut">Carregando…</p>`;
  try {
    const html = await VIEWS[name]();
    if (mine !== turn || $('#app').hidden) return;
    $('#view').innerHTML = `<h1>${name}</h1>${html}`;
    wire();
  } catch (e) {
    if (mine === turn) $('#view').innerHTML = `<h1>${name}</h1><p>${esc(e.message)}</p><div><button data-view="${name}">Tentar de novo</button></div>`;
  }
}
function wire() {
  document.querySelectorAll('.chart i').forEach(i => i.style.height = i.dataset.h + '%');
  if ($('#out2')) $('#out2').onclick = logout;
  document.querySelectorAll('form[data-product]').forEach(el => onSubmit(el, async f => {
    const price_cents = cents(f.price);
    if (!(price_cents >= 100 && price_cents <= 10000000)) throw new Error('Preço inválido.');
    const body = {name: f.name, description: f.description, price_cents, sort_order: Number(f.sort_order) || 0, active: f.active === 'on'};
    const id = el.dataset.product;
    if (id) await write('products?id=eq.' + encodeURIComponent(id), 'PATCH', body);
    else {
      await write('products', 'POST', {id: f.id, ...body});
      await write('product_variants', 'POST', ['branca','preta'].flatMap(color => ['P','M','G','GG'].map(size => ({product_id: f.id, color, size, available: false, stock: 0, image_front: '', image_back: ''}))));
    }
    say('Produto salvo.'); await show(current);
  }));
  if ($('#newCoupon')) onSubmit($('#newCoupon'), async f => {
    const pct = f.type === 'percent', value = pct ? Number(f.value) : cents(f.value);
    if (!(Number.isInteger(value) && value > 0 && (!pct || value <= 90))) throw new Error('Desconto inválido (porcentagem de 1 a 90).');
    await write('coupons', 'POST', {code: f.code.toUpperCase(), percent: pct ? value : null, amount_cents: pct ? null : value, min_cents: cents(f.min || 0) || 0, max_uses: Number(f.max) || null, expires_at: f.exp ? f.exp + 'T23:59:59-03:00' : null});
    say('Cupom criado.'); await show(current);
  });
  document.querySelectorAll('form[data-request]').forEach(el => onSubmit(el, async f => {
    const refund = f.refund.trim() ? cents(f.refund) : null;
    if (refund !== null && !(refund >= 0)) throw new Error('Valor inválido.');
    await write('order_requests?id=eq.' + el.dataset.request, 'PATCH', {status: f.status, refund_cents: refund, admin_reply: f.reply}); say('Solicitação salva.'); await show(current);
  }));
  document.querySelectorAll('[data-stock-mode]').forEach(sel => sel.addEventListener('change', () => {
    const qty = $(`[data-stock-qty="${sel.dataset.stockMode}"]`);
    const status = $(`[data-stock-status="${sel.dataset.stockMode}"]`);
    qty.disabled = sel.value !== 'units';
    status.textContent = sel.value === 'unlimited' ? 'Ilimitado' : sel.value === 'empty' ? 'Sem estoque' : 'Por unidades';
  }));
  const saveStock = $('#saveAllStock');
  if (saveStock) saveStock.addEventListener('click', () => busy(saveStock, async () => {
    const selects = [...document.querySelectorAll('[data-stock-mode]')];
    let changed = 0;
    for (const sel of selects) {
      const id = sel.dataset.stockMode, qty = $(`[data-stock-qty="${id}"]`);
      const oldMode = sel.dataset.oldMode, oldStock = qty.dataset.oldStock;
      const oldAvailable = $(`[data-old-available="${id}"]`).value === 'true';
      const mode = sel.value;
      let stock, available;
      if (mode === 'unlimited') { stock = -1; available = true; }
      else if (mode === 'empty') { stock = 0; available = false; }
      else {
        stock = Number(qty.value);
        if (qty.value === '' || !Number.isInteger(stock) || stock < 0 || stock > 100000) throw new Error('Informe uma quantidade válida para ' + id + '.');
        available = true;
      }
      if (mode === oldMode && String(stock) === String(oldStock) && available === oldAvailable) continue;
      const filter = `product_variants?id=eq.${Number(id)}&stock=eq.${encodeURIComponent(oldStock)}&available=eq.${oldAvailable}`;
      await write(filter, 'PATCH', {stock, available});
      qty.dataset.oldStock = String(stock);
      qty.value = String(Math.max(0, stock));
      sel.dataset.oldMode = mode;
      $(`[data-old-available="${id}"]`).value = String(available);
      changed++;
    }
    say(changed ? `Alterações salvas em ${changed} variação(ões).` : 'Nenhuma alteração pendente.');
    await show(current);
  }));
}
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.view) show(d.view);
  else if ('back' in d) show(current);
  else if (d.order) busy(b, () => detail(d.order));
  else if (d.savestock) busy(b, async () => {
    const input = $(`[data-stock="${d.savestock}"]`), body = {available: $(`[data-avail="${d.savestock}"]`).checked};
    if (input.value !== input.dataset.old) {
      const n = Number(input.value);
      if (input.value === '' || !Number.isInteger(n) || n < 0) throw new Error('Quantidade inválida.');
      body.stock = n;
    }
    /* só grava a quantidade se o estoque não mudou desde que a tela abriu (venda simultânea) */
    await write(`product_variants?id=eq.${Number(d.savestock)}` + ('stock' in body ? `&stock=eq.${Number(input.dataset.old)}` : ''), 'PATCH', body);
    input.dataset.old = input.value; say('Estoque salvo.');
  });
  else if (d.toggle) busy(b, async () => { await write('coupons?code=eq.' + encodeURIComponent(d.toggle), 'PATCH', {active: d.active !== 'true'}); await show(current); });
  else if (d.del && confirm('Excluir o cupom ' + d.del + '?')) busy(b, async () => { await write('coupons?code=eq.' + encodeURIComponent(d.del), 'DELETE'); await show(current); });
});

if (ses) enter().catch(() => { save(null); login(); }); else login();
})();
