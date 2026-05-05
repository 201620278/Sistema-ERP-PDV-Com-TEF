const db = require('./backend/database');

const query = `
SELECT 'produtos' as tabela, COUNT(*) as total FROM produtos
UNION ALL
SELECT 'vendas', COUNT(*) FROM vendas
UNION ALL
SELECT 'financeiro', COUNT(*) FROM financeiro
UNION ALL
SELECT 'nfce_notas', COUNT(*) FROM nfce_notas
`;

db.all(query, [], (err, rows) => {
  if (err) {
    console.error('Erro:', err.message);
    return;
  }

  console.table(rows);
});
