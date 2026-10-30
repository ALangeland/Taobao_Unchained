/*
  Basetao-fetcher til Haulberegneren
  ----------------------------------
  Sådan bruger du det:
  1. Log ind på www.basetao.com.
  2. Tryk F12, vælg fanen "Console" (Konsol).
  3. Indsæt hele dette script og tryk Enter.
     (Chrome kan bede dig skrive "allow pasting" første gang.)
  4. En boks med dine varer vises øverst til højre på siden.
  5. Tryk "Åbn i Haulberegner". Varerne, fragttaksterne og indbetalingerne
     indlæses automatisk. ("Kopiér data" virker også, hvis du foretrækker at indsætte.)

  Hvad scriptet henter:
  - Varer, der endnu ikke er sendt (afventer, bestilt, ankommet til lageret osv.).
  - Findes der ingen, henter det i stedet varerne fra din seneste afsendte pakke
    sammen med den fragt, du betalte for den.
  - Dine seneste PayPal-indbetalinger, så du kan se Basetaos kurs pr. dollar.
  - Basetaos aktuelle fragttakster til Danmark, så beregneren kan estimere fragten.

  Scriptet læser kun. Det ændrer intet på din konto og sender intet andre steder hen.

  Vil du hente en bestemt pakke, så skriv dens waybill-ID i BT_WAYBILL
  på første linje inde i scriptet, fx "299466".
*/
(async () => {
  const BT_WAYBILL = "";
  const H = { headers: { "X-Requested-With": "XMLHttpRequest", "Accept": "application/json" } };
  const BASE = "/best-taobao-agent-service";
  if (!/basetao\.com$/.test(location.hostname)) {
    console.error("Kør scriptet på www.basetao.com, mens du er logget ind.");
    return;
  }

  async function getJSON(url) {
    const r = await fetch(url, H);
    const t = await r.text();
    try { return JSON.parse(t); }
    catch (e) { throw new Error("Basetao svarede ikke med data. Er du logget ind? (" + url + ")"); }
  }

  async function allOrders(state) {
    const rows = [];
    for (let offset = 0; offset < 2000; offset += 100) {
      const j = await getJSON(`${BASE}/order/order_state?limit=100&offset=${offset}&page=${offset / 100 + 1}&state=${state}&search=&tag_name=`);
      rows.push(...(j.rows || []));
      if (!j.rows || j.rows.length < 100) break;
    }
    return rows;
  }

  const clean = s => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const toItem = o => ({
    name: (clean(o.goodsname).slice(0, 70) + (o.attributes ? " · " + clean(o.attributes).replace(/;$/, "") : "")).slice(0, 110),
    price: Number(o.goodsprice) || 0,
    qty: Number(o.goodsnum) || 1,
    w: Number(o.orderweight) || 0,
    domestic: Number(o.sendprice) || 0,
    oid: o.oid,
    url: o.goodsurl || ""
  });

  console.log("Henter dine Basetao-ordrer …");

  // Ikke-afsendte varer. Status 5 betyder "Submit to ship" (afsendt eller på vej i en pakke).
  const open = ["pending", "ordered", "arrived", "splitting", "changing", "transferring"];
  let orders = [];
  for (const s of open) {
    try { orders.push(...(await allOrders(s))); } catch (e) { console.warn(s + ": " + e.message); }
  }
  const seen = new Set();
  orders = orders.filter(o => String(o.state) !== "5" && !seen.has(o.oid) && seen.add(o.oid));

  // Kontohistorik: indbetalinger og fragtbetalinger
  const rec = await getJSON(`${BASE}/account/records?limit=500&offset=0&page=1&sortOrder=desc&search=`);
  const records = rec.rows || [];

  let source = "unshipped", waybill = null, intl = 0;
  if (BT_WAYBILL || !orders.length) {
    const shipped = await allOrders("shipped");
    waybill = BT_WAYBILL || (shipped[0] && shipped[0].sid);
    orders = shipped.filter(o => String(o.sid) === String(waybill));
    source = "waybill";
    for (const r of records) {
      const txt = clean(r.remark);
      if (new RegExp("waybill id:\\s*" + waybill + "\\b").test(txt) || new RegExp("from waybill id:\\s*" + waybill + "\\b").test(txt)) {
        if (/Oversea Freight|submit to ship/i.test(txt) || /adjust/i.test(txt)) intl += -Number(r.money);
      }
    }
    intl = Math.max(0, Math.round(intl * 100) / 100);
  }

  const items = orders.map(toItem);
  const domestic = Math.round(items.reduce((a, i) => a + i.domestic, 0) * 100) / 100;

  const recharges = records
    .map(r => ({ r, m: clean(r.remark).match(/paypal recharge\s*:?\s*\$\s*([\d.]+)\s*=\s*￥\s*([\d.]+)/i) }))
    .filter(x => x.m)
    .slice(0, 12)
    .map(({ r, m }) => {
      const usd = Number(m[1]), cny = Number(m[2]);
      return { date: new Date(r.addtime * 1000).toISOString().slice(0, 10), usd, cny, cnyPerUsd: Math.round(cny / usd * 10000) / 10000 };
    });

  // Basetaos aktuelle fragttakster til Danmark (landekode 52). Bruger sidens egen beregner-funktion.
  let tariffs = null;
  try {
    if (typeof ajax_content === "function" && typeof t_name !== "undefined" && typeof $ === "function") {
      const d = await new Promise((res, rej) =>
        $.when(ajax_content(t_name, t_hash, "post", BASE.replace(/^\//, location.origin + "/") + "/other_action/cost_freight",
          { amount: "100", weight: "3000", country: "52" })).done(res).fail(() => rej(new Error("fragtberegneren svarede ikke"))));
      const lines = (d && d.data || []).map(r => ({
        n: clean(r.deliveryname),
        fw: Number(r.first_weight), ff: Number(r.first_fee),
        cw: Number(r.continue_weight), cf: Number(r.continue_fee),
        cust: Number(r.customs_fee) || 0,
        max: Number(r.queryurl) || 15000,
        days: (String(r.notice).match(/(\d+-\d+)\s*(?:working )?days/) || [])[1] || "",
        vol: Number((String(r.notice).match(/cm\s*\/\s*(\d{4})/) || [])[1]) || 0
      })).filter(l => l.n && l.ff > 0 && l.cw > 0);
      if (lines.length) tariffs = { date: new Date().toISOString().slice(0, 10), lines };
    }
  } catch (e) { console.warn("Kunne ikke hente fragttakster: " + e.message + ". Beregneren bruger sine gemte takster."); }

  const result = {
    source: "basetao",
    version: 2,
    fetched: new Date().toISOString(),
    kind: source,
    waybill,
    items: items.map(({ name, price, qty, w, oid, url }) => ({ name, price, qty, w, oid, url })),
    domestic,
    intl,
    balance: records[0] ? Number(records[0].accountmoney) : null,
    recharges,
    tariffs
  };

  const text = JSON.stringify(result);
  const CALC_URL = "https://alangeland.github.io/Taobao_Unchained/";

  // Data til beregnerens adresse (base64 af UTF-8, uden varelinks for at holde adressen kort)
  const short = JSON.stringify({ ...result, items: result.items.map(({ url, ...i }) => i) });
  const bytes = new TextEncoder().encode(short);
  let bin = ""; for (let i = 0; i < bytes.length; i += 4096) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
  const openUrl = CALC_URL + "#data=" + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  // ---- Boks på siden ----
  document.getElementById("haulberegner-panel")?.remove();
  const host = document.createElement("div");
  host.id = "haulberegner-panel";
  host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const goods = result.items.reduce((a, i) => a + i.price * i.qty, 0);
  const grams = result.items.reduce((a, i) => a + i.w, 0);
  const n2 = v => v.toLocaleString("da-DK", { maximumFractionDigits: 2 });
  root.innerHTML = `
  <style>
    :host{all:initial}
    .box{width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:#fff;color:#16231f;
      border:2px solid #0f6b5c;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
    .head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 14px;background:#0f6b5c;color:#fff}
    .head b{font-size:16px}
    .x{background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 4px}
    .sum{padding:10px 14px;background:#dcefe9;font-size:13px;display:flex;flex-wrap:wrap;gap:4px 16px}
    .sum span b{font-variant-numeric:tabular-nums}
    .list{overflow:auto;flex:1;min-height:80px}
    table{border-collapse:collapse;width:100%;font-size:13px}
    th,td{padding:6px 10px;border-bottom:1px solid #e3e9e7;text-align:right;font-variant-numeric:tabular-nums;vertical-align:top}
    th{position:sticky;top:0;background:#f7f9f8;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b66;font-weight:500}
    th:first-child,td:first-child{text-align:left}
    td:first-child{max-width:300px;word-break:break-word}
    .foot{padding:12px 14px;display:grid;gap:8px;border-top:1px solid #e3e9e7}
    .btns{display:flex;flex-wrap:wrap;gap:8px}
    button.go,a.go{background:#0f6b5c;color:#fff;border:1px solid #0f6b5c;border-radius:6px;padding:9px 14px;font:600 14px system-ui,sans-serif;cursor:pointer;text-decoration:none}
    button.alt{background:#fff;color:#16231f;border:1px solid #cfd8d5;border-radius:6px;padding:9px 14px;font:14px system-ui,sans-serif;cursor:pointer}
    .msg{font-size:13px;color:#5b6b66;margin:0}
    textarea{width:100%;box-sizing:border-box;height:70px;font:12px ui-monospace,monospace;display:none}
  </style>
  <div class="box" role="dialog" aria-label="Haulberegner">
    <div class="head"><b>Haulberegner · ${result.items.length} varer</b><button class="x" title="Luk">×</button></div>
    <div class="list"><table>
      <thead><tr><th>Vare</th><th>Pris ¥</th><th>Antal</th><th>Vægt g</th></tr></thead>
      <tbody>${result.items.map(i => `<tr><td>${esc(i.name)}</td><td>${n2(i.price)}</td><td>${i.qty}</td><td>${i.w || "–"}</td></tr>`).join("") ||
        `<tr><td colspan="4">Ingen varer fundet.</td></tr>`}</tbody>
    </table></div>
    <div class="sum">
      <span>${source === "waybill" ? "Pakke " + esc(waybill) : "Ikke sendt endnu"}</span>
      <span>Varer <b>¥${n2(goods)}</b></span>
      <span>Vægt <b>${n2(grams / 1000)} kg</b></span>
      <span>Fragt i Kina <b>¥${n2(domestic)}</b></span>
      ${intl ? `<span>Fragt til DK <b>¥${n2(intl)}</b></span>` : ""}
      ${recharges[0] ? `<span>Seneste kurs <b>¥${recharges[0].cnyPerUsd}/$</b></span>` : ""}
      ${tariffs ? `<span>${tariffs.lines.length} fragtlinjer</span>` : ""}
    </div>
    <div class="foot">
      <div class="btns">
        <a class="go" href="${openUrl}" target="_blank" rel="noopener">Åbn i Haulberegner</a>
        <button class="alt" id="cp">Kopiér data</button>
      </div>
      <p class="msg" id="m">"Åbn i Haulberegner" indlæser alt automatisk. "Kopiér data" bruges, hvis du har beregneren åben et andet sted.</p>
      <textarea id="ta" readonly></textarea>
    </div>
  </div>`;
  document.body.appendChild(host);
  root.querySelector(".x").onclick = () => host.remove();
  root.getElementById("cp").onclick = async () => {
    const m = root.getElementById("m");
    try { await navigator.clipboard.writeText(text); m.textContent = "Kopieret. Indsæt det under \"Hent fra Basetao\" i beregneren og tryk Indlæs."; }
    catch (e) { const ta = root.getElementById("ta"); ta.style.display = "block"; ta.value = text; ta.select(); m.textContent = "Kunne ikke kopiere automatisk. Teksten er markeret nedenfor, tryk Ctrl+C."; }
  };

  console.log(`%cHaulberegner: ${result.items.length} varer hentet. Se boksen øverst til højre på siden.`, "font-weight:bold;color:#0f6b5c");
  return result;
})().catch(e => console.error("Basetao-fetcher fejlede: " + e.message));
