const {
  formatNumber,
  gerarChaveAcesso,
  gerarCodigoNumerico,
  nowDhEmi,
  onlyDigits,
  padLeft,
  round2,
  sha1Hex,
  xmlEscape
} = require('./utils');

function splitEnderecoLivre(endereco) {
  const texto = String(endereco || '').trim();

  if (!texto) {
    return { xLgr: '', nro: 'S/N', xBairro: '', cMun: '', xMun: '', UF: '', CEP: '' };
  }

  const partes = texto.split(',');
  return {
    xLgr: (partes[0] || '').trim(),
    nro: (partes[1] || 'S/N').trim(),
    xBairro: (partes[2] || '').trim()
  };
}

function mapearFormaPagamento(forma) {
  const mapa = {
    dinheiro: '01',
    cheque: '02',
    cartao_credito: '03',
    cartao_debito: '04',
    credito_loja: '05',
    vale_alimentacao: '10',
    vale_refeicao: '11',
    vale_presente: '12',
    vale_combustivel: '13',
    boleto: '15',
    deposito: '16',
    pix: '17',
    transferencia: '18',
    programa_fidelidade: '19',
    sem_pagamento: '90',
    outro: '99',
    prazo: '99'
  };

  return mapa[forma] || '99';
}

function gerarQrCodeUrl({
  consultaUrl,
  chave,
  versaoQrCode = '3',
  tpAmb
}) {
  if (!consultaUrl) {
    return '';
  }

  const dados = [
    chave,
    versaoQrCode,
    tpAmb
  ].join('|');

  const base = consultaUrl.replace(/\/+$/, '');

  return `${base}?p=${dados}`;
}

function montarInfNFeSupl({ qrCodeUrl, urlChave }) {
  if (!qrCodeUrl || !urlChave) {
    return '';
  }

  return (
    `<infNFeSupl>` +
      `<qrCode><![CDATA[${qrCodeUrl}]]></qrCode>` +
      `<urlChave>${xmlEscape(urlChave)}</urlChave>` +
    `</infNFeSupl>`
  );
}

function anexarInfNFeSupl(xmlAssinado, infNFeSupl) {
  if (!infNFeSupl) {
    return xmlAssinado;
  }

  const xml = String(xmlAssinado || '');

  if (xml.includes('<infNFeSupl>')) {
    return xml;
  }

  if (!xml.includes('</infNFe>')) {
    throw new Error('Tag </infNFe> não encontrada ao anexar infNFeSupl.');
  }

  return xml.replace('</infNFe>', `</infNFe>${infNFeSupl}`);
}

function codigoInternoOuBalanca(codigo) {
  const ean = onlyDigits(codigo || '');
  return /^2\d{12}$/.test(ean);
}

function gtinValido(codigo) {
  const ean = onlyDigits(codigo || '');

  if (![8, 12, 13, 14].includes(ean.length)) {
    return false;
  }

  const numeros = ean.split('').map(Number);
  const digito = numeros.pop();

  let soma = 0;
  let peso = 3;

  for (let i = numeros.length - 1; i >= 0; i--) {
    soma += numeros[i] * peso;
    peso = peso === 3 ? 1 : 3;
  }

  const calculado = (10 - (soma % 10)) % 10;
  return calculado === digito;
}

function obterEANFiscal(item) {
  const unidade = String(item.unidade || '').toLowerCase();
  const codigo = item.codigo_barras || item.produto_codigo_barras || '';

  if (unidade === 'kg') {
    return 'SEM GTIN';
  }

  if (codigoInternoOuBalanca(codigo)) {
    return 'SEM GTIN';
  }

  if (!gtinValido(codigo)) {
    return 'SEM GTIN';
  }

  return onlyDigits(codigo);
}

