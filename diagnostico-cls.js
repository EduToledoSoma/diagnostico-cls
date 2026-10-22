#!/usr/bin/env node
/*
 * Diagnóstico de CLS com Chromium/Playwright.
 * Uso: node diagnostico-cls.js https://seu-site.com [largura=390] [altura=844]
 * Os dados são coletados desde antes dos scripts da página.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const target = process.argv[2];
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);
if (!target || !/^https?:\/\//i.test(target) || !Number.isInteger(width) || !Number.isInteger(height) || width < 200 || height < 200) {
  console.error('Uso: node diagnostico-cls.js https://seu-site.com [largura=390] [altura=844]');
  process.exit(1);
}

const output = path.join(process.cwd(), `resultado-cls-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(output, { recursive: true });

// Esta função roda no navegador ANTES dos scripts do site.
function installProbe() {
  const state = {
    shifts: [],
    geometryChanges: [],
    resizeChanges: [],
    mutations: [],
    snapshots: [],
    images: [],
    marks: [],
    createdAt: performance.now(),
    viewport: { width: innerWidth, height: innerHeight }
  };
  window.__clsDiagnostic = state;
  const ids = new WeakMap();
  const labels = new Map();
  const previously = new Map();
  const beforeResize = new WeakMap();
  const observed = new WeakSet();
  let nextId = 1;
  let lastSample = 0;
  let domObserver;
  let ro;

  function idOf(node) {
    if (!(node instanceof Element)) return null;
    if (!ids.has(node)) ids.set(node, nextId++);
    return ids.get(node);
  }
  function name(node) {
    if (!(node instanceof Element)) return node?.nodeName || '(sem elemento)';
    const tag = (node.tagName || 'elemento').toLowerCase();
    const id = node.id ? `#${node.id}` : '';
    const cls = [...node.classList].filter(Boolean).slice(0, 3).map(c => '.' + c).join('');
    const label = tag + id + cls;
    labels.set(idOf(node), label);
    return label;
  }
  function sectionOf(node) {
    if (!(node instanceof Element)) return '(elemento ausente)';
    const root = node.closest('section, header, footer, main, nav, .main-slider');
    return root ? name(root) : name(node);
  }
  function rectOf(rect) {
    if (!rect) return null;
    return {
      x: +rect.x.toFixed(1), y: +rect.y.toFixed(1),
      width: +rect.width.toFixed(1), height: +rect.height.toFixed(1)
    };
  }
  function watchElements() {
    if (!document.documentElement || !ro) return;
    const elements = document.querySelectorAll('header, footer, section, main, .main-slider, .swiper-wrapper, #empreendimentos');
    for (const element of elements) {
      if (observed.has(element)) continue;
      observed.add(element);
      ro.observe(element);
    }
  }
  function sample() {
    if (document.visibilityState === 'hidden') return;
    const time = +performance.now().toFixed(1);
    if (time - lastSample < 70) return;
    lastSample = time;
    watchElements();
    const elements = [...document.querySelectorAll('header, footer, section, main, .main-slider, .swiper-wrapper, #empreendimentos')];
    const sizes = [];
    for (const el of new Set(elements)) {
      const r = el.getBoundingClientRect();
      const ident = idOf(el);
      const now = {
        id: ident, element: name(el),
        docY: +(r.y + scrollY).toFixed(1),
        viewportY: +r.y.toFixed(1),
        width: +r.width.toFixed(1), height: +r.height.toFixed(1)
      };
      sizes.push(now);
      const old = previously.get(ident);
      if (old) {
        const dy = +(now.docY - old.docY).toFixed(1);
        const dh = +(now.height - old.height).toFixed(1);
        const dw = +(now.width - old.width).toFixed(1);
        if ((Math.abs(dy) >= 2 || Math.abs(dh) >= 2 || Math.abs(dw) >= 2) && state.geometryChanges.length < 1500) {
          state.geometryChanges.push({ atMs: time, element: now.element, section: sectionOf(el), dy, dh, dw, previous: old, current: now });
        }
      }
      previously.set(ident, now);
    }
    if (state.snapshots.length < 200) state.snapshots.push({ atMs: time, scrollY: +scrollY.toFixed(1), elements: sizes });
  }

  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        const sources = (e.sources || []).map(s => {
          const old = rectOf(s.previousRect);
          const cur = rectOf(s.currentRect);
          return {
            element: name(s.node),
            section: sectionOf(s.node),
            previousRect: old,
            currentRect: cur,
            dy: old && cur ? +(cur.y - old.y).toFixed(1) : null,
            dx: old && cur ? +(cur.x - old.x).toFixed(1) : null
          };
        });
        state.shifts.push({
          atMs: +e.startTime.toFixed(1),
          score: +e.value.toFixed(6),
          hadRecentInput: !!e.hadRecentInput,
          sources
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (error) {
    state.marks.push({ atMs: performance.now(), event: 'Layout Shift API indisponível: ' + error.message });
  }

  function begin() {
    if (!document.documentElement) return;
    state.marks.push({ atMs: +performance.now().toFixed(1), event: 'DOMContentLoaded' });
    ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        // Um ResizeObserver pode capturar variações entre duas amostras periódicas.
        const next = { width: +entry.contentRect.width.toFixed(1), height: +entry.contentRect.height.toFixed(1) };
        const old = beforeResize.get(entry.target);
        if (old && state.resizeChanges.length < 500 &&
            (Math.abs(next.width - old.width) >= 2 || Math.abs(next.height - old.height) >= 2)) {
          state.resizeChanges.push({
            atMs: +performance.now().toFixed(1), element: name(entry.target),
            section: sectionOf(entry.target),
            before: old, after: next,
            dh: +(next.height - old.height).toFixed(1),
            dw: +(next.width - old.width).toFixed(1)
          });
        }
        beforeResize.set(entry.target, next);
      }
    });
    watchElements();
    sample();
    setInterval(sample, 100);

    domObserver = new MutationObserver(records => {
      for (const r of records) {
        if (state.mutations.length >= 300) break;
        const target = r.target;
        if (!(target instanceof Element)) continue;
        if (r.type === 'childList') {
          const noteworthy = [...r.addedNodes, ...r.removedNodes].filter(n => n.nodeType === 1 && !['SCRIPT', 'STYLE'].includes(n.nodeName));
          if (!noteworthy.length) continue;
          if (!target.closest('header, main, section, .main-slider, body')) continue;
          state.mutations.push({
            atMs: +performance.now().toFixed(1), type: 'childList',
            target: name(target), section: sectionOf(target),
            added: [...r.addedNodes].filter(n => n.nodeType === 1).slice(0, 3).map(name),
            removed: [...r.removedNodes].filter(n => n.nodeType === 1).slice(0, 3).map(name)
          });
        } else if (r.type === 'attributes') {
          const isImportant = target.matches('section, header, main, .main-slider, .swiper, .swiper-wrapper, .swiper-slide') || target.id === 'empreendimentos';
          if (!isImportant) continue;
          state.mutations.push({
            atMs: +performance.now().toFixed(1), type: 'attribute',
            target: name(target), section: sectionOf(target),
            attribute: r.attributeName
          });
        }
      }
    });
    domObserver.observe(document.documentElement, {
      attributes: true, attributeFilter: ['style', 'class'],
      childList: true, subtree: true
    });
    document.addEventListener('load', event => {
      if (event.target instanceof HTMLImageElement && state.images.length < 150) {
        state.images.push({
          atMs: +performance.now().toFixed(1),
          element: name(event.target), section: sectionOf(event.target),
          naturalWidth: event.target.naturalWidth, naturalHeight: event.target.naturalHeight,
          hasExplicitSize: !!(event.target.hasAttribute('width') && event.target.hasAttribute('height'))
        });
      }
    }, true);
    document.fonts?.ready.then(() => {
      state.marks.push({ atMs: +performance.now().toFixed(1), event: 'Fontes prontas' });
    }).catch(() => {});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', begin, { once: true });
  } else begin();
  addEventListener('load', () => state.marks.push({ atMs: +performance.now().toFixed(1), event: 'load' }));
  addEventListener('pagehide', () => { domObserver?.disconnect(); ro?.disconnect(); });
}

function clsReport(shifts) {
  const valid = shifts.filter(s => !s.hadRecentInput).sort((a, b) => a.atMs - b.atMs);
  let start = null, previous = null, score = 0;
  let max = 0, best = [];
  let inWindow = [];
  for (const event of valid) {
    if (start === null || event.atMs - previous > 1000 || event.atMs - start > 5000) {
      start = event.atMs;
      score = 0;
      inWindow = [];
    }
    score += event.score;
    inWindow.push(event);
    if (score > max) { max = score; best = [...inWindow]; }
    previous = event.atMs;
  }
  return { cls: +max.toFixed(6), winningEvents: best, validEvents: valid.length };
}

function simplifiedEvent(e) {
  const names = [...new Set(e.sources.map(s => s.section))];
  return `| ${(e.atMs / 1000).toFixed(2)}s | ${e.score.toFixed(4)} | ${names.join(', ') || '(fontes indisponíveis)'} |`;
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true, locale: 'pt-BR',
      reducedMotion: 'no-preference'
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => { if (errors.length < 80) errors.push({ kind: 'javascript', message: String(e) }); });
    page.on('requestfailed', request => {
      if (errors.length < 80) errors.push({ kind: 'rede', url: request.url(), message: request.failure()?.errorText || 'falhou' });
    });
    await context.addInitScript(installProbe);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    let navError = null;
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (error) { navError = String(error.message || error); }
    await page.waitForTimeout(7000);
    const data = await page.evaluate(() => window.__clsDiagnostic || null).catch(() => null);
    if (!data) throw new Error('Não foi possível coletar os dados (verifique redirecionamentos ou bloqueios do site).');

    const finalURL = page.url();
    await page.screenshot({ path: path.join(output, 'screenshot-mobile.png'), fullPage: false }).catch(() => {});
    await context.tracing.stop({ path: path.join(output, 'trace.zip') });

    const report = clsReport(data.shifts);
    const events = report.winningEvents.length ? report.winningEvents : [...data.shifts].sort((a, b) => b.score - a.score).slice(0, 5);
    const affected = new Map();
    for (const event of data.shifts.filter(s => !s.hadRecentInput)) {
      for (const section of new Set(event.sources.map(s => s.section))) {
        affected.set(section, { count: (affected.get(section)?.count || 0) + 1, maxScore: Math.max(affected.get(section)?.maxScore || 0, event.score) });
      }
    }
    const largest = [...data.shifts].filter(s => !s.hadRecentInput).sort((a, b) => b.score - a.score).slice(0, 8);
    const changes = [...data.geometryChanges].sort((a, b) => Math.max(Math.abs(b.dh), Math.abs(b.dy)) - Math.max(Math.abs(a.dh), Math.abs(a.dy)));
    const nearby = e => data.geometryChanges.filter(g => Math.abs(g.atMs - e.atMs) <= 400).sort((a, b) => Math.abs(a.atMs - e.atMs) - Math.abs(b.atMs - e.atMs)).slice(0, 15);
    const nearbyResizes = e => data.resizeChanges.filter(r => Math.abs(r.atMs - e.atMs) <= 400).slice(0, 12);
    const nearbyMutations = e => data.mutations.filter(m => Math.abs(m.atMs - e.atMs) <= 400).slice(0, 12);

    const md = [
      '# Diagnóstico de CLS (mobile)', '',
      `- URL: ${finalURL}`,
      `- Viewport: ${width} × ${height}`,
      `- CLS (janela de sessão máxima): **${report.cls.toFixed(4)}**`,
      `- Eventos sem interação: ${report.validEvents}`,
      '- Ambiente: Chromium automatizado pelo Playwright; pode diferir do PageSpeed.',
      navError ? `- Aviso de navegação: ${navError}` : '',
      '', '## Eventos mais fortes', '',
      '| Momento | Pontuação do evento | Seções afetadas (não são necessariamente as causadoras) |',
      '| --- | ---: | --- |',
      ...largest.map(simplifiedEvent),
      '', '## Seções presentes nas fontes de deslocamento', '',
      '| Seção | Nº de eventos em que apareceu | Maior evento |',
      '| --- | ---: | ---: |',
      ...[...affected].sort((a, b) => b[1].maxScore - a[1].maxScore).slice(0, 25)
        .map(([section, v]) => `| ${section} | ${v.count} | ${v.maxScore.toFixed(4)} |`),
      '', '## Maior janela de CLS (critério usado para a nota)', '',
      ...report.winningEvents.map(e => `- **${(e.atMs / 1000).toFixed(2)}s**: ${e.score.toFixed(4)} — ${[...new Set(e.sources.map(s => s.section))].join(', ')}`),
      '', '## Mudanças de geometria próximas dos eventos maiores', '',
      '*dy* é mudança de posição vertical no documento; *dh* é mudança de altura. Mudanças próximas são pistas, não provas de causalidade.',
      ...events.slice(0, 5).flatMap(e => [
        '', `### Evento ${(e.atMs / 1000).toFixed(2)}s — ${e.score.toFixed(4)}`,
        ...e.sources.map(s => `- Elemento deslocado: ${s.element} — seção: ${s.section}; Y ${s.previousRect?.y ?? '?'} → ${s.currentRect?.y ?? '?'}; altura visível ${s.previousRect?.height ?? '?'} → ${s.currentRect?.height ?? '?'}`),
        ...(nearby(e).length ? nearby(e).map(g => `- Geometria em ${(g.atMs / 1000).toFixed(2)}s: **${g.element}** — dy ${g.dy}px, dh ${g.dh}px, dw ${g.dw}px`) : ['- Nenhuma mudança geométrica amostrada dentro de ±400 ms.']),
        ...(nearbyResizes(e).length ? nearbyResizes(e).slice(0, 6).map(r => `- ResizeObserver em ${(r.atMs / 1000).toFixed(2)}s: **${r.element}** — altura ${r.before.height} → ${r.after.height}px`) : []),
        ...(nearbyMutations(e).length ? nearbyMutations(e).slice(0, 6).map(m => `- DOM em ${(m.atMs / 1000).toFixed(2)}s: ${m.type} em ${m.target}${m.attribute ? ` (${m.attribute})` : ''}`) : [])
      ]),
      '', '## Maiores mudanças medidas', '',
      '| Momento | Elemento | dy (px) | dh (px) |',
      '| --- | --- | ---: | ---: |',
      ...changes.slice(0, 25).map(g => `| ${(g.atMs / 1000).toFixed(2)}s | ${g.element} | ${g.dy} | ${g.dh} |`),
      '', '## Como interpretar', '',
      '1. A lista de fontes mostra elementos que **mudaram de posição**, não necessariamente o código responsável.',
      '2. Se o `#empreendimentos` deslocar e o `.main-slider` mudar de altura antes, investigue a altura do banner.',
      '3. Se a altura do `.swiper-wrapper` mudar perto do evento, investigue inicialização, CSS e dimensões dos slides.',
      '4. Use `trace.zip` para inspecionar a gravação no Playwright Trace Viewer: `npx playwright show-trace trace.zip`.',
      '5. Compare a mesma URL, viewport e condições antes/depois do MR; para reproduzir PageSpeed, use também uma rede/CPU equivalentes.',
      '', '## Arquivos', '',
      '- `dados-cls.json`: detalhes e medidas completas.',
      '- `trace.zip`: snapshots e eventos para investigação.',
      '- `screenshot-mobile.png`: captura ao fim do teste.',
      ''
    ].filter(line => line !== null).join('\n');

    fs.writeFileSync(path.join(output, 'relatorio.md'), md, 'utf8');
    fs.writeFileSync(path.join(output, 'dados-cls.json'), JSON.stringify({ target, finalURL, viewport: { width, height }, metrics: report, affected: Object.fromEntries(affected), data, errors, navError }, null, 2), 'utf8');
    console.log('\n=== DIAGNÓSTICO CLS ===');
    console.log(`URL: ${finalURL}`);
    console.log(`Viewport: ${width} x ${height}`);
    console.log(`CLS: ${report.cls.toFixed(4)}`);
    console.log('\nMaiores eventos:');
    for (const e of largest.slice(0, 5)) {
      console.log(`  ${(e.atMs / 1000).toFixed(2)}s  ${e.score.toFixed(4)}  ${[...new Set(e.sources.map(s => s.section))].join(' | ') || '(fontes indisponíveis)'}`);
    }
    console.log('\nMaiores mudanças de tamanho/posição:');
    for (const c of changes.slice(0, 8)) {
      console.log(`  ${(c.atMs / 1000).toFixed(2)}s  dy=${c.dy}  dh=${c.dh}  ${c.element}`);
    }
    if (errors.length) console.log(`\nAviso: ${errors.length} erros de rede ou de JS (ver dados-cls.json).`);
    console.log(`\nArquivos gerados em: ${output}`);
    console.log('Abra relatorio.md e envie seu conteúdo para revisão do MR.');
    await context.close();
  } finally {
    await browser?.close();
  }
}
main().catch(err => { console.error('Falha no diagnóstico:', err.message || err); process.exitCode = 1; });
