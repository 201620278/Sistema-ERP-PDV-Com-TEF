function normalizarTexto(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .normalize('NFC')
        .toLowerCase();
}

// Função utilitária para normalizar produto com categoria e subcategoria
function normalizarProduto(produto, categorias = window.categoriasSistema || []) {
    const categoriaId = String(produto.categoria_id || produto.categoriaId || '');
    const subcategoriaId = String(produto.subcategoria_id || produto.subcategoriaId || '');
    const categoriaObj = categorias.find(c => String(c.id) === categoriaId);
    const subcategoriaObj = categoriaObj && categoriaObj.subcategorias ? categoriaObj.subcategorias.find(s => String(s.id) === subcategoriaId) : null;
    return {
        ...produto,
        categoria: produto.categoria || produto.categoria_nome || (categoriaObj ? categoriaObj.nome : ''),
        subcategoria: produto.subcategoria || produto.subcategoria_nome || (subcategoriaObj ? subcategoriaObj.nome : '')
    };
}
// Função global para minimizar modais Bootstrap
window.minimizarModal = function(modalId) {
    const $modal = $('#' + modalId);
    if ($modal.length) {
        $modal.modal('hide');
        // Adiciona botão flutuante para restaurar
        if ($('#btn-restaurar-' + modalId).length === 0) {
            const $btn = $('<button id="btn-restaurar-' + modalId + '" class="btn btn-primary position-fixed" style="bottom: 24px; right: 24px; z-index: 2000; box-shadow: 0 2px 8px #0002;">Restaurar Produto</button>');
            $btn.on('click', function() {
                $modal.modal('show');
                // Atualiza categorias e subcategorias ao restaurar
                if (typeof inicializarCategoriasESubcategorias === 'function') {
                    // Pega os dados já preenchidos
                    const produto = {
                        id: $('#produtoId').val(),
                        codigo: $('#codigo').val(),
                        nome: $('#nome').val(),
                        categoria_id: $('#categoria_id').val(),
                        subcategoria_id: $('#subcategoria_id').val(),
                        unidade: $('#unidade').val(),
                        preco_compra: $('#preco_compra').val(),
                        lucro_percentual: $('#lucro_percentual').val(),
                        preco_venda: $('#preco_venda').val(),
                        estoque_atual: $('#estoque_atual').val(),
                        estoque_minimo: $('#estoque_minimo').val(),
                        fornecedor: $('#fornecedor').val()
                    };
                    inicializarCategoriasESubcategorias(produto, !!produto.id);
                }
                $(this).remove();
            });
            $('body').append($btn);
        }
    }
};
// =========================
// MÓDULO DE PRODUTOS
// =========================

// Carrega página de produtos
function loadProdutos() {
    $.ajax({
        url: `${API_URL}/produtos`,
        method: 'GET',
        success: function (produtos) {
            window.produtosList = produtos || [];
            renderProdutos(window.produtosList);
        },
        error: function () {
            $('#page-content').html('<div class="alert alert-danger">Erro ao carregar produtos!</div>');
        }
    });
}
window.loadProdutos = loadProdutos;

const RELATORIO_PRODUTOS_FILTROS = {
    todos: 'Todos os produtos',
    estoque_baixo: 'Estoque baixo',
    proximo_minimo: 'Próximo do mínimo',
    vencidos: 'Vencidos',
    proximo_vencimento: 'Próximos do vencimento'
};

function showRelatorioEstoqueProdutos() {
    carregarRelatorioEstoqueProdutos('todos');
}

function obterTipoFiltroRelatorioAtual() {
    const modal = document.getElementById('relatorio-estoque-modal');
    if (modal) {
        return modal.getAttribute('data-tipo-filtro') || 'todos';
    }
    return $('#relatorio-tipo-filtro').val() || 'todos';
}

function aplicarFiltroRelatorioProdutos() {
    const tipoFiltro = $('#relatorio-tipo-filtro').val() || 'todos';
    const inicio = $('#relatorio-data-inicio').val() || '';
    const fim = $('#relatorio-data-fim').val() || '';
    carregarRelatorioEstoqueProdutos(tipoFiltro, inicio, fim);
}

function classificarEstoqueProduto(p) {
    const atual = Number(p.estoque_atual || 0);
    const minimo = Number(p.estoque_minimo || 0);
    if (minimo <= 0) return 'ok';
    if (atual <= minimo) return 'estoque_baixo';
    if (atual <= Math.ceil(minimo * 1.2)) return 'proximo_minimo';
    return 'ok';
}

function classificarValidadeProduto(p) {
    if (Number(p.controlar_validade || 0) !== 1 || !p.data_validade) {
        return 'nao_controla';
    }
    if (p.status_validade === 'vencido') return 'vencido';
    if (p.status_validade === 'proximo') return 'proximo_vencimento';
    return 'ok_validade';
}

function obterStatusVisualProduto(p) {
    const estoque = classificarEstoqueProduto(p);
    const validade = classificarValidadeProduto(p);
    const critico = estoque === 'estoque_baixo' || validade === 'vencido';
    const alerta = estoque === 'proximo_minimo' || validade === 'proximo_vencimento';

    if (critico) return { nivel: 'critico', estoque, validade };
    if (alerta) return { nivel: 'alerta', estoque, validade };
    return { nivel: 'ok', estoque, validade };
}

function classesLinhaStatusProduto(status) {
    if (status.nivel === 'critico') {
        return { row: 'table-danger', text: 'text-danger', estoque: 'text-danger fw-bold' };
    }
    if (status.nivel === 'alerta') {
        return { row: 'table-warning', text: 'text-warning-emphasis', estoque: 'text-warning-emphasis fw-bold' };
    }
    return { row: '', text: '', estoque: '' };
}

function montarBadgesStatusProduto(p) {
    const status = obterStatusVisualProduto(p);
    const badges = [];

    if (status.estoque === 'estoque_baixo') {
        badges.push('<span class="badge bg-danger ms-1">Estoque baixo</span>');
    } else if (status.estoque === 'proximo_minimo') {
        badges.push('<span class="badge bg-warning text-dark ms-1">Próximo do mínimo</span>');
    }

    if (status.validade === 'vencido') {
        badges.push('<span class="badge bg-danger ms-1">Vencido</span>');
    } else if (status.validade === 'proximo_vencimento') {
        const dias = Number(p.dias_para_vencer ?? 0);
        badges.push(`<span class="badge bg-warning text-dark ms-1">Vence em ${dias} dia(s)</span>`);
    }

    return badges.join('');
}

const classificarEstoqueRelatorio = classificarEstoqueProduto;
const classificarValidadeRelatorio = classificarValidadeProduto;

function filtrarProdutosRelatorio(produtos, tipoFiltro) {
    const lista = Array.isArray(produtos) ? produtos : [];

    switch (tipoFiltro) {
        case 'estoque_baixo':
            return lista.filter((p) => classificarEstoqueRelatorio(p) === 'estoque_baixo');
        case 'proximo_minimo':
            return lista.filter((p) => classificarEstoqueRelatorio(p) === 'proximo_minimo');
        case 'vencidos':
            return lista.filter((p) => {
                return classificarValidadeRelatorio(p) === 'vencido' && Number(p.estoque_atual || 0) > 0;
            });
        case 'proximo_vencimento':
            return lista.filter((p) => {
                return classificarValidadeRelatorio(p) === 'proximo_vencimento' && Number(p.estoque_atual || 0) > 0;
            });
        case 'todos':
        default:
            return lista;
    }
}

function montarBadgesStatusRelatorio(p) {
    const badges = [];
    const estoque = classificarEstoqueRelatorio(p);

    if (estoque === 'estoque_baixo') {
        badges.push('<span class="badge bg-danger">Estoque baixo</span>');
    } else if (estoque === 'proximo_minimo') {
        badges.push('<span class="badge bg-warning text-dark">Próximo do mínimo</span>');
    }

    const validade = classificarValidadeRelatorio(p);
    if (validade === 'vencido') {
        badges.push('<span class="badge bg-danger">Vencido</span>');
    } else if (validade === 'proximo_vencimento') {
        const dias = Number(p.dias_para_vencer ?? 0);
        badges.push(`<span class="badge bg-warning text-dark">Vence em ${dias} dia(s)</span>`);
    }

    if (!badges.length) {
        badges.push('<span class="badge bg-secondary">OK</span>');
    }

    return badges.join(' ');
}

