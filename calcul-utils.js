'use strict';
const BuilderUtils = {
  parsePrices(text, catalogue) {
    const rows = text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
    if (rows.shift().trim().toLowerCase() !== 'type;reference;prix_ht') throw new Error('En-tête attendu : type;reference;prix_ht');
    const updates = new Map();
    let ignored = 0;
    const seen = new Set();
    for (const row of rows) {
      if (!row.trim()) continue;
      const cols = row.split(';').map(c=>c.trim());
      if (cols.length !== 3 || !cols[1] || !cols[2]) throw new Error('Ligne CSV incomplète.');
      const price = Number(cols[2].replace(',','.'));
      if (!Number.isFinite(price) || price < 0 || price > 100000 || seen.has(cols[1])) throw new Error('Prix invalide ou référence dupliquée : '+cols[1]);
      seen.add(cols[1]);
      const article = catalogue.find(a=>a.Reference===cols[1]);
      if (article) updates.set(article,price); else ignored++;
    }
    if (!updates.size) throw new Error('Aucune référence reconnue pour ce calculateur.');
    return {updates,ignored};
  },
  async importPrices(input, catalogue, refresh) {
    try {
      const file = input.files?.[0];
      if (!file) return;
      const text = /\.csv$/i.test(file.name) ? await file.text() : null;
      if (typeof window !== 'undefined' && window.SupplierCatalogues?.importFile && (text === null || text.replace(/^\uFEFF/,'').trim().split(/\r?\n/)[0].trim().toLowerCase() !== 'type;reference;prix_ht')) {
        await window.SupplierCatalogues.importFile(file);
        return;
      }
      const {updates,ignored} = this.parsePrices(text ?? await file.text(),catalogue);
      updates.forEach((price,article)=>article.Prix_public_HT=price);
      refresh();
      document.getElementById('tarifStatus').textContent = `${updates.size} tarifs importés${ignored ? ' ; '+ignored+' références hors de ce calculateur' : ''}.`;
    } catch(err) { alert(err.message); }
    finally { input.value = ''; }
  },
  number(id, min = 0, max = 1000) {
    const input = document.getElementById(id);
    const raw = String(input.value).trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${input.labels?.[0]?.textContent || id} : valeur attendue entre ${min} et ${max}.`);
    }
    return value;
  },
  escape(value) {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },
  supports(length, spacing) {
    return Math.max(2, Math.ceil(length / spacing - 1e-9) + 1);
  },
  // Placement décroissant dans le premier stock disponible. Trait de scie 3 mm.
  pack(cuts, stock, kerf = .003) {
    if (!Number.isFinite(stock) || stock <= 0) throw new Error('Longueur de stock invalide.');
    const bins = [];
    for (const cut of [...cuts].sort((a,b) => b.length-a.length)) {
      if (!Number.isFinite(cut.length) || cut.length <= 0 || cut.length > stock + 1e-9) {
        throw new Error('Une pièce dépasse la longueur du stock sélectionné. Choisissez une longueur adaptée.');
      }
      let bin = bins.find(b => b.remaining + 1e-9 >= cut.length + kerf);
      if (!bin) { bin = {remaining:stock, cuts:[], owner:cut.owner}; bins.push(bin); }
      const consumed = cut.length + (bin.cuts.length ? kerf : 0);
      bin.remaining -= consumed;
      bin.cuts.push(cut);
    }
    return bins;
  },
  repeatedCuts(length, count, stock, owner) {
    // Terrasse : les longueurs supérieures au stock exigent des joints sur appui.
    const pieces = Math.ceil(length / stock - 1e-9);
    return Array.from({length:count * pieces}, () => ({length:length/pieces, owner}));
  },
  invalidate(ids, canvases = []) {
    for (const id of ids) document.getElementById(id).textContent = '—';
    document.querySelector('#tableResult tbody').innerHTML = '';
    for (const id of ['blocTechnique','resumePose']) document.getElementById(id).innerHTML = '';
    for (const id of canvases) {
      const canvas = document.getElementById(id);
      canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
    }
  }
};
