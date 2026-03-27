const fs = require('fs');
const path = require('path');
const { createClient } = require('@base44/sdk');
const appId = process.env.OLD_APP_ID;
const appBaseUrl = process.env.OLD_APP_BASE;
const token = process.env.OLD_TOKEN;
if (!appId || !appBaseUrl || !token) { console.error('Missing env'); process.exit(1); }
const base44 = createClient({ appId, appBaseUrl, token, requiresAuth: true, serverUrl: '' });
const entities = [
  'Project','RFI','ChangeOrder','CostCode','SOVItem','Drawing','WorkPackage','DailyLog','Delivery','Contact','ActionItem','ScheduleTask','Photo','Meeting','LookAhead','ProductionNote','Resource','Alert','ScopeItem','Activity','ProjectNumberSequence','Document','UploadedFile','DrawingSet','Expense','PMAuditLog','PMADecision','PMAAssumption','Inspection','SafetyIncident','PunchlistItem','Warranty','ProjectCloseout','QualityControlRecord','ChangeRequest','Vendor'
];
const outDir = path.join(process.cwd(), 'old-app-data');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
(async () => {
  for (const name of entities) {
    try {
      if (!base44.entities[name]) { console.warn(`Skip ${name}: not defined`); continue; }
      const data = await base44.entities[name].list();
      fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(data, null, 2));
      console.log(`Exported ${name}: ${data.length}`);
    } catch (err) {
      console.warn(`Failed ${name}: ${err.message}`);
    }
  }
})();
