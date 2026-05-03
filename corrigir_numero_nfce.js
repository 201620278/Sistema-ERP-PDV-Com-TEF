const db = require('./backend/database');

db.get(`
  SELECT MAX(CAST(numero AS INTEGER)) AS maior_numero
  FROM nfce_notas
`, [], (err, row) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }

  const maior = Number(row?.maior_numero || 0);
  const proximo = maior + 1;

  db.run(`
    UPDATE configuracoes
    SET valor = ?, updated_at = CURRENT_TIMESTAMP
    WHERE chave = 'fiscal_numero_atual'
  `, [String(proximo)], (updateErr) => {
    if (updateErr) {
      console.error(updateErr.message);
      process.exit(1);
    }

    console.log(`Número NFC-e corrigido. Próximo número será: ${proximo}`);
    process.exit(0);
  });
});
