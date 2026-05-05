const path = require('path');
const fs = require('fs');

// Detectar caminho do banco
let dbPath = process.env.DB_DIR;
if (!dbPath) {
  const possiblePaths = [
    'C:\\projetos\\MercantilFiscal\\dados',
    path.join(__dirname, 'dados'),
    './dados'
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      dbPath = p;
      break;
    }
  }
}

console.log('DB_DIR:', dbPath);

const db = require('./backend/database');

db.get('SELECT chave, valor FROM configuracoes WHERE chave=?', ['fiscal_numero_atual'], (err, row) => {
  if (err) {
    console.error('Erro:', err.message);
  } else {
    console.log('CONFIG fiscal_numero_atual:', row);
  }
  
  db.get('SELECT MAX(CAST(numero AS INTEGER)) as maior FROM nfce_notas', [], (err2, row2) => {
    if (err2) {
      console.error('Erro MAX:', err2.message);
    } else {
      console.log('MAX numero no banco:', row2);
    }
    setTimeout(() => process.exit(0), 100);
  });
});