function buildNfceXml({ config, venda, itens, numero }) {
  const dhEmi = nowDhEmi();
  const aamm = dhEmi.slice(2, 4) + dhEmi.slice(5, 7);
  const cNF = gerarCodigoNumerico();

  const chave = gerarChaveAcesso({
    uf: config.codigoUf,
    aamm,
    cnpj: config.cnpj,
    modelo: '65',
    serie: config.serie,
    numero,
    tpEmis: '1',
    cNF
  });

  const enderecoLivre = splitEnderecoLivre(config.endereco);

  const emit = {
    xNome: config.nomeEmpresa,
    xFant: config.nomeEmpresa,
    CNPJ: onlyDigits(config.cnpj),
    IE: onlyDigits(config.ie),
    CRT: config.crt,
    enderEmit: {
      xLgr: config.logradouro || enderecoLivre.xLgr || 'ENDERECO NAO INFORMADO',
      nro: config.numeroEndereco || enderecoLivre.nro || 'S/N',
      xBairro: config.bairro || enderecoLivre.xBairro || 'CENTRO',
      cMun: config.municipioCodigo,
      xMun: config.municipioNome,
      UF: config.uf,
      CEP: onlyDigits(config.cep || ''),
      cPais: '1058',
      xPais: 'BRASIL',
      fone: onlyDigits(config.telefone || '')
    }
  };

  const infAdFisco = config.ambiente === 2
    ? 'EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
    : '';

  let vProd = 0;
  const vDesc = round2(venda.desconto || 0);
  let vNF = 0;

  const descricaoHomologacao = 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';

  const dets = (itens || []).map((item, idx) => {
    const quantidade = Number(item.quantidade || 0);
    const valorUnitario = Number(item.preco_unitario || 0);
    const subtotal = round2(item.subtotal != null ? item.subtotal : quantidade * valorUnitario);
    vProd += subtotal;

    const ncm = padLeft(onlyDigits(item.ncm || item.produto_ncm || '00000000').slice(0, 8), 8);
    const cfop = item.cfop || '5102';
    const cest = onlyDigits(item.cest || item.produto_cest || '');
    const cEAN = obterEANFiscal(item);
    const unidade = item.unidade || 'UN';
    const xProd = Number(config.ambiente) === 2 && idx === 0
      ? descricaoHomologacao
      : item.produto_nome || 'PRODUTO';

    return `
      <det nItem="${idx + 1}">
        <prod>
          <cProd>${xmlEscape(String(item.produto_id || idx + 1))}</cProd>
          <cEAN>${xmlEscape(cEAN || 'SEM GTIN')}</cEAN>
          <xProd>${xmlEscape(xProd)}</xProd>
          <NCM>${ncm}</NCM>
          ${cest ? `<CEST>${cest}</CEST>` : ''}
          <CFOP>${cfop}</CFOP>
          <uCom>${xmlEscape(unidade)}</uCom>
          <qCom>${formatNumber(quantidade, 4)}</qCom>
          <vUnCom>${formatNumber(valorUnitario, 10)}</vUnCom>
          <vProd>${formatNumber(subtotal, 2)}</vProd>
          <cEANTrib>${xmlEscape(cEAN || 'SEM GTIN')}</cEANTrib>
          <uTrib>${xmlEscape(unidade)}</uTrib>
          <qTrib>${formatNumber(quantidade, 4)}</qTrib>
          <vUnTrib>${formatNumber(valorUnitario, 10)}</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            <ICMSSN102>
              <orig>${item.origem != null ? Number(item.origem) : 0}</orig>
              <CSOSN>${xmlEscape(String(item.csosn || '102'))}</CSOSN>
            </ICMSSN102>
          </ICMS>
          <PIS>
            <PISNT>
              <CST>07</CST>
            </PISNT>
          </PIS>
          <COFINS>
            <COFINSNT>
              <CST>07</CST>
            </COFINSNT>
          </COFINS>
        </imposto>
      </det>
    `;
  }).join('');

  vNF = round2(vProd - vDesc);

  const tPag = mapearFormaPagamento(venda.forma_pagamento);

  let blocoCard = '';

  if (tPag === '03' || tPag === '04') {
    blocoCard = `
    <card>
      <tpIntegra>2</tpIntegra>
    </card>`;
  }

  const pag =
    venda.forma_pagamento === 'prazo'
      ? `<detPag><indPag>1</indPag><tPag>99</tPag><vPag>${formatNumber(vNF, 2)}</vPag></detPag>`
      : `<detPag><indPag>0</indPag><tPag>${tPag}</tPag><vPag>${formatNumber(vNF, 2)}</vPag>${blocoCard}</detPag>`;

  const xmlSemAssinatura = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe versao="4.00" Id="NFe${chave}">
    <ide>
      <cUF>${config.codigoUf}</cUF>
      <cNF>${cNF}</cNF>
      <natOp>VENDA NFC-E</natOp>
      <mod>65</mod>
      <serie>${config.serie}</serie>
      <nNF>${numero}</nNF>
      <dhEmi>${dhEmi}</dhEmi>
      <tpNF>1</tpNF>
      <idDest>1</idDest>
      <cMunFG>${config.municipioCodigo}</cMunFG>
      <tpImp>${config.tpImp}</tpImp>
      <tpEmis>1</tpEmis>
      <cDV>${chave.slice(-1)}</cDV>
      <tpAmb>${config.ambiente}</tpAmb>
      <finNFe>1</finNFe>
      <indFinal>1</indFinal>
      <indPres>1</indPres>
      <procEmi>0</procEmi>
      <verProc>CDGESTAO-NFCE-1.0.0</verProc>
    </ide>
    <emit>
      <CNPJ>${emit.CNPJ}</CNPJ>
      <xNome>${xmlEscape(emit.xNome)}</xNome>
      <xFant>${xmlEscape(emit.xFant)}</xFant>
      <enderEmit>
        <xLgr>${xmlEscape(emit.enderEmit.xLgr)}</xLgr>
        <nro>${xmlEscape(emit.enderEmit.nro)}</nro>
        <xBairro>${xmlEscape(emit.enderEmit.xBairro)}</xBairro>
        <cMun>${emit.enderEmit.cMun}</cMun>
        <xMun>${xmlEscape(emit.enderEmit.xMun)}</xMun>
        <UF>${emit.enderEmit.UF}</UF>
        ${emit.enderEmit.CEP ? `<CEP>${emit.enderEmit.CEP}</CEP>` : ''}
        <cPais>${emit.enderEmit.cPais}</cPais>
        <xPais>${emit.enderEmit.xPais}</xPais>
        ${emit.enderEmit.fone ? `<fone>${emit.enderEmit.fone}</fone>` : ''}
      </enderEmit>
      <IE>${emit.IE}</IE>
      <CRT>${emit.CRT}</CRT>
    </emit>
    ${dets}
    <total>
      <ICMSTot>
        <vBC>0.00</vBC>
        <vICMS>0.00</vICMS>
        <vICMSDeson>0.00</vICMSDeson>
        <vFCP>0.00</vFCP>
        <vBCST>0.00</vBCST>
        <vST>0.00</vST>
        <vFCPST>0.00</vFCPST>
        <vFCPSTRet>0.00</vFCPSTRet>
        <vProd>${formatNumber(vProd, 2)}</vProd>
        <vFrete>0.00</vFrete>
        <vSeg>0.00</vSeg>
        <vDesc>${formatNumber(vDesc, 2)}</vDesc>
        <vII>0.00</vII>
        <vIPI>0.00</vIPI>
        <vIPIDevol>0.00</vIPIDevol>
        <vPIS>0.00</vPIS>
        <vCOFINS>0.00</vCOFINS>
        <vOutro>0.00</vOutro>
        <vNF>${formatNumber(vNF, 2)}</vNF>
      </ICMSTot>
    </total>
    <transp>
      <modFrete>9</modFrete>
    </transp>
    <pag>
      ${pag}
    </pag>
    <infAdic>
      <infCpl>${xmlEscape(infAdFisco)}</infCpl>
    </infAdic>
  </infNFe>
</NFe>`;

  return {
    chave,
    numero,
    cNF,
    dhEmi,
    xmlSemAssinatura,
    valores: { vProd, vDesc, vNF }
  };
}

module.exports = {
  buildNfceXml,
  gerarQrCodeUrl,
  montarInfNFeSupl,
  anexarInfNFeSupl,
  mapearFormaPagamento
};