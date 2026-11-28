/* Checkout Pix transparente Resider — cobrança e confirmação sempre no servidor. */
(() => {
  let pending = null;
  let overlay = null;
  let pollTimer = null;
  let currentOrderId = null;

  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  function ensurePixModal() {
    if (overlay) return;
    const style = make("style");
    style.textContent = `
      .rcpix{position:fixed;inset:0;z-index:99999;background:rgba(8,10,16,.64);display:none;align-items:center;justify-content:center;padding:18px;font-family:inherit}
      .rcpix.on{display:flex}.rcpix-card{width:min(100%,440px);max-height:92dvh;overflow:auto;background:#f7f7f8;color:#101014;border-radius:22px;padding:24px;box-shadow:0 24px 90px #0005}
      .rcpix-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.rcpix-head h2{font-size:20px;font-weight:650}
      .rcpix-close{font-size:25px;width:36px;height:36px;border-radius:50%;background:#e9e9ed;cursor:pointer}
      .rcpix-note{color:#60606a;font-size:13px;margin:8px 0 16px;line-height:1.5}
      .rcpix-status{padding:11px 13px;border-radius:12px;background:#ececf0;font-size:13px;margin:12px 0;text-align:center}
      .rcpix-qr{display:block;width:min(100%,240px);height:auto;aspect-ratio:1;object-fit:contain;background:#fff;border-radius:12px;margin:16px auto;padding:8px}
      .rcpix-code{width:100%;min-height:88px;resize:vertical;border:1px solid #d7d7dc;border-radius:12px;background:#fff;padding:12px;font:12px/1.45 ui-monospace,monospace;color:#17171b}
      .rcpix-btn{width:100%;min-height:46px;border-radius:12px;padding:12px 16px;background:#111827;color:white;font-weight:600;margin-top:10px;cursor:pointer}
      .rcpix-btn.secondary{background:#e6e6eb;color:#15151a}.rcpix-btn:disabled{opacity:.55;cursor:wait}
      .rcpix-help{font-size:12px;color:#656570;text-align:center;margin-top:12px}
      @media(prefers-reduced-motion:no-preference){.rcpix-card{animation:rcpix-in .18s ease-out}@keyframes rcpix-in{from{transform:translateY(8px);opacity:.7}to{transform:none;opacity:1}}}
    `;
    overlay = make("div", "rcpix");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "rcpixTitle");
    const card = make("section", "rcpix-card");
    const head = make("div", "rcpix-head");
    const title = make("h2", null, "Pague com Pix"); title.id = "rcpixTitle";
    const close = make("button", "rcpix-close", "×"); close.type = "button"; close.setAttribute("aria-label", "Fechar");
    close.addEventListener("click", () => overlay.classList.remove("on"));
    head.append(title, close);
    const note = make("p", "rcpix-note", "Abra o aplicativo do seu banco, escolha Pix e escaneie o QR Code ou copie o código abaixo.");
    const status = make("div", "rcpix-status", "Gerando seu Pix…"); status.id = "rcpixStatus";
    const qr = make("img", "rcpix-qr"); qr.alt = "QR Code Pix"; qr.hidden = true;
    const code = make("textarea", "rcpix-code"); code.readOnly = true; code.placeholder = "O código Pix aparecerá aqui"; code.setAttribute("aria-label", "Pix copia e cola");
    const copy = make("button", "rcpix-btn", "Copiar código Pix"); copy.type = "button"; copy.disabled = true;
    copy.addEventListener("click", async () => {
      if (!code.value) return;
      try { await navigator.clipboard.writeText(code.value); copy.textContent = "Código copiado"; }
      catch { code.focus(); code.select(); try { document.execCommand("copy"); copy.textContent = "Código copiado"; } catch { copy.textContent = "Selecione e copie o código"; } }
      setTimeout(() => { copy.textContent = "Copiar código Pix"; }, 2200);
    });
    const retry = make("button", "rcpix-btn secondary", "Gerar outro Pix"); retry.type = "button"; retry.hidden = true;
    retry.addEventListener("click", () => { if (currentOrderId) startPayment(currentOrderId); });
    const help = make("p", "rcpix-help", "A confirmação é automática. Não feche a página antes de concluir o pagamento.");
    card.append(head, note, status, qr, code, copy, retry, help);
    overlay.append(card);
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.classList.remove("on"); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") overlay.classList.remove("on"); });
    document.head.append(style);
    document.body.append(overlay);
  }

  function showModal() { ensurePixModal(); overlay.classList.add("on"); }
  function setStatus(message) {
    ensurePixModal();
    document.getElementById("rcpixStatus").textContent = message;
  }
  function showPayment(data) {
    ensurePixModal();
    const qr = overlay.querySelector(".rcpix-qr");
    const code = overlay.querySelector(".rcpix-code");
    const copy = overlay.querySelector(".rcpix-btn");
    const retry = overlay.querySelector(".rcpix-btn.secondary");
    if (data.qr_code_base64) {
      qr.src = "data:image/png;base64," + data.qr_code_base64;
      qr.hidden = false;
    }
    if (data.qr_code) {
      code.value = data.qr_code;
      copy.disabled = false;
    }
    const status = String(data.status || "pending");
    if (status === "approved") {
      setStatus("Pagamento confirmado! Seu pedido foi aprovado.");
      qr.hidden = true; code.hidden = true; copy.hidden = true; retry.hidden = true;
      if (Array.isArray(bag)) bag = [];
      try { localStorage.removeItem("rc_bag"); } catch {}
      if (typeof renderBag === "function") renderBag();
      pending = null;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (typeof toast === "function") toast("Pix confirmado! Seu pedido está pago.");
    } else if (["rejected", "cancelled"].includes(status)) {
      setStatus("Este Pix não foi aprovado. Você pode gerar uma nova cobrança para o mesmo pedido.");
      retry.hidden = false;
    } else {
      setStatus("Aguardando pagamento… Assim que o banco confirmar, seu pedido será atualizado automaticamente.");
      retry.hidden = true;
    }
  }

  async function callPayment(orderId, action) {
    const accessToken = await token();
    const response = await fetch(window.LOJA.supabaseUrl + "/functions/v1/create-payment", {
      method: "POST",
      headers: {
        apikey: window.LOJA.supabaseKey,
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ order_id: Number(orderId), ...(action ? { action } : {}) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        payment_not_configured: "O Mercado Pago ainda não está configurado no servidor.",
        payer_document_missing: "Complete o CPF nos dados da sua conta para gerar o Pix.",
        payer_email_missing: "Adicione um e-mail à sua conta para gerar o Pix.",
        order_already_paid: "Este pedido já está pago.",
        order_not_payable: "Este pedido não pode receber um novo pagamento."
      };
      throw new Error(messages[data.error] || data.message || "Não foi possível processar o Pix.");
    }
    return data;
  }

  async function pollStatus(orderId) {
    try {
      const data = await callPayment(orderId, "status");
      showPayment(data);
      if (data.status === "approved" || ["rejected", "cancelled"].includes(data.status)) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      }
    } catch {
      setStatus("Ainda estamos aguardando a confirmação do Mercado Pago. Esta tela continuará verificando.");
    }
  }

  async function startPayment(orderId) {
    currentOrderId = orderId;
    showModal();
    setStatus("Gerando seu Pix…");
    const qr = overlay.querySelector(".rcpix-qr");
    const code = overlay.querySelector(".rcpix-code");
    const copy = overlay.querySelector(".rcpix-btn");
    const retry = overlay.querySelector(".rcpix-btn.secondary");
    qr.hidden = true; code.hidden = false; code.value = ""; copy.disabled = true; retry.hidden = true;
    try {
      const data = await callPayment(orderId);
      showPayment(data);
      if (pollTimer) clearInterval(pollTimer);
      if (data.status !== "approved" && !["rejected", "cancelled"].includes(data.status)) {
        pollTimer = setInterval(() => pollStatus(orderId), 5000);
      }
    } catch (error) {
      setStatus(error.message || "Falha ao gerar o Pix.");
      if (typeof toast === "function") toast(error.message || "Falha ao gerar o Pix.");
      retry.hidden = false;
    }
  }

  const runCheckout = async (event) => {
    const button = event.target.closest("#rvOk");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (!window.LOJA || !window.LOJA.vendasAtivas) {
      if (typeof toast === "function") toast("As vendas ainda não estão abertas.");
      return;
    }
    if (!Array.isArray(bag) || !bag.length || !sess) {
      if (typeof toast === "function") toast("Entre na sua conta e confira a sacola.");
      return;
    }

    button.disabled = true;
    try {
      const body = { items: bag.map((item) => ({
        product_id: item.p.id, color: item.c, size: item.s, quantity: item.q
      })), coupon: document.getElementById("cupom")?.value.trim() || null };
      const signature = sess.refresh_token + JSON.stringify(body);
      const orderId = pending?.signature === signature ? pending.id
        : await rest("rpc/create_order", { method: "POST", body }).catch((e) => {
          const known = ["Estoque insuficiente", "Cupom invalido", "Produto indisponivel", "Complete os dados de entrega", "Muitos pedidos aguardando pagamento"]
            .find((m) => JSON.stringify([e.message, e.data, e.body]).includes(m));
          throw new Error(known ? known.replace("invalido", "inválido").replace("indisponivel", "indisponível") : "Não foi possível registrar o pedido agora.");
        });
      pending = { signature, id: orderId };
      await startPayment(orderId);
    } catch (error) {
      if (typeof toast === "function") toast(error.message || "Falha ao iniciar pagamento.");
    } finally {
      button.disabled = false;
    }
  };

  document.addEventListener("click", (event) => {
    if (event.target.closest("#rvOk")) runCheckout(event);
  }, true);
})();
