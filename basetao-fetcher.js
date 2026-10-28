/*
  Basetao-fetcher til Haulberegneren
  ----------------------------------
  Sådan bruger du det:
  1. Log ind på www.basetao.com.
  2. Tryk F12, vælg fanen "Console" (Konsol).
  3. Indsæt hele dette script og tryk Enter.
     (Chrome kan bede dig skrive "allow pasting" første gang.)
  4. Scriptet kopierer resultatet til udklipsholderen.
  5. Åbn Haulberegneren, tryk "Importér fra Basetao" og indsæt.

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
  let copied = false;
  try { if (typeof copy === "function") { copy(text); copied = true; } } catch (e) {}
  if (!copied) { try { await navigator.clipboard.writeText(text); copied = true; } catch (e) {} }

  console.log(
    `%cHaulberegner: ${items.length} varer (${source === "waybill" ? "pakke " + waybill : "ikke afsendt"}), ` +
    `fragt i Kina ¥${domestic}` + (intl ? `, fragt til DK ¥${intl}` : "") +
    (recharges[0] ? `, seneste kurs ¥${recharges[0].cnyPerUsd} pr. $` : "") +
    (tariffs ? `, ${tariffs.lines.length} fragtlinjer` : ""),
    "font-weight:bold;color:#0f6b5c"
  );
  console.table(result.items.map(i => ({ vare: i.name, "pris ¥": i.price, antal: i.qty, "vægt g": i.w })));
  if (copied) console.log("Kopieret til udklipsholderen. Indsæt det i Haulberegneren under \"Importér fra Basetao\".");
  else console.log("Kunne ikke kopiere automatisk. Markér og kopiér teksten nedenfor:\n\n" + text);
  return result;
})().catch(e => console.error("Basetao-fetcher fejlede: " + e.message));
