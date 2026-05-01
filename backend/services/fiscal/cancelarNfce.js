const { getFiscalConfig } = require('./configService');
const { assinarEvento } = require('./signer');
const { carregarCertificadoPfx } = require('./certificateService');
const { compactarXml } = require('./utils');
const axios = require('axios');
const https = require('https');

function getUrlRecepcaoEvento(config) {
  const ambiente = Number(config.ambiente);

  if (ambiente === 1) {
    return 'https://nfce.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx';
  }

  return 'https://nfce-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx';
}

async function cancelarNfce(nota, justificativa) {
  const config = await getFiscalConfig();

  if (!nota.chave || !nota.protocolo) {
    throw new Error('Nota não possui chave ou protocolo.');
  }

  if (!justificativa || justificativa.trim().length < 15) {
    throw new Error('Justificativa deve ter no mínimo 15 caracteres.');
  }

  function formatarDataHoraEvento(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');

    const ano = date.getFullYear();
    const mes = pad(date.getMonth() + 1);
    const dia = pad(date.getDate());
    const hora = pad(date.getHours());
    const min = pad(date.getMinutes());
    const seg = pad(date.getSeconds());

    return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}-03:00`;
  }

  const dataEvento = formatarDataHoraEvento();
  const idLote = String(Date.now()).slice(-15);
  const nSeqEvento = '1';

  const eventoXml = `
    <evento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">
      <infEvento Id="ID110111${nota.chave}${nSeqEvento.padStart(2, '0')}">
        <cOrgao>${config.codigoUf}</cOrgao>
        <tpAmb>${config.ambiente}</tpAmb>
        <CNPJ>${String(config.cnpj || '').replace(/\D/g, '')}</CNPJ>
        <chNFe>${nota.chave}</chNFe>
        <dhEvento>${dataEvento}</dhEvento>
        <tpEvento>110111</tpEvento>
        <nSeqEvento>${nSeqEvento}</nSeqEvento>
        <verEvento>1.00</verEvento>
        <detEvento versao="1.00">
          <descEvento>Cancelamento</descEvento>
          <nProt>${nota.protocolo}</nProt>
          <xJust>${justificativa.trim()}</xJust>
        </detEvento>
      </infEvento>
    </evento>
  `;

  const certificado = carregarCertificadoPfx(
    config.certificadoPath,
    config.certificadoSenha
  );

  const assinatura = assinarEvento(
    compactarXml(eventoXml),
    certificado.privateKeyPem,
    certificado.certPem
  );

  const eventoAssinado = assinatura.xmlAssinado;

  const envEvento = `
    <envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
      <idLote>${idLote}</idLote>
      ${eventoAssinado}
    </envEvento>
  `;

  const soap = `<?xml version="1.0" encoding="utf-8"?>
    <soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                     xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                     xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
      <soap12:Header>
        <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
          <cUF>${config.codigoUf}</cUF>
          <versaoDados>1.00</versaoDados>
        </nfeCabecMsg>
      </soap12:Header>
      <soap12:Body>
        <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
          ${compactarXml(envEvento)}
        </nfeDadosMsg>
      </soap12:Body>
    </soap12:Envelope>`;

  const url = getUrlRecepcaoEvento(config);

  const agent = new https.Agent({
    key: certificado.privateKeyPem,
    cert: certificado.certBundlePem || certificado.certPem,
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2',
    keepAlive: false,
    servername: new URL(url).hostname
  });

  const response = await axios.post(url, soap, {
    httpsAgent: agent,
    proxy: false,
    timeout: 30000,
    responseType: 'text',
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento"',
      'Accept': 'application/soap+xml, text/xml, */*',
      'User-Agent': 'CDGESTAO-NFCE/1.0'
    }
  });

  return response.data;
}

module.exports = cancelarNfce;