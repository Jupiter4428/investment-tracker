const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { realizedForSell } = require('../services/portfolioEngine');
const { ASSET_TYPES, DEFAULT_TAX_RATES } = require('../constants');

const router = express.Router();
router.use(requireAuth);

function getRates() {
  const rows = db.prepare('SELECT * FROM tax_rates').all();
  const rates = {};
  rows.forEach((r) => {
    rates[r.asset_type] = { gainRate: r.gain_rate, gainNote: r.gain_note, divRate: r.div_rate, intRate: r.int_rate };
  });
  ASSET_TYPES.forEach((a) => {
    if (!rates[a]) rates[a] = DEFAULT_TAX_RATES[a];
  });
  return rates;
}

router.get('/rates', (req, res) => res.json({ rates: getRates() }));

router.put('/rates', (req, res) => {
  const rates = req.body?.rates || {};
  const tx = db.transaction((entries) => {
    const stmt = db.prepare(
      `INSERT INTO tax_rates (asset_type, gain_rate, gain_note, div_rate, int_rate) VALUES (@a,@g,@n,@d,@i)
       ON CONFLICT(asset_type) DO UPDATE SET gain_rate=@g, gain_note=@n, div_rate=@d, int_rate=@i`
    );
    for (const [assetType, r] of entries) {
      stmt.run({
        a: assetType,
        g: Number(r.gainRate) || 0,
        n: r.gainNote || (DEFAULT_TAX_RATES[assetType] || {}).gainNote || '',
        d: Number(r.divRate) || 0,
        i: Number(r.intRate) || 0,
      });
    }
  });
  tx(Object.entries(rates));
  res.json({ ok: true });
});

router.get('/report', (req, res) => {
  const beYear = parseInt(req.query.year, 10);
  if (!beYear) return res.status(400).json({ error: 'กรุณาระบุปีภาษี (พ.ศ.)' });
  const ceYear = beYear - 543;
  const rates = getRates();

  const allTx = db.prepare('SELECT * FROM transactions').all();
  const grouped = {};
  allTx.forEach((t) => {
    (grouped[t.symbol] = grouped[t.symbol] || []).push(t);
  });

  const txsThisYear = allTx.filter((t) => t.date.startsWith(String(ceYear)));
  const byType = {};
  ASSET_TYPES.forEach((a) => (byType[a] = { realized: 0, div: 0, int: 0, taxOnGain: 0, whtDiv: 0, whtInt: 0 }));

  txsThisYear.forEach((t) => {
    const b = byType[t.asset_type] || (byType[t.asset_type] = { realized: 0, div: 0, int: 0, taxOnGain: 0, whtDiv: 0, whtInt: 0 });
    const r = rates[t.asset_type] || { gainRate: 0, divRate: 0, intRate: 0 };
    if (t.action === 'ขาย') {
      const g = realizedForSell(grouped[t.symbol] || [], t);
      b.realized += g;
      b.taxOnGain += Math.max(g, 0) * (r.gainRate || 0) / 100;
    } else if (t.action === 'ปันผล') {
      const amt = t.qty * t.price;
      b.div += amt;
      b.whtDiv += (amt * (r.divRate || 0)) / 100;
    } else if (t.action === 'ดอกเบี้ย') {
      const amt = t.qty * t.price;
      b.int += amt;
      b.whtInt += (amt * (r.intRate || 0)) / 100;
    }
  });

  let totRealized = 0, totDiv = 0, totInt = 0, totTax = 0;
  const rows = Object.entries(byType)
    .filter(([, v]) => v.realized || v.div || v.int)
    .map(([assetType, v]) => {
      totRealized += v.realized;
      totDiv += v.div;
      totInt += v.int;
      totTax += v.taxOnGain + v.whtDiv + v.whtInt;
      return { assetType, ...v, gainNote: (rates[assetType] || {}).gainNote || '-' };
    });

  res.json({ year: beYear, rows, totals: { realized: totRealized, div: totDiv, int: totInt, tax: totTax } });
});

module.exports = router;
