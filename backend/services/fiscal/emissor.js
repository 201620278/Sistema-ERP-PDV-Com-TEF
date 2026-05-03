const fs = require('fs');
const path = require('path');
const db = require('../../database');
const { getFiscalConfig, incrementaNumeroFiscal } = require('./configService');
const { carregarCertificadoPfx } = require('./certificateService');
const {
  buildNfceXml,
  gerarQrCodeUrl,
  montarInfNFeSupl,
  anexarInfNFeSupl
} = require('./xmlBuilder');
const { assinarNFe } = require('./signer');
const { montarLote, enviarLote } = require('./soapClient');
const { compactarXml } = require('./utils');
const { validarItensFiscal } = require('./validadorFiscal');
const { gerarDanfeHtml } = require('./danfe');
const { getFiscalSubDir } = require('./paths');

console.log('EMISSOR REAL:', __filename);

function salvarDebug(nome, conteudo) {
  const pasta = getFiscalSubDir('debug');
  fs.writeFileSync(path.join(pasta, nome), String(conteudo ?? ''), 'utf8');
}

function carregarVenda(vendaId) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT v.*, c.nome as cliente_nome, c.cpf_cnpj as cliente_cpf
      FROM vendas v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE v.id = ?
    `, [vendaId], (err, venda) => {
      if (err) return reject(err);
      if (!venda) return reject(new Error('Venda não encontrada.'));

      db.all(`
        SELECT
          vi.*,
          p.nome as produto_nome,
          p.ncm as produto_ncm,
          p.cfop,
          p.csosn,
          p.origem,
          p.cest as produto_cest,
          p.codigo_barras as produto_codigo_barras,
          p.unidade
        FROM vendas_itens vi
        INNER JOIN produtos p ON p.id = vi.produto_id
        WHERE vi.venda_id = ?
        ORDER BY vi.id
      `, [vendaId], (itErr, itens) => {
        if (itErr) return reject(itErr);
        resolve({ venda, itens });
      });
    });
  });
}

function salvarNota(payload) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO nfce_notas (
        venda_id, numero, serie, chave_acesso, ambiente, status,
        xml_enviado, xml_retorno, protocolo, recibo, qr_code_url, danfe_html,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `, [
      payload.venda_id,
      payload.numero,
      payload.serie,
      payload.chave_acesso,
      payload.ambiente,
      payload.status,
      payload.xml_enviado || null,
      payload.xml_retorno || null,
      payload.protocolo || null,
      payload.recibo || null,
      payload.qr_code_url || null,
      payload.danfe_html || null
    ], function(err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
  });
}

