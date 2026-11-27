/* DADOS DA LOJA — preencha entre as aspas. Não invente: use só dados reais. */
window.LOJA={
  nomeLegal:'',   // seu nome completo ou a razão social
  documento:'',   // CNPJ (ou CPF, se vender como pessoa física)
  endereco:'',    // endereço para contato
  email:'',       // e-mail de atendimento (libera a newsletter)
  whatsapp:'',    // com DDD
  contasAtivas:false, // cadastro/login: ligar só depois de configurar o envio de e-mails e preencher os dados acima
  vendasAtivas:false, // NÃO mude: ligar as vendas exige também pagamento, login e banco
  supabaseUrl:'https://mxnrxgrlrhofllesgxzm.supabase.co',
  supabaseKey:'sb_publishable_IaUsvSTxzuOqLFLBHyd4gg_-8bm9qR4' // chave pública. Nunca coloque a service_role aqui.
};
// sai de dentro de molduras de outros sites
if(window.top!==window.self){try{window.top.location=window.location.href}catch(e){document.documentElement.style.display='none'}}
document.addEventListener('DOMContentLoaded',function(){
  var L=window.LOJA;
  var linhas=[['Responsável',L.nomeLegal],['CNPJ/CPF',L.documento],['Endereço',L.endereco],['E-mail',L.email],['WhatsApp',L.whatsapp]];
  var txt=linhas.filter(function(l){return l[1]}).map(function(l){return l[0]+': '+l[1]}).join('\n');
  document.querySelectorAll('[data-loja="id"]').forEach(function(el){el.textContent=txt||'Loja em preparação. Vendas ainda não abertas.'});
});

// aviso de cookies, teclado e textos alternativos (só na página da loja)
document.addEventListener('DOMContentLoaded',function(){
  var box=document.getElementById('ck');
  if(!box)return;
  var K='rc_cookies',v=null;
  try{v=localStorage.getItem(K)}catch(e){}
  box.hidden=!!v;
  // antes de ligar qualquer ferramenta opcional (Analytics, Pixel...), conferir se rc_cookies começa com "todos"
  box.addEventListener('click',function(e){var b=e.target.closest('[data-ck]');if(!b)return;
    try{localStorage.setItem(K,b.dataset.ck+'|'+new Date().toISOString())}catch(_){}
    box.hidden=true});
  box.addEventListener('keydown',function(e){e.stopPropagation()});
  var o=document.getElementById('ckOpen');
  if(o)o.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();box.hidden=false;box.querySelector('button').focus()});

  // janelas fechadas saem da navegação por teclado; ao abrir, o foco entra; ao fechar, volta
  var volta=null;
  ['drawer','modal','search'].forEach(function(id){
    var el=document.getElementById(id);if(!el)return;
    var aberto=el.classList.contains('on');el.inert=!aberto;
    new MutationObserver(function(){
      var a=el.classList.contains('on');if(a===aberto)return;aberto=a;el.inert=!a;
      if(a){if(!document.activeElement.closest('#drawer,#modal,#search'))volta=document.activeElement;
        if(id!=='search')setTimeout(function(){var b=el.querySelector('button');if(aberto&&b)b.focus({preventScroll:true})},350)}
      else setTimeout(function(){if(!document.querySelector('.drawer.on,.modal.on,.search.on,.auth.on')&&volta&&volta.isConnected)volta.focus({preventScroll:true})},50);
    }).observe(el,{attributes:true,attributeFilter:['class']});
  });

  // descrição das fotos acompanha a cor e o lado mostrados; botões repetidos ganham o nome da peça
  function descreve(im){
    if(!im.dataset.nome){var c=im.closest('.ct,.card');if(!c)return;im.dataset.nome=im.alt}
    var s=im.getAttribute('src')||'';
    im.alt='Camiseta '+im.dataset.nome+(s.indexOf('preta')>-1?' preta':' branca')+(s.indexOf('costas')>-1?', costas':', frente');
  }
  document.querySelectorAll('.ct img,.card .ph img').forEach(function(im){
    descreve(im);new MutationObserver(function(){descreve(im)}).observe(im,{attributes:true,attributeFilter:['src']});
  });
  document.querySelectorAll('.card').forEach(function(c){
    var q=c.querySelector('.quick'),im=c.querySelector('img');
    if(q&&im&&im.dataset.nome)q.setAttribute('aria-label','Escolher cor e tamanho: '+im.dataset.nome);
  });
});
