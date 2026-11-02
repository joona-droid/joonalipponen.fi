# joonalipponen.fi

Yksi sivu, joka rakentuu `content/`-kansion tiedostoista. HTML:ään ei tarvitse koskea.

## Mitä missäkin

| Tiedosto | Sisältö |
|---|---|
| `content/fi.json` | Kaikki suomenkieliset tekstit |
| `content/sv.json` | Ruotsinkieliset tekstit (sama rakenne kuin fi.json) |
| `content/en.json` | Englanninkieliset tekstit (sama rakenne kuin fi.json) |
| `content/media.json` | Mediajutut (uusin ensin automaattisesti) |
| `content/quotes.json` | Suosittelijat (`"type": "reference"`, nosto kentässä `highlight`, koko teksti `quote`) ja lainaukset (`"type": "quote"`) |
| `content/site.json` | `"draftMode": true` näyttää luonnokset ja kuvapaikat. Vaihda `false` ennen julkaisua |
| `images/` | Kuvat |
| `fonts/` | Obviously-fontit (nyt demoversio, vaihdetaan ostettuun) |

## Säännöt

- `"draft": true` missä tahansa kohdassa = näkyy vain luonnostilassa.
- `[hakasulkeet]` tekstissä korostuvat luonnostilassa täydennettävinä ja piiloutuvat julkaistussa sivussa. Kohta, jossa on pelkkiä hakasulkeita, ei näy lainkaan.
- Osio piiloutuu, jos sille ei ole sisältöä (esim. tyhjä lainauslista).
- Päivämäärät muodossa `2026-10-05`, `2026-10` tai `2026`.

## Kuvan lisääminen

Kuvan kohdalla on `"src": ""`. Lisää kuva `images/`-kansioon ja kirjoita polku: `"src": "images/hero.webp"`. Kirjoita `"alt"`-kenttään lyhyt kuvaus kuvasta.

## Esikatselu omalla koneella

Selain ei lataa JSON-tiedostoja suoraan levyltä, joten käynnistä kansiossa paikallinen palvelin:

```
python3 -m http.server
```

ja avaa `http://localhost:8000`.

## Ennen julkaisua

- [ ] `draftMode` → `false`
- [ ] Obviously-lisenssi ostettu ja demofontit vaihdettu (demo ei sisällä ä-, ö- ja å-kirjaimia eikä välimerkkejä, ja sen käyttö julkisella sivulla vaatii lisenssin)
- [ ] Archivo ladattu omalle palvelimelle Google Fontsin sijaan (GDPR)
- [ ] Jakokuva ja favicon


## Kielet

Sivu on kolmikielinen. Kielenvaihto (FI / SV / EN) on ylälaidassa, ja kieli vaihtuu yhdellä painalluksella. Lukija pysyy samassa kohdassa sivua.

- Kielet ja oletuskieli määritellään tiedostossa `content/site.json` (`"languages": ["fi", "sv", "en"]`).
- Jokaisella kielellä on oma tiedostonsa, jossa on täsmälleen sama rakenne. Kun muutat tekstiä suomeksi, muuta sama kohta myös `sv.json`- ja `en.json`-tiedostoon.
- Valittu kieli näkyy osoitteessa (`?lang=sv`, `?lang=en`), joten ruotsin- tai englanninkielisen sivun voi jakaa suoraan linkkinä. Selain muistaa valinnan seuraavalla käynnillä.
- Suositusten käännökset ovat `quotes.json`-tiedostossa kentissä `"sv"` ja `"en"`.
- Mediajuttujen otsikot pysyvät alkuperäisellä kielellä. Juttutyypit (Kolumni, Mielipide …) käännetään `ui.mediaTypes`-kohdassa.
- Käännöslinjaukset: ruotsiksi SYL = FSF ja AYY = AUS. Englanniksi SYL ja AYY pysyvät, ”liike” on ”student movement” ja AYY:n hallitus on ”AYY Board”.