async function emitirPorVendaId(vendaId) {
  console.log('ENTROU NO EMISSOR FISCAL');
  const { venda, itens } = await carregarVenda(vendaId);

  const existe = await new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM nfce_notas
       WHERE venda_id = ?
         AND status IN ("autorizada","pendente","soap_enviado","configuracao_pendente")
       ORDER BY id DESC
       LIMIT 1`,
      [vendaId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });

  if (existe) {
    return {
      reused: true,
      status: existe.status,
      notaId: existe.id,
      numero: existe.numero,
      chaveAcesso: existe.chave_acesso,
      danfeHtml: existe.danfe_html
    };
  }

  const config = await getFiscalConfig();
  const numero = await incrementaNumeroFiscal();

  if (!config.nomeEmpresa || !config.cnpj || !config.ie) {
    const notaId = await salvarNota({
      venda_id: vendaId,
      numero,
      serie: config.serie,
      chave_acesso: '',
      ambiente: config.ambiente,
      status: 'configuracao_pendente',
      xml_retorno: 'Preencha nome da empresa, CNPJ e IE nas configurações.'
    });

    return {
      success: false,
      notaId,
      status: 'configuracao_pendente',
      message: 'Configuração fiscal incompleta.'
    };
  }

  if (!config.certificadoPath || !fs.existsSync(config.certificadoPath)) {
    const caminhoInfo = config.certificadoPath || '(não informado)';

    const notaId = await salvarNota({
      venda_id: vendaId,
      numero,
      serie: config.serie,
      chave_acesso: '',
      ambiente: config.ambiente,
      status: 'configuracao_pendente',
      xml_retorno: `Certificado A1/PFX não encontrado em: ${caminhoInfo}`
    });

    return {
      success: false,
      notaId,
      status: 'configuracao_pendente',
      message: `Certificado A1/PFX não encontrado em: ${caminhoInfo}`
    };
  }

  const errosFiscais = validarItensFiscal(itens, config.ambiente);
  if (errosFiscais.length > 0) {
    console.warn('Avisos fiscais (homologação):', errosFiscais.join('; '));
  }

  const xmlBase = buildNfceXml({ config, venda, itens, numero });

  let xmlAssinadoFinal = null;
  let qrCodeUrl = '';
  let assinaturaErro = null;
  let certificado = null;

  try {
    salvarDebug('01-xml-nfe-original.xml', xmlBase.xmlSemAssinatura);

    certificado = carregarCertificadoPfx(config.certificadoPath, config.certificadoSenha);

    console.log('ANTES DE CHAMAR assinarNFe');
    console.log('TIPO xmlNfe:', typeof xmlBase.xmlSemAssinatura);
    console.log('TAMANHO xmlNfe:', xmlBase.xmlSemAssinatura ? xmlBase.xmlSemAssinatura.length : 0);
    console.log('CHAVE PRIVADA OK:', !!certificado.privateKeyPem);
    console.log('CERT PEM OK:', !!certificado.certPem);

    salvarDebug('01b-antes-assinatura.txt', [
      `TIPO xmlNfe: ${typeof xmlBase.xmlSemAssinatura}`,
      `TAMANHO xmlNfe: ${xmlBase.xmlSemAssinatura ? xmlBase.xmlSemAssinatura.length : 0}`,
      `CHAVE PRIVADA OK: ${!!certificado.privateKeyPem}`,
      `CERT PEM OK: ${!!certificado.certPem}`
    ].join('\n'));

    const xmlParaAssinar = compactarXml(xmlBase.xmlSemAssinatura);
    salvarDebug('01a-xml-nfe-compactado-antes-assinatura.xml', xmlParaAssinar);

    const assinatura = assinarNFe(
      xmlParaAssinar,
      certificado.privateKeyPem,
      certificado.certPem
    );

    console.log('DEPOIS DE CHAMAR assinarNFe');
    console.log('TAMANHO xmlAssinado:', assinatura.xmlAssinado ? assinatura.xmlAssinado.length : 0);

    salvarDebug('01c-depois-assinatura.txt', [
      `TAMANHO xmlAssinado: ${assinatura.xmlAssinado ? assinatura.xmlAssinado.length : 0}`,
      `DigestValue: ${assinatura.digestValue || ''}`
    ].join('\n'));

    qrCodeUrl = gerarQrCodeUrl({
      consultaUrl: config.urls.consultaQr,
      chave: xmlBase.chave,
      tpAmb: config.ambiente
    });

    const infNFeSupl = montarInfNFeSupl({
      qrCodeUrl,
      urlChave: config.urls.consultaChave || config.urls.consultaQr
    });

    xmlAssinadoFinal = anexarInfNFeSupl(assinatura.xmlAssinado, infNFeSupl);
    xmlAssinadoFinal = compactarXml(xmlAssinadoFinal);

    salvarDebug('02-xml-nfe-assinado.xml', assinatura.xmlAssinado);
    salvarDebug('02b-qrcode-url.txt', qrCodeUrl);
    salvarDebug('02c-infNFeSupl.xml', infNFeSupl);
    salvarDebug('02d-xml-nfe-assinado-final.xml', xmlAssinadoFinal);

    if (!xmlAssinadoFinal.includes('<Signature')) {
      throw new Error('XML final ficou sem Signature.');
    }

    if (!xmlAssinadoFinal.includes('<infNFeSupl>')) {
      throw new Error('XML final ficou sem infNFeSupl.');
    }

    if (!xmlAssinadoFinal.includes('<qrCode><![CDATA[')) {
      throw new Error('XML final ficou sem qrCode.');
    }
  } catch (error) {
    assinaturaErro = error;

    salvarDebug(
      '99-erro-assinatura-emissor.txt',
      error && error.stack ? error.stack : String(error)
    );

    console.error('ERRO FINAL CAPTURADO NO EMISSOR:', error);
  }

  const danfeHtml = await gerarDanfeHtml({
    venda,
    itens,
    empresa: {
      nome: config.nomeEmpresa,
      cnpj: config.cnpj,
      endereco: config.endereco
    },
    chave: xmlBase.chave,
    numero,
    serie: config.serie,
    qrCodeUrl,
    tributos: xmlBase.valores
  });

  let status = assinaturaErro ? 'configuracao_pendente' : 'pendente';
  let xmlRetorno = assinaturaErro ? assinaturaErro.message : null;
  let soapResponse = null;

  if (!assinaturaErro) {
    const loteXml = montarLote(xmlAssinadoFinal, String(numero));

    soapResponse = await enviarLote({
      url: config.urls.autorizacao,
      loteXml,
      certificadoPath: config.certificadoPath,
      certificadoSenha: config.certificadoSenha,
      cUF: config.codigoUf || '23',
      versaoDados: '4.00'
    });

    salvarDebug('05-soap-resposta.json', JSON.stringify(soapResponse, null, 2));
    salvarDebug('06-soap-retorno.xml', String(soapResponse.raw || soapResponse.message || ''));

    const raw = String(soapResponse.raw || soapResponse.message || '');

    if (raw.includes('<cStat>100</cStat>')) {
      status = 'autorizada';

      const protMatch = raw.match(/<nProt>(.*?)<\/nProt>/);
      if (protMatch) {
        soapResponse.protocolo = protMatch[1];
      }
    } else if (raw.includes('<cStat>539</cStat>')) {
      status = 'rejeitada_duplicidade';

      console.warn('NFC-e rejeitada por duplicidade. O próximo número fiscal será corrigido automaticamente.');
    } else if (raw.includes('<cStat>') || /rejeic/i.test(raw)) {
      status = 'rejeitada';
    } else {
      status = soapResponse.status || 'pendente';
    }

    xmlRetorno = raw || null;
  }

  const notaId = await salvarNota({
    venda_id: vendaId,
    numero,
    serie: config.serie,
    chave_acesso: xmlBase.chave,
    ambiente: config.ambiente,
    status,
    xml_enviado: xmlAssinadoFinal,
    xml_retorno: xmlRetorno,
    protocolo: soapResponse?.protocolo || null,
    qr_code_url: qrCodeUrl,
    danfe_html: danfeHtml
  });

  return {
    success: !assinaturaErro,
    notaId,
    status,
    numero,
    chaveAcesso: xmlBase.chave,
    qrCodeUrl,
    danfeHtml,
    soap: soapResponse
  };
}

module.exports = { emitirPorVendaId };