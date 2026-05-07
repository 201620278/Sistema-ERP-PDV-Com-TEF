let carrinho = [];
let produtosDisponiveis = [];
let formaPagamentoSelecionada = null;
let clienteSelecionado = null;
let clientesResultados = [];
let vendaPrazoInfo = null;
let vendaEmProcessamento = false;
let pdvClockInterval = null;
let caixaAberto = false;

function normalizarTexto(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .normalize('NFC')
        .toLowerCase();
}

function loadPDV() {
    console.log('Carregando PDV...');

    $.ajax({
        url: `${API_URL}/produtos`,
        method: 'GET',
        cache: false,
        success: function(produtos) {
            produtosDisponiveis = Array.isArray(produtos) ? produtos.map(p => ({
                ...p,
                estoque_atual: Number(p.estoque_atual || 0),
                preco_venda: Number(p.preco_venda || 0)
            })) : [];

            inicializarPDV();
        },
        error: function(xhr) {
            console.error('Erro ao carregar produtos:', xhr);
            produtosDisponiveis = [];
            inicializarPDV();
            showNotification('Erro ao carregar produtos do PDV.', 'danger');
        }
    });
}

function inicializarPDV() {
    $('#operador-nome').text(obterNomeOperador());
    verificarStatusCaixa(); // Verifica caixa antes de iniciar
    atualizarCarrinho();
    iniciarRelogioPDV();
    bindEventosPDV();
    focarCampoCodigo();
    
    // Verificar status do caixa a cada 30 segundos
    setInterval(verificarStatusCaixa, 30000);
}

// Verificar status do caixa
function verificarStatusCaixa() {
    $.ajax({
        url: `${API_URL}/caixa/aberto`,
        method: 'GET',
        cache: false,
        success: function(caixa) {
            caixaAberto = !!caixa;
            atualizarStatusCaixaUI();
        },
        error: function() {
            caixaAberto = false;
            atualizarStatusCaixaUI();
        }
    });
}

// Atualizar UI do status do caixa
function atualizarStatusCaixaUI() {
    const statusEl = $('#statusCaixaPdv');
    const btnFinalizar = $('#btnFinalizarVendaPdv');
    const statusAnterior = statusEl.hasClass('caixa-aberto');

    if (caixaAberto) {
        statusEl.text('🟢 Caixa Aberto');
        statusEl.removeClass('caixa-fechado').addClass('caixa-aberto');
        btnFinalizar.prop('disabled', carrinho.length === 0);
        // Mostrar notificação apenas quando mudar de fechado para aberto
        if (!statusAnterior && statusEl.data('inicializado')) {
            showNotification('Caixa aberto! Pronto para vender.', 'success');
        }
    } else {
        statusEl.text('🔴 Caixa Fechado');
        statusEl.removeClass('caixa-aberto').addClass('caixa-fechado');
        btnFinalizar.prop('disabled', true);
        // Mostrar notificação apenas quando mudar de aberto para fechado
        if (statusAnterior) {
            showNotification('Caixa fechado. Abra o caixa antes de vender.', 'warning');
        }
    }
    statusEl.data('inicializado', true);
}

function focarCampoCodigo() {
    setTimeout(() => {
        const input = $('#buscaProdutoPdv');
        if (input.length) input.trigger('focus');
    }, 120);
}



function obterNomeOperador() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        return user.nome || user.username || 'Usuário';
    } catch (e) {
        return 'Usuário';
    }
}

function iniciarRelogioPDV() {
    atualizarDataHora();

    if (pdvClockInterval) {
        clearInterval(pdvClockInterval);
    }

    pdvClockInterval = setInterval(atualizarDataHora, 1000);
}

function atualizarDataHora() {
    $('#data-hora').text(new Date().toLocaleString('pt-BR'));
}