function formatarValidadeRelatorio(valor) {
    if (!valor) return '-';
    const data = new Date(`${valor}T00:00:00`);
    return Number.isNaN(data.getTime()) ? valor : data.toLocaleDateString('pt-BR');
}

function montarOptionsFiltroRelatorio(tipoAtual) {
    return Object.entries(RELATORIO_PRODUTOS_FILTROS)
        .map(([valor, label]) => {
            const selected = valor === tipoAtual ? 'selected' : '';
            return `<option value="${valor}" ${selected}>${label}</option>`;
        })
        .join('');
}

function parseRelatorioData(valor) {
    if (!valor) return null;
    const data = new Date(`${valor}T00:00:00`);
    return Number.isNaN(data.getTime()) ? null : data;
}

function isRelatorioDataDentroDoIntervalo(dataString, inicio, fim) {
    if (!dataString) return false;

    const data = new Date(dataString);
    if (Number.isNaN(data.getTime())) return false;

    if (inicio && data < inicio) return false;

    if (fim) {
        const fimDoDia = new Date(fim.getTime());
        fimDoDia.setHours(23, 59, 59, 999);
        if (data > fimDoDia) return false;
    }

    return true;
}

function formatarUltimaCompraRelatorio(valor) {
    if (!valor) return '-';
    return formatDate(valor);
}

