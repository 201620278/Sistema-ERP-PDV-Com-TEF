let produtosCompraList = [];
let fornecedoresList = [];
let itensCompraAtual = [];
let compraImportadaXml = null;

function loadCompras() {
    $.when(
        $.ajax({ url: `${API_URL}/produtos`, method: 'GET' }),
        $.ajax({ url: `${API_URL}/compras`, method: 'GET' }),
        $.ajax({ url: `${API_URL}/fornecedores`, method: 'GET' })
    ).done(function(produtosResp, comprasResp, fornecedoresResp) {
        produtosCompraList = produtosResp[0] || [];
        fornecedoresList = fornecedoresResp[0] || [];
        renderCompras(comprasResp[0] || []);
    }).fail(function() {
        $('#page-content').html('<div class="alert alert-danger">Erro ao carregar compras.</div>');
    });
}

function renderCompras(compras) {
    const html = `
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
                <div><i class="fas fa-shopping-cart"></i> Compras</div>
                <button class="btn btn-primary btn-sm" onclick="showCompraModal()"><i class="fas fa-plus"></i> Nova compra</button>
            </div>
            <div class="card-body">
                <div class="alert alert-info">
                    Ao salvar a compra, o sistema dá entrada no estoque, atualiza custo/preço de venda e lança a despesa automaticamente no financeiro.
                </div>
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Data</th>
                                <th>Fornecedor</th>
                                <th>Total</th>
                                <th>Condição</th>
                                <th>Forma</th>
                                <th>Status</th>
                                <th>Pendências</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${compras.map(c => `
                                <tr>
                                    <td>${c.id || '-'}</td>
                                    <td>${formatDate(c.data_compra)}</td>
                                    <td>${c.fornecedor || '-'}</td>
                                    <td>${formatCurrency(c.total)}</td>
                                    <td>${rotuloCondicaoPagamento(c.condicao_pagamento || 'avista')}</td>
                                    <td>${rotuloFormaPagamento(c.forma_pagamento)}</td>
                                    <td>${formatBadgeStatusCompra(c.status)}</td>
                                    <td>${c.parcelas_pendentes || 0}</td>
                                    <td>
                                        <button class="btn btn-sm btn-info" onclick="viewCompra(${c.id})" title="Visualizar">
                                            <i class="fas fa-eye"></i>
                                        </button>

                                        <button class="btn btn-sm btn-secondary" onclick="abrirDevolucaoCompra(${c.id})" title="Devolução interna">
                                            <i class="fas fa-undo"></i>
                                        </button>

                                        <button class="btn btn-sm btn-danger" onclick="abrirModalNFeDevolucaoCompra(${c.id})" title="NF-e devolução SEFAZ">
                                            <i class="fas fa-file-invoice"></i>
                                        </button>

                                        <button class="btn btn-sm btn-warning" onclick="cancelarCompra(${c.id})" title="Cancelar compra">
                                            <i class="fas fa-ban"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="9" class="text-center">Nenhuma compra registrada.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    $('#page-content').html(html);
}

function formatBadgeStatusCompra(status) {
    const badges = {
        'normal': '<span class="badge bg-success">Normal</span>',
        'devolvida_parcial': '<span class="badge bg-warning text-dark"><i class="fas fa-undo"></i> Devolvido Parcial</span>',
        'devolvida': '<span class="badge bg-danger"><i class="fas fa-undo"></i> Devolvido Total</span>',
        'cancelada': '<span class="badge bg-secondary"><i class="fas fa-ban"></i> Cancelada</span>'
    };
    return badges[status] || '<span class="badge bg-success">Normal</span>';
}

function rotuloCondicaoPagamento(value) {
    const mapa = { avista: 'À vista', prazo: 'A prazo', parcelado: 'Parcelado', entrada_parcelado: 'Entrada + Parcelamento' };
    return mapa[value] || value || '-';
}

function rotuloFormaPagamento(value) {
    const mapa = {
        dinheiro: 'Dinheiro',
        pix: 'PIX',
        cartao_credito: 'Cartão crédito',
        cartao_debito: 'Cartão débito',
        boleto: 'Boleto',
        transferencia: 'Transferência',
        cheque: 'Cheque'
    };
    return mapa[value] || '-';
}

