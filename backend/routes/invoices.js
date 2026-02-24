const router = require('express').Router();
const fs   = require('fs');
const path = require('path');
const pool = require('../db/pool');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function termsToHtml(text) {
  if (!text) return '';
  return text.split('\n').map(line => {
    const t = line.trim();
    if (!t) return '';
    if (t.startsWith('•') || t.startsWith('-')) {
      return `<li>${t.replace(/^[•\-]\s*/, '')}</li>`;
    }
    return `<p>${t}</p>`;
  }).join('');
}

async function buildInvoiceData(id) {
  const { rows: inv } = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
  if (!inv[0]) return null;

  const { rows: items } = await pool.query(
    'SELECT * FROM line_items WHERE invoice_id = $1 ORDER BY sort_order, id',
    [id]
  );

  const lineItems = items.map(item => ({
    ...item,
    qty:        Number(item.qty),
    unit_price: Number(item.unit_price),
    total:      Number(item.qty) * Number(item.unit_price),
  }));

  const subtotal   = lineItems.reduce((s, i) => s + i.total, 0);
  const vatAmount  = subtotal * (Number(inv[0].vat_percent) / 100);
  const grandTotal = subtotal + vatAmount;

  return {
    ...inv[0],
    vat_percent: Number(inv[0].vat_percent),
    line_items:   lineItems,
    subtotal,
    vat_amount:   vatAmount,
    grand_total:  grandTotal,
    terms_html:   termsToHtml(inv[0].terms),
    invoice_date: inv[0].invoice_date
      ? new Date(inv[0].invoice_date).toLocaleDateString('en-GB')
      : '',
  };
}

