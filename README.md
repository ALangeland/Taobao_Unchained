# Haulberegner

En beregner til Taobao-køb via Basetao. Skriv varer i yuan, eller hent dem fra Basetao, og få den reelle pris i danske kroner.

Åbn den på **https://alangeland.github.io/Taobao_Unchained/**, eller åbn `index.html` direkte i en browser. Der skal ikke installeres noget. Alt, du skriver, gemmes kun i din egen browser.

## Fragt

Beregneren estimerer fragten til Danmark ud fra varernes samlede vægt og Basetaos takster for hver fragtlinje. Den billigste linje vælges automatisk, men du kan vælge en anden eller skrive fragten selv.

- Pris pr. linje = første vægtenhed + ekstra vægtenheder (rundet op) + evt. tolddeklaration.
- Taksterne er hentet fra Basetaos fragtberegner 28/10-2026. Fetcher-scriptet henter de aktuelle takster, hver gang du bruger det.
- Estimatet bruger den faktiske vægt. Store, lette pakker kan blive dyrere, hvis rumfangsvægten er højere.

## Indbetalinger og tab

Under **Indbetalinger** fører du en log over dine overførsler:

| Felt | Hvor du finder det |
|---|---|
| Trukket kr | Det beløb, der blev trukket på dit kort (PayPal → transaktionsdetaljer) |
| Sendt $ | Det beløb, Basetao modtog i dollar |
| Fik ¥ | Det beløb, Basetao satte ind på din konto (Basetao → Account → Transactions) |
| Marked kr/$ og ¥/$ | ECB-kursen den dag. Knappen **Hent markedskurser** henter dem |

For hver indbetaling beregnes:

- **PayPal-tab** = (trukket kr − sendt $ × markedskurs) / trukket kr
- **Basetao-tab** = (sendt $ − fik ¥ / markedskurs) × kr pr. $ / trukket kr

Gennemsnittet (vægtet efter beløb, over alle eller de seneste 3, 5 eller 10) bruges i beregningen. Kender du endnu ikke beløbet i yuan, viser loggen et estimat ud fra dit gennemsnit. Kvitteringen viser også, hvor mange dollar du skal sende for at dække din kurv.

Loggen starter med 12 rigtige indbetalinger fra maj 2024 til juli 2026: PayPal tog i gennemsnit 4,37 % og Basetao 7,32 %.

## Hent dine data fra Basetao

`basetao-fetcher.js` henter data direkte fra din Basetao-konto:

1. Log ind på www.basetao.com.
2. Tryk F12 og vælg fanen **Console**.
3. Indsæt hele indholdet af `basetao-fetcher.js` og tryk Enter. Første gang skal du måske skrive `allow pasting` i Chrome.
4. Resultatet kopieres til udklipsholderen. Indsæt det i Haulberegneren under **Hent fra Basetao** og tryk **Indlæs**.

Scriptet henter:

- de varer, der endnu ikke er sendt, eller varerne og fragten fra din seneste pakke, hvis du ikke har nogen
- dine seneste PayPal-indbetalinger (dollar og yuan), som lægges i loggen
- Basetaos aktuelle fragttakster til Danmark

Vil du have en bestemt pakke, så skriv dens waybill-ID i `BT_WAYBILL` øverst i scriptet. Scriptet læser kun fra din konto og sender intet andre steder hen.