function bindEventosPDV() {
    $(document).off('keydown.pdvAtalhos').on('keydown.pdvAtalhos', function(e) {
        if (e.key === 'F1') {
            e.preventDefault();
            e.stopPropagation();
            abrirConsultaProdutosPDV();
        }
        if (e.key === 'F4') {
            e.preventDefault();
            e.stopPropagation();
            if (carrinho.length > 0) {
                const ultimoIndex = carrinho.length - 1;
                const input = $(`.quantidade-item[data-index="${ultimoIndex}"]`);
                if (input.length) {
                    input.trigger('focus');
                    input[0].select();
                }
            } else {
                showNotification('Nenhum item para alterar quantidade.', 'warning');
            }
        }
        if (e.key === 'F7') {
            e.preventDefault();
            e.stopPropagation();
            abrirFechamentoCaixa();
        }
        if (e.key === 'F8') {
            e.preventDefault();
            e.stopPropagation();
            $('#descontoPdv').trigger('focus');
        }
        if (e.key === 'F10') {
            e.preventDefault();
            e.stopPropagation();
            abrirModalDecisaoFiscal();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelarVendaAtual();
        }
    });

    $('#buscaProdutoPdv').off('keypress').on('keypress', function(e) {
        if (e.which === 13) {
            const codigo = $(this).val().trim();
            if (codigo) {
                adicionarProdutoPorCodigo(codigo);
                $(this).val('');
            }
        }
    });

    $('#btnBuscarProdutoPdv').off('click').on('click', function() {
        const codigo = $('#buscaProdutoPdv').val().trim();
        if (codigo) {
            adicionarProdutoPorCodigo(codigo);
            $('#buscaProdutoPdv').val('');
        } else {
            showNotification('Digite ou bip o código do produto.', 'warning');
        }
        focarCampoCodigo();
    });

    $('#btnLimparVendaPdv').off('click').on('click', limparCarrinho);
    $('#btnCancelarVendaPdv').off('click').on('click', cancelarVendaAtual);
    $('#btnFinalizarVendaPdv').off('click').on('click', abrirModalDecisaoFiscal);
    $('#btnFechamentoCaixaPdv').off('click').on('click', abrirFechamentoCaixa);
    $('#formaPagamentoPdv').off('change').on('change', aoAlterarFormaPagamento);
    $('#formaPagamentoPdv').val('');

    // Busca de cliente para venda a prazo (sidebar)
    $('#clienteBuscaPrazo').off('input').on('input', function() {
        const termo = normalizarTexto($(this).val()).trim();
        if (termo.length < 2) {
            $('#clientePrazoSugestoes').empty().hide();
            $('#clientePrazoId').val('');
            return;
        }

        $.ajax({
            url: `${API_URL}/clientes`,
            method: 'GET',
            success: function(clientes) {
                const filtrados = (clientes || []).filter(c =>
                    normalizarTexto(c.nome).includes(termo) ||
                    String(c.cpf_cnpj || '').replace(/\D/g, '').includes(termo.replace(/\D/g, ''))
                );

                if (filtrados.length === 0) {
                    $('#clientePrazoSugestoes').html('<div class="list-group-item" style="font-size:0.8rem;">Nenhum cliente encontrado</div>').show();
                    return;
                }

                $('#clientePrazoSugestoes').html(
                    filtrados.map(c => `
                        <button type="button" class="list-group-item list-group-item-action" data-id="${c.id}" data-nome="${escapeHtml(c.nome || '')}" style="font-size:0.8rem; padding:4px 8px;">
                            ${escapeHtml(c.nome || '')}${c.cpf_cnpj ? ' - ' + formatarCpfCnpj(c.cpf_cnpj) : ''}
                        </button>
                    `).join('')
                ).show();
            },
            error: function() {
                $('#clientePrazoSugestoes').empty().hide();
            }
        });
    });

    $(document).off('click.prazoSugestao').on('click.prazoSugestao', '#clientePrazoSugestoes button', function() {
        const id = $(this).data('id');
        const nome = $(this).data('nome');
        $('#clientePrazoId').val(id);
        $('#clienteBuscaPrazo').val(nome);
        $('#clientePrazoSugestoes').empty().hide();
        $('#clientePrazoSelecionado').show();
        $('#clientePrazoNome').text(nome);
        clienteSelecionado = { id: Number(id), nome: String(nome) };
    });

    $('#btnRemoverClientePrazo').off('click').on('click', function() {
        $('#clientePrazoId').val('');
        $('#clienteBuscaPrazo').val('');
        $('#clientePrazoSelecionado').hide();
        $('#clientePrazoNome').text('');
        clienteSelecionado = null;
        setTimeout(() => $('#clienteBuscaPrazo').trigger('focus'), 50);
    });

    $('#clienteBusca').off('input').on('input', async function () {
        const termo = $(this).val().trim();
        if (termo.length < 2) {
            $('#clienteResultados').empty();
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const resposta = await fetch(`${API_URL}/clientes/buscar?termo=${encodeURIComponent(termo)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!resposta.ok) {
                throw new Error(`Erro ao buscar clientes: ${resposta.status}`);
            }
            const clientes = await resposta.json();
            renderizarResultadosClientes(clientes);
        } catch (error) {
            console.error('Erro ao buscar clientes:', error);
        }
    });
    $('#clienteResultados').off('click').on('click', '.cliente-item', function() {
        const clienteId = Number($(this).data('id'));
        const cliente = clientesResultados.find(c => Number(c.id) === clienteId);
        if (cliente) {
            selecionarCliente(cliente);
        }
    });

    // Calculadora PDV
    let calcExpression = '';
    const calcDisplay = $('#calcDisplay');

    $('.calc-btn').off('click').on('click', function() {
        const valor = String($(this).data('value'));

        if (valor === 'C') {
            calcExpression = '';
            calcDisplay.text('0');
        } else if (valor === '=') {
            if (calcExpression) {
                try {
                    // Avaliar expressão matemática de forma segura
                    const resultado = Function('"use strict"; return (' + calcExpression + ')')();
                    calcDisplay.text(resultado.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
                    calcExpression = String(resultado);
                } catch (e) {
                    calcDisplay.text('Erro');
                    calcExpression = '';
                }
            }
        } else {
            // Números e operadores
            if (calcExpression === '' && ['/', '*', '+', '-'].includes(valor)) {
                // Não começar com operador
                return;
            }
            calcExpression += valor;
            calcDisplay.text(calcExpression);
        }

        // Após clicar em =, focar no campo de busca
        if (valor === '=') {
            setTimeout(() => {
                $('#buscaProdutoPdv').trigger('focus');
            }, 100);
        }
    });

    $('#descontoPdv').off('input').on('input', function() {
        calcularTotal();
        calcularTrocoPDV();
    });

    $('#valorRecebidoPDV').off('input').on('input', calcularTrocoPDV);

    aoAlterarFormaPagamento();
}

function aoAlterarFormaPagamento() {
    const formaPagamento = $('#formaPagamentoPdv').val();
    const boxCliente = $('#pdvClienteBox');
    const boxDinheiro = $('#pdvDinheiroBox');

    // Esconde tudo primeiro
    boxCliente.hide();
    boxDinheiro.hide();

    if (formaPagamento === 'dinheiro') {
        boxDinheiro.show();
        calcularTrocoPDV();

        setTimeout(() => {
            const input = $('#valorRecebidoPDV');
            if (input.length) input.trigger('focus');
        }, 100);
    }

    if (formaPagamento === 'prazo') {
        boxCliente.show();

        // Padrão: 30 dias a partir de hoje
        const hoje = new Date();
        const vencimentoPadrao = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 30);

        if (!$('#dataVencimentoPrazo').val()) {
            $('#dataVencimentoPrazo').val(vencimentoPadrao.toISOString().split('T')[0]);
        }

        if (!$('#parcelasPrazo').val() || $('#parcelasPrazo').val() === '0') {
            $('#parcelasPrazo').val(1);
        }

        setTimeout(() => {
            $('#clienteBuscaPrazo').trigger('focus');
        }, 100);
    } else {
        limparCamposPrazo();
    }
}

function limparCamposPrazo() {
    $('#clientePrazoId').val('');
    $('#clienteBuscaPrazo').val('');
    $('#clientePrazoSugestoes').empty().hide();
    $('#clientePrazoSelecionado').hide();
    $('#clientePrazoNome').text('');
    $('#dataVencimentoPrazo').val('');
    $('#parcelasPrazo').val(1);
    clienteSelecionado = null;
}

function calcularTrocoPDV() {
    const total = calcularTotalValor();
    const recebido = parseFloat($('#valorRecebidoPDV').val()) || 0;
    const troco = Math.max(0, recebido - total);

    $('#trocoPDV').text(formatCurrency(troco));
}

function renderizarResultadosClientes(clientes) {
    clientesResultados = Array.isArray(clientes) ? clientes : [];
    const container = $('#clienteResultados');

    if (!clientesResultados.length) {
        container.html('<div class="cliente-item">Nenhum cliente encontrado</div>');
        return;
    }

    container.html(clientesResultados.map(cliente => `
        <div class="cliente-item" data-id="${cliente.id}">
            <strong>${escapeHtml(cliente.nome)}</strong><br>
            <small>${formatarCpfCnpj(cliente.cpf_cnpj) || ''}${cliente.telefone ? ' - ' + escapeHtml(cliente.telefone) : ''}</small>
        </div>
    `).join(''));
}

function selecionarCliente(cliente) {
    clienteSelecionado = cliente;
    $('#clienteSelecionado').show();
    $('#clienteSelecionadoNome').text(`${cliente.nome}${cliente.cpf_cnpj ? ' - ' + formatarCpfCnpj(cliente.cpf_cnpj) : ''}`);
    $('#clienteBusca').val(cliente.nome);
    $('#clienteResultados').empty();
}

function removerClienteSelecionado() {
    clienteSelecionado = null;
    $('#clienteSelecionado').hide();
    $('#clienteSelecionadoNome').text('');
    $('#clienteBusca').val('');
    $('#clienteResultados').empty();
}

function abrirCadastroCliente() {
    if (typeof showClienteModal === 'function') {
        showClienteModal();
    } else {
        showNotification('Cadastro de cliente não disponível no momento.', 'warning');
    }
}

function renderCarrinhoItens() {
    if (!Array.isArray(carrinho) || carrinho.length === 0) {
        return '<tr><td colspan="5" class="text-center">Nenhum item no carrinho</td></tr>';
    }

    return carrinho.map((item, index) => `
        <tr>
            <td>
                <input type="number"
                       class="form-control form-control-sm quantidade-item"
                       value="${Number(item.quantidade)}"
                       min="0.01"
                       step="0.001"
                       data-index="${index}">
            </td>
            <td>${escapeHtml(item.nome)}</td>
            <td>${formatCurrency(item.preco_unitario)}</td>
            <td>${formatCurrency(item.subtotal)}</td>
            <td class="text-center">
                <button type="button" class="btn btn-sm btn-outline-danger item-remover" data-index="${index}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function codigoEhBalanca(codigo) {
    return /^2\d{12}$/.test(String(codigo || '').trim());
}

function unidadeEhKg(produto) {
    return String(produto?.unidade || '').toLowerCase() === 'kg';
}

// Padrão profissional comum:
// 2 + 5 dígitos código do produto + 6 dígitos valor total em centavos + dígito verificador
// Exemplo: 2000010014890
// Produto: 00001
// Valor: R$ 14,89
function interpretarCodigoBalanca(codigo) {
    const limpo = String(codigo || '').replace(/\D/g, '');

    if (!codigoEhBalanca(limpo)) return null;

    return {
        codigoProduto: limpo.substring(1, 6),
        valorTotal: Number(limpo.substring(6, 12)) / 100,
        codigoOriginal: limpo
    };
}

function normalizarCodigoProduto(codigo) {
    return String(codigo || '').replace(/\D/g, '').replace(/^0+/, '') || String(codigo || '').trim();
}

function encontrarProdutoPorCodigoOuNome(termo) {
    const busca = normalizarTexto(termo);
    const buscaNumerica = normalizarCodigoProduto(termo);

    return produtosDisponiveis.find(p => {
        const codigo = normalizarTexto(p.codigo);
        const codigoBarras = normalizarTexto(p.codigo_barras);
        const nome = normalizarTexto(p.nome);

        const codigoNumerico = normalizarCodigoProduto(p.codigo);
        const barrasNumerico = normalizarCodigoProduto(p.codigo_barras);

        return (
            (codigo && codigo === busca) ||
            (codigoBarras && codigoBarras === busca) ||
            (codigoNumerico && codigoNumerico === buscaNumerica) ||
            (barrasNumerico && barrasNumerico === buscaNumerica) ||
            (nome && nome.includes(busca))
        );
    });
}

function adicionarItemNoCarrinho(produto, quantidade, precoUnitario, mensagemExtra = '') {
    quantidade = Number(quantidade || 0);
    precoUnitario = Number(precoUnitario || 0);

    if (quantidade <= 0 || precoUnitario <= 0) {
        showNotification('Quantidade ou preço inválido.', 'warning');
        return;
    }

    if (quantidade > Number(produto.estoque_atual)) {
        showNotification(`Estoque insuficiente para ${produto.nome}. Disponível: ${produto.estoque_atual}`, 'danger');
        return;
    }

    const itemExistente = carrinho.find(item => Number(item.id) === Number(produto.id));

    if (itemExistente) {
        const novaQuantidade = Number(itemExistente.quantidade) + quantidade;

        if (novaQuantidade > Number(produto.estoque_atual)) {
            showNotification(`Estoque insuficiente para ${produto.nome}. Disponível: ${produto.estoque_atual}`, 'danger');
            return;
        }

        itemExistente.quantidade = Number(novaQuantidade.toFixed(3));
        itemExistente.preco_unitario = precoUnitario;
        itemExistente.subtotal = Number((itemExistente.quantidade * precoUnitario).toFixed(2));
    } else {
        carrinho.push({
            id: produto.id,
            nome: produto.nome,
            quantidade: Number(quantidade.toFixed(3)),
            preco_unitario: precoUnitario,
            subtotal: Number((quantidade * precoUnitario).toFixed(2))
        });
    }

    atualizarCarrinho();
    showNotification(`${produto.nome} adicionado ao carrinho${mensagemExtra}.`, 'success');
    focarCampoCodigo();
}

function adicionarProdutoPorCodigo(codigo) {
    if (!codigo || !codigo.trim()) return;

    if (!Array.isArray(produtosDisponiveis) || produtosDisponiveis.length === 0) {
        showNotification('Nenhum produto disponível para venda.', 'warning');
        return;
    }

    const codigoDigitado = String(codigo).trim();

    // 1) Código de balança
    const dadosBalanca = interpretarCodigoBalanca(codigoDigitado);

    if (dadosBalanca) {
        const produtoBalanca = encontrarProdutoPorCodigoOuNome(dadosBalanca.codigoProduto);

        if (!produtoBalanca) {
            showNotification(`Produto da balança não encontrado. Código interno: ${dadosBalanca.codigoProduto}`, 'danger');
            return;
        }

        if (!unidadeEhKg(produtoBalanca)) {
            showNotification(`O produto ${produtoBalanca.nome} não está cadastrado como KG.`, 'warning');
            return;
        }

        const precoKg = Number(produtoBalanca.preco_venda || 0);

        if (precoKg <= 0) {
            showNotification(`Preço por KG inválido para ${produtoBalanca.nome}.`, 'danger');
            return;
        }

        const peso = dadosBalanca.valorTotal / precoKg;

        adicionarItemNoCarrinho(
            produtoBalanca,
            peso,
            precoKg,
            ` - Peso: ${peso.toFixed(3)} KG - Total: ${formatCurrency(dadosBalanca.valorTotal)}`
        );

        return;
    }

    // 2) Produto normal
    const produto = encontrarProdutoPorCodigoOuNome(codigoDigitado);

    if (!produto) {
        showNotification(`Produto não encontrado: ${codigo}`, 'danger');
        return;
    }

    if (Number(produto.estoque_atual) <= 0) {
        showNotification(`${produto.nome} está sem estoque.`, 'danger');
        return;
    }

    // 3) Produto KG digitado manualmente
    if (unidadeEhKg(produto)) {
        abrirModalQuantidadeProduto(produto, function (peso) {
            adicionarItemNoCarrinho(
                produto,
                peso,
                Number(produto.preco_venda || 0),
                ` - Peso: ${peso.toFixed(3)} KG`
            );
        });
        return;
    }

    // 4) Produto unidade continua igual
    abrirModalQuantidadeProduto(produto, function (quantidade) {
        adicionarItemNoCarrinho(produto, quantidade, Number(produto.preco_venda || 0));
    });
}

function atualizarQuantidade(index, quantidade) {
    const novaQuantidade = parseFloat(quantidade);
    const item = carrinho[index];

    if (!item) return;

    if (Number.isNaN(novaQuantidade) || novaQuantidade <= 0) {
        removerItemCarrinho(index);
        return;
    }

    const produto = produtosDisponiveis.find(p => Number(p.id) === Number(item.id));
    if (!produto) {
        showNotification('Produto do carrinho não encontrado no cadastro.', 'danger');
        return;
    }

    if (novaQuantidade > Number(produto.estoque_atual)) {
        showNotification(`Estoque insuficiente para ${produto.nome}. Disponível: ${produto.estoque_atual}`, 'danger');
        atualizarCarrinho();
        return;
    }

    item.quantidade = novaQuantidade;
    item.subtotal = Number(item.preco_unitario) * novaQuantidade;
    atualizarCarrinho();
}

function removerItemCarrinho(index) {
    const item = carrinho[index];
    if (!item) return;
    carrinho.splice(index, 1);
    atualizarCarrinho();
    showNotification(`${item.nome} removido do carrinho.`, 'info');
}

function limparCarrinho() {
    if (carrinho.length === 0) return;
    if (!window.confirm('Tem certeza que deseja limpar todo o carrinho?')) return;

    carrinho = [];
    formaPagamentoSelecionada = null;
    vendaPrazoInfo = null;
    clienteSelecionado = null;
    $('#descontoPdv').val(0);
    $('#formaPagamentoPdv').val('');
    $('#pdvClienteBox').hide();
    $('#pdvDinheiroBox').hide();
    limparCamposPrazo();
    atualizarCarrinho();
    focarCampoCodigo();
    showNotification('Carrinho limpo com sucesso.', 'info');
}

function atualizarCarrinho() {
    const tbody = $('#tabelaItensVendaPdv');
    if (tbody.length) {
        tbody.html(renderCarrinhoItens());

        tbody.off('click').on('click', '.item-remover', function() {
            const index = $(this).data('index');
            removerItemCarrinho(index);
        });

        tbody.off('change').on('change', '.quantidade-item', function() {
            const index = $(this).data('index');
            let novaQtd = parseFloat($(this).val());
            if (isNaN(novaQtd) || novaQtd <= 0) {
                removerItemCarrinho(index);
            } else {
                alterarQuantidadeItem(index, novaQtd);
            }
        });
    }

    calcularTotal();

    const total = calcularTotalValor();
    // Só habilita finalizar se caixa aberto E houver itens no carrinho
    $('#btnFinalizarVendaPdv').prop('disabled', !caixaAberto || carrinho.length === 0 || total <= 0);
    $('#btnCancelarVendaPdv').prop('disabled', carrinho.length === 0);
}

function calcularSubtotal() {
    return carrinho.reduce((acc, item) => acc + Number(item.subtotal || 0), 0);
}

function calcularTotalValor() {
    const subtotal = calcularSubtotal();
    const desconto = parseFloat($('#descontoPdv').val()) || 0;
    return Math.max(0, subtotal - desconto);
}

function calcularTotal() {
    const subtotal = calcularSubtotal();
    const total = calcularTotalValor();
    $('#subtotalPdv').text(formatCurrency(subtotal));
    $('#totalPdv').text(formatCurrency(total));

    calcularTrocoPDV();
}

function abrirModalPagamento(onConfirm) {
    if (carrinho.length === 0) {
        showNotification('Adicione itens ao carrinho antes de finalizar a venda.', 'warning');
        return;
    }

    const total = calcularTotalValor();
    if (total <= 0) {
        showNotification('O total da venda deve ser maior que zero.', 'warning');
        return;
    }

    const modalHtml = `
        <div class="modal fade" id="pagamentoModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Forma de Pagamento</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <h4 class="text-center mb-3">Total: ${formatCurrency(total)}</h4>

                        <div class="payment-methods mb-3 d-flex flex-wrap gap-2">
                            <button type="button" class="payment-method-btn btn btn-outline-primary" data-pagamento="dinheiro">Dinheiro</button>
                            <button type="button" class="payment-method-btn btn btn-outline-primary" data-pagamento="cartao_credito">Cartão Crédito</button>
                            <button type="button" class="payment-method-btn btn btn-outline-primary" data-pagamento="cartao_debito">Cartão Débito</button>
                            <button type="button" class="payment-method-btn btn btn-outline-primary" data-pagamento="pix">PIX</button>
                            <button type="button" class="payment-method-btn btn btn-outline-primary" data-pagamento="prazo">A Prazo</button>
                        </div>

                        <div id="troco-area" style="display:none;" class="mt-4 p-3 bg-light rounded">
                            <div class="mb-3">
                                <label for="valor-recebido" class="form-label fw-bold">Valor Recebido:</label>
                                <input type="number" step="0.01" class="form-control form-control-lg text-end" id="valor-recebido" placeholder="0,00" autofocus>
                            </div>
                            <div class="mt-3 p-2 bg-white rounded border-2 border-success">
                                <div class="d-flex justify-content-between align-items-center">
                                    <span class="fw-bold">Total:</span>
                                    <span style="font-size:1.2rem;">${formatCurrency(total)}</span>
                                </div>
                                <div class="d-flex justify-content-between align-items-center mt-2">
                                    <span class="fw-bold text-success">Troco:</span>
                                    <span id="troco" style="font-size:1.5rem; color:#198754; font-weight:bold;">R$ 0,00</span>
                                </div>
                            </div>
                            <small class="text-muted d-block mt-2">💡 Dica: Digite o valor e pressione <kbd>Enter</kbd> para confirmar</small>
                        </div>

                        <div id="prazo-area" style="display:none;" class="mt-3 position-relative">
                            <div class="mb-2">
                                <label for="cliente-prazo-busca">Cliente *</label>
                                <input type="text" class="form-control" id="cliente-prazo-busca" placeholder="Digite o nome do cliente">
                                <input type="hidden" id="cliente-prazo-id">
                                <div id="cliente-prazo-sugestoes" class="list-group position-absolute w-100" style="z-index: 9999; display:none;"></div>
                            </div>
                            <div class="mb-2">
                                <label for="parcelas-prazo">Quantidade de Parcelas *</label>
                                <input type="number" min="1" max="24" class="form-control" id="parcelas-prazo" value="1">
                            </div>
                            <div class="mb-2">
                                <label for="primeiro-vencimento-prazo">Primeiro Vencimento *</label>
                                <input type="date" class="form-control" id="primeiro-vencimento-prazo">
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="confirmar-pagamento">Confirmar Pagamento</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('#modal-container').html(modalHtml);

    const modalEl = document.getElementById('pagamentoModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    formaPagamentoSelecionada = null;
    vendaPrazoInfo = null;

    $('.payment-method-btn').off('click').on('click', function() {
        selecionarPagamento($(this).data('pagamento'));
    });

    $('#confirmar-pagamento').off('click').on('click', function() {
        confirmarPagamento(modalEl, onConfirm);
    });

    $('#valor-recebido').off('input').on('input', calcularTroco);

    const formaPagamentoAtual = $('#formaPagamentoPdv').val();
    if (formaPagamentoAtual === 'dinheiro') {
        setTimeout(() => selecionarPagamento('dinheiro'), 0);
    }
}

function selecionarPagamento(tipo) {
    formaPagamentoSelecionada = tipo;

    $('.payment-method-btn').removeClass('active btn-primary').addClass('btn-outline-primary');
    $(`.payment-method-btn[data-pagamento="${tipo}"]`).removeClass('btn-outline-primary').addClass('active btn-primary');

    if (tipo === 'dinheiro') {
        $('#troco-area').show();
        $('#prazo-area').hide();
        $('#valor-recebido').val('');
        calcularTroco();
        // Foco automático no campo de valor recebido após pequeno delay
        setTimeout(() => {
            const valorInput = $('#valor-recebido');
            if (valorInput.length) {
                valorInput.trigger('focus');
                valorInput.off('keypress').on('keypress', function(e) {
                    if (e.which === 13) { // Enter
                        e.preventDefault();
                        document.getElementById('confirmar-pagamento').click();
                    }
                });
            }
        }, 100);
    } else if (tipo === 'prazo') {
        $('#troco-area').hide();
        $('#prazo-area').show();

        const hoje = new Date();
        const primeiroVencimento = new Date(hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate());
        $('#primeiro-vencimento-prazo').val(primeiroVencimento.toISOString().split('T')[0]);

        $('#cliente-prazo-busca').off('input').on('input', function() {
            const termo = normalizarTexto($(this).val()).trim();
            if (termo.length < 2) {
                $('#cliente-prazo-sugestoes').empty().hide();
                $('#cliente-prazo-id').val('');
                return;
            }

            $.ajax({
                url: `${API_URL}/clientes`,
                method: 'GET',
                success: function(clientes) {
                    const filtrados = (clientes || []).filter(c =>
                        normalizarTexto(c.nome).includes(termo) ||
                        String(c.cpf_cnpj || '').replace(/\D/g, '').includes(termo.replace(/\D/g, ''))
                    );

                    if (filtrados.length === 0) {
                        $('#cliente-prazo-sugestoes').html('<div class="list-group-item">Nenhum cliente encontrado</div>').show();
                        return;
                    }

                    $('#cliente-prazo-sugestoes').html(
                        filtrados.map(c => `
                            <button type="button" class="list-group-item list-group-item-action" data-id="${c.id}" data-nome="${escapeHtml(c.nome || '')}">
                                ${escapeHtml(c.nome || '')}${c.cpf_cnpj ? ' - ' + formatarCpfCnpj(c.cpf_cnpj) : ''}
                            </button>
                        `).join('')
                    ).show();
                },
                error: function() {
                    $('#cliente-prazo-sugestoes').empty().hide();
                }
            });
        });

        $(document).off('click.sugestaoCliente').on('click.sugestaoCliente', '#cliente-prazo-sugestoes button', function() {
            $('#cliente-prazo-id').val($(this).data('id'));
            $('#cliente-prazo-busca').val($(this).data('nome'));
            $('#cliente-prazo-sugestoes').empty().hide();
        });
    } else {
        $('#troco-area').hide();
        $('#prazo-area').hide();
    }
}

function calcularTroco() {
    const total = calcularTotalValor();
    const recebido = parseFloat($('#valor-recebido').val()) || 0;
    const troco = Math.max(0, recebido - total);
    $('#troco').text(formatCurrency(troco));
}

function confirmarPagamento(modalEl, onConfirm) {
    if (!formaPagamentoSelecionada) {
        showNotification('Selecione uma forma de pagamento.', 'warning');
        return;
    }

    if (formaPagamentoSelecionada === 'dinheiro') {
        const recebido = parseFloat($('#valor-recebido').val()) || 0;
        const total = calcularTotalValor();
        if (recebido < total) {
            showNotification('Valor recebido insuficiente.', 'danger');
            return;
        }
    }

    if (formaPagamentoSelecionada === 'prazo') {
        const clienteId = parseInt($('#cliente-prazo-id').val(), 10);
        const parcelas = parseInt($('#parcelas-prazo').val(), 10) || 1;
        const primeiroVencimento = $('#primeiro-vencimento-prazo').val();

        if (!clienteId) {
            showNotification('Selecione o cliente da venda a prazo.', 'danger');
            return;
        }
        if (parcelas < 1) {
            showNotification('Quantidade de parcelas inválida.', 'danger');
            return;
        }
        if (!primeiroVencimento) {
            showNotification('Informe o primeiro vencimento.', 'danger');
            return;
        }

        vendaPrazoInfo = {
            cliente_id: clienteId,
            parcelas,
            primeiro_vencimento: primeiroVencimento,
            cliente_nome: $('#cliente-prazo-busca').val().trim()
        };
    } else {
        vendaPrazoInfo = null;
    }

    const instancia = bootstrap.Modal.getInstance(modalEl);
    if (instancia) instancia.hide();

    if (typeof onConfirm === 'function') {
        onConfirm();
    } else {
        executarFinalizacaoVenda();
    }
}

function abrirModalDecisaoFiscal(skipPagamento = false) {
    if (vendaEmProcessamento) {
        showNotification('A venda já está sendo processada.', 'warning');
        return;
    }

    // Verificar se caixa está aberto
    if (!caixaAberto) {
        showNotification('🔴 Caixa fechado. Abra o caixa antes de vender.', 'danger');
        return;
    }

    if (!Array.isArray(carrinho) || carrinho.length === 0) {
        showNotification('Adicione itens ao carrinho antes de finalizar.', 'warning');
        return;
    }

    const formaPagamento = $('#formaPagamentoPdv').val();

    if (!formaPagamento) {
        showNotification('Selecione uma forma de pagamento.', 'warning');
        return;
    }

    const desconto = parseFloat($('#descontoPdv').val()) || 0;
    const subtotal = calcularSubtotal();
    const total = Math.round((Math.max(0, subtotal - desconto)) * 100) / 100;

    if (total <= 0) {
        showNotification('O total final da venda é inválido.', 'warning');
        return;
    }

    if (formaPagamento === 'dinheiro') {
        const recebido = parseFloat($('#valorRecebidoPDV').val()) || 0;

        if (recebido <= 0) {
            showNotification('Informe o valor recebido em dinheiro.', 'warning');
            $('#valorRecebidoPDV').trigger('focus');
            return;
        }

        if (recebido < total) {
            showNotification('O valor recebido é menor que o total da venda.', 'danger');
            $('#valorRecebidoPDV').trigger('focus');
            return;
        }
    }

    if (formaPagamento === 'prazo') {
        const clienteIdPrazo = clienteSelecionado?.id || Number($('#clientePrazoId').val()) || null;
        if (!clienteIdPrazo) {
            showNotification('Para venda a prazo, selecione um cliente.', 'warning');
            $('#clienteBuscaPrazo').trigger('focus');
            return;
        }
        const parcelas = Number($('#parcelasPrazo').val()) || 1;
        if (parcelas < 1) {
            showNotification('A quantidade de parcelas deve ser no mínimo 1.', 'warning');
            $('#parcelasPrazo').trigger('focus');
            return;
        }
        const dataVenc = $('#dataVencimentoPrazo').val();
        if (!dataVenc) {
            showNotification('Informe a data do primeiro vencimento.', 'warning');
            $('#dataVencimentoPrazo').trigger('focus');
            return;
        }
    }

    const clienteId = clienteSelecionado?.id || vendaPrazoInfo?.cliente_id || Number($('#clientePrazoId').val()) || null;

    $('#modal-container').html(`
        <div class="modal fade" id="decisaoFiscalModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-sm modal-dialog-centered">
                <div class="modal-content border-0 shadow">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title text-dark mb-0">Finalizar Venda</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>

                    <div class="modal-body text-center">
                        <p class="mb-3">
                            Deseja emitir NFC-e desta venda agora?
                        </p>

                        <div class="d-grid gap-2">
                            <button
                                type="button"
                                class="btn btn-secondary btn-fiscal-bloqueado"
                                onclick="finalizarComFiscal()"
                                title="Emitir NFC-e"
                            >
                                Sim, emitir NFC-e
                            </button>

                            <button
                                type="button"
                                class="btn btn-success"
                                onclick="finalizarSemFiscal()"
                            >
                                Não, finalizar sem NFC-e
                            </button>
                        </div>

                        <small class="text-muted d-block mt-3">
                            A emissão fiscal está temporariamente em desenvolvimento.
                        </small>
                    </div>
                </div>
            </div>
        </div>
    `);

    const modalEl = document.getElementById('decisaoFiscalModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function finalizarComFiscal() {
    const modalEl = document.getElementById('decisaoFiscalModal');

    if (document.activeElement) {
        document.activeElement.blur();
    }

    const instancia = bootstrap.Modal.getInstance(modalEl);

    if (instancia) {
        instancia.hide();
    }

    setTimeout(() => {
        mostrarModalCpfCnpjNota();
    }, 300);
}

function limparCpfCnpj(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function validarCpfCnpjNota(valor) {
    const doc = limparCpfCnpj(valor);

    if (!doc) return true;

    return doc.length === 11 || doc.length === 14;
}

function mostrarModalCpfCnpjNota() {
    $('#modal-container').html(`
        <div class="modal fade" id="cpfCnpjNotaModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-sm modal-dialog-centered">
                <div class="modal-content border-0 shadow">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title mb-0">CPF/CNPJ na Nota</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>

                    <div class="modal-body">
                        <label class="form-label">Informe CPF ou CNPJ do cliente</label>
                        <input
                            type="text"
                            id="cpfCnpjNotaFiscal"
                            class="form-control"
                            placeholder="Opcional"
                            maxlength="18"
                            autocomplete="off"
                        >

                        <small class="text-muted d-block mt-2">
                            Deixe em branco para emitir como consumidor não identificado.
                        </small>

                        <div class="d-grid gap-2 mt-3">
                            <button type="button" class="btn btn-success" id="btnConfirmarCpfNota">
                                Emitir NFC-e
                            </button>

                            <button type="button" class="btn btn-secondary" id="btnEmitirSemCpf">
                                Emitir sem CPF/CNPJ
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);

    const modalEl = document.getElementById('cpfCnpjNotaModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    $('#cpfCnpjNotaFiscal').trigger('focus');

    $('#cpfCnpjNotaFiscal').on('input', function () {
        let v = limparCpfCnpj(this.value);

        if (v.length <= 11) {
            v = v.replace(/(\d{3})(\d)/, '$1.$2');
            v = v.replace(/(\d{3})(\d)/, '$1.$2');
            v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        } else {
            v = v.replace(/^(\d{2})(\d)/, '$1.$2');
            v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
            v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
            v = v.replace(/(\d{4})(\d)/, '$1-$2');
        }

        this.value = v;
    });

    $('#btnConfirmarCpfNota').off('click').on('click', function () {
        const cpfCnpj = $('#cpfCnpjNotaFiscal').val();

        if (!validarCpfCnpjNota(cpfCnpj)) {
            showNotification('CPF/CNPJ inválido. Informe 11 ou 14 números.', 'warning');
            $('#cpfCnpjNotaFiscal').trigger('focus');
            return;
        }

        modal.hide();

        setTimeout(() => {
            executarFinalizacaoVenda(true, limparCpfCnpj(cpfCnpj));
        }, 300);
    });

    $('#btnEmitirSemCpf').off('click').on('click', function () {
        modal.hide();

        setTimeout(() => {
            executarFinalizacaoVenda(true, null);
        }, 300);
    });
}


function finalizarSemFiscal() {
    const modalEl = document.getElementById('decisaoFiscalModal');
    const instancia = bootstrap.Modal.getInstance(modalEl);

    if (instancia) {
        instancia.hide();
    }

    executarFinalizacaoVenda(false);
}

function mostrarModalAvisoDebitoCliente(aviso, totalEmAberto, parcelasVencidas, onConfirm) {
    const detalhes = [];
    if (totalEmAberto > 0) {
        detalhes.push(`Valor em aberto: <strong>${formatCurrency(totalEmAberto)}</strong>`);
    }
    if (parcelasVencidas > 0) {
        detalhes.push(`Parcelas vencidas: <strong>${parcelasVencidas}</strong>`);
    }

    $('#modal-container').html(`
        <div class="modal fade" id="debitoAvisoModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-sm modal-dialog-centered">
                <div class="modal-content border-0 shadow">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title text-dark mb-0">Aviso de Débito</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>
                    <div class="modal-body text-center">
                        <p class="mb-3">${escapeHtml(aviso)}</p>
                        <p class="mb-3">${detalhes.join('<br>')}</p>
                        <div class="d-grid gap-2">
                            <button type="button" class="btn btn-danger" id="confirmar-continuar-debito">Continuar mesmo assim</button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);

    const modalEl = document.getElementById('debitoAvisoModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    $('#confirmar-continuar-debito').off('click').on('click', function() {
        modal.hide();
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
    });
}

function executarFinalizacaoVenda(emitirFiscal = false, cpfCnpjNota = null) {
    if (vendaEmProcessamento) {
        showNotification('A venda já está sendo processada.', 'warning');
        return;
    }

    if (!Array.isArray(carrinho) || carrinho.length === 0) {
        showNotification('Adicione itens ao carrinho antes de finalizar.', 'warning');
        return;
    }

    const formaPagamento = $('#formaPagamentoPdv').val();

    if (!formaPagamento) {
        showNotification('Selecione uma forma de pagamento.', 'warning');
        return;
    }

    const clienteId = clienteSelecionado?.id || vendaPrazoInfo?.cliente_id || Number($('#clientePrazoId').val()) || null;
    if (formaPagamento === 'prazo' && !clienteId) {
        showNotification('Para venda a prazo, selecione um cliente.', 'warning');
        $('#clienteBuscaPrazo').trigger('focus');
        return;
    }

    if (formaPagamento === 'prazo') {
        const parcelas = Number($('#parcelasPrazo').val()) || vendaPrazoInfo?.parcelas || 1;
        const dataVenc = $('#dataVencimentoPrazo').val() || vendaPrazoInfo?.primeiro_vencimento;
        if (!dataVenc) {
            showNotification('Informe a data do primeiro vencimento.', 'warning');
            $('#dataVencimentoPrazo').trigger('focus');
            return;
        }
        if (parcelas < 1) {
            showNotification('A quantidade de parcelas deve ser no mínimo 1.', 'warning');
            $('#parcelasPrazo').trigger('focus');
            return;
        }
    }

    const desconto = parseFloat($('#descontoPdv').val()) || 0;
    const subtotal = calcularSubtotal();
    const total = Math.round((Math.max(0, subtotal - desconto)) * 100) / 100;

    if (total <= 0) {
        showNotification('O total final da venda é inválido.', 'warning');
        return;
    }

    const dados = {
        cliente_id: clienteId,
        cliente_nome: clienteSelecionado?.nome || vendaPrazoInfo?.cliente_nome || null,
        forma_pagamento: formaPagamento,
        desconto,
        total,
        emitir_fiscal: emitirFiscal,
        cpf_cnpj_nota: emitirFiscal ? cpfCnpjNota : null,
        itens: carrinho.map(item => ({
            produto_id: Number(item.id),
            quantidade: Number(item.quantidade),
            preco_unitario: Number(item.preco_unitario),
            subtotal: Math.round(Number(item.preco_unitario) * Number(item.quantidade) * 100) / 100
        }))
    };

    if (formaPagamento === 'dinheiro') {
        dados.valor_recebido = parseFloat($('#valorRecebidoPDV').val()) || 0;
    }

    if (formaPagamento === 'prazo') {
        const dataRecebimento = $('#dataVencimentoPrazo').val() || vendaPrazoInfo?.primeiro_vencimento;
        const qtdParcelas = Number($('#parcelasPrazo').val()) || vendaPrazoInfo?.parcelas || 1;
        dados.parcelas = qtdParcelas;
        dados.primeiro_vencimento = dataRecebimento;
    }

    vendaEmProcessamento = true;

    const itensParaCupom = dados.itens.map(item => {
        const produto = produtosDisponiveis.find(p => Number(p.id) === Number(item.produto_id));
        return {
            ...item,
            produto_nome: produto ? produto.nome : 'Produto'
        };
    });

    function enviarVenda(payload) {
        $.ajax({
            url: `${API_URL}/vendas`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload),
            success: function(response) {
                vendaEmProcessamento = false;

                const vendaId = response.venda_id || response.id || response.vendaId || response.venda?.id;

                if (!vendaId) {
                    console.error('Resposta da venda sem ID:', response);
                    showNotification('Venda finalizada, mas não foi possível localizar o ID da venda.', 'danger');
                    return;
                }

                if (emitirFiscal) {
                    showNotification('Venda finalizada. Emitindo NFC-e...', 'info');

                    mostrarModalProcessandoNFCe(vendaId);

                    setTimeout(() => {
                        emitirNFCeVenda(vendaId);
                    }, 300);
                } else {
                    imprimirCupomNaoFiscal(vendaId, {
                        ...payload,
                        itens: itensParaCupom
                    }, total, desconto);
                }

                finalizarPosVenda();
                showNotification('Venda finalizada com sucesso.', 'success');
            },
            error: function(xhr) {
                vendaEmProcessamento = false;

                if (xhr.status === 409 && xhr.responseJSON?.pode_continuar) {
                    const aviso = xhr.responseJSON.aviso || 'Cliente possui débitos em aberto.';
                    const totalEmAberto = Number(xhr.responseJSON.total_em_aberto || 0);
                    const parcelasVencidas = Number(xhr.responseJSON.parcelas_vencidas || 0);

                    mostrarModalAvisoDebitoCliente(aviso, totalEmAberto, parcelasVencidas, function() {
                        payload.forcar = true;
                        enviarVenda(payload);
                    });
                    return;
                }

                showNotification(xhr.responseJSON?.error || 'Erro ao finalizar a venda.', 'danger');
            }
        });
    }

    enviarVenda(dados);
}

function finalizarPosVenda() {
    carrinho = [];
    formaPagamentoSelecionada = null;
    clienteSelecionado = null;
    vendaPrazoInfo = null;
    $('#descontoPdv').val(0);
    $('#formaPagamentoPdv').val('');
    $('#valorRecebidoPDV').val('');
    $('#trocoPDV').text('R$ 0,00');
    aoAlterarFormaPagamento();
    removerClienteSelecionado();
    atualizarCarrinho();
    focarCampoCodigo();

    $.ajax({
        url: `${API_URL}/produtos`,
        method: 'GET',
        cache: false,
        success: function(produtos) {
            produtosDisponiveis = Array.isArray(produtos) ? produtos.map(p => ({
                ...p,
                estoque_atual: Number(p.estoque_atual || 0),
                preco_venda: Number(p.preco_venda || 0)
            })) : [];
        }
    });

    if (typeof loadVendas === 'function' && typeof currentPage !== 'undefined' && currentPage === 'vendas') {
        loadVendas();
    }
}

function cancelarVendaAtual() {
    if (carrinho.length === 0) {
        showNotification('Não há venda em andamento para cancelar.', 'info');
        return;
    }

    if (!window.confirm('Tem certeza que deseja cancelar esta venda?')) return;

    carrinho = [];
    formaPagamentoSelecionada = null;
    clienteSelecionado = null;
    vendaPrazoInfo = null;
    $('#descontoPdv').val(0);
    $('#formaPagamentoPdv').val('');
    $('#valorRecebidoPDV').val('');
    $('#trocoPDV').text('R$ 0,00');
    aoAlterarFormaPagamento();
    removerClienteSelecionado();
    atualizarCarrinho();
    focarCampoCodigo();
    showNotification('Venda cancelada.', 'info');
}

function emitirNFCeVenda(vendaId) {
    if (!vendaId) {
        console.error('emitirNFCeVenda chamado sem vendaId');
        limparModaisTravados();
        showNotification('Erro: ID da venda não encontrado para emitir NFC-e.', 'danger');
        return;
    }

    $.ajax({
        url: `${API_URL}/fiscal/emitir/venda/${vendaId}`,
        method: 'POST',
        timeout: 60000,

        success: function(response) {
            console.log('Retorno NFC-e:', response);

            const modalProcessando = document.getElementById('processandoNFCeModal');
            if (modalProcessando) {
                const instancia = bootstrap.Modal.getInstance(modalProcessando);
                if (instancia) instancia.hide();
            }

            setTimeout(() => {
                limparModaisTravados();
                showNotification('NFC-e autorizada pela SEFAZ!', 'success');
                mostrarModalImpressaoFiscal(vendaId, response);
            }, 300);
        },

        error: function(xhr) {
            console.error('Erro ao emitir NFC-e:', xhr);

            const modalProcessando = document.getElementById('processandoNFCeModal');
            if (modalProcessando) {
                const instancia = bootstrap.Modal.getInstance(modalProcessando);
                if (instancia) instancia.hide();
            }

            setTimeout(() => {
                limparModaisTravados();

                const mensagem =
                    xhr.responseJSON?.erro ||
                    xhr.responseJSON?.error ||
                    xhr.responseJSON?.message ||
                    xhr.responseText ||
                    'NFC-e não autorizada pela SEFAZ.';

                showNotification(mensagem, 'danger');
                mostrarModalErroNFCe(vendaId, mensagem);
            }, 300);
        }
    });
}

function mostrarModalErroNFCe(vendaId, mensagem) {
    $('#modal-container').html(`
        <div class="modal fade" id="erroNFCeModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content border-0 shadow">
                    <div class="modal-header bg-danger text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-triangle-exclamation me-2"></i>
                            NFC-e não autorizada
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>

                    <div class="modal-body text-center">
                        <p>
                            A venda <strong>#${vendaId}</strong> foi finalizada, mas a NFC-e não foi autorizada.
                        </p>

                        <div class="alert alert-danger text-start">
                            ${escapeHtml(mensagem)}
                        </div>

                        <div class="d-grid gap-2">
                            <button class="btn btn-warning" onclick="emitirNFCeVenda(${vendaId})">
                                <i class="fas fa-rotate-right me-2"></i>
                                Tentar emitir novamente
                            </button>

                            <button class="btn btn-outline-secondary" onclick="fecharModalErroNFCe()">
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);

    const modalEl = document.getElementById('erroNFCeModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function mostrarModalImpressaoFiscal(vendaId, fiscalResponse = {}) {
    const chaveAcesso =
        fiscalResponse.chave_acesso ||
        fiscalResponse.chaveAcesso ||
        fiscalResponse.chave ||
        '';

    const protocolo =
        fiscalResponse.protocolo ||
        fiscalResponse.nProt ||
        fiscalResponse.numero_protocolo ||
        '';

    $('#modal-container').html(`
        <div class="modal fade" id="impressaoFiscalModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content border-0 shadow">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-check-circle me-2"></i>
                            NFC-e Emitida
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>

                    <div class="modal-body text-center">
                        <p class="mb-2">
                            A NFC-e da venda <strong>#${vendaId}</strong> foi enviada para a SEFAZ.
                        </p>

                        ${chaveAcesso ? `
                            <p class="small mb-1">
                                <strong>Chave:</strong><br>
                                ${escapeHtml(chaveAcesso)}
                            </p>
                        ` : ''}

                        ${protocolo ? `
                            <p class="small mb-3">
                                <strong>Protocolo:</strong><br>
                                ${escapeHtml(protocolo)}
                            </p>
                        ` : ''}

                        <div class="d-grid gap-2">
                            <button class="btn btn-success btn-lg" onclick="imprimirDANFEFiscal(${vendaId})">
                                <i class="fas fa-print me-2"></i>
                                Imprimir Cupom Fiscal
                            </button>

                            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);

    const modalEl = document.getElementById('impressaoFiscalModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

async function mostrarModalProcessandoNFCe(vendaId) {
    $('#modal-container').html(`
        <div class="modal fade" id="processandoNFCeModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content border-0 shadow">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-file-invoice me-2"></i>
                            Emitindo NFC-e
                        </h5>
                    </div>

                    <div class="modal-body text-center">
                        <div class="spinner-border text-primary mb-3" role="status"></div>

                        <p class="mb-1">
                            Venda <strong>#${vendaId}</strong> finalizada.
                        </p>

                        <p class="text-muted mb-0">
                            Enviando NFC-e para autorização da SEFAZ...
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `);

    const modalEl = document.getElementById('processandoNFCeModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

async function imprimirDANFEFiscal(vendaId) {
    try {
        const token = localStorage.getItem('token');

        // Buscar DANFE
        const resposta = await fetch(`${API_URL}/fiscal/danfe/venda/${vendaId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}` 
            }
        });

        const texto = await resposta.text();

        if (!resposta.ok) {
            console.error('Erro ao buscar DANFE:', {
                status: resposta.status,
                resposta: texto
            });

            showNotification(`Erro ao abrir DANFE fiscal: ${texto}`, 'danger');
            return;
        }

        // No Electron, mostrar cupom e imprimir silenciosamente
        if (window.electronAPI?.abrirComprovante) {
            try {
                // Buscar impressora configurada
                const respImpressora = await fetch(`${API_URL}/configuracoes/impressora_cupom`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                let deviceName = null;
                try {
                    const impressoraData = await respImpressora.json();
                    if (impressoraData.caminho) {
                        deviceName = impressoraData.caminho;
                    }
                } catch (e) {
                    // Se não conseguir buscar, imprimir sem deviceName
                }

                // Abrir comprovante visível e imprimir silenciosamente
                window.electronAPI.abrirComprovante(texto, { silent: true, deviceName });
                showNotification('Cupom fiscal enviado para impressora.', 'success');
            } catch (printError) {
                console.error('Erro na impressão:', printError);
                // Fallback: abrir janela sem impressão automática
                window.electronAPI.abrirComprovante(texto);
            }
            return;
        }

        // Fallback para navegador
        const janela = window.open('', '_blank', 'width=420,height=720');

        if (!janela) {
            showNotification('Permita pop-ups para imprimir o cupom fiscal.', 'warning');
            return;
        }

        janela.document.open();
        janela.document.write(texto);
        janela.document.close();

        setTimeout(() => {
            janela.focus();
            janela.print();
        }, 500);

    } catch (error) {
        console.error('Erro ao imprimir DANFE:', error);
        showNotification('Erro ao imprimir DANFE NFC-e.', 'danger');
    }
}

function imprimirCupomNaoFiscal(vendaId, venda, total, desconto) {
    const dataHora = new Date().toLocaleString('pt-BR');
    const formaPagamentoTexto = {
        dinheiro: 'Dinheiro',
        cartao_credito: 'Cartão de Crédito',
        cartao_debito: 'Cartão de Débito',
        pix: 'PIX',
        prazo: 'A Prazo'
    }[venda.forma_pagamento] || venda.forma_pagamento;

    const clienteNome = venda.cliente_nome || (vendaPrazoInfo?.cliente_nome || '');

    const infoPrazo = venda.forma_pagamento === 'prazo' && vendaPrazoInfo ? `
        <div style="margin-top:10px;border-top:1px dashed #000;padding-top:8px;">
            <strong>Venda a Prazo</strong><br>
            Cliente: ${escapeHtml(vendaPrazoInfo.cliente_nome || 'Cliente')}<br>
            Parcelas: ${vendaPrazoInfo.parcelas}<br>
            1º Vencimento: ${escapeHtml(vendaPrazoInfo.primeiro_vencimento)}
        </div>
    ` : '';

    const cupomHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Comprovante Não Fiscal</title>
            <style>
                body { font-family: monospace; width: 80mm; margin: 0 auto; padding: 10px; font-size: 12px; }
                .header, .footer { text-align: center; }
                .header { margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #000; }
                .empresa { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
                .cupom-item { margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px dotted #ccc; }
                .total { text-align: right; margin-top: 15px; padding-top: 10px; border-top: 1px dashed #000; }
                .footer { margin-top: 20px; padding-top: 10px; border-top: 1px dashed #000; font-size: 10px; }
                @media print { body { margin: 0; padding: 5px; } }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="empresa">CDS Sistemas</div>
                <div>${dataHora}</div>
                <div>COMPROVANTE NÃO FISCAL</div>
                <div>Venda #${vendaId}</div>
            </div>

            <div class="itens">
                ${venda.itens.map(item => `
                    <div class="cupom-item">
                        ${escapeHtml(item.produto_nome || 'Produto')}<br>
                        ${Number(item.quantidade)} x ${formatCurrency(item.preco_unitario)} = ${formatCurrency(item.subtotal)}
                    </div>
                `).join('')}
            </div>

            <div class="total">
                Subtotal: ${formatCurrency(total + desconto)}<br>
                Desconto: ${formatCurrency(desconto)}<br>
                <strong>TOTAL: ${formatCurrency(total)}</strong><br>
                Forma de Pagamento: ${formaPagamentoTexto}
                ${clienteNome ? `<br>Cliente: ${escapeHtml(clienteNome)}` : ''}
            </div>

            ${infoPrazo}

            <div class="footer">
                Obrigado pela preferência!<br>
                Volte sempre.<br>
                <strong>Este comprovante não possui valor fiscal.</strong>
            </div>
        </body>
        </html>
    `;

    const payloadEscPos = {
        vendaId,
        forma_pagamento: venda.forma_pagamento,
        cliente_nome: clienteNome || null,
        desconto,
        total,
        itens: Array.isArray(venda.itens) ? venda.itens : []
    };

    $.ajax({
        url: `${API_URL}/impressao/cupom`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(payloadEscPos),
        success: function() {
            showNotification('Cupom enviado para impressora ESC/POS.', 'success');
        },
        error: function(xhr) {
            console.warn('Falha ao imprimir via ESC/POS, usando fallback.', xhr);
            // No Electron, mostrar comprovante e imprimir silenciosamente
            if (window.electronAPI?.abrirComprovante) {
                window.electronAPI.abrirComprovante(cupomHtml, { silent: true });
                return;
            }

            // Fallback para navegador
            const printWindow = window.open('', '_blank', 'width=420,height=720');
            if (!printWindow) {
                showNotification('Permita pop-ups para imprimir o comprovante.', 'warning');
                return;
            }

            printWindow.document.open();
            printWindow.document.write(cupomHtml);
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
        }
    });
}

function limparModaisTravados() {
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
}

function fecharModalErroNFCe() {
    const modalEl = document.getElementById('erroNFCeModal');

    if (modalEl) {
        const instancia = bootstrap.Modal.getInstance(modalEl);
        if (instancia) instancia.hide();
    }

    setTimeout(() => {
        limparModaisTravados();
    }, 300);
}

function abrirModalQuantidadeProduto(produto, callback) {
    $('#modalQuantidadeProduto').remove();

    const unidade = String(produto.unidade || 'UN').toUpperCase();
    const isKg = unidade === 'KG';

    const modalHtml = `
        <div class="modal fade" id="modalQuantidadeProduto" tabindex="-1">
            <div class="modal-dialog modal-sm modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header py-2">
                        <h6 class="modal-title">Quantidade</h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>

                    <div class="modal-body">
                        <p class="mb-2 fw-bold">${produto.nome}</p>

                        <label class="form-label">
                            ${isKg ? 'Peso em KG' : 'Quantidade'}
                        </label>

                        <input 
                            type="number"
                            class="form-control form-control-lg"
                            id="inputQuantidadeProduto"
                            min="0.001"
                            step="${isKg ? '0.001' : '1'}"
                            value="${isKg ? '' : '1'}"
                            placeholder="${isKg ? 'Ex: 0.650' : 'Ex: 1'}"
                        >

                        <small class="text-muted">
                            ${isKg ? 'Digite o peso do produto' : 'Digite a quantidade vendida'}
                        </small>
                    </div>

                    <div class="modal-footer py-2">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            Cancelar
                        </button>
                        <button type="button" class="btn btn-primary" id="btnConfirmarQuantidadeProduto">
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('body').append(modalHtml);

    const modalEl = document.getElementById('modalQuantidadeProduto');
    const modal = new bootstrap.Modal(modalEl);

    modal.show();

    modalEl.addEventListener('shown.bs.modal', function () {
        const input = document.getElementById('inputQuantidadeProduto');
        input.focus();
        input.select();
    });

    $('#btnConfirmarQuantidadeProduto').off('click').on('click', function () {
        confirmarQuantidadeProduto(produto, callback, modal);
    });

    $('#inputQuantidadeProduto').off('keydown').on('keydown', function (e) {
        if (e.key === 'Enter') {
            confirmarQuantidadeProduto(produto, callback, modal);
        }
    });

    modalEl.addEventListener('hidden.bs.modal', function () {
        $('#modalQuantidadeProduto').remove();
    });
}

function confirmarQuantidadeProduto(produto, callback, modal) {
    const valor = $('#inputQuantidadeProduto').val();
    const quantidade = Number(String(valor).replace(',', '.'));

    if (!quantidade || quantidade <= 0) {
        showNotification('Informe uma quantidade válida.', 'warning');
        $('#inputQuantidadeProduto').focus();
        return;
    }

    if (quantidade > Number(produto.estoque_atual)) {
        showNotification(`Estoque insuficiente. Disponível: ${produto.estoque_atual}`, 'danger');
        $('#inputQuantidadeProduto').focus();
        return;
    }

    modal.hide();

    if (typeof callback === 'function') {
        callback(quantidade);
    }
}

// =======================================================
// CONSULTA DE PRODUTOS NO PDV - F1
// =======================================================

function abrirConsultaProdutosPDV() {
    $('#modalConsultaProdutosPDV').remove();

    const modalHtml = `
        <div class="modal fade" id="modalConsultaProdutosPDV" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-search"></i> Consulta de Produtos - F1
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>

                    <div class="modal-body">
                        <div class="alert alert-info py-2 mb-3">
                            Use esta tela apenas para consultar preço/estoque. Clique em <strong>Adicionar</strong> somente se quiser mandar o produto para o carrinho.
                        </div>

                        <div class="input-group mb-3">
                            <span class="input-group-text">
                                <i class="fas fa-barcode"></i>
                            </span>
                            <input
                                type="text"
                                id="inputConsultaProdutoPDV"
                                class="form-control form-control-lg"
                                placeholder="Buscar por nome, código, código de barras ou ID..."
                                autocomplete="off"
                            >
                            <button class="btn btn-primary" type="button" onclick="buscarProdutosConsultaPDV()">
                                Buscar
                            </button>
                        </div>

                        <div id="resultadoConsultaProdutosPDV">
                            <div class="text-muted text-center py-4">
                                Digite o nome, código ou ID do produto para consultar.
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <small class="text-muted me-auto">
                            ESC fecha a consulta. Enter busca o produto.
                        </small>
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            Voltar ao PDV
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('body').append(modalHtml);

    const modalEl = document.getElementById('modalConsultaProdutosPDV');
    const modal = new bootstrap.Modal(modalEl);

    modal.show();

    modalEl.addEventListener('shown.bs.modal', function () {
        $('#inputConsultaProdutoPDV').trigger('focus');
    });

    $('#inputConsultaProdutoPDV').off('keydown').on('keydown', function (e) {
        if (e.key === 'Enter') {
            buscarProdutosConsultaPDV();
        }
    });

    modalEl.addEventListener('hidden.bs.modal', function () {
        $('#modalConsultaProdutosPDV').remove();
        focarCampoCodigo();
    });
}

function buscarProdutosConsultaPDV() {
    const termo = $('#inputConsultaProdutoPDV').val().trim();

    if (!termo) {
        $('#resultadoConsultaProdutosPDV').html(`
            <div class="alert alert-warning">Digite algo para buscar.</div>
        `);
        return;
    }

    $('#resultadoConsultaProdutosPDV').html(`
        <div class="text-center py-4">
            <div class="spinner-border text-primary"></div>
            <div class="mt-2">Buscando produtos...</div>
        </div>
    `);

    $.ajax({
        url: `${API_URL}/produtos/consulta-pdv/buscar?q=${encodeURIComponent(termo)}`,
        method: 'GET',
        cache: false,
        success: function (produtos) {
            renderizarProdutosConsultaPDV(produtos || []);
        },
        error: function (xhr) {
            console.error('Erro na consulta de produtos:', xhr.responseJSON || xhr.responseText || xhr);

            const msg = xhr.responseJSON?.error || 'Erro ao consultar produtos.';

            $('#resultadoConsultaProdutosPDV').html(`
                <div class="alert alert-danger">
                    ${msg}
                </div>
            `);
        }
    });
}

function renderizarProdutosConsultaPDV(produtos) {
    if (!produtos.length) {
        $('#resultadoConsultaProdutosPDV').html(`
            <div class="alert alert-warning">
                Nenhum produto encontrado.
            </div>
        `);
        return;
    }

    const linhas = produtos.map(p => {
        const estoque = Number(p.estoque_atual || 0);
        const preco = Number(p.preco_venda || 0);
        const estoqueBaixo = estoque <= Number(p.estoque_minimo || 0);
        const semEstoque = estoque <= 0;

        return `
            <tr>
                <td>${p.id}</td>
                <td>
                    <strong>${escapeHtml(p.nome)}</strong><br>
                    <small class="text-muted">
                        Código: ${escapeHtml(p.codigo || '-')} |
                        Barras: ${escapeHtml(p.codigo_barras || '-')}
                    </small>
                </td>
                <td>${escapeHtml(p.unidade || 'UN')}</td>
                <td class="fw-bold text-success">${formatCurrency(preco)}</td>
                <td>
                    <span class="badge ${semEstoque ? 'bg-danger' : estoqueBaixo ? 'bg-warning text-dark' : 'bg-success'}">
                        ${estoque}
                    </span>
                </td>
                <td class="text-end">
                    <button
                        type="button"
                        class="btn btn-sm btn-success"
                        ${semEstoque ? 'disabled' : ''}
                        onclick="adicionarProdutoConsultaPDV(${p.id})"
                    >
                        <i class="fas fa-cart-plus"></i> Adicionar
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    $('#resultadoConsultaProdutosPDV').html(`
        <div class="table-responsive">
            <table class="table table-sm table-hover align-middle">
                <thead class="table-light">
                    <tr>
                        <th>ID</th>
                        <th>Produto</th>
                        <th>Un.</th>
                        <th>Preço</th>
                        <th>Estoque</th>
                        <th class="text-end">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhas}
                </tbody>
            </table>
        </div>
    `);
}

function adicionarProdutoConsultaPDV(idProduto) {
    const produto = produtosDisponiveis.find(p => Number(p.id) === Number(idProduto));

    if (!produto) {
        showNotification('Produto não encontrado na lista do PDV. Atualize o PDV e tente novamente.', 'danger');
        return;
    }

    if (Number(produto.estoque_atual || 0) <= 0) {
        showNotification('Produto sem estoque.', 'warning');
        return;
    }

    abrirModalQuantidadeProduto(produto, function (quantidade) {
        adicionarItemNoCarrinho(produto, quantidade, Number(produto.preco_venda || 0));
    });
}

function atualizarDataHoraPdv() {
  const el = document.getElementById("dataHoraPdv");
  if (!el) return;

  const agora = new Date();
  el.textContent = agora.toLocaleString("pt-BR");
}

// Função para abrir fechamento de caixa
function abrirFechamentoCaixa() {
    if (typeof loadPage === 'function') {
        // Fecha o menu lateral se estiver aberto
        if (typeof fecharMenuPdv === 'function') {
            fecharMenuPdv();
        } else {
            document.body.classList.remove('menu-open');
        }
        // Sai do modo fullscreen do PDV antes de navegar
        if (typeof desativarPdvFullscreen === 'function') {
            desativarPdvFullscreen();
        }
        // Remove a classe do body
        document.body.classList.remove('pdv-mode');
        // Carrega a página de caixa
        loadPage('caixa');
        // Atualiza o menu ativo
        $('.nav-link').removeClass('active');
        $('.nav-link[data-page="caixa"]').addClass('active');
    } else {
        showNotification('Erro ao navegar para fechamento de caixa.', 'danger');
    }
}

setInterval(atualizarDataHoraPdv, 1000);
atualizarDataHoraPdv();

document.addEventListener("DOMContentLoaded", () => {
  const busca = document.getElementById("buscaProdutoPdv");
  if (busca) busca.focus();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "F2") {
    e.preventDefault();
    document.getElementById("buscaProdutoPdv")?.focus();
  }

  if (e.key === "F7") {
    e.preventDefault();
    abrirFechamentoCaixa();
  }

  if (e.key === "F10") {
    e.preventDefault();
    document.getElementById("btnFinalizarVendaPdv")?.click();
  }

  if (e.key === "Escape") {
    e.preventDefault();
    // Se menu estiver aberto, fecha o menu
    if (document.body.classList.contains('menu-open')) {
      fecharMenuPdv();
    } else {
      document.getElementById("btnCancelarVendaPdv")?.click();
    }
  }
});

// PDV Fullscreen Mode
function ativarPdvFullscreen() {
  document.body.classList.add('pdv-mode');
}

function desativarPdvFullscreen() {
  document.body.classList.remove('pdv-mode');
}

function abrirMenuPdv() {
  document.body.classList.add('menu-open');
}

function fecharMenuPdv() {
  document.body.classList.remove('menu-open');
}

// Event listener para botão de menu
$(document).off('click.menuPdv').on('click.menuPdv', '#btnMenuPdv', function(e) {
  e.preventDefault();
  e.stopPropagation();
  abrirMenuPdv();
});

// Fechar menu ao clicar no overlay ou em um item do menu
$(document).off('click.fecharMenu').on('click.fecharMenu', function(e) {
  if (document.body.classList.contains('menu-open')) {
    // Se clicou no overlay (fora do menu) ou em um link do menu
    const clickedSidebar = $(e.target).closest('#sidebar').length > 0;
    const clickedMenuButton = $(e.target).closest('#btnMenuPdv').length > 0;

    if (!clickedSidebar && !clickedMenuButton) {
      fecharMenuPdv();
    }

    // Se clicou em um link do menu, fecha o menu e desativa fullscreen
    if ($(e.target).closest('.nav-link').length > 0) {
      fecharMenuPdv();
      desativarPdvFullscreen();
    }
  }
});

// Ativar fullscreen quando carregar PDV
$(document).ready(function() {
  if (currentPage === 'pdv') {
    ativarPdvFullscreen();
  }
});
