async function incrementaNumeroFiscal() {
  const cfg = await getConfiguracoes([
    'fiscal_numero_atual',
    'fiscal_serie',
    'fiscal_ambiente'
  ]);

  const numeroConfig = Number(cfg.fiscal_numero_atual || 1);
  const serie = Number(cfg.fiscal_serie || 1);
  const ambiente = Number(cfg.fiscal_ambiente || 2);

  return new Promise((resolve, reject) => {
    db.get(`
      SELECT MAX(CAST(numero AS INTEGER)) AS maior
      FROM nfce_notas
      WHERE CAST(serie AS INTEGER) = ?
        AND CAST(ambiente AS INTEGER) = ?
    `, [serie, ambiente], async (err, row) => {
      if (err) return reject(err);

      const maiorBanco = Number(row?.maior || 0);

      const numeroSeguro = Math.max(
        numeroConfig,
        maiorBanco + 1
      );

      try {
        await setConfiguracao(
          'fiscal_numero_atual',
          String(numeroSeguro + 1),
          'number',
          'Próximo número NFC-e'
        );

        console.log(`[FISCAL] Número usado: ${numeroSeguro}`);
        console.log(`[FISCAL] Próximo número salvo: ${numeroSeguro + 1}`);

        resolve(numeroSeguro);
      } catch (e) {
        reject(e);
      }
    });
  });
}