function formasPagamentoCompra(selected = '') {
    const opcoes = [
        ['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['cartao_credito', 'Cartão crédito'], ['cartao_debito', 'Cartão débito'],
        ['boleto', 'Boleto'], ['transferencia', 'Transferência'], ['cheque', 'Cheque']
    ];
    return opcoes.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function atualizarVisibilidadePagamentoCompra() {
    const condicao = $('#condicao_pagamento').val();
    if (condicao === 'avista') {
        $('#grupo_vencimento_compra').hide();
        $('#grupo_parcelas_compra').hide();
        $('#grupo_entrada_compra').hide();
        $('#data_vencimento').val($('#data_compra').val());
        $('#parcelas').val(1);
        $('#valor_entrada').val(0);
    } else if (condicao === 'prazo') {
        $('#grupo_vencimento_compra').show();
        $('#grupo_parcelas_compra').show();
        $('#grupo_entrada_compra').hide();
        if (parseInt($('#parcelas').val(), 10) < 1) $('#parcelas').val(1);
        $('#valor_entrada').val(0);
    } else if (condicao === 'parcelado') {
        $('#grupo_vencimento_compra').show();
        $('#grupo_parcelas_compra').show();
        $('#grupo_entrada_compra').hide();
        if (parseInt($('#parcelas').val(), 10) < 1) $('#parcelas').val(1);
        $('#valor_entrada').val(0);
    } else if (condicao === 'entrada_parcelado') {
        $('#grupo_vencimento_compra').show();
        $('#grupo_parcelas_compra').show();
        $('#grupo_entrada_compra').show();
        if (parseInt($('#parcelas').val(), 10) < 1) $('#parcelas').val(1);
    }
    calcularParcelasCompra();
}

function calcularParcelasCompra() {
    const total = Number($('#valor_total_nota').val()) || itensCompraAtual.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const parcelas = parseInt($('#parcelas').val(), 10) || 1;
    const dataVencimento = $('#data_vencimento').val();
    const condicao = $('#condicao_pagamento').val();
    const valorEntrada = Number($('#valor_entrada').val()) || 0;

    if (!dataVencimento || (parcelas <= 1 && condicao !== 'entrada_parcelado')) {
        $('#parcelas_detalhes').html('');
        return;
    }

    let html = '<h6>Parcelas:</h6><ul class="list-group list-group-flush">';
    const dataBase = new Date(dataVencimento);

    if (condicao === 'entrada_parcelado' && valorEntrada > 0) {
        // Entrada
        html += `<li class="list-group-item d-flex justify-content-between">
            <span>Entrada</span>
            <span>${formatCurrency(valorEntrada)} - ${dataBase.toISOString().split('T')[0]}</span>
        </li>`;
        // Parcelas restantes
        const valorRestante = total - valorEntrada;
        const valorParcela = valorRestante / parcelas;
        for (let i = 0; i < parcelas; i++) {
            const dataParcela = new Date(dataBase);
            dataParcela.setMonth(dataBase.getMonth() + i);
            html += `<li class="list-group-item d-flex justify-content-between">
                <span>Parcela ${i + 1}</span>
                <span>${formatCurrency(valorParcela)} - ${dataParcela.toISOString().split('T')[0]}</span>
            </li>`;
        }
    } else {
        // Parcelas normais
        const valorParcela = total / parcelas;
        for (let i = 0; i < parcelas; i++) {
            const dataParcela = new Date(dataBase);
            dataParcela.setMonth(dataBase.getMonth() + i);
            html += `<li class="list-group-item d-flex justify-content-between">
                <span>Parcela ${i + 1}</span>
                <span>${formatCurrency(valorParcela)} - ${dataParcela.toISOString().split('T')[0]}</span>
            </li>`;
        }
    }
    html += '</ul>';
    $('#parcelas_detalhes').html(html);
}

function formatNumberInput(value, decimals = 2) {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num.toFixed(decimals) : Number(0).toFixed(decimals);
}

function normalizeItemCompra(item = {}) {
    const custo = Number(item.preco_unitario || item.preco_compra || 0);
    const quantidade = Number(item.quantidade || 1);
    const margem = Number(item.margem_lucro ?? item.lucro_percentual ?? 30);
    const ultimoPrecoCompra = Number(item.ultimo_preco_compra || custo);
    const precoVenda = Number(item.preco_venda_sugerido || item.preco_venda || (custo * (1 + margem / 100)) || 0);
    return {
        produto_id: item.produto_id ? Number(item.produto_id) : '',
        produto_nome: item.produto_nome || item.nome || item.descricao_produto || '',
        codigo_barras: item.codigo_barras || item.codigo || '',
        unidade: item.unidade || 'UN',
        ncm: item.ncm || '',
        quantidade,
        preco_unitario: Number(custo.toFixed(2)),
        ultimo_preco_compra: Number(ultimoPrecoCompra.toFixed(2)),
        margem_lucro: Number(margem.toFixed(2)),
        preco_venda_sugerido: Number(precoVenda.toFixed(2)),
        vendido_por_peso: Number(item.vendido_por_peso || 0),
        peso_total_compra: Number(item.peso_total_compra || item.quantidade || 0),
        custo_por_kg: Number(item.custo_por_kg || custo || 0),
        atualizar_preco_venda: Number(item.atualizar_preco_venda ?? 1),
        frete_rateado: Number(item.frete_rateado || 0),
        desconto_rateado: Number(item.desconto_rateado || 0),
        outras_despesas_rateado: Number(item.outras_despesas_rateado || 0),
        custo_unitario_final: Number(item.custo_unitario_final || custo || 0),
        subtotal: Number((quantidade * custo).toFixed(2))
    };
}

function recalcularLinhaCompra(index, origem = 'custo') {
    const item = itensCompraAtual[index];
    if (!item) return;
    item.quantidade = Number(item.quantidade || 0);
    item.preco_unitario = Number(item.preco_unitario || 0);
    item.margem_lucro = Number(item.margem_lucro || 0);
    item.preco_venda_sugerido = Number(item.preco_venda_sugerido || 0);

    if (origem === 'margem' || origem === 'custo') {
        item.preco_venda_sugerido = Number((item.preco_unitario * (1 + (item.margem_lucro / 100))).toFixed(2));
    } else if (origem === 'venda') {
        item.margem_lucro = item.preco_unitario > 0
            ? Number((((item.preco_venda_sugerido - item.preco_unitario) / item.preco_unitario) * 100).toFixed(2))
            : 0;
    }

    item.subtotal = Number((item.quantidade * item.preco_unitario).toFixed(2));
}


function recalcularTotaisCompraNota() {
    const valorProdutos = itensCompraAtual.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const desconto = Number($('#valor_desconto').val()) || 0;
    const frete = Number($('#valor_frete').val()) || 0;
    const outras = Number($('#valor_outras_despesas').val()) || 0;
    const totalNota = Number((valorProdutos - desconto + frete + outras).toFixed(2));

    $('#valor_produtos').val(formatNumberInput(valorProdutos));
    $('#valor_total_nota').val(formatNumberInput(totalNota));
    $('#totalCompra').text(formatCurrency(totalNota));

    const totalXml = Number($('#valor_total_nota').val()) || totalNota;
    const diferenca = Number((totalXml - totalNota).toFixed(2));

    $('#conferencia_total_compra').remove();

    let classe = Math.abs(diferenca) <= 0.05 ? 'alert-success' : 'alert-warning';
    let texto = Math.abs(diferenca) <= 0.05
        ? 'Conferência OK: total dos itens bate com o total da nota.'
        : `Atenção: diferença entre XML e itens: ${formatCurrency(diferenca)}. Verifique frete, desconto ou despesas.`;

    $('#valor_total_nota').closest('.row').after(`
      <div class="col-12 mt-2" id="conferencia_total_compra">
        <div class="alert ${classe} py-2 mb-0">${texto}</div>
      </div>
    `);
}

function removerItemCompra(index) {
    if (index < 0 || index >= itensCompraAtual.length) return;
    itensCompraAtual.splice(index, 1);
    renderItensCompraTabela();
    calcularParcelasCompra();
}

function renderItensCompraTabela() {
    const tbody = $('#itensCompraBody');
    const optionsProdutos = '<option value="">Selecione</option>' + produtosCompraList.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    tbody.html(itensCompraAtual.map((item, index) => `
        <tr>
            <td style="min-width:220px;">
                <select class="form-control form-control-sm mb-1" onchange="alterarProdutoItemCompra(${index}, this.value)">
                    ${optionsProdutos.replace(`value="${item.produto_id}"`, `value="${item.produto_id}" selected`)}
                </select>
                <div>${escapeHtml(item.produto_nome || '')}</div>
            </td>
            <td style="min-width:120px;">${escapeHtml(item.codigo_barras || '')}</td>
            <td style="min-width:90px;">${formatNumberInput(item.quantidade)}</td>
            <td style="min-width:110px;">
              ${formatCurrency(item.preco_unitario)}
              ${item.custo_unitario_final && Number(item.custo_unitario_final) !== Number(item.preco_unitario)
                ? `<br><small class="text-muted">Custo final: ${formatCurrency(item.custo_unitario_final)}</small>` 
                : ''}
            </td>
            <td style="min-width:95px;">${formatNumberInput(item.margem_lucro)}%</td>
            <td style="min-width:110px;">
              ${formatCurrency(item.preco_venda_sugerido)}
              <br>
              <small>
                <label>
                  <input type="checkbox" ${Number(item.atualizar_preco_venda ?? 1) === 1 ? 'checked' : ''}
                    onchange="itensCompraAtual[${index}].atualizar_preco_venda = this.checked ? 1 : 0">
                  Atualizar preço
                </label>
              </small>
            </td>
            <td>${formatCurrency(item.subtotal)}</td>
            <td>
                <button class="btn btn-sm btn-warning me-1" onclick="editarItemCompra(${index})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="removerItemCompra(${index})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="8" class="text-center">Nenhum item adicionado.</td></tr>');
    recalcularTotaisCompraNota();
    calcularParcelasCompra();
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function alterarCampoItemCompra(index, campo, valor) {
    if (!itensCompraAtual[index]) return;
    itensCompraAtual[index][campo] = valor;
    if (campo === 'produto_nome' && String(valor).trim() === '') {
        itensCompraAtual[index].produto_id = '';
    }
}

function alterarNumeroItemCompra(index, campo, valor, origem) {
    if (!itensCompraAtual[index]) return;
    itensCompraAtual[index][campo] = Number(valor || 0);
    recalcularLinhaCompra(index, origem);
    renderItensCompraTabela();
}

function alterarProdutoItemCompra(index, produtoId) {
    const produto = produtosCompraList.find(p => String(p.id) === String(produtoId));
    if (!itensCompraAtual[index]) return;
    itensCompraAtual[index].produto_id = produtoId ? Number(produtoId) : '';
    if (produto) {
        itensCompraAtual[index].produto_nome = produto.nome;
        itensCompraAtual[index].codigo_barras = produto.codigo_barras || produto.codigo || '';
        itensCompraAtual[index].unidade = produto.unidade || 'UN';
        itensCompraAtual[index].ncm = produto.ncm || '';
        if (!Number(itensCompraAtual[index].preco_unitario)) {
            itensCompraAtual[index].preco_unitario = Number(produto.preco_compra || 0);
        }
        itensCompraAtual[index].ultimo_preco_compra = Number(produto.preco_compra || 0);
        if (!Number(itensCompraAtual[index].preco_venda_sugerido)) {
            itensCompraAtual[index].preco_venda_sugerido = Number(produto.preco_venda || 0);
        }
        if (!Number(itensCompraAtual[index].margem_lucro)) {
            itensCompraAtual[index].margem_lucro = Number(produto.lucro_percentual || 30);
        }
        recalcularLinhaCompra(index, 'custo');
        renderItensCompraTabela();
    }
}

function adicionarItemCompra() {
    const produtoId = $('#produto_id_item').val();
    const descricaoLivre = ($('#codigo_barras_item').val() || '').trim();
    const quantidade = Number($('#quantidade_item').val());
    const preco = Number($('#preco_item').val());
    const margemInput = Number($('#margem_padrao_item').val());
    const precoVendaInput = Number($('#preco_venda_item').val());
    const margem = Number.isFinite(margemInput) ? margemInput : 30;

    if ((!produtoId && !descricaoLivre) || !quantidade || !preco) {
        showNotification('Informe produto ou descrição, quantidade e preço.', 'warning');
        return;
    }

    let margemFinal = margem;
    let precoVenda = preco * (1 + margem / 100);

    if (Number.isFinite(precoVendaInput) && precoVendaInput > 0) {
        precoVenda = precoVendaInput;
        margemFinal = preco > 0 ? ((precoVenda - preco) / preco) * 100 : 0;
    }

    const produto = produtosCompraList.find(p => String(p.id) === String(produtoId));
    const item = normalizeItemCompra({
        produto_id: produto ? produto.id : '',
        produto_nome: produto ? produto.nome : descricaoLivre,
        codigo_barras: produto ? (produto.codigo_barras || produto.codigo || '') : '',
        quantidade,
        preco_unitario: preco,
        ultimo_preco_compra: produto ? Number(produto.preco_compra || 0) : preco,
        margem_lucro: margemFinal,
        preco_venda_sugerido: precoVenda,
        unidade: produto ? (produto.unidade || 'UN') : 'UN',
        ncm: produto ? (produto.ncm || '') : ''
    });

    itensCompraAtual.push(item);
    limparFormularioItemCompra();
    renderItensCompraTabela();
}

function limparFormularioItemCompra() {
    $('#codigo_barras_item').val('');
    $('#produto_id_item').val('');
    $('#quantidade_item').val('1');
    $('#preco_item').val('');
    $('#margem_padrao_item').val('30');
    $('#preco_venda_item').val('');
    $('#codigo_barras_item').focus();
}

function calcularValorVendaItem() {
    const preco = Number($('#preco_item').val()) || 0;
    const margem = Number($('#margem_padrao_item').val()) || 30;
    const valorVenda = preco * (1 + margem / 100);
    $('#preco_venda_item').val(formatNumberInput(valorVenda));
}

function calcularMargemItem() {
    const preco = Number($('#preco_item').val()) || 0;
    const valorVenda = Number($('#preco_venda_item').val()) || 0;
    if (preco > 0) {
        const margem = ((valorVenda - preco) / preco) * 100;
        $('#margem_padrao_item').val(formatNumberInput(margem));
    }
}

function editarItemCompra(index) {
    const item = itensCompraAtual[index];
    if (!item) return;
    // Preencher os campos do formulário
    $('#codigo_barras_item').val(item.produto_nome || item.codigo_barras || '');
    $('#produto_id_item').val(item.produto_id || '');
    $('#quantidade_item').val(formatNumberInput(item.quantidade));
    $('#preco_item').val(formatNumberInput(item.preco_unitario));
    $('#margem_padrao_item').val(formatNumberInput(item.margem_lucro));
    $('#preco_venda_item').val(formatNumberInput(item.preco_venda_sugerido));
    // Recalcular para consistência
    calcularValorVendaItem();
    // Remover o item da lista
    itensCompraAtual.splice(index, 1);
    renderItensCompraTabela();
    $('#codigo_barras_item').focus();
}

function onFornecedorInput() {
    const inputValue = $('#fornecedor').val();
    if (!inputValue) return;
    const fornecedor = fornecedoresList.find(f => String(f.nome || '').toLowerCase() === inputValue.trim().toLowerCase());
    if (fornecedor) {
        $('#fornecedor').val(fornecedor.nome);
    }
}

function onFornecedorKeyDown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const inputValue = $('#fornecedor').val().trim();
    if (!inputValue) return;
    const fornecedor = fornecedoresList.find(f => String(f.nome || '').toLowerCase() === inputValue.toLowerCase());
    if (fornecedor) {
        $('#fornecedor').val(fornecedor.nome);
    }
}

function onProdutoInput() {
    const inputValue = $('#codigo_barras_item').val().trim();
    if (!inputValue) {
        $('#produto_id_item').val('');
        return;
    }
    const produto = findProdutoByInput(inputValue);
    if (produto) {
        $('#produto_id_item').val(produto.id);
        $('#preco_item').val(produto.preco_compra || '');
        $('#margem_padrao_item').val(produto.lucro_percentual || 30);
        calcularValorVendaItem();
    } else {
        $('#produto_id_item').val('');
    }
}

function onProdutoKeyDown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const inputValue = $('#codigo_barras_item').val().trim();
    if (!inputValue) return;
    const produto = findProdutoByInput(inputValue);
    if (!produto) return;

    $('#produto_id_item').val(produto.id);
    $('#preco_item').val(produto.preco_compra || '');
    $('#margem_padrao_item').val(produto.lucro_percentual || 30);
    calcularValorVendaItem();
    $('#codigo_barras_item').val(`${produto.codigo_barras || produto.codigo || ''} - ${produto.nome}`);
    if (parseFloat($('#quantidade_item').val()) > 0 && parseFloat($('#preco_item').val()) > 0) {
        adicionarItemCompra();
    } else {
        $('#quantidade_item').focus();
    }
}

function findFornecedorByTerm(term) {
    const lower = term.toLowerCase();
    return fornecedoresList.find(f => {
        const nome = String(f.nome || '').toLowerCase();
        const contato = String(f.contato || '').toLowerCase();
        return nome === lower || nome.startsWith(lower) || contato.includes(lower);
    });
}

function findProdutoByInput(input) {
    const cleaned = input.replace(/\s+-\s+.*$/, '').trim();
    const lower = input.toLowerCase().trim();
    return produtosCompraList.find(p => {
        const codigo = String(p.codigo || '').trim();
        const codigoBarras = String(p.codigo_barras || '').trim();
        const nome = String(p.nome || '').toLowerCase().trim();
        return codigo === cleaned || codigoBarras === cleaned || nome === lower;
    });
}

function showCompraModal() {
    itensCompraAtual = [];
    compraImportadaXml = null;
    const hoje = new Date().toISOString().split('T')[0];
    const modalHtml = `
        <div class="modal fade" id="compraModal" tabindex="-1">
            <div class="modal-dialog modal-xl modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Lançamento de Nova compra</h5>
                        <div>
                            <button type="button" class="btn btn-sm btn-light me-1" title="Minimizar" onclick="minimizarModal('compraModal')">
                                <i class="fas fa-window-minimize"></i>
                            </button>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                    </div>
                    <div class="modal-body">
                                            <div class="row g-3">
    <div class="col-12">
        <h6 class="border-bottom pb-2 mb-2">Importar XML da NF-e</h6>
    </div>
    <div class="col-md-8">
        <input type="file" class="form-control" id="xmlFile" accept=".xml" onchange="importarXmlCompra(this)">
        <small class="text-muted">Selecione o arquivo XML da nota fiscal para importar os dados automaticamente.</small>
    </div>
    <div class="col-md-4">
        <button type="button" class="btn btn-outline-secondary" onclick="limparImportacaoXml()">Limpar importação</button>
    </div>
</div>

<hr>

<div class="row g-3">
    <div class="col-12">
        <h6 class="border-bottom pb-2 mb-2">Dados da nota de compra</h6>
    </div>

    <div class="col-md-2">
        <label class="form-label">Data da compra *</label>
        <input type="date" class="form-control" id="data_compra" value="${hoje}">
    </div>

    <div class="col-md-2">
        <label class="form-label">Data emissão</label>
        <input type="date" class="form-control" id="data_emissao" value="${hoje}">
    </div>

    <div class="col-md-2">
        <label class="form-label">Data entrada</label>
        <input type="date" class="form-control" id="data_entrada" value="${hoje}">
    </div>

    <div class="col-md-6">
        <label class="form-label">Fornecedor</label>
        <input type="text" class="form-control" id="fornecedor" list="lista_fornecedores" oninput="onFornecedorInput()" onkeydown="onFornecedorKeyDown(event)">
        <datalist id="lista_fornecedores">
            ${fornecedoresList.map(f => `<option value="${escapeHtml(f.nome || '')}"></option>`).join('')}
        </datalist>
    </div>

    <div class="col-md-2">
        <label class="form-label">Número NF</label>
        <input type="text" class="form-control" id="numero_nf" maxlength="20">
    </div>

    <div class="col-md-2">
        <label class="form-label">Série</label>
        <input type="text" class="form-control" id="serie_nf" maxlength="10">
    </div>

    <div class="col-md-2">
        <label class="form-label">Modelo</label>
        <input type="text" class="form-control" id="modelo_nf" value="55" maxlength="5">
    </div>

    <div class="col-md-6">
        <label class="form-label">Chave de acesso</label>
        <input type="text" class="form-control" id="chave_acesso" maxlength="44" placeholder="Digite ou leia a chave da NF" oninput="this.value = this.value.replace(/\\D/g, '')">
        <small class="text-muted">Aceita leitura por leitor de código de barras.</small>
    </div>

    <div class="col-12">
        <label class="form-label">Observação</label>
        <textarea class="form-control" id="observacao_compra" rows="2"></textarea>
    </div>
</div>

<hr>

<div class="row g-3">
    <div class="col-12">
        <h6 class="border-bottom pb-2 mb-2">Itens da compra</h6>
    </div>
</div>
                        <div class="row g-2 align-items-end">
                            <div class="col-md-4">
                                <label class="form-label">Código de barras / descrição rápida</label>
                                <input type="text" class="form-control" id="codigo_barras_item" placeholder="Leitor, código ou nome" list="produtos-datalist" autocomplete="off" oninput="onProdutoInput()" onkeydown="onProdutoKeyDown(event)">
                                <datalist id="produtos-datalist">
                                    ${produtosCompraList.map(p => `<option value="${escapeHtml((p.codigo_barras || p.codigo || '') + ' - ' + p.nome)}"></option>`).join('')}
                                </datalist>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label">Produto</label>
                                <select class="form-control" id="produto_id_item">
                                    <option value="">Selecione</option>
                                    ${produtosCompraList.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-1">
                                <label class="form-label">Qtd</label>
                                <input type="number" step="0.01" class="form-control" id="quantidade_item" value="1">
                            </div>
                            <div class="col-md-1">
                                <label class="form-label">Preço compra</label>
                                <input type="number" step="0.01" class="form-control" id="preco_item" oninput="calcularValorVendaItem()">
                            </div>
                            <div class="col-md-1">
                                <label class="form-label">Margem %</label>
                                <input type="number" step="0.01" class="form-control" id="margem_padrao_item" value="30" oninput="calcularValorVendaItem()">
                            </div>
                            <div class="col-md-1">
                                <label class="form-label">Valor venda</label>
                                <input type="number" step="0.01" class="form-control" id="preco_venda_item" oninput="calcularMargemItem()">
                            </div>
                            <div class="col-md-1">
                                <button class="btn btn-success w-100" onclick="adicionarItemCompra()"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>
                        <div class="table-responsive mt-3">
                            <table class="table table-bordered align-middle">
                                <thead>
                                    <tr>
                                        <th>Produto / descrição</th>
                                        <th>Cód. barras</th>
                                        <th>Qtd</th>
                                        <th>Preço compra</th>
                                        <th>Margem %</th>
                                        <th>Venda sugerida</th>
                                        <th>Subtotal</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                
                                <tbody id="itensCompraBody"></tbody>
                                <tfoot><tr><th colspan="6" class="text-end">Total</th><th id="totalCompra">${formatCurrency(0)}</th><th></th></tr></tfoot>
                            </table>

                            <hr>
                            <div class="row g-2 mt-2">
    <div class="col-12">
        <h6 class="border-bottom pb-2 mb-2">Totais da nota</h6>
    </div>

    <div class="col-md-2">
        <label class="form-label">Valor produtos</label>
        <input type="number" step="0.01" class="form-control" id="valor_produtos" value="0.00" readonly>
    </div>

    <div class="col-md-2">
        <label class="form-label">Desconto</label>
        <input type="number" step="0.01" class="form-control" id="valor_desconto" value="0.00" oninput="recalcularTotaisCompraNota(); calcularParcelasCompra();">
    </div>

    <div class="col-md-2">
        <label class="form-label">Frete</label>
        <input type="number" step="0.01" class="form-control" id="valor_frete" value="0.00" oninput="recalcularTotaisCompraNota(); calcularParcelasCompra();">
    </div>

    <div class="col-md-3">
        <label class="form-label">Outras despesas</label>
        <input type="number" step="0.01" class="form-control" id="valor_outras_despesas" value="0.00" oninput="recalcularTotaisCompraNota(); calcularParcelasCompra();">
    </div>

    <div class="col-md-3">
        <label class="form-label">Valor total da nota</label>
        <input type="number" step="0.01" class="form-control fw-bold" id="valor_total_nota" value="0.00" readonly>
    </div>
</div>

<hr>
                            <div class="row g-2">
                            <div class="col-md-3 mb-3">
                                <label class="form-label">Condição de pagamento *</label>
                                <select class="form-control" id="condicao_pagamento" onchange="atualizarVisibilidadePagamentoCompra()">
                                    <option value="avista">À vista</option>
                                    <option value="prazo">A prazo</option>
                                    <option value="parcelado">Parcelado</option>
                                    <option value="entrada_parcelado">Entrada + Parcelamento</option>
                                </select>
                            </div>
                            <div class="col-md-3 mb-3">
                                <label class="form-label">Forma de pagamento</label>
                                <select class="form-control" id="forma_pagamento"><option value="">Selecione</option>${formasPagamentoCompra()}</select>
                            </div>
                            <div class="col-md-2 mb-3" id="grupo_entrada_compra" style="display:none;">
                                <label class="form-label">Valor entrada</label>
                                <input type="number" step="0.01" class="form-control" id="valor_entrada" value="0" onchange="calcularParcelasCompra()">
                            </div>
                            <div class="col-md-2 mb-3" id="grupo_parcelas_compra" style="display:none;">
                                <label class="form-label">Parcelas após entrada</label>
                                <input type="number" min="1" class="form-control" id="parcelas" value="1" onchange="calcularParcelasCompra()">
                                <small class="text-muted">Informe quantas parcelas serão geradas após a entrada.</small>
                            </div>
                            <div class="col-md-2 mb-3" id="grupo_vencimento_compra" style="display:none;">
                                <label class="form-label">1º vencimento</label>
                                <input type="date" class="form-control" id="data_vencimento" value="${hoje}" onchange="calcularParcelasCompra()">
                            </div>
                        </div>
                        <div id="parcelas_detalhes" class="mb-3"></div>
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" onclick="saveCompra()">Salvar compra</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    $('#modal-container').html(modalHtml);
    $('#compraModal').modal('show');
    renderItensCompraTabela();
    atualizarVisibilidadePagamentoCompra();
}

function saveCompra() {
    if (!itensCompraAtual.length) {
        showNotification('Adicione ao menos um item.', 'warning');
        return;
    }

    const total = Number($('#valor_total_nota').val()) || itensCompraAtual.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const condicaoPagamento = $('#condicao_pagamento').val();
    const valorEntrada = Number($('#valor_entrada').val()) || 0;
    const parcelas = parseInt($('#parcelas').val(), 10) || 1;

    if (condicaoPagamento === 'entrada_parcelado' && valorEntrada <= 0) {
        showNotification('Informe o valor da entrada para Entrada + Parcelamento.', 'warning');
        return;
    }

    const data = {
        data_compra: $('#data_compra').val(),
        data_emissao: $('#data_emissao').val(),
        data_entrada: $('#data_entrada').val(),
        fornecedor: $('#fornecedor').val(),
        fornecedor_cnpj: compraImportadaXml?.fornecedor_cnpj || '',
        fornecedor_rua: compraImportadaXml?.fornecedor_rua || '',
        fornecedor_numero: compraImportadaXml?.fornecedor_numero || '',
        fornecedor_bairro: compraImportadaXml?.fornecedor_bairro || '',
        fornecedor_cidade: compraImportadaXml?.fornecedor_cidade || '',
        fornecedor_uf: compraImportadaXml?.fornecedor_uf || '',
        fornecedor_cep: compraImportadaXml?.fornecedor_cep || '',
        numero_nf: $('#numero_nf').val().trim(),
        serie_nf: $('#serie_nf').val().trim(),
        modelo_nf: $('#modelo_nf').val().trim() || '55',
        chave_acesso: ($('#chave_acesso').val() || '').replace(/\D/g, ''),
        valor_produtos: Number($('#valor_produtos').val()) || 0,
        valor_desconto: Number($('#valor_desconto').val()) || 0,
        valor_frete: Number($('#valor_frete').val()) || 0,
        valor_outras_despesas: Number($('#valor_outras_despesas').val()) || 0,
        valor_total_nota: Number($('#valor_total_nota').val()) || 0,
        total,
        itens: itensCompraAtual.map(item => ({
            produto_id: item.produto_id || null,
            produto_nome: item.produto_nome,
            codigo_barras: item.codigo_barras,
            unidade: item.unidade,
            ncm: item.ncm,
            quantidade: Number(item.quantidade || 0),
            preco_unitario: Number(item.preco_unitario || 0),
            margem_lucro: Number(item.margem_lucro || 0),
            preco_venda_sugerido: Number(item.preco_venda_sugerido || 0),
            subtotal: Number(item.subtotal || 0),
            vendido_por_peso: Number(item.vendido_por_peso || 0),
            peso_total_compra: Number(item.peso_total_compra || item.quantidade || 0),
            custo_por_kg: Number(item.custo_por_kg || item.preco_unitario || 0),
            atualizar_preco_venda: Number(item.atualizar_preco_venda ?? 1)
        })),
        condicao_pagamento: condicaoPagamento,
        forma_pagamento: $('#forma_pagamento').val(),
        data_vencimento: $('#data_vencimento').val(),
        parcelas,
        valor_entrada: valorEntrada,
        observacao: $('#observacao_compra').val()
    };

    if (data.chave_acesso && data.chave_acesso.length !== 44) {
        showNotification('A chave de acesso deve ter 44 dígitos.', 'warning');
        return;
    }

    if (!data.fornecedor || !data.fornecedor.trim()) {
        showNotification('Informe o fornecedor da nota.', 'warning');
        return;
    }

    $.ajax({
        url: `${API_URL}/compras`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(data)
    }).done(function() {
        $('#compraModal').modal('hide');
        showNotification('Compra registrada com sucesso!', 'success');
        loadCompras();
    }).fail(function(xhr) {
        showNotification(xhr.responseJSON?.error || 'Erro ao registrar compra.', 'danger');
    });
}

function viewCompra(id) {
    $.ajax({ url: `${API_URL}/compras/${id}`, method: 'GET' }).done(function(compra) {
        const financeiroHtml = (compra.financeiro || []).map(f => `
            <tr>
                <td>${f.numero_parcela ? `${f.numero_parcela}/${f.total_parcelas}` : '-'}</td>
                <td>${formatDate(f.vencimento || f.data_movimento)}</td>
                <td>${f.status}</td>
                <td>${formatCurrency(f.valor)}</td>
            </tr>
        `).join('') || '<tr><td colspan="4" class="text-center">Sem lançamentos financeiros.</td></tr>';
        const itensHtml = (compra.itens || []).map(item => `
            <tr>
                <td>${escapeHtml(item.produto_nome || item.descricao_produto || '-')}</td>
                <td>${item.quantidade}</td>
                <td>${formatCurrency(item.preco_unitario)}</td>
                <td>${item.margem_lucro || 30}%</td>
                <td>${formatCurrency(item.preco_venda_sugerido || 0)}</td>
                <td>${formatCurrency(item.subtotal)}</td>
            </tr>
        `).join('');
        const modalHtml = `
            <div class="modal fade" id="viewCompraModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Compra ${compra.id}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p><strong>Fornecedor:</strong> ${escapeHtml(compra.fornecedor || '-')}</p>
                            <p>
                                <strong>Data compra:</strong> ${formatDate(compra.data_compra)}
                                ${compra.data_emissao ? ` | <strong>Emissão:</strong> ${formatDate(compra.data_emissao)}` : ''}
                                ${compra.data_entrada ? ` | <strong>Entrada:</strong> ${formatDate(compra.data_entrada)}` : ''}
                            </p>
                            <p>
                                <strong>Número NF:</strong> ${escapeHtml(compra.numero_nf || '-')}
                                | <strong>Série:</strong> ${escapeHtml(compra.serie_nf || '-')}
                                | <strong>Modelo:</strong> ${escapeHtml(compra.modelo_nf || '-')}
                            </p>
                            <p style="word-break: break-all;">
                                <strong>Chave de acesso:</strong> ${escapeHtml(compra.chave_acesso || '-')}
                            </p>
                            <p>
                                <strong>Valor produtos:</strong> ${formatCurrency(compra.valor_produtos || 0)}
                                | <strong>Desconto:</strong> ${formatCurrency(compra.valor_desconto || 0)}
                                | <strong>Frete:</strong> ${formatCurrency(compra.valor_frete || 0)}
                                | <strong>Outras despesas:</strong> ${formatCurrency(compra.valor_outras_despesas || 0)}
                            </p>
                            <p>
                                <strong>Total nota:</strong> ${formatCurrency(compra.valor_total_nota || compra.total || 0)}
                                | <strong>Condição:</strong> ${rotuloCondicaoPagamento(compra.condicao_pagamento || 'avista')}
                                | <strong>Forma:</strong> ${rotuloFormaPagamento(compra.forma_pagamento)}
                            </p>
                            <p><strong>Observação:</strong> ${escapeHtml(compra.observacao || '-')}</p>
                            <h6>Itens</h6>
                            <table class="table table-bordered"><thead><tr><th>Produto</th><th>Qtd</th><th>Preço compra</th><th>Margem</th><th>Venda sugerida</th><th>Subtotal</th></tr></thead><tbody>${itensHtml}</tbody></table>
                            <h6>Lançamentos financeiros gerados</h6>
                            <table class="table table-bordered"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Status</th><th>Valor</th></tr></thead><tbody>${financeiroHtml}</tbody></table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        $('#modal-container').html(modalHtml);
        $('#viewCompraModal').modal('show');
    }).fail(function(xhr) {
        showNotification(xhr.responseJSON?.error || 'Erro ao carregar compra.', 'danger');
    });
}

function cancelarCompra(id) {
    const modalHtml = `
        <div class="modal fade" id="modalCancelarCompra" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-dark">
                        <h5 class="modal-title"><i class="fas fa-ban"></i> Cancelar Compra #${id}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-danger">
                            <i class="fas fa-exclamation-triangle"></i>
                            O sistema vai baixar o estoque e cancelar o financeiro desta compra.
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-bold">Motivo do cancelamento</label>
                            <textarea id="motivoCancelarCompra" class="form-control" rows="3"
                                placeholder="Informe o motivo do cancelamento...">Cancelamento manual</textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Voltar</button>
                        <button type="button" class="btn btn-danger" id="btnConfirmarCancelarCompra">
                            <i class="fas fa-ban"></i> Confirmar Cancelamento
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('#modalCancelarCompra').remove();
    $('body').append(modalHtml);

    const modal = new bootstrap.Modal(document.getElementById('modalCancelarCompra'));
    modal.show();

    document.getElementById('btnConfirmarCancelarCompra').addEventListener('click', function() {
        const motivo = $('#motivoCancelarCompra').val().trim();
        if (!motivo) {
            showNotification('Informe o motivo do cancelamento.', 'warning');
            return;
        }

        modal.hide();

        $.ajax({
            url: `${API_URL}/compras/${id}/cancelar`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ motivo })
        }).done(function() {
            showNotification('Compra cancelada com sucesso!', 'success');
            loadCompras();
        }).fail(function(xhr) {
            showNotification(xhr.responseJSON?.error || 'Erro ao cancelar compra.', 'danger');
        });
    });

    document.getElementById('modalCancelarCompra').addEventListener('hidden.bs.modal', function() {
        $('#modalCancelarCompra').remove();
    });
}

function importarXmlCompra(input) {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('xml', file);

    $.ajax({
        url: `${API_URL}/compras/parse-xml`,
        method: 'POST',
        data: formData,
        processData: false,
        contentType: false
    }).done(function(data) {
        compraImportadaXml = data;
        preencherFormularioCompra(data);
        showNotification('XML importado com sucesso!', 'success');
    }).fail(function(xhr) {
        showNotification(xhr.responseJSON?.error || 'Erro ao importar XML.', 'danger');
    });
}

function limparImportacaoXml() {
    compraImportadaXml = null;
    $('#xmlFile').val('');
    // Reset form to empty
    $('#data_compra').val(new Date().toISOString().split('T')[0]);
    $('#data_emissao').val(new Date().toISOString().split('T')[0]);
    $('#data_entrada').val(new Date().toISOString().split('T')[0]);
    $('#fornecedor').val('');
    $('#numero_nf').val('');
    $('#serie_nf').val('');
    $('#modelo_nf').val('55');
    $('#chave_acesso').val('');
    $('#observacao_compra').val('');
    $('#valor_produtos').val('0.00');
    $('#valor_desconto').val('0.00');
    $('#valor_frete').val('0.00');
    $('#valor_outras_despesas').val('0.00');
    $('#valor_total_nota').val('0.00');
    $('#condicao_pagamento').val('avista');
    $('#forma_pagamento').val('');
    $('#valor_entrada').val('0');
    $('#parcelas').val('1');
    $('#data_vencimento').val(new Date().toISOString().split('T')[0]);
    itensCompraAtual = [];
    renderItensCompraTabela();
    atualizarVisibilidadePagamentoCompra();
}

function preencherFormularioCompra(data) {
    $('#data_emissao').val(data.data_emissao || $('#data_compra').val());
    $('#data_entrada').val(data.data_entrada || $('#data_compra').val());
    $('#fornecedor').val(data.fornecedor || '');
    $('#numero_nf').val(data.numero_nf || '');
    $('#serie_nf').val(data.serie_nf || '');
    $('#modelo_nf').val(data.modelo_nf || '55');
    $('#chave_acesso').val(data.chave_acesso || '');
    $('#observacao_compra').val(data.observacao || '');
    $('#valor_produtos').val(formatNumberInput(data.valor_produtos || 0));
    $('#valor_desconto').val(formatNumberInput(data.valor_desconto || 0));
    $('#valor_frete').val(formatNumberInput(data.valor_frete || 0));
    $('#valor_outras_despesas').val(formatNumberInput(data.valor_outras_despesas || 0));
    $('#valor_total_nota').val(formatNumberInput(data.valor_total_nota || 0));

    // Itens
    itensCompraAtual = (data.itens || []).map(item => normalizeItemCompra(item));
    renderItensCompraTabela();

    // Pagamento padrão
    $('#condicao_pagamento').val('avista');
    atualizarVisibilidadePagamentoCompra();
}

function abrirDevolucaoCompra(id) {
    $.ajax({
        url: `${API_URL}/compras/${id}`,
        method: 'GET'
    }).done(function(compra) {
        const itens = compra.itens || [];

        const linhas = itens.map(item => {
            const qtdComprada = Number(item.quantidade || 0);
            const qtdDevolvida = Number(item.quantidade_devolvida || 0);
            const qtdDisponivel = Math.max(0, qtdComprada - qtdDevolvida);

            return `
                <tr>
                    <td>
                        <strong>${escapeHtml(item.produto_nome || '-')}</strong><br>
                        <small>Cód: ${escapeHtml(item.produto_codigo || item.codigo_barras || '-')}</small>
                    </td>
                    <td>${qtdComprada}</td>
                    <td>${qtdDevolvida}</td>
                    <td><strong>${qtdDisponivel}</strong></td>
                    <td>${formatCurrency(item.custo_unitario_final || item.preco_unitario || 0)}</td>
                    <td>
                        <input
                            type="number"
                            class="form-control form-control-sm qtd-devolver-compra"
                            data-item-id="${item.id}"
                            min="0"
                            max="${qtdDisponivel}"
                            step="0.001"
                            value="0"
                            ${qtdDisponivel <= 0 ? 'disabled' : ''}
                        >
                    </td>
                </tr>
            `;
        }).join('');

        const modalHtml = `
            <div class="modal fade" id="modalDevolucaoCompra" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header bg-secondary text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-undo"></i> Devolução da Compra #${compra.id}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>

                        <div class="modal-body">
                            <div class="alert alert-warning">
                                Esta devolução é interna: baixa estoque e gera crédito no financeiro.
                                A emissão fiscal SEFAZ modelo 55 será a próxima etapa.
                            </div>

                            <p><strong>Fornecedor:</strong> ${escapeHtml(compra.fornecedor || '-')}</p>
                            <p><strong>Total da compra:</strong> ${formatCurrency(compra.total)}</p>

                            <div class="mb-3">
                                <label class="form-label">Motivo da devolução</label>
                                <textarea id="motivoDevolucaoCompra" class="form-control" rows="3"
                                    placeholder="Ex: Produto veio errado, danificado ou diferente do solicitado."></textarea>
                            </div>

                            <div class="table-responsive">
                                <table class="table table-sm table-bordered align-middle">
                                    <thead>
                                        <tr>
                                            <th>Produto</th>
                                            <th>Comprada</th>
                                            <th>Já devolvida</th>
                                            <th>Disponível</th>
                                            <th>Custo</th>
                                            <th>Qtd devolver</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${linhas || '<tr><td colspan="6" class="text-center">Nenhum item encontrado.</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div class="modal-footer">
                            <button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                            <button class="btn btn-danger" onclick="confirmarDevolucaoCompra(${compra.id})">
                                Confirmar devolução
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        $('#modalDevolucaoCompra').remove();
        $('body').append(modalHtml);
        $('#modalDevolucaoCompra').modal('show');

        $('#modalDevolucaoCompra').on('hidden.bs.modal', function () {
            $('#modalDevolucaoCompra').remove();
        });
    }).fail(function(xhr) {
        showNotification(xhr.responseJSON?.error || 'Erro ao carregar compra.', 'danger');
    });
}

function confirmarDevolucaoCompra(id) {
    const motivo = $('#motivoDevolucaoCompra').val().trim();

    if (!motivo || motivo.length < 10) {
        showNotification('Informe um motivo com no mínimo 10 caracteres.', 'warning');
        return;
    }

    const itens = [];

    $('.qtd-devolver-compra').each(function() {
        const quantidade = Number($(this).val() || 0);
        const compraItemId = Number($(this).data('item-id'));
        const max = Number($(this).attr('max') || 0);

        if (quantidade > max) {
            showNotification('Quantidade devolvida maior que a disponível.', 'warning');
            itens.length = 0;
            return false;
        }

        if (quantidade > 0) {
            itens.push({
                compra_item_id: compraItemId,
                quantidade
            });
        }
    });

    if (!itens.length) {
        showNotification('Informe a quantidade de pelo menos um item para devolver.', 'warning');
        return;
    }

    if (!confirm('Confirma a devolução parcial/total dos itens selecionados?')) {
        return;
    }

    $.ajax({
        url: `${API_URL}/compras/${id}/devolver`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ motivo, itens })
    }).done(function(resp) {
        showNotification(resp.message || 'Devolução registrada com sucesso.', 'success');
        $('#modalDevolucaoCompra').modal('hide');
        loadCompras();
    }).fail(function(xhr) {
        showNotification(xhr.responseJSON?.error || 'Erro ao registrar devolução.', 'danger');
    });
}

function abrirModalNFeDevolucaoCompra(id) {
    $.ajax({
        url: `${API_URL}/compras/${id}`,
        method: 'GET'
    }).done(function(compra) {
        const itens = compra.itens || [];

        const itensDevolvidos = itens.filter(item => Number(item.quantidade_devolvida || 0) > 0);

        const linhas = itensDevolvidos.map(item => `
            <tr>
                <td>${escapeHtml(item.produto_nome || item.descricao_produto || '-')}</td>
                <td>${Number(item.quantidade_devolvida || 0)}</td>
                <td>${formatCurrency(item.custo_unitario_final || item.preco_unitario || 0)}</td>
                <td>${formatCurrency(Number(item.quantidade_devolvida || 0) * Number(item.custo_unitario_final || item.preco_unitario || 0))}</td>
            </tr>
        `).join('');

        const chaveAtual = String(compra.chave_acesso || '').replace(/\D/g, '');

        const modalHtml = `
            <div class="modal fade" id="modalNFeDevolucaoCompra" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header bg-danger text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-file-invoice"></i> NF-e de Devolução SEFAZ - Compra #${compra.id}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>

                        <div class="modal-body">
                            <div class="alert alert-warning">
                                Antes de emitir para a SEFAZ, registre primeiro a <strong>devolução interna</strong>.
                                A NF-e de devolução será emitida somente para os itens já devolvidos.
                            </div>

                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <strong>Fornecedor:</strong><br>
                                    ${escapeHtml(compra.fornecedor || '-')}
                                </div>
                                <div class="col-md-3">
                                    <strong>Total da compra:</strong><br>
                                    ${formatCurrency(compra.total)}
                                </div>
                                <div class="col-md-3">
                                    <strong>Status:</strong><br>
                                    ${escapeHtml(compra.status || '-')}
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">
                                    Chave de acesso da NF-e original do fornecedor
                                </label>
                                <input
                                    type="text"
                                    id="chaveNFeFornecedorDevolucao"
                                    class="form-control"
                                    maxlength="44"
                                    placeholder="Digite ou cole a chave de 44 dígitos"
                                    value="${escapeHtml(chaveAtual)}"
                                >
                                <small class="text-muted">
                                    Obrigatório para emitir NF-e de devolução. Deve conter 44 dígitos.
                                </small>
                            </div>

                            <h6>Itens já devolvidos internamente</h6>

                            <div class="table-responsive">
                                <table class="table table-sm table-bordered align-middle">
                                    <thead>
                                        <tr>
                                            <th>Produto</th>
                                            <th>Qtd devolvida</th>
                                            <th>Valor unitário</th>
                                            <th>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${linhas || '<tr><td colspan="4" class="text-center text-danger">Nenhum item devolvido internamente. Faça primeiro a devolução interna.</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div class="modal-footer">
                            <button class="btn btn-secondary" data-bs-dismiss="modal">
                                Fechar
                            </button>

                            <button class="btn btn-primary" onclick="salvarChaveNFeFornecedor(${compra.id})">
                                Salvar chave
                            </button>

                            <button
                                class="btn btn-danger"
                                onclick="confirmarEmissaoNFeDevolucaoCompra(${compra.id})"
                                ${itensDevolvidos.length === 0 ? 'disabled' : ''}
                            >
                                Emitir NF-e devolução SEFAZ
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        $('#modalNFeDevolucaoCompra').remove();
        $('body').append(modalHtml);
        $('#modalNFeDevolucaoCompra').modal('show');

        $('#modalNFeDevolucaoCompra').on('hidden.bs.modal', function () {
            $('#modalNFeDevolucaoCompra').remove();
        });
    }).fail(function(xhr) {
        showNotification(xhr.responseJSON?.error || 'Erro ao carregar compra.', 'danger');
    });
}

function salvarChaveNFeFornecedor(id) {
    const chave = String($('#chaveNFeFornecedorDevolucao').val() || '').replace(/\D/g, '');

    if (chave.length !== 44) {
        showNotification('A chave da NF-e precisa ter 44 dígitos.', 'warning');
        return;
    }

    $.ajax({
        url: `${API_URL}/compras/${id}/chave-nfe-fornecedor`,
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ chave })
    }).done(function(resp) {
        showNotification(resp.message || 'Chave salva com sucesso.', 'success');
    }).fail(function(xhr) {
        showNotification(xhr.responseJSON?.error || 'Erro ao salvar chave.', 'danger');
    });
}

function confirmarEmissaoNFeDevolucaoCompra(id) {
    const chave = String($('#chaveNFeFornecedorDevolucao').val() || '').replace(/\D/g, '');

    if (chave.length !== 44) {
        showNotification('Salve uma chave de NF-e válida com 44 dígitos antes de emitir.', 'warning');
        return;
    }

    if (!confirm('Confirma a emissão da NF-e modelo 55 de devolução para a SEFAZ?')) {
        return;
    }

    salvarChaveNFeFornecedor(id);

    setTimeout(function() {
        $.ajax({
            url: `${API_URL}/compras/${id}/emitir-nfe-devolucao`,
            method: 'POST',
            contentType: 'application/json'
        }).done(function(resp) {
            showNotification(resp.message || 'NF-e de devolução emitida.', 'success');
            console.log('Retorno NF-e devolução:', resp);

            $('#modalNFeDevolucaoCompra').modal('hide');
            loadCompras();
        }).fail(function(xhr) {
            const resposta = xhr.responseJSON || { respostaBruta: xhr.responseText };

            console.error('RETORNO COMPLETO SEFAZ:', resposta);
            console.error('STATUS:', xhr.status);
            console.error('DATA:', resposta);

            const motivo =
                resposta?.xMotivo ||
                resposta?.motivo ||
                resposta?.retorno?.xMotivo ||
                resposta?.retorno?.xmotivo ||
                resposta?.erro ||
                resposta?.mensagem ||
                resposta?.error ||
                'Motivo não informado pelo backend.';

            const cStat =
                resposta?.cStat ||
                resposta?.retorno?.cStat ||
                resposta?.statusSefaz ||
                '';

            alert(
                `NF-e de devolução rejeitada pela SEFAZ.\n\n` +
                `cStat: ${cStat || 'não informado'}\n` +
                `Motivo: ${motivo}`
            );

            showNotification(xhr.responseJSON?.error || 'Erro ao emitir NF-e de devolução.', 'danger');
        });
    }, 500);
}
