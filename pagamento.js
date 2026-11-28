/* Integração do checkout Resider — o token do Mercado Pago nunca passa pelo navegador. */
(() => {
  let pending = null; // se o pagamento falhar, tentar de novo usa o mesmo pedido (não reserva estoque duas vezes)
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
      const accessToken = await token();
      const response = await fetch(window.LOJA.supabaseUrl + "/functions/v1/create-payment", {
        method: "POST",
        headers: {
          apikey: window.LOJA.supabaseKey,
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ order_id: Number(orderId) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.checkout_url) {
        if (response.status === 503) throw new Error("O Mercado Pago ainda não foi configurado no servidor. Nenhuma cobrança foi feita.");
        throw new Error("Não foi possível iniciar o pagamento. Seu pedido não foi enviado para cobrança.");
      }
      window.location.assign(data.checkout_url);
    } catch (error) {
      if (typeof toast === "function") toast(error.message || "Falha ao iniciar pagamento.");
      button.disabled = false;
    }
  };

  document.addEventListener("click", (event) => {
    if (event.target.closest("#rvOk")) runCheckout(event);
  }, true);
})();
