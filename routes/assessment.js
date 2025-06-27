const express = require('express');
const fs = require('fs');
const path = require('path');
const runZTChecks = require('../services/ztScanner');
const { ClientSecretCredential } = require('@azure/identity');
const { SubscriptionClient } = require('@azure/arm-subscriptions');

const router = express.Router();

router.post('/run', async (req, res) => {
  const { subscriptionId, clientId, clientSecret, env } = req.body;
  const tenantId = process.env.AZURE_TENANT_ID;

  if (!subscriptionId || !clientId || !clientSecret || !env) {
    return res.status(400).json({ error: 'subscriptionId, clientId, Environment, and clientSecret are required' });
  }

  // After receiving user input in req.body
  process.env.AZURE_CLIENT_ID = req.body.clientId;
  process.env.AZURE_CLIENT_SECRET = req.body.clientSecret;
  process.env.AZURE_SUBSCRIPTION_ID = req.body.subscriptionId;
  process.env.ENV = req.body.env;

  try {
    const credential = new ClientSecretCredential(
      tenantId, // Tenant ID can still come from .env or you can add it to the form as well
      clientId,
      clientSecret
    );
    

    // Fetch subscription name from Azure
    let subscriptionName = subscriptionId;
    try {
      const subClient = new SubscriptionClient(credential);
      const sub = await subClient.subscriptions.get(subscriptionId);
      subscriptionName = sub.displayName || subscriptionId;
      console.log(`Fetched subscription name: ${subscriptionName}`);
    } catch (err) {
      console.warn('Could not fetch subscription name, using subscriptionId as fallback.');
    }

    const scanStart = Date.now();
    // Pass credential to runZTChecks
    const results = await runZTChecks();
    const scanEnd = Date.now();
    const scanDurationSec = ((scanEnd - scanStart) / 1000).toFixed(2);

    // Calculate summary for chart
    const totalControls = Array.isArray(results) ? results.length : 1;
    const passedControls = Array.isArray(results)
      ? results.filter(r => r.status === 'PASS').length
      : (results.status === 'PASS' ? 1 : 0);
    const failedControls = totalControls - passedControls;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeSubName = subscriptionName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const reportDir = path.join(__dirname, '../reports');
    const reportFile = `${safeSubName}-${timestamp}.html`;
    const reportPath = path.join(reportDir, reportFile);

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    // Enhanced HTML report with better UI/UX and detailed results
    function renderResourceTable(resources, statusKey = 'remark', isViolating = false) {
      if (!resources || !resources.length) return '<p>No resources found.</p>';
      const keys = Object.keys(resources[0]);
      return `
        <table class="${isViolating ? 'violating-table' : ''}">
          <thead>
            <tr>
              ${keys.map(k => `<th>${k}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${resources.map(r => `
              <tr class="${(r[statusKey] || '').toString().toLowerCase().includes('fail') || (r[statusKey] || '').toString().toLowerCase().includes('not comply') ? 'fail' : 'pass'}">
                ${keys.map(k => `<td>${r[k] !== undefined ? r[k] : ''}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    let controlsHtml = '';
    if (Array.isArray(results)) {
      // If results is an array of controls
      controlsHtml = results.map(control => `
        <section>
          <h3>${control.policy || 'Control'}</h3>
          <p><strong>Status:</strong> <span class="${control.status === 'PASS' ? 'pass' : 'fail'}">${control.status}</span></p>
          <p><strong>Reason:</strong> ${control.reason}</p>
          <details>
            <summary>Scanned Resources</summary>
            ${renderResourceTable(control.scannedResources)}
          </details>
          <details>
            <summary>Violating Resources</summary>
            ${renderResourceTable(control.violatingResources, 'remark', true)}
          </details>
        </section>
      `).join('');
    } else {
      // If results is a single control object
      controlsHtml = `
        <section>
          <h3>${results.policy || 'Control'}</h3>
          <p><strong>Status:</strong> <span class="${results.status === 'PASS' ? 'pass' : 'fail'}">${results.status}</span></p>
          <p><strong>Reason:</strong> ${results.reason}</p>
          <details>
            <summary>Scanned Resources</summary>
            ${renderResourceTable(results.scannedResources)}
          </details>
          <details>
            <summary>Violating Resources</summary>
            ${renderResourceTable(results.violatingResources, 'remark', true)}
          </details>
        </section>
      `;
    }

    const htmlReport = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>ZT Assessment Report - ${safeSubName}-${timestamp}</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 2em; background: #f8fafc; color: #222; }
          h1 { color: #2d6ca2; }
          h2 { color: #1a4d80; }
          h3 { margin-top: 2em; }
          .pass { color: #1b883a; font-weight: bold; }
          .fail { color: #c0392b; font-weight: bold; }
          table { border-collapse: collapse; width: 100%; margin: 1em 0; background: #fff; }
          th, td { border: 1px solid #d0d7de; padding: 8px 12px; text-align: left; }
          th { background: #eaf1fb; }
          tr.pass { background: #eafbe7; }
          tr.fail { background: #fdeaea; }
          .violating-table tr, .violating-table td, .violating-table th {
            background: #ffebeb !important;
            color: #c0392b !important;
            font-weight: bold;
          }
          .violating-table th {
            background: #ffd6d6 !important;
          }
          details { margin-bottom: 1em; }
          summary { cursor: pointer; font-weight: bold; }
          .logo-center {
            display: block;
            margin-left: auto;
            margin-right: auto;
            margin-bottom: 10px;
            height: 60px;
          }
          .report-title {
            text-align: center;
            margin-top: 0;
            margin-bottom: 20px;
            display: block;
          }
          .summary-section {
            background: #f4f8fb;
            border-radius: 8px;
            padding: 1em 2em;
            margin-bottom: 2em;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
            box-shadow: 0 2px 8px #e0e7ef;
          }
          .summary-section strong { color: #2d6ca2; }
          .chart-container {
            width: 350px;
            margin: 0 auto 2em auto;
          }
          @media (max-width: 800px) {
            table, thead, tbody, th, td, tr { display: block; }
            th { position: absolute; left: -9999px; }
            td { border: none; position: relative; padding-left: 50%; }
            td:before { position: absolute; left: 6px; width: 45%; white-space: nowrap; font-weight: bold; }
            .chart-container { width: 100%; }
          }
        </style>
      </head>
      <body>
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Microsoft_Azure.svg/225px-Microsoft_Azure.svg.png" alt="Logo" class="logo-center">
        <h1 class="report-title">ZT Assessment Report</h1>
        <div class="summary-section">
          <p><strong>Report Name:</strong> ${safeSubName}-${timestamp}.html</p>
          <p><strong>Subscription:</strong> ${subscriptionName}</p>
          <p><strong>Subscription ID:</strong> ${subscriptionId}</p>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Scan Duration:</strong> ${scanDurationSec} seconds</p>
          <p><strong>Controls Scanned:</strong> ${totalControls}</p>
          <p><strong>Passed:</strong> <span style="color:#1b883a;font-weight:bold">${passedControls}</span> &nbsp; 
             <strong>Failed:</strong> <span style="color:#c0392b;font-weight:bold">${failedControls}</span></p>
          <div class="chart-container">
            <canvas id="summaryChart"></canvas>
          </div>
        </div>
        <h2>Assessment Summary</h2>
        ${controlsHtml}
        <script>
          const ctx = document.getElementById('summaryChart').getContext('2d');
          new Chart(ctx, {
            type: 'pie',
            data: {
              labels: ['Passed', 'Failed'],
              datasets: [{
                data: [${passedControls}, ${failedControls}],
                backgroundColor: ['#1b883a', '#c0392b'],
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              plugins: {
                legend: { position: 'bottom' }
              }
            }
          });
        </script>
      </body>
      </html>
    `;

    fs.writeFileSync(reportPath, htmlReport);

    res.json({
      message: 'ZT Assessment Completed',
      reportPath: `/reports/${reportFile}`,
      results
    });
  } catch (err) {
    res.status(500).json({ error: 'ZT Scan failed', details: err.message });
  }
});

module.exports = router;

