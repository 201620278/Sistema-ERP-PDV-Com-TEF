const crypto = require('crypto');

function gerarQRCodeNFCe({ chave, ambiente, idCSC, CSC }) {
  const versaoQR = '2';
  const tpAmb = String(Number(ambiente || 2));
  const idToken = String(Number(String(idCSC || '1').replace(/\D/g, '') || 1));
  const token = String(CSC || '').trim();

  const dadosParaHash = `${chave}|${versaoQR}|${tpAmb}|${idToken}`;

  const hashCSC = crypto
    .createHash('sha1')
    .update(dadosParaHash + token)
    .digest('hex')
    .toUpperCase();

  const urlBase =
    Number(tpAmb) === 1
      ? 'https://nfce.sefaz.ce.gov.br/pages/consultaNota.jsf?p='
      : 'https://nfceh.sefaz.ce.gov.br/pages/consultaNota.jsf?p=';

  return `${urlBase}${chave}|${versaoQR}|${tpAmb}|${idToken}|${hashCSC}`;
}

module.exports = {
  gerarQRCodeNFCe
};
