# Haulberegner

En lille beregner til Taobao-køb via Basetao. Skriv varer og fragt i yuan, og få den reelle pris i danske kroner.

Åbn `index.html` i en browser. Der skal ikke installeres noget.

## Hvad den regner med

- **Markedskurs:** kroner pr. 100 yuan (standard 100,12 kr, ECB-kursen 23/10-2026).
- **PayPal-tab:** 4,37 % af det beløb, du betaler, når PayPal veksler kroner til dollar.
- **Basetao-tab:** 7,32 % af det beløb, du betaler, når Basetao krediterer dollar som yuan.

Tabene er gennemsnittet af 12 indbetalinger fra maj 2024 til juli 2026, målt mod ECB's kurser på betalingsdagene. Alle tre tal kan rettes i beregneren.

Fragten til Danmark fordeles på varerne efter vægt, hvis alle varer har en vægt, ellers efter pris. Moms ved levering (25 %) kan slås til for linjer, der ikke er toldfri.

Det, du skriver, gemmes i browserens lokale lager.

## Hent dine varer fra Basetao

`basetao-fetcher.js` henter dine varer direkte fra din Basetao-konto, så du ikke skal taste dem ind.

1. Log ind på www.basetao.com.
2. Tryk F12 og vælg fanen **Console**.
3. Indsæt hele indholdet af `basetao-fetcher.js` og tryk Enter. Første gang skal du måske skrive `allow pasting` i Chrome.
4. Resultatet kopieres til udklipsholderen. Indsæt det i Haulberegneren under **Hent fra Basetao** og tryk **Indlæs**.

Scriptet henter de varer, der endnu ikke er sendt. Har du ingen, henter det varerne og fragten fra din seneste afsendte pakke. Vil du have en bestemt pakke, så skriv dens waybill-ID i `BT_WAYBILL` øverst i scriptet.

Scriptet læser kun fra din konto og sender intet andre steder hen.