function printRelatorioEstoqueProdutos() {
    const $modal = $('#relatorio-estoque-modal');
    if (!$modal.length) return;

    const title = 'Relatório de Estoque';
    const bodyHtml = $modal.find('.modal-body').html();
    const css = `
        <style>
            body { font-family: Arial, sans-serif; color: #222; padding: 20px; }
            h1 { font-size: 20px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background: #f8f9fa; }
            tr.table-danger td { background-color: #f8d7da; }
            tr.table-warning td { background-color: #fff3cd; }
            .badge { display: inline-block; padding: 0.35em 0.65em; border-radius: 0.35rem; }
            .badge.bg-danger { background-color: #dc3545; color: white; }
            .badge.bg-warning { background-color: #ffc107; color: #212529; }
            .badge.bg-secondary { background-color: #6c757d; color: white; }
            .no-print { display: none !important; }
        </style>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>${title}</title>
                ${css}
            </head>
            <body>
                <h1>${title}</h1>
                ${bodyHtml}
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

function carregarRelatorioEstoqueProdutos(tipoFiltro = 'todos', filtroInicio = '', filtroFim = '') {
    const params = new URLSearchParams();

    if (filtroInicio) params.append('inicio', filtroInicio);
    if (filtroFim) params.append('fim', filtroFim);

    $.ajax({
        url: `${API_URL}/produtos/relatorio-estoque?${params.toString()}`,
        method: 'GET',
        headers: {
            Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
        },
        success: function(produtos) {
            renderRelatorioEstoqueProdutos(produtos || [], tipoFiltro, filtroInicio, filtroFim);
        },
        error: function(xhr) {
            const erro = xhr.responseJSON?.error || 'Erro ao carregar relatório de estoque.';
            showNotification(erro, 'danger');
        }
    });
}

function renderRelatorioEstoqueProdutos(produtos, tipoFiltro = 'todos', filtroInicio = '', filtroFim = '') {
    produtos = Array.isArray(produtos) ? produtos : [];
    const inicio = parseRelatorioData(filtroInicio);
    const fim = parseRelatorioData(filtroFim);

    let produtosFiltrados = produtos;

    if (inicio || fim) {
        produtosFiltrados = produtos.filter(p => isRelatorioDataDentroDoIntervalo(p.ultima_compra_data, inicio, fim));
    }

    const produtosExibidos = filtrarProdutosRelatorio(produtosFiltrados, tipoFiltro);

    const valorTotalFiscal = produtosExibidos.reduce((sum, p) => {
        return sum + (Number(p.estoque_atual || 0) * Number(p.preco_compra || 0));
    }, 0);

    const tituloModo = RELATORIO_PRODUTOS_FILTROS[tipoFiltro] || 'Todos os produtos';

    const filtroLegenda = `Exibindo ${produtosExibidos.length} produto(s) de ${produtosFiltrados.length} no período.`;

    const filtroDatasTexto = (inicio || fim)
        ? `Filtro aplicado pela data da última compra: ${filtroInicio || 'início não informado'} até ${filtroFim || 'fim não informado'}.`
        : 'Nenhum filtro de data aplicado.';

    const modalHtml = `
        <div class="modal fade" id="relatorio-estoque-modal" tabindex="-1" data-tipo-filtro="${tipoFiltro}">
            <div class="modal-dialog modal-xl modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Relatório de Estoque</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row g-3 mb-3 no-print">
                            <div class="col-md-4">
                                <label class="form-label">Tipo de filtro</label>
                                <select id="relatorio-tipo-filtro" class="form-select">
                                    ${montarOptionsFiltroRelatorio(tipoFiltro)}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Data início (última compra)</label>
                                <input type="date" id="relatorio-data-inicio" class="form-control" value="${filtroInicio || ''}">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Data fim (última compra)</label>
                                <input type="date" id="relatorio-data-fim" class="form-control" value="${filtroFim || ''}">
                            </div>
                            <div class="col-md-2 d-flex align-items-end gap-2 flex-wrap">
                                <button type="button" class="btn btn-primary w-100" onclick="aplicarFiltroRelatorioProdutos()">
                                    Aplicar
                                </button>
                            </div>
                            <div class="col-12 d-flex gap-2 flex-wrap">
                                <button type="button" class="btn btn-outline-secondary btn-sm" onclick="carregarRelatorioEstoqueProdutos($('#relatorio-tipo-filtro').val() || 'todos')">
                                    Limpar datas
                                </button>
                                <button type="button" class="btn btn-success btn-sm" onclick="printRelatorioEstoqueProdutos()">
                                    Imprimir relatório
                                </button>
                            </div>
                        </div>

                        <div class="mb-3">
                            <strong>${tituloModo}</strong>
                            <div class="text-muted">${filtroLegenda}</div>
                            <div class="text-muted">${filtroDatasTexto}</div>
                            <div class="text-muted">Valor fiscal total exibido: ${formatCurrency(valorTotalFiscal)}</div>
                        </div>

                        <div class="table-responsive">
                            <table class="table table-striped table-hover">
                                <thead>
                                    <tr>
                                        <th>Produto</th>
                                        <th>Categoria</th>
                                        <th>Estoque</th>
                                        <th>Mínimo</th>
                                        <th>Lote</th>
                                        <th>Validade</th>
                                        <th>Última compra</th>
                                        <th>Total em estoque</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${produtosExibidos.length === 0 ? `
                                        <tr>
                                            <td colspan="9" class="text-center">
                                                Nenhum produto encontrado para o filtro selecionado.
                                            </td>
                                        </tr>
                                    ` : produtosExibidos.map(p => {
                                        const estoqueAtual = Number(p.estoque_atual || 0);
                                        const estoqueMinimo = Number(p.estoque_minimo || 0);
                                        const precoCompra = Number(p.preco_compra || 0);
                                        const totalItem = estoqueAtual * precoCompra;
                                        const classes = classesLinhaStatusProduto(obterStatusVisualProduto(p));

                                        return `
                                            <tr class="${classes.row}">
                                                <td class="${classes.text}">${escapeHtml(p.nome || '-')}</td>
                                                <td>${escapeHtml(p.categoria || '-')}</td>
                                                <td>${estoqueAtual}</td>
                                                <td>${estoqueMinimo}</td>
                                                <td>${escapeHtml(p.lote || '-')}</td>
                                                <td>${formatarValidadeRelatorio(p.data_validade)}</td>
                                                <td>${formatarUltimaCompraRelatorio(p.ultima_compra_data)}</td>
                                                <td>${formatCurrency(totalItem)}</td>
                                                <td>${montarBadgesStatusRelatorio(p)}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="modal-footer no-print">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('#modal-container').html(modalHtml);

    const modalEl = document.getElementById('relatorio-estoque-modal');
    const modal = new bootstrap.Modal(modalEl);

    modalEl.addEventListener('hidden.bs.modal', function () {
        modal.dispose();
        $('#relatorio-estoque-modal').remove();
        $('.modal-backdrop').remove();
    });

    modal.show();
}


function montarOptionsFiltroCategorias(produtos) {
    const mapa = new Map();

    (produtos || []).forEach(p => {
        const id = String(p.categoria_id || '');
        const nome = p.categoria || p.categoria_nome || '';

        if (id && nome) {
            mapa.set(id, nome);
        }
    });

    return Array.from(mapa.entries())
        .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
        .map(([id, nome]) => `<option value="${id}">${escapeHtml(nome)}</option>`)
        .join('');
}

function aplicarFiltrosProdutos(produtos) {
    const termo = normalizarTexto($('#buscaProduto').val()).trim();
    const categoriaId = String($('#filtroCategoriaProduto').val() || '');

    // Se houver termo de busca ou filtro de categoria, mostrar tabela normal
    if (termo || categoriaId) {
        $('#categorias-container').hide();
        $('#tabela-produtos-container').show();

        const filtrados = (produtos || []).filter(p => {
            const bateBusca =
                !termo ||
                (p.nome && normalizarTexto(p.nome).includes(termo)) ||
                (p.codigo && normalizarTexto(p.codigo).includes(termo)) ||
                (p.categoria && normalizarTexto(p.categoria).includes(termo)) ||
                (p.fornecedor && normalizarTexto(p.fornecedor).includes(termo));

            const bateCategoria =
                !categoriaId || String(p.categoria_id || '') === categoriaId;

            return bateBusca && bateCategoria;
        });

        $('#produtos-tbody').html(renderProdutosAgrupados(filtrados));
    } else {
        // Se não houver filtro, mostrar categorias
        $('#categorias-container').show();
        $('#tabela-produtos-container').hide();
        carregarCategoriasProdutos();
    }
}

function produtoComEstoqueBaixo(p) {
    return classificarEstoqueProduto(p) === 'estoque_baixo';
}

function produtoProximoMinimo(p) {
    return classificarEstoqueProduto(p) === 'proximo_minimo';
}

function renderProdutoRow(p) {
    const status = obterStatusVisualProduto(p);
    const classes = classesLinhaStatusProduto(status);
    const badges = montarBadgesStatusProduto(p);

    return `
        <tr class="${classes.row}">
            <td class="${classes.text} fw-semibold">${escapeHtml(p.nome || '')}</td>
            <td>${escapeHtml(p.codigo || '')}</td>
            <td>${escapeHtml(p.categoria || p.categoria_nome || '')}</td>
            <td>${escapeHtml(p.unidade || '')}</td>
            <td>${formatCurrency(p.preco_compra || 0)}</td>
            <td>${formatCurrency(p.preco_venda || 0)}</td>
            <td class="${classes.estoque}">
                ${formatarEstoqueProduto(p.estoque_atual, p.unidade)}
                ${badges}
            </td>
            <td>
                <button class="btn btn-sm btn-info" onclick="viewProduto(${p.id})">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-warning" onclick="editProduto(${p.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduto(${p.id})">
                    <i class="fas fa-trash"></i>
                </button>
                <button class="btn btn-sm btn-secondary" onclick="historicoProduto(${p.id})">
                    <i class="fas fa-history"></i>
                </button>
            </td>
        </tr>
    `;
}

function renderProdutosAgrupados(produtos) {
    if (!produtos || produtos.length === 0) {
        return `
            <tr>
                <td colspan="8" class="text-center text-muted py-4">
                    Nenhum produto encontrado.
                </td>
            </tr>
        `;
    }

    const grupos = {};

    produtos.forEach(produto => {
        const categoria = produto.categoria || produto.categoria_nome || 'SEM CATEGORIA';
        const subcategoria = produto.subcategoria || produto.subcategoria_nome || 'SEM SUBCATEGORIA';

        if (!grupos[categoria]) {
            grupos[categoria] = {};
        }

        if (!grupos[categoria][subcategoria]) {
            grupos[categoria][subcategoria] = [];
        }

        grupos[categoria][subcategoria].push(produto);
    });

    let html = '';

    Object.keys(grupos)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .forEach(categoria => {
            html += `
                <tr class="table-dark">
                    <td colspan="8" style="font-weight: bold; font-size: 15px;">
                        ${escapeHtml(categoria.toUpperCase())}
                    </td>
                </tr>
            `;

            Object.keys(grupos[categoria])
                .sort((a, b) => a.localeCompare(b, 'pt-BR'))
                .forEach(subcategoria => {
                    html += `
                        <tr class="table-secondary">
                            <td colspan="8" style="font-weight: bold; padding-left: 25px;">
                                ${escapeHtml(subcategoria)}
                            </td>
                        </tr>
                    `;

                    grupos[categoria][subcategoria]
                        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
                        .forEach(produto => {
                            html += renderProdutoRow(produto);
                        });
                });
        });

    return html;
}

function gerarRelatorioEstoque() {
    showRelatorioEstoqueProdutos();
}

// Renderiza listagem de produtos
function renderProdutos(produtos) {
    window.produtosCache = produtos;
    window.produtosOriginais = produtos;
    const html = `
        <div class="row mb-3 g-3">
            <div class="col-md-6">
                <div class="card mb-0 border-danger h-100" id="cardEstoqueBaixoProdutos">
                    <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2 bg-danger bg-opacity-10">
                        <strong class="text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Alertas de estoque</strong>
                        <button type="button" class="btn btn-sm btn-outline-danger" onclick="carregarEstoqueBaixoProdutos()">
                            <i class="fas fa-sync-alt"></i> Atualizar
                        </button>
                    </div>
                    <div class="card-body" id="listaEstoqueBaixoProdutos">
                        <div class="text-muted">Carregando...</div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card-dashboard card-vencimentos h-100" id="cardVencimentosProdutos">
                    <div class="card-icon">⏰</div>
                    <div class="card-info">
                        <h3>Vencimentos</h3>
                        <p>
                            <strong id="qtdProdutosVencidos">0</strong> vencidos |
                            <strong id="qtdProdutosProximos">0</strong> próximos
                        </p>
                        <button type="button" class="btn btn-warning btn-sm" onclick="abrirModalVencimentosProdutos()">
                            Ver produtos
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-header">
                <div class="row align-items-center">
                    <div class="col-md-6">
                        <i class="fas fa-box"></i> Lista de Produtos
                    </div>
                    <div class="col-md-8 d-flex justify-content-end align-items-center gap-2 flex-wrap">
                        <button class="btn btn-secondary btn-sm" onclick="gerarRelatorioEstoque()">
                            <i class="fas fa-list"></i> Relatório de estoque
                        </button>

                        <button class="btn btn-primary btn-sm" onclick="showProdutoModal()">
                            <i class="fas fa-plus"></i> Novo Produto
                        </button>

                        <select
                            class="form-select form-select-sm"
                            id="filtroCategoriaProduto"
                            style="width: 200px;"
                        >
                            <option value="">Todas as categorias</option>
                            ${montarOptionsFiltroCategorias(produtos)}
                        </select>

                        <input
                            type="text"
                            class="form-control form-control-sm"
                            id="buscaProduto"
                            placeholder="Buscar produto..."
                            style="width: 200px;"
                        >
                    </div>
                </div>
            </div>

            <div class="card-body">
                <div class="alert alert-info py-2 mb-3">
                    <i class="fas fa-info-circle me-2"></i>
                    Clique em uma categoria para ver os produtos. Use a busca acima para pesquisar em todos os produtos.
                </div>
                <div class="d-flex flex-wrap gap-3 mb-3 small">
                    <span><span class="d-inline-block rounded px-2 py-1 bg-warning">&nbsp;</span> Amarelo: próximo do mínimo ou do vencimento</span>
                    <span><span class="d-inline-block rounded px-2 py-1 bg-danger">&nbsp;</span> Vermelho: estoque no mínimo ou abaixo / vencido</span>
                </div>
                <div id="categorias-container">
                    ${renderCategoriasProdutos(produtos)}
                </div>
                <div class="table-responsive" id="tabela-produtos-container" style="display: none;">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Código</th>
                                <th>Categoria</th>
                                <th>Unidade</th>
                                <th>Preço Compra</th>
                                <th>Preço Venda</th>
                                <th>Estoque</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="produtos-tbody">
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    $('#page-content').html(html);

    $('#buscaProduto, #filtroCategoriaProduto').on('input change', function () {
        aplicarFiltrosProdutos(produtos);
    });

    // Carregar categorias inicialmente
    carregarCategoriasProdutos();
    inicializarCardEstoqueBaixo();
    inicializarModalVencimentosProdutos();
    carregarVencimentosProdutos();
}

function renderCategoriasProdutos(produtos) {
    if (!produtos || produtos.length === 0) {
        return '<div class="alert alert-warning">Nenhum produto encontrado.</div>';
    }

    // Extrair categorias únicas dos produtos
    const categoriasMap = new Map();
    produtos.forEach(p => {
        const catId = p.categoria_id || '';
        const catNome = p.categoria || p.categoria_nome || 'Sem Categoria';
        if (!categoriasMap.has(catId)) {
            categoriasMap.set(catId, { id: catId, nome: catNome, count: 0 });
        }
        categoriasMap.get(catId).count++;
    });

    const categorias = Array.from(categoriasMap.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    return categorias.map(cat => `
        <div class="card mb-2 categoria-card" data-categoria-id="${cat.id}">
            <div class="card-header bg-light d-flex justify-content-between align-items-center" style="cursor: pointer;" onclick="toggleProdutosCategoriaMenu('${cat.id}', '${escapeHtml(cat.nome)}')">
                <strong><i class="fas fa-folder me-2"></i>${escapeHtml(cat.nome)}</strong>
                <span class="badge bg-primary">${cat.count}</span>
            </div>
            <div class="card-body p-0" id="produtos-categoria-${cat.id}" style="display: none;">
                <div class="text-center py-3">
                    <div class="spinner-border spinner-border-sm text-primary"></div>
                </div>
            </div>
        </div>
    `).join('');
}

function carregarCategoriasProdutos() {
    $('#categorias-container').html(`
        <div class="text-center py-4">
            <div class="spinner-border text-primary"></div>
            <div class="mt-2">Carregando categorias...</div>
        </div>
    `);

    $.ajax({
        url: `${API_URL}/categorias?tipo=produto`,
        method: 'GET',
        success: function(categorias) {
            if (!categorias || categorias.length === 0) {
                $('#categorias-container').html(`
                    <div class="alert alert-warning">
                        Nenhuma categoria encontrada.
                    </div>
                `);
                return;
            }

            // Contar produtos por categoria
            const categoriasComContagem = categorias.map(cat => {
                const produtosCategoria = (window.produtosCache || []).filter(
                    (p) => String(p.categoria_id) === String(cat.id)
                );
                const count = produtosCategoria.length;
                const countBaixo = produtosCategoria.filter((p) => produtoComEstoqueBaixo(p)).length;
                const countProximo = produtosCategoria.filter((p) => produtoProximoMinimo(p)).length;
                return { ...cat, count, countBaixo, countProximo };
            }).filter(cat => cat.count > 0);

            const html = categoriasComContagem.map(cat => `
                <div class="card mb-2 categoria-card" data-categoria-id="${cat.id}">
                    <div class="card-header bg-light d-flex justify-content-between align-items-center" style="cursor: pointer;" onclick="toggleProdutosCategoriaMenu(${cat.id}, '${escapeHtml(cat.nome)}')">
                        <strong><i class="fas fa-folder me-2"></i>${escapeHtml(cat.nome)}</strong>
                        <span>
                            <span class="badge bg-primary">${cat.count}</span>
                            ${cat.countProximo > 0 ? `<span class="badge bg-warning text-dark ms-1" title="Próximo do estoque mínimo">${cat.countProximo} próx.</span>` : ''}
                            ${cat.countBaixo > 0 ? `<span class="badge bg-danger ms-1" title="Estoque no mínimo ou abaixo">${cat.countBaixo} baixo</span>` : ''}
                        </span>
                    </div>
                    <div class="card-body p-0" id="produtos-categoria-${cat.id}" style="display: none;">
                        <div class="text-center py-3">
                            <div class="spinner-border spinner-border-sm text-primary"></div>
                        </div>
                    </div>
                </div>
            `).join('');

            $('#categorias-container').html(html);
        },
        error: function() {
            $('#categorias-container').html(`
                <div class="alert alert-danger">
                    Erro ao carregar categorias.
                </div>
            `);
        }
    });
}

function toggleProdutosCategoriaMenu(categoriaId, categoriaNome) {
    const container = $(`#produtos-categoria-${categoriaId}`);

    if (container.is(':visible')) {
        container.slideUp();
    } else {
        // Se ainda não carregou os produtos, carregar
        if (container.find('.spinner-border').length > 0) {
            const produtosCategoria = (window.produtosCache || []).filter(p => String(p.categoria_id) === String(categoriaId));

            if (!produtosCategoria || produtosCategoria.length === 0) {
                container.html(`
                    <div class="p-3 text-muted">
                        Nenhum produto nesta categoria.
                    </div>
                `);
            } else {
                const tabelaHtml = `
                    <div class="table-responsive">
                        <table class="table table-striped table-hover mb-0">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Código</th>
                                    <th>Unidade</th>
                                    <th>Preço Compra</th>
                                    <th>Preço Venda</th>
                                    <th>Estoque</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${produtosCategoria.map(p => renderProdutoRow(p)).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                container.html(tabelaHtml);
            }
        }

        container.slideDown();
    }
}

function renderProdutosRows(produtos) {
    if (!produtos || produtos.length === 0) {
        return '<tr><td colspan="8" class="text-center">Nenhum produto cadastrado</td></tr>';
    }

    return produtos.map((p) => renderProdutoRow(p)).join('');
}


// Abre modal de produto
function showProdutoModal(produto = null) {
    const isEdit = produto !== null;
    const title = isEdit ? 'Editar Produto' : 'Novo Produto';
    const lucro = isEdit && produto.lucro_percentual !== undefined ? produto.lucro_percentual : '';

    // Remove modais antigos para evitar conflitos de aria-hidden e IDs duplicados
    $('#produtoModal').remove();
    $('#viewProdutoModal').remove();
    const modalHtml = `
        <div class="modal fade" id="produtoModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header d-flex align-items-center justify-content-between">
                        <h5 class="modal-title mb-0">${title}</h5>
                        <div class="d-flex gap-2">
                            <button type="button" class="btn btn-outline-secondary btn-sm" onclick="minimizarModal('produtoModal')" title="Minimizar">
                                <i class="fas fa-window-minimize"></i>
                            </button>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                        </div>
                    </div>

                    <div class="modal-body">
                        <form id="produtoForm">
                            <input type="hidden" id="produtoId" value="${isEdit ? (produto.id || '') : ''}">

                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label for="codigo" class="form-label">Código</label>
                                    <input
                                        type="text"
                                        class="form-control"
                                        id="codigo"
                                        value="${isEdit ? escapeHtml(produto.codigo || '') : ''}"
                                    >
                                </div>

                                <div class="col-md-6 mb-3">
                                    <label for="nome" class="form-label">Nome *</label>
                                    <input
                                        type="text"
                                        class="form-control"
                                        id="nome"
                                        required
                                        value="${isEdit ? escapeHtml(produto.nome || '') : ''}"
                                    >
                                </div>

                                <div class="col-md-6 mb-3">
                                    <label for="categoria_id" class="form-label">Categoria</label>
                                    <select class="form-control" id="categoria_id">
                                        <option value="">Carregando...</option>
                                    </select>
                                </div>

                                <div class="col-md-6 mb-3">
                                    <label for="subcategoria_id" class="form-label">Subcategoria</label>
                                    <select class="form-control" id="subcategoria_id">
                                        <option value="">Selecione uma categoria</option>
                                    </select>
                                </div>

                                <div class="col-md-6 mb-3">
                                    <label for="unidade" class="form-label">Unidade</label>
                                    <select class="form-control" id="unidade">
                                        <option value="un" ${isEdit && produto.unidade === 'un' ? 'selected' : ''}>Unidade</option>
                                        <option value="kg" ${isEdit && produto.unidade === 'kg' ? 'selected' : ''}>Quilograma</option>
                                        <option value="g" ${isEdit && produto.unidade === 'g' ? 'selected' : ''}>Grama</option>
                                        <option value="l" ${isEdit && produto.unidade === 'l' ? 'selected' : ''}>Litro</option>
                                        <option value="ml" ${isEdit && produto.unidade === 'ml' ? 'selected' : ''}>Mililitro</option>
                                    </select>
                                </div>

                                <div class="col-md-6 mb-3 d-flex align-items-end">
                                    <div class="form-check form-switch">
                                        <input
                                            class="form-check-input"
                                            type="checkbox"
                                            id="vendido_por_peso"
                                            ${isEdit && Number(produto.vendido_por_peso || 0) === 1 ? 'checked' : ''}
                                        >
                                        <label class="form-check-label" for="vendido_por_peso">
                                            Produto vendido por peso
                                        </label>
                                    </div>
                                </div>

                                <div class="col-12" id="areaProdutoPeso" style="display:none;">
                                    <div class="card border-primary mb-3">
                                        <div class="card-header bg-light">
                                            <strong>Configuração de venda por peso</strong>
                                        </div>
                                        <div class="card-body">
                                            <div class="row">
                                                <div class="col-md-4 mb-3">
                                                    <label for="peso_total_compra" class="form-label">Peso Total Comprado (KG)</label>
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        class="form-control"
                                                        id="peso_total_compra"
                                                        value="${isEdit ? Number(produto.peso_total_compra || 0) : 0}"
                                                    >
                                                </div>

                                                <div class="col-md-4 mb-3">
                                                    <label for="valor_total_compra" class="form-label">Valor Total da Compra</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        class="form-control"
                                                        id="valor_total_compra"
                                                        value="${isEdit ? Number(produto.valor_total_compra || 0) : 0}"
                                                    >
                                                </div>

                                                <div class="col-md-4 mb-3">
                                                    <label for="custo_por_kg" class="form-label">Custo por KG</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        class="form-control"
                                                        id="custo_por_kg"
                                                        readonly
                                                        value="${isEdit ? Number(produto.custo_por_kg || 0) : 0}"
                                                    >
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="col-md-4 mb-3">
                                    <label for="preco_compra" class="form-label">Preço de Compra</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        class="form-control"
                                        id="preco_compra"
                                        value="${isEdit ? Number(produto.preco_compra || 0) : 0}"
                                    >
                                </div>

                                <div class="col-md-4 mb-3">
                                    <label for="lucro_percentual" class="form-label">% Lucro Real</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        class="form-control"
                                        id="lucro_percentual"
                                        placeholder="%"
                                        value="${lucro}"
                                    >
                                </div>

                                <div class="col-md-4 mb-3">
                                    <label for="preco_venda" class="form-label">Preço de Venda *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        class="form-control"
                                        id="preco_venda"
                                        required
                                        value="${isEdit ? Number(produto.preco_venda || 0) : 0}"
                                    >
                                </div>

                                <div class="col-md-6 mb-3">
                                    <label for="estoque_atual" class="form-label">Estoque Atual</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        class="form-control"
                                        id="estoque_atual"
                                        value="${isEdit ? Number(produto.estoque_atual || 0) : 0}"
                                    >
                                </div>

                                <div class="col-md-6 mb-3">
                                    <label for="estoque_minimo" class="form-label">Estoque Mínimo</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        class="form-control"
                                        id="estoque_minimo"
                                        value="${isEdit ? Number(produto.estoque_minimo || 0) : 0}"
                                    >
                                </div>

                                <div class="col-md-12 mb-3 position-relative">
                                    <label for="fornecedor" class="form-label">Fornecedor</label>
                                    <input
                                        type="text"
                                        class="form-control"
                                        id="fornecedor"
                                        autocomplete="off"
                                        value="${isEdit ? escapeHtml(produto.fornecedor || '') : ''}"
                                    >
                                    <div
                                        id="fornecedor-autocomplete"
                                        class="list-group position-absolute w-100"
                                        style="z-index: 9999; display: none;"
                                    ></div>
                                </div>

                                <div class="col-12">
                                    <div class="row g-3 border rounded p-3 mb-2 bg-light">
                                        <div class="col-md-12">
                                            <div class="form-check">
                                                <input
                                                    class="form-check-input"
                                                    type="checkbox"
                                                    id="controlar_validade"
                                                    ${isEdit && Number(produto.controlar_validade || 0) === 1 ? 'checked' : ''}
                                                >
                                                <label class="form-check-label" for="controlar_validade">
                                                    Controlar validade deste produto
                                                </label>
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <label for="data_validade" class="form-label">Data de validade</label>
                                            <input
                                                type="date"
                                                id="data_validade"
                                                class="form-control"
                                                value="${isEdit ? (produto.data_validade || '') : ''}"
                                            >
                                        </div>
                                        <div class="col-md-4">
                                            <label for="lote" class="form-label">Lote</label>
                                            <input
                                                type="text"
                                                id="lote"
                                                class="form-control"
                                                placeholder="Ex: LOTE001"
                                                value="${isEdit ? escapeHtml(produto.lote || '') : ''}"
                                            >
                                        </div>
                                        <div class="col-md-4">
                                            <label for="dias_alerta_validade" class="form-label">Alertar com quantos dias?</label>
                                            <input
                                                type="number"
                                                id="dias_alerta_validade"
                                                class="form-control"
                                                value="${isEdit ? Number(produto.dias_alerta_validade || 30) : 30}"
                                                min="1"
                                            >
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="card mt-3">
                                <div class="card-header p-2">
                                    <button class="btn btn-link text-decoration-none" type="button" data-bs-toggle="collapse" data-bs-target="#dadosFiscaisSection" aria-expanded="true" aria-controls="dadosFiscaisSection">
                                        Dados Fiscais
                                    </button>
                                </div>
                                <div id="dadosFiscaisSection" class="collapse show">
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-3 mb-3">
                                                <label for="ncm" class="form-label">NCM</label>
                                                <input type="text" class="form-control" id="ncm" value="${isEdit ? escapeHtml(produto.ncm || '') : ''}">
                                            </div>
                                            <div class="col-md-3 mb-3">
                                                <label for="cfop" class="form-label">CFOP</label>
                                                <input type="text" class="form-control" id="cfop" value="${isEdit ? escapeHtml(produto.cfop || '') : ''}">
                                            </div>
                                            <div class="col-md-3 mb-3">
                                                <label for="csosn" class="form-label">CSOSN</label>
                                                <input type="text" class="form-control" id="csosn" value="${isEdit ? escapeHtml(produto.csosn || '') : ''}">
                                            </div>
                                            <div class="col-md-3 mb-3">
                                                <label for="origem" class="form-label">Origem</label>
                                                <input type="number" class="form-control" id="origem" value="${isEdit ? Number(produto.origem || 0) : 0}">
                                            </div>

                                            <div class="col-md-4 mb-3">
                                                <label for="cest" class="form-label">CEST</label>
                                                <input type="text" class="form-control" id="cest" value="${isEdit ? escapeHtml(produto.cest || '') : ''}">
                                            </div>
                                            <div class="col-md-4 mb-3">
                                                <label for="codigo_barras" class="form-label">Código de barras</label>
                                                <input type="text" class="form-control" id="codigo_barras" value="${isEdit ? escapeHtml(produto.codigo_barras || '') : ''}">
                                            </div>
                                            <div class="col-md-4 mb-3">
                                                <label for="aliquota_icms" class="form-label">Alíquota ICMS</label>
                                                <input type="number" step="0.01" class="form-control" id="aliquota_icms" value="${isEdit ? Number(produto.aliquota_icms || 0) : 0}">
                                            </div>
                                            <div class="col-md-4 mb-3">
                                                <label for="aliquota_pis" class="form-label">Alíquota PIS</label>
                                                <input type="number" step="0.01" class="form-control" id="aliquota_pis" value="${isEdit ? Number(produto.aliquota_pis || 0) : 0}">
                                            </div>
                                            <div class="col-md-4 mb-3">
                                                <label for="aliquota_cofins" class="form-label">Alíquota COFINS</label>
                                                <input type="number" step="0.01" class="form-control" id="aliquota_cofins" value="${isEdit ? Number(produto.aliquota_cofins || 0) : 0}">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>

                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" onclick="saveProduto()">Salvar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('#modal-container').html(modalHtml);

    $('#produtoModal').modal('show');
    // Remove botão flutuante se existir ao restaurar
    $('#btn-restaurar-produtoModal').remove();

    inicializarCategoriasESubcategorias(produto, isEdit);
    inicializarAutocompleteFornecedor();
    inicializarCalculoPreco(produto, isEdit);

    if (isEdit && produto) {
        $('#data_validade').val(produto.data_validade || '');
        $('#lote').val(produto.lote || '');
        $('#dias_alerta_validade').val(produto.dias_alerta_validade || 30);
        $('#controlar_validade').prop('checked', produto.controlar_validade == 1);
    } else {
        $('#data_validade').val('');
        $('#lote').val('');
        $('#dias_alerta_validade').val(30);
        $('#controlar_validade').prop('checked', false);
    }

    // ...
}


// Inicializa categorias e subcategorias
function inicializarCategoriasESubcategorias(produto, isEdit) {
    if (!(window.categoriasAPI && window.subcategoriasAPI)) {
        $('#categoria_id').html('<option value="">Categorias indisponíveis</option>');
        $('#subcategoria_id').html('<option value="">Subcategorias indisponíveis</option>');
        return;
    }

    function renderCategorias(categoriasComSubs) {
        window.categoriasSistema = categoriasComSubs;
        let catOptions = '<option value="">Selecione</option>';
        categoriasComSubs.forEach(cat => {
            catOptions += `<option value="${cat.id}">${escapeHtml(cat.nome || '')}</option>`;
        });
        $('#categoria_id').html(catOptions);
        if (isEdit && produto && produto.categoria_id) {
            $('#categoria_id').val(String(produto.categoria_id));
        }

        function carregarSubs(catId, selectedSubId) {
            if (!catId) {
                $('#subcategoria_id').html('<option value="">Selecione uma categoria</option>');
                return;
            }
            const cat = categoriasComSubs.find(c => String(c.id) === String(catId));
            let subOptions = '<option value="">Nenhuma</option>';
            (cat && cat.subcategorias ? cat.subcategorias : []).forEach(sub => {
                subOptions += `<option value="${sub.id}">${escapeHtml(sub.nome || '')}</option>`;
            });
            $('#subcategoria_id').html(subOptions);
            if (typeof selectedSubId !== 'undefined' && selectedSubId !== null) {
                $('#subcategoria_id').val(String(selectedSubId));
            }
        }

        $('#categoria_id').off('change').on('change', function () {
            carregarSubs($(this).val());
        });

        if (isEdit && produto && typeof produto.categoria_id !== 'undefined' && produto.categoria_id !== null) {
            let subId = '';
            if (typeof produto.subcategoria_id !== 'undefined' && produto.subcategoria_id !== null && produto.subcategoria_id !== 'null') {
                subId = String(produto.subcategoria_id);
            }
            carregarSubs(produto.categoria_id, subId);
        } else {
            $('#subcategoria_id').html('<option value="">Selecione uma categoria</option>');
        }
    }

    // Renderiza rapidamente com cache local (quando houver) e em seguida
    // sempre sincroniza da API para refletir novas subcategorias sem recarregar a página.
    if (window.categoriasSistema && Array.isArray(window.categoriasSistema) && window.categoriasSistema.length > 0) {
        renderCategorias(window.categoriasSistema);
    }

    const possuiCacheCategorias = window.categoriasSistema && Array.isArray(window.categoriasSistema) && window.categoriasSistema.length > 0;

    $.when(categoriasAPI.listar('produto'), subcategoriasAPI.listar()).done(function (categorias, subcategorias) {
        categorias = categorias[0] || [];
        subcategorias = subcategorias[0] || [];

        const categoriasComSubs = (categorias || []).map(cat => ({
            ...cat,
            subcategorias: (subcategorias || []).filter(sub => String(sub.categoria_id) === String(cat.id))
        }));

        renderCategorias(categoriasComSubs);
    }).fail(function () {
        if (possuiCacheCategorias) {
            return;
        }
        $('#categoria_id').html('<option value="">Erro ao carregar categorias</option>');
        $('#subcategoria_id').html('<option value="">Erro ao carregar subcategorias</option>');
    });
}


// Inicializa autocomplete de fornecedor
function inicializarAutocompleteFornecedor() {
    $('#fornecedor').off('input').on('input', function () {
        const termo = ($(this).val() || '').trim();
        const termoNumerico = termo.replace(/\D/g, '');
        const $lista = $('#fornecedor-autocomplete');

        if (termo.length < 2) {
            $lista.hide().html('');
            return;
        }

        $.ajax({
            url: `${API_URL}/fornecedores?busca=${encodeURIComponent(termo)}`,
            method: 'GET',
            headers: {
                Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
            },
            success: function (fornecedores) {
                const termoLower = termo.toLowerCase();
                const filtrados = (fornecedores || []).filter(f => {
                    if (!f) return false;

                    const nome = String(f.nome || '').toLowerCase();
                    const razao = String(f.razao_social || '').toLowerCase();
                    const cpfCnpj = String(f.cpf_cnpj || '');
                    const cpfCnpjNumerico = cpfCnpj.replace(/\D/g, '');

                    const correspondeTexto = nome.includes(termoLower) || razao.includes(termoLower) || cpfCnpj.toLowerCase().includes(termoLower);
                    const correspondeCnpjNumerico = termoNumerico.length > 0 && cpfCnpjNumerico.includes(termoNumerico);

                    return correspondeTexto || correspondeCnpjNumerico;
                });

                if (filtrados.length === 0) {
                    $lista.hide().html('');
                    return;
                }

                let html = '';
                filtrados.forEach(f => {
                    const label = f.cpf_cnpj
                        ? `${escapeHtml(f.nome || '')} - CNPJ: ${escapeHtml(f.cpf_cnpj)}`
                        : `${escapeHtml(f.nome || '')}`;
                    html += `
                        <button
                            type="button"
                            class="list-group-item list-group-item-action fornecedor-item"
                            data-nome="${escapeHtml(f.nome)}"
                        >
                            ${label}
                        </button>
                    `;
                });

                $lista.html(html).show();

                $('.fornecedor-item').off('click').on('click', function () {
                    $('#fornecedor').val($(this).text().trim());
                    $lista.hide().html('');
                });
            },
            error: function () {
                $lista.hide().html('');
            }
        });
    });

    $('#fornecedor').off('blur').on('blur', function () {
        setTimeout(() => {
            $('#fornecedor-autocomplete').hide().html('');
        }, 200);
    });
}


// Inicializa cálculo automático do preço de venda
function inicializarCalculoPreco(produto, isEdit) {
    let atualizando = false;

    function numero(valor) {
        return parseFloat(String(valor || '0').replace(',', '.')) || 0;
    }

    function produtoPorPesoAtivo() {
        return $('#vendido_por_peso').is(':checked');
    }

    function atualizarAreaPeso() {
        const ativo = produtoPorPesoAtivo();

        $('#areaProdutoPeso').toggle(ativo);

        if (ativo) {
            $('#unidade').val('kg');
            calcularCustoPorKg();
        }
    }

    function calcularCustoPorKg() {
        if (!produtoPorPesoAtivo()) return;

        const pesoTotal = numero($('#peso_total_compra').val());
        const valorTotal = numero($('#valor_total_compra').val());

        if (pesoTotal > 0 && valorTotal > 0) {
            const custoKg = valorTotal / pesoTotal;

            $('#custo_por_kg').val(custoKg.toFixed(2));
            $('#preco_compra').val(custoKg.toFixed(2));

            calcularPrecoVendaPorLucro();
        }
    }

    function calcularPrecoVendaPorLucro() {
        if (atualizando) return;
        atualizando = true;

        const precoCompra = numero($('#preco_compra').val());
        const lucro = numero($('#lucro_percentual').val());

        if (precoCompra > 0) {
            const precoVenda = precoCompra + (precoCompra * lucro / 100);
            $('#preco_venda').val(precoVenda.toFixed(2));
        }

        atualizando = false;
    }

    function calcularLucroPorPrecoVenda() {
        if (atualizando) return;
        atualizando = true;

        const precoCompra = numero($('#preco_compra').val());
        const precoVenda = numero($('#preco_venda').val());

        if (precoCompra > 0 && precoVenda > 0) {
            const lucro = ((precoVenda - precoCompra) / precoCompra) * 100;
            $('#lucro_percentual').val(lucro.toFixed(2));
        }

        atualizando = false;
    }

    $('#vendido_por_peso').off('change').on('change', atualizarAreaPeso);

    $('#peso_total_compra, #valor_total_compra')
        .off('input')
        .on('input', calcularCustoPorKg);

    $('#preco_compra')
        .off('input')
        .on('input', function () {
            if (produtoPorPesoAtivo()) {
                $('#custo_por_kg').val(numero($('#preco_compra').val()).toFixed(2));
            }

            if ($('#lucro_percentual').val() !== '') {
                calcularPrecoVendaPorLucro();
            } else {
                calcularLucroPorPrecoVenda();
            }
        });

    $('#lucro_percentual')
        .off('input')
        .on('input', calcularPrecoVendaPorLucro);

    $('#preco_venda')
        .off('input')
        .on('input', calcularLucroPorPrecoVenda);

    atualizarAreaPeso();

    if (isEdit && produto) {
        setTimeout(() => {
            if ($('#lucro_percentual').val() !== '') {
                calcularPrecoVendaPorLucro();
            } else {
                calcularLucroPorPrecoVenda();
            }
        }, 100);
    }
}


// Salva produto
function saveProduto() {
    const id = $('#produtoId').val();

    const data = {
        codigo: ($('#codigo').val() || '').trim(),
        nome: ($('#nome').val() || '').trim(),
        categoria_id: $('#categoria_id').val() ? String($('#categoria_id').val()) : null,
        subcategoria_id: $('#subcategoria_id').val() ? String($('#subcategoria_id').val()) : null,
        unidade: ($('#unidade').val() || '').trim(),
        preco_compra: parseFloat($('#preco_compra').val()) || 0,
        preco_venda: parseFloat($('#preco_venda').val()) || 0,
        lucro_percentual: $('#lucro_percentual').val() !== '' ? parseFloat($('#lucro_percentual').val()) : null,
        estoque_atual: parseFloat($('#estoque_atual').val()) || 0,
        estoque_minimo: parseFloat($('#estoque_minimo').val()) || 0,
        fornecedor: ($('#fornecedor').val() || '').trim(),
        data_validade: ($('#data_validade').val() || '').trim() || null,
        lote: ($('#lote').val() || '').trim(),
        dias_alerta_validade: parseInt($('#dias_alerta_validade').val(), 10) || 30,
        controlar_validade: $('#controlar_validade').is(':checked') ? 1 : 0,
        ncm: ($('#ncm').val() || '').trim(),
        cfop: ($('#cfop').val() || '').trim(),
        csosn: ($('#csosn').val() || '').trim(),
        origem: $('#origem').val() !== '' ? parseInt($('#origem').val(), 10) : 0,
        cest: ($('#cest').val() || '').trim(),
        codigo_barras: ($('#codigo_barras').val() || '').trim(),
        aliquota_icms: parseFloat($('#aliquota_icms').val()) || 0,
        aliquota_pis: parseFloat($('#aliquota_pis').val()) || 0,
        aliquota_cofins: parseFloat($('#aliquota_cofins').val()) || 0,
        vendido_por_peso: $('#vendido_por_peso').is(':checked') ? 1 : 0,
        peso_total_compra: parseFloat($('#peso_total_compra').val()) || 0,
        valor_total_compra: parseFloat($('#valor_total_compra').val()) || 0,
        custo_por_kg: parseFloat($('#custo_por_kg').val()) || 0
    };

    if (data.controlar_validade === 1 && !data.data_validade) {
        showNotification('Informe a data de validade do produto ou desative o controle de validade.', 'warning');
        $('#data_validade').focus();
        return;
    }

    if (!data.nome) {
        showNotification('Informe o nome do produto.', 'warning');
        $('#nome').focus();
        return;
    }

    if (data.preco_venda <= 0) {
        showNotification('Informe um preço de venda válido.', 'warning');
        $('#preco_venda').focus();
        return;
    }

    if (data.preco_compra < 0) {
        showNotification('Preço de compra inválido.', 'warning');
        $('#preco_compra').focus();
        return;
    }

    if (data.vendido_por_peso === 1) {
        if (data.peso_total_compra <= 0) {
            showNotification('Informe o peso total comprado em KG.', 'warning');
            $('#peso_total_compra').focus();
            return;
        }

        if (data.valor_total_compra <= 0) {
            showNotification('Informe o valor total da compra.', 'warning');
            $('#valor_total_compra').focus();
            return;
        }

        if (data.custo_por_kg <= 0) {
            showNotification('Custo por KG inválido.', 'warning');
            $('#custo_por_kg').focus();
            return;
        }
    }

    if (data.estoque_atual < 0) {
        showNotification('Estoque atual inválido.', 'warning');
        $('#estoque_atual').focus();
        return;
    }

    if (data.estoque_minimo < 0) {
        showNotification('Estoque mínimo inválido.', 'warning');
        $('#estoque_minimo').focus();
        return;
    }

    const url = id ? `${API_URL}/produtos/${id}` : `${API_URL}/produtos`;
    const method = id ? 'PUT' : 'POST';

    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        headers: {
            Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
        },
        data: JSON.stringify(data),
        success: function (produtoSalvo) {
            $('#produtoModal').modal('hide');
            showNotification('Produto salvo com sucesso!', 'success');
            // Atualiza lista local se necessário
            if (window.produtosList && Array.isArray(window.produtosList)) {
                const produtoNormalizado = normalizarProduto(produtoSalvo, window.categoriasSistema || []);
                const indexExistente = window.produtosList.findIndex(p => String(p.id) === String(produtoNormalizado.id));

                if (indexExistente >= 0) {
                    window.produtosList[indexExistente] = produtoNormalizado;
                } else {
                    window.produtosList.unshift(produtoNormalizado);
                }

                if (typeof renderProdutos === 'function') {
                    renderProdutos(window.produtosList);
                }
            } else {
                loadProdutos();
            }
        },
        error: function (xhr) {
            const erro = xhr.responseJSON?.error || 'Erro desconhecido';
            showNotification('Erro ao salvar produto: ' + erro, 'danger');
        }
    });
}
window.saveProduto = saveProduto;


// Histórico de preços
function showHistoricoPrecos(produtoId) {
    $.ajax({
        url: `${API_URL}/produtos/${produtoId}/historico-precos`,
        method: 'GET',
        success: function (rows) {
            const modalHtml = `
                <div class="modal fade" id="historicoPrecosModal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Histórico de preços</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="table-responsive">
                                    <table class="table table-sm table-striped">
                                        <thead>
                                            <tr>
                                                <th>Data</th>
                                                <th>P. compra (de →)</th>
                                                <th>P. venda (de →)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${(rows && rows.length)
                                                ? rows.map(r => `
                                                    <tr>
                                                        <td>${formatDateTime(r.created_at)}</td>
                                                        <td>${formatCurrency(r.preco_compra_anterior || 0)} → ${formatCurrency(r.preco_compra_novo || 0)}</td>
                                                        <td>${formatCurrency(r.preco_venda_anterior || 0)} → ${formatCurrency(r.preco_venda_novo || 0)}</td>
                                                    </tr>
                                                `).join('')
                                                : '<tr><td colspan="3" class="text-center">Nenhuma alteração de preço registrada ainda.</td></tr>'
                                            }
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            $('#modal-container').html(modalHtml);
            $('#historicoPrecosModal').modal('show');
        },
        error: function () {
            showNotification('Erro ao carregar histórico de preços.', 'danger');
        }
    });
}
window.showHistoricoPrecos = showHistoricoPrecos;


// Excluir produto
function deleteProduto(id) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) {
        return;
    }

    $.ajax({
        url: `${API_URL}/produtos/${id}`,
        method: 'DELETE',
        headers: {
            Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
        },
        success: function () {
            showNotification('Produto excluído com sucesso!', 'success');
            loadProdutos();
        },
        error: function (xhr) {
            const erro = xhr.responseJSON?.error || 'Erro desconhecido';
            showNotification('Erro ao excluir produto: ' + erro, 'danger');
        }
    });
}
window.deleteProduto = deleteProduto;


// Editar produto
function editProduto(id) {
    $.ajax({
        url: `${API_URL}/produtos/${id}`,
        method: 'GET',
        headers: {
            Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
        },
        success: function (produto) {
            showProdutoModal(produto);
        },
        error: function () {
            showNotification('Erro ao carregar produto para edição.', 'danger');
        }
    });
}
window.editProduto = editProduto;


// Visualizar produto
function viewProduto(id) {
    $.ajax({
        url: `${API_URL}/produtos/${id}`,
        method: 'GET',
        headers: {
            Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
        },
        success: function (produto) {
            const produtoNormalizado = normalizarProduto(produto, window.categoriasSistema || []);
            const modalHtml = `
                <div class="modal fade" id="viewProdutoModal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header d-flex align-items-center justify-content-between">
                                <h5 class="modal-title">Detalhes do Produto</h5>
                                <div class="d-flex gap-2">
                                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="minimizarModal('viewProdutoModal')" title="Minimizar">
                                        <i class="fas fa-window-minimize"></i>
                                    </button>
                                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                </div>
                            </div>
                            <div class="modal-body">
                                <p><strong>Nome:</strong> ${escapeHtml(produtoNormalizado.nome || '-')}</p>
                                <p><strong>Código:</strong> ${escapeHtml(produtoNormalizado.codigo || '-')}</p>
                                <p><strong>Categoria:</strong> ${escapeHtml(produtoNormalizado.categoria || '-')}</p>
                                <p><strong>Subcategoria:</strong> ${escapeHtml(produtoNormalizado.subcategoria || '-')}</p>
                                <p><strong>Unidade:</strong> ${escapeHtml(produtoNormalizado.unidade || '-')}</p>
                                <p><strong>Preço de Compra:</strong> ${formatCurrency(produtoNormalizado.preco_compra || 0)}</p>
                                <p><strong>Preço de Venda:</strong> ${formatCurrency(produtoNormalizado.preco_venda || 0)}</p>
                                <p><strong>Estoque Atual:</strong> ${formatarEstoqueProduto(produtoNormalizado.estoque_atual, produtoNormalizado.unidade)}</p>
                                <p><strong>Estoque Mínimo:</strong> ${Number(produtoNormalizado.estoque_minimo || 0)}</p>
                                <p><strong>Fornecedor:</strong> ${escapeHtml(produtoNormalizado.fornecedor || '-')}</p>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            $('#modal-container').html(modalHtml);
            $('#viewProdutoModal').modal('show');
        },
        error: function () {
            showNotification('Erro ao carregar detalhes do produto.', 'danger');
        }
    });
}
window.viewProduto = viewProduto;


// Escape HTML
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatarEstoqueProduto(valor, unidade = '') {
    const numero = Number(valor || 0);
    const unidadeNormalizada = String(unidade || '').toUpperCase();

    if (unidadeNormalizada === 'KG') {
        return `${numero.toFixed(3)} kg`;
    }

    return `${numero.toFixed(0)} ${unidade || 'UN'}`;
}

function montarTabelaEstoqueResumo(lista, classeLinha) {
  if (!lista.length) return '';

  return `
    <table class="table table-sm table-hover mb-0">
      <thead>
        <tr>
          <th>Produto</th>
          <th>Código</th>
          <th class="text-end">Estoque</th>
          <th class="text-end">Mínimo</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map((p) => `
          <tr class="${classeLinha}">
            <td class="fw-semibold">${escapeHtml(p.nome || '')}</td>
            <td>${escapeHtml(p.codigo || '-')}</td>
            <td class="text-end fw-bold">${formatarEstoqueProduto(p.estoque_atual, p.unidade)}</td>
            <td class="text-end">${formatarEstoqueProduto(p.estoque_minimo, p.unidade)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function montarListaEstoqueBaixoProdutos(criticos, proximos) {
  const listaCriticos = Array.isArray(criticos) ? criticos : [];
  const listaProximos = Array.isArray(proximos) ? proximos : [];

  if (!listaCriticos.length && !listaProximos.length) {
    return '<div class="text-muted">Nenhum alerta de estoque no momento.</div>';
  }

  let html = '<div class="table-responsive">';

  if (listaCriticos.length) {
    html += `
      <p class="small text-danger fw-semibold mb-1">Estoque no mínimo ou abaixo (${listaCriticos.length})</p>
      ${montarTabelaEstoqueResumo(listaCriticos, 'table-danger')}
    `;
  }

  if (listaProximos.length) {
    html += `
      <p class="small text-warning-emphasis fw-semibold mb-1 mt-3">Próximo do mínimo (${listaProximos.length})</p>
      ${montarTabelaEstoqueResumo(listaProximos, 'table-warning')}
    `;
  }

  html += '</div>';
  return html;
}

function separarProdutosPorEstoque(produtos) {
  const criticos = [];
  const proximos = [];

  (produtos || []).forEach((p) => {
    const tipo = classificarEstoqueProduto(p);
    if (tipo === 'estoque_baixo') criticos.push(p);
    else if (tipo === 'proximo_minimo') proximos.push(p);
  });

  return { criticos, proximos };
}

async function carregarEstoqueBaixoProdutos() {
  const container = document.getElementById('listaEstoqueBaixoProdutos');
  if (!container) return;

  container.innerHTML = '<div class="text-muted">Carregando...</div>';

  const cache = window.produtosCache || window.produtosList || [];
  if (cache.length) {
    const { criticos, proximos } = separarProdutosPorEstoque(cache);
    container.innerHTML = montarListaEstoqueBaixoProdutos(criticos, proximos);
    return;
  }

  try {
    const response = await fetch(`${API_URL}/produtos/estoque/baixo`, {
      headers: {
        Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
      }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao carregar estoque baixo.');
    }

    container.innerHTML = montarListaEstoqueBaixoProdutos(data, []);
  } catch (error) {
    console.error('Erro estoque baixo:', error);
    container.innerHTML = '<div class="text-danger">Erro ao carregar alertas de estoque.</div>';
  }
}

function inicializarCardEstoqueBaixo() {
  carregarEstoqueBaixoProdutos();
}

window.carregarEstoqueBaixoProdutos = carregarEstoqueBaixoProdutos;

function inicializarModalVencimentosProdutos() {
    if ($('#modalVencimentosProdutos').length) return;

    $('body').append(`
        <div class="modal fade" id="modalVencimentosProdutos" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Produtos vencidos ou próximos do vencimento</h5>
                        <button type="button" class="btn-close" onclick="fecharModalVencimentosProdutos()" aria-label="Fechar"></button>
                    </div>
                    <div class="modal-body">
                        <table class="table table-striped table-hover">
                            <thead>
                                <tr>
                                    <th>Produto</th>
                                    <th>Estoque</th>
                                    <th>Lote</th>
                                    <th>Validade</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="listaVencimentosProdutos">
                                <tr>
                                    <td colspan="5">Carregando...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `);
}

async function carregarVencimentosProdutos() {
    try {
        const response = await fetch(`${API_URL}/produtos/vencimentos/alertas?dias=30`, {
            headers: {
                Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
            }
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erro ao carregar vencimentos');
        }

        $('#qtdProdutosVencidos').text(data.vencidos || 0);
        $('#qtdProdutosProximos').text(data.proximos || 0);

        renderizarListaVencimentosProdutos(data.produtos || []);
    } catch (error) {
        console.error('Erro ao carregar vencimentos:', error);
        $('#qtdProdutosVencidos').text('0');
        $('#qtdProdutosProximos').text('0');
    }
}

function renderizarListaVencimentosProdutos(produtos) {
    const tbody = $('#listaVencimentosProdutos');

    if (!tbody.length) return;

    if (!produtos.length) {
        tbody.html(`
            <tr>
                <td colspan="5" class="text-center text-muted">
                    Nenhum produto vencido ou próximo do vencimento.
                </td>
            </tr>
        `);
        return;
    }

    tbody.html(produtos.map((produto) => {
        const vencido = produto.status_validade === 'vencido';
        const statusTexto = vencido
            ? 'Vencido'
            : `Vence em ${produto.dias_para_vencer} dia(s)`;

        const linhaClasse = vencido ? 'table-danger' : 'table-warning';
        const badgeClasse = vencido ? 'bg-danger' : 'bg-warning text-dark';

        const validadeFormatada = produto.data_validade
            ? new Date(produto.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')
            : '-';

        return `
            <tr class="${linhaClasse}">
                <td class="fw-semibold">${escapeHtml(produto.nome || '-')}</td>
                <td>${produto.estoque_atual || 0}</td>
                <td>${escapeHtml(produto.lote || '-')}</td>
                <td>${validadeFormatada}</td>
                <td>
                    <span class="badge ${badgeClasse}">
                        ${statusTexto}
                    </span>
                </td>
            </tr>
        `;
    }).join(''));
}

function abrirModalVencimentosProdutos() {
    carregarVencimentosProdutos();
    const el = document.getElementById('modalVencimentosProdutos');
    if (el) {
        bootstrap.Modal.getOrCreateInstance(el).show();
    }
}

function fecharModalVencimentosProdutos() {
    const el = document.getElementById('modalVencimentosProdutos');
    if (el) {
        bootstrap.Modal.getInstance(el)?.hide();
    }
}

window.carregarVencimentosProdutos = carregarVencimentosProdutos;
window.abrirModalVencimentosProdutos = abrirModalVencimentosProdutos;
window.fecharModalVencimentosProdutos = fecharModalVencimentosProdutos;
