/* DADOS DA LOJA — preencha entre as aspas. Não invente: use só dados reais. */
window.LOJA={
  nomeLegal:'',   // seu nome completo ou a razão social
  documento:'',   // CNPJ (ou CPF, se vender como pessoa física)
  endereco:'',    // endereço para contato
  email:'',       // e-mail de atendimento (libera a newsletter)
  whatsapp:'',    // com DDD
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