function renderTemplate(html, ctx) {
  // {{#if KEY}}...{{/if}}
  html = html.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, k, body) =>
    ctx[k] ? body : ''
  );
  // {{#each line_items}}...{{/each}}
  html = html.replace(/\{\{#each line_items\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, rowTpl) =>
    (ctx.line_items || []).map((item, idx) => {
      let row = rowTpl;
      row = row.replace(/\{\{inc @index\}\}/g, idx + 1);
      row = row.replace(/\{\{formatNum this\.(\w+)\}\}/g, (__, k) => fmtNum(item[k]));
      row = row.replace(/\{\{this\.(\w+)\}\}/g, (__, k) => item[k] ?? '');
      return row;
    }).join('')
  );
  // {{formatNum KEY}}
  html = html.replace(/\{\{formatNum (\w+)\}\}/g, (_, k) => fmtNum(ctx[k]));
  // {{{KEY}}} raw HTML
  html = html.replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => ctx[k] ?? '');
  // {{KEY}}
  html = html.replace(/\{\{(\w+)\}\}/g, (_, k) => (ctx[k] != null ? String(ctx[k]) : ''));
  return html;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/invoices
router.get('/', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const { rows } = await pool.query(
      isAdmin
        ? `SELECT i.*, u.full_name AS client_name, u.username
           FROM invoices i JOIN users u ON u.id = i.client_id
           ORDER BY i.created_at DESC`
        : `SELECT i.*, u.full_name AS client_name
           FROM invoices i JOIN users u ON u.id = i.client_id
           WHERE i.client_id = $1 ORDER BY i.created_at DESC`,
      isAdmin ? [] : [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[invoices/GET]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ⚠️  PDF route MUST come before /:id — otherwise Express catches it as id="pdf"
// GET /api/invoices/:id/pdf
router.get('/:id/pdf', authenticate, async (req, res) => {
  try {
    const data = await buildInvoiceData(req.params.id);
    if (!data) return res.status(404).json({ error: 'Invoice not found' });

    if (req.user.role === 'client' && data.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const templatePath = path.join(__dirname, '../templates/invoice.html');
    const rawHtml = fs.readFileSync(templatePath, 'utf8');
    const renderedHtml = renderTemplate(rawHtml, data);

    // Try Puppeteer; fall back to HTML preview if not available
    try {
      const puppeteer = require('puppeteer');
      const browser   = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: 'new',
      });
      const page = await browser.newPage();
      await page.setContent(renderedHtml, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });
      await browser.close();

      const filename = `invoice-${data.invoice_number || data.id}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(pdfBuffer);
    } catch {
      // Puppeteer unavailable (e.g. first local run without Chrome) — serve HTML
      res.setHeader('Content-Type', 'text/html');
      return res.send(renderedHtml);
    }
  } catch (err) {
    console.error('[invoices/pdf]', err.message);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// GET /api/invoices/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const data = await buildInvoiceData(req.params.id);
    if (!data) return res.status(404).json({ error: 'Invoice not found' });
    if (req.user.role === 'client' && data.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(data);
  } catch (err) {
    console.error('[invoices/GET/:id]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/invoices
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const {
    client_id, invoice_number, invoice_date, quote_to,
    client_phone, client_address, client_email,
    company_name, company_address, company_website, company_logo_url,
    vat_percent, currency, terms, line_items = [],
  } = req.body;

  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  try {
    // Verify client exists
    const { rows: clientCheck } = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'client'`, [client_id]
    );
    if (!clientCheck[0]) return res.status(400).json({ error: 'Client not found' });

    const { rows } = await pool.query(
      `INSERT INTO invoices (
        client_id, invoice_number, invoice_date, quote_to,
        client_phone, client_address, client_email,
        company_name, company_address, company_website, company_logo_url,
        vat_percent, currency, terms
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *`,
      [
        client_id,
        invoice_number   || null,
        invoice_date     || null,
        quote_to         || null,
        client_phone     || null,
        client_address   || null,
        client_email     || null,
        company_name     || 'DrawBit',
        company_address  || '37, Hassan Aflaton St., Ard El Golf, Nasr City',
        company_website  || 'www.drawbit.tech',
        company_logo_url || null,
        vat_percent != null ? vat_percent : 14,
        currency    || 'USD',
        terms       || null,
      ]
    );

    const invoiceId = rows[0].id;
    for (let i = 0; i < line_items.length; i++) {
      const { description, qty, unit_price } = line_items[i];
      if (!description || unit_price == null) continue; // skip blank rows
      await pool.query(
        `INSERT INTO line_items (invoice_id, sort_order, description, qty, unit_price)
         VALUES ($1,$2,$3,$4,$5)`,
        [invoiceId, i, description, qty ?? 1, unit_price]
      );
    }

    res.status(201).json(await buildInvoiceData(invoiceId));
  } catch (err) {
    console.error('[invoices/POST]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/invoices/:id
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const id = req.params.id;
  const {
    invoice_number, invoice_date, quote_to,
    client_phone, client_address, client_email,
    company_name, company_address, company_website, company_logo_url,
    vat_percent, currency, terms, status, line_items,
  } = req.body;

  try {
    // Only update provided fields (explicit list — no silent COALESCE nulls)
    const fields = [];
    const vals   = [];
    const set = (col, val) => { fields.push(`${col} = $${fields.length + 1}`); vals.push(val); };

    if (invoice_number   !== undefined) set('invoice_number',   invoice_number);
    if (invoice_date     !== undefined) set('invoice_date',     invoice_date || null);
    if (quote_to         !== undefined) set('quote_to',         quote_to);
    if (client_phone     !== undefined) set('client_phone',     client_phone);
    if (client_address   !== undefined) set('client_address',   client_address);
    if (client_email     !== undefined) set('client_email',     client_email);
    if (company_name     !== undefined) set('company_name',     company_name);
    if (company_address  !== undefined) set('company_address',  company_address);
    if (company_website  !== undefined) set('company_website',  company_website);
    if (company_logo_url !== undefined) set('company_logo_url', company_logo_url);
    if (vat_percent      !== undefined) set('vat_percent',      vat_percent);
    if (currency         !== undefined) set('currency',         currency);
    if (terms            !== undefined) set('terms',            terms);
    if (status           !== undefined) set('status',           status);

    if (fields.length > 0) {
      vals.push(id);
      await pool.query(
        `UPDATE invoices SET ${fields.join(', ')} WHERE id = $${vals.length}`,
        vals
      );
    }

    if (Array.isArray(line_items)) {
      await pool.query('DELETE FROM line_items WHERE invoice_id = $1', [id]);
      for (let i = 0; i < line_items.length; i++) {
        const { description, qty, unit_price } = line_items[i];
        if (!description || unit_price == null) continue;
        await pool.query(
          `INSERT INTO line_items (invoice_id, sort_order, description, qty, unit_price)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, i, description, qty ?? 1, unit_price]
        );
      }
    }

    res.json(await buildInvoiceData(id));
  } catch (err) {
    console.error('[invoices/PUT]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/invoices/:id
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[invoices/DELETE]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
