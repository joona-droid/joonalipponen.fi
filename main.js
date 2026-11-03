/* joonalipponen.fi
 * Sivu rakennetaan content/-kansion JSON-tiedostoista.
 * Tekstit: content/fi.json, sv.json, en.json (kielet ja oletuskieli: site.json)
 * Listat:  content/media.json, quotes.json (suosittelijat: "type": "reference")
 * Asetukset: content/site.json  ("draftMode": true näyttää luonnokset)
 *
 * Osio piilotetaan automaattisesti, jos sille ei ole sisältöä.
 * Merkintä "draft": true näkyy vain luonnostilassa.
 * Hakasulkeissa oleva teksti [näin] korostetaan luonnostilassa täydennettäväksi.
 */
(function () {
  "use strict";

  var state = { t: {}, site: {}, media: [], quotes: [], events: [], draft: false, cache: {}, io: null };

  var LANG_NAMES = { fi: ["FI", "Suomeksi"], sv: ["SV", "På svenska"], en: ["EN", "In English"] };

  /* ---------- Apufunktiot ---------- */

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else el.setAttribute(k, v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }

  // Teksti, jossa [hakasulkeet] korostetaan luonnostilassa
  function txt(tag, str, attrs) {
    var el = h(tag, attrs);
    String(str || "").split(/(\[[^\]]+\])/).forEach(function (part) {
      if (!part) return;
      if (/^\[.*\]$/.test(part)) {
        if (state.draft) el.appendChild(h("mark", { class: "todo", text: part }));
        return;
      }
      el.appendChild(document.createTextNode(part));
    });
    return el;
  }

  // Teksti, jossa **näin** merkitty osa korostetaan
  function rich(tag, str, cls) {
    var el = h(tag, { class: cls });
    String(str || "").split(/\*\*/).forEach(function (part, i) {
      if (!part) return;
      el.appendChild(i % 2 ? h("strong", { text: part }) : document.createTextNode(part));
    });
    return el;
  }

  function filled(str) {
    return state.draft || String(str || "").replace(/\[[^\]]*\]/g, "").trim().length > 0;
  }

  function visible(item) { return item && (!item.draft || state.draft); }
  function ui(key) { return (state.t.ui || {})[key] || ""; }

  function badge(item) {
    return item && item.draft && state.draft ? h("span", { class: "badge", text: ui("draftBadge") }) : null;
  }

  function section(id, tone, cfg, children) {
    var sec = h("section", { id: id, class: "section on-" + tone, "aria-labelledby": id + "-h" });
    if (cfg && cfg.draft && state.draft) sec.appendChild(h("div", { class: "badge-row" }, [badge(cfg)]));
    var wrap = h("div", { class: "wrap" }, children);
    sec.appendChild(wrap);
    if (cfg && cfg.navLabel) sec.dataset.nav = cfg.navLabel;
    return sec;
  }

  function heading(id, text) {
    return h("h2", { class: "h-section", id: id + "-h", text: text });
  }

  var WIDTHS = [640, 1280, 1920];

  // Kuva: "src" ilman tiedostopäätettä = valmiiksi pakattu sarja (nimi-640.webp, -1280, -1920).
  // "src" päätteen kanssa (esim. images/kuva.jpg) käytetään sellaisenaan.
  function img(data, extraClass, opts) {
    data = data || {};
    opts = opts || {};
    var box = h("div", { class: "ph" + (extraClass ? " " + extraClass : "") + (data.src ? " has-img" : "") });
    if (data.src) {
      var hasExt = /\.[a-z0-9]{3,4}$/i.test(data.src);
      var attrs = {
        src: hasExt ? data.src : data.src + "-1280.webp",
        alt: data.alt || "",
        loading: opts.eager ? "eager" : "lazy",
        decoding: "async",
        fetchpriority: opts.eager ? "high" : null,
        sizes: opts.sizes || "(max-width: 760px) 100vw, 50vw",
        srcset: hasExt ? null : WIDTHS.map(function (w) { return data.src + "-" + w + ".webp " + w + "w"; }).join(", ")
      };
      var im = h("img", attrs);
      if (data.focus) im.style.objectPosition = data.focus;
      box.appendChild(im);
      if (data.credit && (state.draft || data.credit.indexOf("[") !== 0)) {
        box.appendChild(txt("span", ui("photoBy") + ": " + data.credit, { class: "credit" }));
      }
    } else {
      box.setAttribute("role", "img");
      box.setAttribute("aria-label", data.alt || data.placeholder || ui("imagePlaceholder"));
      if (state.draft) {
        box.appendChild(h("div", { class: "ph__label" }, [
          h("b", { text: ui("imagePlaceholder") }),
          h("span", { text: data.placeholder || "" })
        ]));
      }
    }
    return box;
  }

  // Irtileikattu kuva (läpinäkyvä tausta): "cutout": "images/nimi" -> nimi-640.webp, nimi-1280.webp
  function cutout(data, cls, sizes) {
    var wrap = h("div", { class: "cut " + (cls || "") });
    wrap.appendChild(h("div", { class: "cut__shape", "aria-hidden": "true" }));
    wrap.appendChild(h("img", {
      class: "cut__img",
      src: data.cutout + "-1280.webp",
      srcset: data.cutout + "-640.webp 640w, " + data.cutout + "-1280.webp 1280w",
      sizes: sizes || "(max-width: 760px) 90vw, 45vw",
      alt: data.alt || "",
      decoding: "async"
    }));
    if (data.credit && (state.draft || data.credit.indexOf("[") !== 0)) {
      wrap.appendChild(txt("span", ui("photoBy") + ": " + data.credit, { class: "credit" }));
    }
    return wrap;
  }

  function fmtDate(d) {
    if (!d) return "";
    var p = String(d).split("-");
    var short = ui("monthsShort");
    if (p.length === 3 && short) return Number(p[2]) + " " + short[Number(p[1]) - 1] + " " + p[0];
    if (p.length === 3) return Number(p[2]) + "." + Number(p[1]) + "." + p[0];
    if (p.length === 2) return (ui("months")[Number(p[1]) - 1] || p[1]) + " " + p[0];
    return p[0];
  }

  function today() {
    var n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  }

  function lang(obj) {
    if (typeof obj === "string") return obj;
    if (!obj) return "";
    return obj[state.t.meta.lang] || obj.fi || "";
  }

  /* ---------- Osiot ---------- */

  var render = {

    hero: function (c) {
      var parts = String(c.name || "").split(" ");
      var name = h("h1", { class: "hero__name", id: "hero-h" }, parts.map(function (p) { return h("span", { text: p }); }));
      var left = h("div", {}, [
        h("p", { class: "hero__eyebrow", text: c.eyebrow }),
        name,
        h("p", { class: "hero__lead" }, [txt("span", c.lead), c.leadTag ? h("small", { class: "hero__tag", text: c.leadTag }) : null]),
        c.cta ? txt("p", c.cta, { class: "hero__cta" }) : null,
        h("ul", { class: "hero__facts" }, (c.facts || []).map(function (f) { return h("li", { text: f }); }))
      ]);
      var sticker = c.sticker ? h("div", { class: "sticker", "aria-hidden": "true", text: c.sticker }) : null;
      var media = c.image && c.image.cutout
        ? h("div", { class: "hero__media hero__media--cut" }, [cutout(c.image, "cut--hero", "(max-width: 760px) 100vw, 50vw"), sticker])
        : h("div", { class: "hero__media" }, [img(c.image, null, { eager: true, sizes: "(max-width: 760px) 92vw, 40vw" }), sticker]);
      var sec = h("section", { id: "top", class: "hero on-ice", "aria-labelledby": "hero-h" }, [
        h("div", { class: "wrap hero__grid" }, [left, media])
      ]);
      return sec;
    },

    vision: function (c) {
      if (!visible(c)) return null;
      var proof = c.proof && visible(c.proof)
        ? h("div", { class: "proof" }, [badge(c.proof), h("h3", { text: c.proof.title }), txt("p", c.proof.text)])
        : null;
      return section("visio", "teal", c, [
        h("p", { class: "eyebrow", text: c.eyebrow }),
        c.statement ? rich("p", c.statement, "vision__statement") : null,
        txt("p", c.intro, { class: "vision__intro" }),
        h("h2", { class: "vision__heading", id: "visio-h", text: c.heading }),
        c.goalsIntro ? txt("p", c.goalsIntro, { class: "vision__goals-intro" }) : null,
        h("ol", { class: "goals" }, (c.goals || []).map(function (g) {
          return h("li", { class: "goal" }, [h("h3", { text: g.title }), txt("p", g.text)]);
        })),
        render.promises(state.t.promises || {}, true),
        h("div", { class: "vision__foot" }, [
          c.pull ? h("p", { class: "pull", text: c.pull }) : null,
          proof
        ])
      ]);
    },

    band: function (c) {
      if (!c || !c.text) return null;
      var sec = h("section", { class: "band", "aria-label": c.text }, [
        c.image ? img(c.image, "band__img", { sizes: "100vw" }) : null,
        h("p", { class: "band__text", "aria-hidden": "true", text: c.text })
      ]);
      return sec;
    },

    about: function (c) {
      if (!visible(c)) return null;
      var tl = state.t.timeline;
      var timeline = null;
      if (tl && tl.items && tl.items.filter(visible).length) {
        timeline = h("div", { class: "timeline" }, [
          h("h3", { text: tl.heading }),
          h("ol", { class: "tl" }, tl.items.filter(visible).map(function (it) {
            return h("li", {}, [
              h("div", { class: "tl__year", text: it.year }),
              h("div", { class: "tl__body" }, [
                txt("strong", it.title),
                txt("p", it.text),
                badge(it),
                it.image ? img(it.image, "reveal") : null
              ])
            ]);
          })),
          tl.note ? txt("p", tl.note, { class: "tl__note" }) : null
        ]);
      }
      return section("kuka", "mist", c, [
        heading("kuka", c.heading),
        h("div", { class: "about__grid" }, [
          h("div", { class: "stack" }, (c.paragraphs || []).map(function (p, i) { return txt("p", p, i === 0 ? { class: "lead" } : null); })),
          c.image && c.image.cutout ? cutout(c.image, "cut--about", "(max-width: 760px) 80vw, 35vw") : img(c.image, "reveal")
        ]),
        timeline
      ]);
    },

    results: function (c) {
      if (!visible(c) || !(c.items || []).length) return null;
      return section("tehtya", "teal", c, [
        heading("tehtya", c.heading),
        h("div", { class: "results" }, c.items.filter(visible).map(function (it) {
          return h("div", { class: "result" }, [h("p", { class: "result__big", text: it.big }), txt("p", it.text)]);
        }))
      ]);
    },

    attitude: function (c) {
      if (!visible(c)) return null;
      return section("asenne", "white", c, [
        heading("asenne", c.heading),
        txt("p", c.intro, { class: "attitude__intro" }),
        h("div", { class: "attitude__grid" }, [
          h("div", { class: "att-items" }, (c.items || []).map(function (it) {
            return h("div", { class: "att-item" }, [h("h3", { text: it.title }), txt("p", it.text)]);
          })),
          img(c.image, "reveal")
        ])
      ]);
    },

    promises: function (c, inline) {
      var items = (c.items || []).filter(filled);
      if (!inline || !visible(c) || !items.length) return null;
      return h("div", { class: "promises" }, [
        h("h3", { class: "promises__h", text: c.heading }),
        h("ul", { class: "promise-list" }, items.map(function (p) { return h("li", {}, [txt("span", p)]); }))
      ]);
    },

    references: function (c) {
      var r = state.quotes.filter(function (x) { return visible(x) && x.type === "reference"; });
      if (!r.length) return null;
      var anyDraft = r.some(function (x) { return x.draft; });
      return section("suosittelijat", "ice", { navLabel: c.navLabel, draft: anyDraft }, [
        heading("suosittelijat", c.heading),
        c.note ? txt("p", c.note, { class: "refs__note" }) : null,
        h("div", { class: "refs" }, r.map(function (x) {
          var full = lang(x.quote);
          return h("figure", { class: "ref" }, [
            txt("blockquote", lang(x.highlight) || full, { class: "ref__hl" }),
            h("figcaption", { class: "ref__who" }, [
              x.image ? img({ src: x.image, alt: "" }, "ref__face") : h("span", { class: "ref__initials", "aria-hidden": "true", text: String(x.name).replace(/\[|\]/g, "").split(" ").map(function (w) { return w.charAt(0); }).join("").slice(0, 2) }),
              h("div", {}, [txt("strong", x.name), txt("span", lang(x.role))])
            ]),
            lang(x.highlight) && full ? h("details", { class: "ref__more" }, [
              h("summary", { text: ui("readFull") }),
              txt("p", full)
            ]) : null,
            badge(x)
          ]);
        }))
      ]);
    },

    quotes: function (c) {
      var q = state.quotes.filter(function (x) { return visible(x) && x.type !== "reference"; });
      if (!q.length) return null;
      return section("sanottua", "white", { navLabel: c.navLabel, draft: q.some(function (x) { return x.draft; }) }, [
        heading("sanottua", c.heading),
        h("div", { class: "quotes" }, q.map(function (x) {
          return h("figure", { class: "quote" }, [
            txt("blockquote", lang(x.quote)),
            h("figcaption", {}, [h("div", {}, [txt("strong", x.name), txt("span", lang(x.role))])])
          ]);
        }))
      ]);
    },

    positions: function (c) {
      var items = (c.items || []).filter(function (x) { return visible(x) && filled(x.a); });
      if (!items.length) return null;
      return section("kannat", "white", { navLabel: c.navLabel, draft: items.some(function (x) { return x.draft; }) }, [
        heading("kannat", c.heading),
        c.intro ? txt("p", c.intro, { class: "positions__intro" }) : null,
        h("div", { class: "positions" }, items.map(function (it) {
          return h("details", {}, [txt("summary", it.q), txt("p", it.a)]);
        }))
      ]);
    },

    gallery: function (c) {
      var imgs = (c.images || []).filter(function (x) { return x.src || state.draft; });
      if (!imgs.length) return null;
      return section("kuvat", "white", c, [
        heading("kuvat", c.heading),
        h("div", { class: "gallery" }, imgs.map(function (x) { return img(x, "reveal", { sizes: "(max-width: 640px) 100vw, 60vw" }); }))
      ]);
    },

    media: function (c) {
      var items = state.media.filter(visible).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      if (!items.length) return null;
      var cards = h("ul", { class: "media-cards" }, items.map(function (m) {
        var thumb;
        if (m.image) {
          var im = h("img", { src: m.image, alt: "", loading: "lazy", decoding: "async" });
          if (m.focus) im.style.objectPosition = m.focus;
          thumb = h("div", { class: "mc__thumb" }, [im]);
        } else {
          thumb = h("div", { class: "mc__thumb mc__thumb--text", "aria-hidden": "true" }, [h("span", { text: m.outlet })]);
        }
        var inner = [
          thumb,
          h("div", { class: "mc__body" }, [
            h("span", { class: "mc__meta", text: [fmtDate(m.date), m.outlet, (ui("mediaTypes") || {})[m.type] || m.type].filter(Boolean).join(" · ") }),
            txt("span", m.title, { class: "mc__title" }),
            badge(m)
          ])
        ];
        var card = m.url && m.url !== "#"
          ? h("a", { class: "mc", href: m.url, target: "_blank", rel: "noopener" }, inner)
          : h("div", { class: "mc" }, inner);
        return h("li", {}, [card]);
      }));
      var quote = c.quote ? h("figure", { class: "media-quote" }, [
        txt("blockquote", c.quote.text),
        h("figcaption", { text: c.quote.source })
      ]) : null;
      var intro = c.intro ? txt("p", c.intro, { class: "media__intro" }) : null;
      return section("media", "mist", c, [heading("media", c.heading), intro, quote, cards]);
    },

    writings: function (c) {
      var items = (c.items || []).filter(visible);
      if (!items.length) return null;
      return section("kirjoitukset", "cream", c, [
        heading("kirjoitukset", c.heading),
        h("div", { class: "positions" }, items.map(function (it) {
          return h("details", {}, [txt("summary", it.title), h("div", { class: "stack" }, (it.paragraphs || []).map(function (p) { return txt("p", p); }))]);
        }))
      ]);
    },

    contact: function () {
      var m = state.t.material || {};
      var c = state.t.contact || {};
      var bio = function (label, text) {
        var btn = h("button", { class: "btn", type: "button", text: ui("copy") });
        var p = txt("p", text);
        btn.addEventListener("click", function () {
          var done = function () { btn.textContent = ui("copied"); setTimeout(function () { btn.textContent = ui("copy"); }, 1600); };
          var fallback = function () {
            var r = document.createRange(); r.selectNodeContents(p);
            var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
          };
          try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
        });
        return h("div", { class: "bio" }, [h("div", { class: "bio__head" }, [h("b", { text: label }), btn]), p]);
      };
      var line = function (label, value, href) {
        if (!value || !filled(value)) return null;
        var v = href && value.indexOf("[") !== 0 ? h("a", { href: href, text: value }) : txt("span", value);
        return h("div", { class: "contact-line" }, [h("b", { text: label }), v]);
      };
      var sec = h("section", { id: "yhteys", class: "section on-teal", "aria-labelledby": "yhteys-h" }, [
        h("div", { class: "wrap mc__grid" }, [
          h("div", {}, [
            h("h2", { class: "h-section", text: m.heading }),
            txt("p", m.intro, { style: "margin-bottom:1rem" }),
            bio(m.bioShortLabel, m.bioShort),
            bio(m.bioLongLabel, m.bioLong),
            m.photoNote ? txt("p", m.photoNote, { style: "margin-top:1rem;opacity:.85" }) : null
          ]),
          h("div", { class: "contact-col" }, [
            c.image ? img(c.image, "contact__img", { sizes: "(max-width: 860px) 60vw, 25vw" }) : null,
            h("h2", { class: "h-section", id: "yhteys-h", text: c.heading }),
            txt("p", c.text),
            h("div", { class: "contact-lines" }, [
              line(ui("email"), c.email, "mailto:" + c.email),
              line(ui("phone"), c.phone, "tel:" + String(c.phone || "").replace(/\s/g, ""))
            ]),
            h("div", { class: "links" }, (c.links || []).filter(function (l) { return state.draft || (l.url && l.url !== "#"); }).map(function (l) {
              return h("a", { href: l.url, target: "_blank", rel: "noopener", text: l.label });
            }))
          ])
        ])
      ]);
      sec.dataset.nav = c.navLabel;
      return sec;
    }
  };

  // Osioiden järjestys sivulla
  var ORDER = ["hero", "vision", "promises", "band", "about", "results", "attitude",
               "references", "quotes", "positions", "media", "gallery", "writings", "contact"];

  function build() {
    var t = state.t;
    document.documentElement.lang = t.meta.lang;
    document.title = t.meta.title;
    var md = document.querySelector('meta[name="description"]');
    if (md && t.meta.description) md.setAttribute("content", t.meta.description);
    var skip = document.querySelector(".skip");
    if (skip && ui("skip")) skip.textContent = ui("skip");
    var navEl = document.querySelector(".nav");
    if (navEl && ui("navLabel")) navEl.setAttribute("aria-label", ui("navLabel"));
    langSwitch();
    var main = document.getElementById("sisalto");
    main.innerHTML = "";
    ORDER.forEach(function (key) {
      var fn = render[key];
      var el = fn ? fn(t[key] || {}) : null;
      if (el) main.appendChild(el);
    });

    var nav = document.getElementById("nav");
    nav.innerHTML = "";
    main.querySelectorAll("section[data-nav]").forEach(function (s) {
      nav.appendChild(h("li", {}, [h("a", { href: "#" + s.id, text: s.dataset.nav })]));
    });
    document.getElementById("footer").textContent = t.footer || "";
    spy(nav);
  }

  /* Valikko seuraa vieritystä: näkyvän osion linkki korostuu ja vieritetään näkyviin */
  function spy(nav) {
    if (!("IntersectionObserver" in window)) return;
    if (state.io) state.io.disconnect();
    var links = {};
    nav.querySelectorAll("a").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var a = links[e.target.id];
        if (!a || a === current) return;
        if (current) current.removeAttribute("aria-current");
        a.setAttribute("aria-current", "true");
        current = a;
        var box = nav.parentElement;
        if (box && box.scrollWidth > box.clientWidth) {
          var x = a.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft - 16;
          box.scrollTo({ left: Math.max(0, x), behavior: "smooth" });
        }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    state.io = io;
    document.querySelectorAll("section[data-nav]").forEach(function (s) { io.observe(s); });
  }

  /* ---------- Kielenvaihto ---------- */

  function langSwitch() {
    var box = document.getElementById("lang");
    if (!box) return;
    var langs = state.site.languages || ["fi"];
    box.innerHTML = "";
    if (langs.length < 2) return;
    box.setAttribute("aria-label", ui("langLabel") || "Kieli");
    langs.forEach(function (code) {
      var n = LANG_NAMES[code] || [code.toUpperCase(), code];
      var b = h("button", {
        type: "button", lang: code, text: n[0],
        "aria-label": n[1], title: n[1],
        "aria-pressed": code === state.t.meta.lang ? "true" : "false"
      });
      b.addEventListener("click", function () { setLang(code, true); });
      box.appendChild(b);
    });
  }

  // Vaihtaa kielen ja pitää lukijan samassa kohdassa sivua
  function setLang(code, keepPlace) {
    if (state.t.meta && code === state.t.meta.lang) return Promise.resolve();
    var anchor = null, offset = 0;
    if (keepPlace) {
      var secs = document.querySelectorAll("main > section[id]");
      for (var i = 0; i < secs.length; i++) {
        var r = secs[i].getBoundingClientRect();
        if (r.bottom > 80) { anchor = secs[i].id; offset = r.top; break; }
      }
    }
    return getLang(code).then(function (t) {
      if (!t) return;
      state.t = t;
      build();
      try { localStorage.setItem("lang", code); } catch (e) {}
      try {
        var u = new URL(location.href);
        if (code === (state.site.defaultLanguage || "fi")) u.searchParams.delete("lang"); else u.searchParams.set("lang", code);
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      } catch (e) {}
      if (anchor) keepAt(anchor, offset);
    });
  }

  // Pitää osion paikallaan myös silloin, kun yläpuolen kuvat latautuvat uudelleen
  function keepAt(id, offset) {
    var el = document.getElementById(id);
    if (!el) return;
    var go = function () { window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: "instant" }); };
    go();
    var moved = false;
    var onUser = function () { moved = true; };
    ["wheel", "touchstart", "keydown"].forEach(function (ev) { window.addEventListener(ev, onUser, { once: true, passive: true }); });
    // Kuvat ja fontit voivat muuttaa korkeuksia vielä hetken: korjataan paikka niiden mukana
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(function () { if (!moved) go(); });
      ro.observe(document.getElementById("sisalto"));
      setTimeout(function () { ro.disconnect(); }, 2500);
    }
    setTimeout(function () { if (!moved) go(); }, 400);
  }

  function getLang(code) {
    if (state.cache[code]) return Promise.resolve(state.cache[code]);
    return load(code, null).then(function (t) { if (t) state.cache[code] = t; return t; });
  }

  function startLang() {
    var langs = state.site.languages || ["fi"];
    var pick = null;
    try { pick = new URL(location.href).searchParams.get("lang"); } catch (e) {}
    if (!pick) { try { pick = localStorage.getItem("lang"); } catch (e) {} }
    if (langs.indexOf(pick) < 0) pick = state.site.defaultLanguage || "fi";
    return pick;
  }

  /* ---------- Lataus ---------- */

  function load(name, fallback) {
    // Esikatselussa sisältö voi olla upotettuna sivuun
    if (window.__CONTENT__ && window.__CONTENT__[name] !== undefined) return Promise.resolve(window.__CONTENT__[name]);
    return fetch("content/" + name + ".json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function (err) {
        console.error("content/" + name + ".json ei latautunut:", err);
        return fallback;
      });
  }

  Promise.all([load("site", {}), load("media", []), load("quotes", [])])
    .then(function (r) {
      state.site = r[0] || {};
      state.media = Array.isArray(r[1]) ? r[1] : [];
      state.quotes = Array.isArray(r[2]) ? r[2] : [];
      state.draft = !!state.site.draftMode;
      var code = startLang();
      return getLang(code).then(function (t) {
        return t || (code !== "fi" ? getLang(state.site.defaultLanguage || "fi") : null);
      });
    })
    .then(function (t) {
      if (!t) {
        document.getElementById("sisalto").innerHTML =
          '<div class="load-error"><p><strong>Sisältö ei latautunut.</strong> Jos avasit tiedoston suoraan koneelta, ' +
          'käynnistä paikallinen palvelin kansiossa: <code>python3 -m http.server</code> ja avaa ' +
          '<code>http://localhost:8000</code>. Tarkista myös, ettei content/fi.json -tiedostossa ole kirjoitusvirhettä.</p></div>';
        return;
      }
      state.t = t;
      build();
    });
})();
