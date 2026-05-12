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

function showRelatorioEstoqueProdutos() {
    carregarRelatorioEstoqueProdutos(false);
}

function toggleRelatorioProdutosMostrarTodos() {
    const exibirTodosAtual = $('#relatorio-estoque-modal').data('exibir-todos') === true || $('#relatorio-estoque-modal').data('exibir-todos') === 'true';
    const inicio = $('#relatorio-data-inicio').val() || '';
    const fim = $('#relatorio-data-fim').val() || '';
    carregarRelatorioEstoqueProdutos(!exibirTodosAtual, inicio, fim);
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

function carregarRelatorioEstoqueProdutos(exibirTodos = false, filtroInicio = '', filtroFim = '') {
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
            renderRelatorioEstoqueProdutos(produtos || [], exibirTodos, filtroInicio, filtroFim);
        },
        error: function(xhr) {
            const erro = xhr.responseJSON?.error || 'Erro ao carregar relatório de estoque.';
            showNotification(erro, 'danger');
        }
    });
}

function renderRelatorioEstoqueProdutos(produtos, exibirTodos = false, filtroInicio = '', filtroFim = '') {
    produtos = Array.isArray(produtos) ? produtos : [];
    const inicio = parseRelatorioData(filtroInicio);
    const fim = parseRelatorioData(filtroFim);

    let produtosFiltrados = produtos;

    if (inicio || fim) {
        produtosFiltrados = produtos.filter(p => isRelatorioDataDentroDoIntervalo(p.ultima_compra_data, inicio, fim));
    }

    const itensEstoqueMinimo = produtosFiltrados.filter(p => {
        const atual = Number(p.estoque_atual || 0);
        const minimo = Number(p.estoque_minimo || 0);
        return minimo > 0 && atual <= minimo;
    });

    const itensProximosDoMinimo = produtosFiltrados.filter(p => {
        const atual = Number(p.estoque_atual || 0);
        const minimo = Number(p.estoque_minimo || 0);
        return minimo > 0 && atual > minimo && atual <= Math.ceil(minimo * 1.2);
    });

    const produtosExibidos = exibirTodos
        ? produtosFiltrados
        : [...itensEstoqueMinimo, ...itensProximosDoMinimo];

    const valorTotalFiscal = produtosFiltrados.reduce((sum, p) => {
        return sum + (Number(p.estoque_atual || 0) * Number(p.preco_compra || 0));
    }, 0);

    const tituloModo = exibirTodos
        ? 'Todos os produtos'
        : 'Estoque mínimo e próximos do mínimo';

    const filtroLegenda = exibirTodos
        ? `Mostrando todos os produtos (${produtosFiltrados.length}).`
        : `Estoque baixo: ${itensEstoqueMinimo.length}, Próximo do mínimo: ${itensProximosDoMinimo.length}.`;

    const filtroDatasTexto = (inicio || fim)
        ? `Filtro aplicado pela data da última compra: ${filtroInicio || 'início não informado'} até ${filtroFim || 'fim não informado'}.`
        : 'Nenhum filtro de data aplicado.';

    const modalHtml = `
        <div class="modal fade" id="relatorio-estoque-modal" tabindex="-1" data-exibir-todos="${exibirTodos}">
            <div class="modal-dialog modal-xl modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Relatório de Estoque</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row g-3 mb-3 no-print">
                            <div class="col-md-3">
                                <label class="form-label">Data início</label>
                                <input type="date" id="relatorio-data-inicio" class="form-control" value="${filtroInicio || ''}">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Data fim</label>
                                <input type="date" id="relatorio-data-fim" class="form-control" value="${filtroFim || ''}">
                            </div>
                            <div class="col-md-6 d-flex align-items-end gap-2">
                                <button type="button" class="btn btn-primary" onclick="carregarRelatorioEstoqueProdutos(${exibirTodos}, $('#relatorio-data-inicio').val(), $('#relatorio-data-fim').val())">
                                    Aplicar filtro
                                </button>
                                <button type="button" class="btn btn-outline-secondary" onclick="carregarRelatorioEstoqueProdutos(${exibirTodos})">
                                    Limpar filtro
                                </button>
                                <button type="button" class="btn btn-success" onclick="printRelatorioEstoqueProdutos()">
                                    Imprimir relatório
                                </button>
                            </div>
                        </div>

                        <div class="mb-3">
                            <strong>${tituloModo}</strong>
                            <div class="text-muted">${filtroLegenda}</div>
                            <div class="text-muted">${filtroDatasTexto}</div>
                            <div class="text-muted">Valor fiscal total do estoque: ${formatCurrency(valorTotalFiscal)}</div>
                        </div>

                        <div class="table-responsive">
                            <table class="table table-striped table-hover">
                                <thead>
                                    <tr>
                                        <th>Produto</th>
                                        <th>Categoria</th>
                                        <th>Estoque</th>
                                        <th>Mínimo</th>
                                        <th>Última compra</th>
                                        <th>Total em estoque</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${produtosExibidos.length === 0 ? `
                                        <tr>
                                            <td colspan="7" class="text-center">
                                                Nenhum produto ${exibirTodos ? 'cadastrado' : 'com estoque baixo ou próximo do mínimo'}.
                                            </td>
                                        </tr>
                                    ` : produtosExibidos.map(p => {
                                        const estoqueAtual = Number(p.estoque_atual || 0);
                                        const estoqueMinimo = Number(p.estoque_minimo || 0);
                                        const precoCompra = Number(p.preco_compra || 0);
                                        const totalItem = estoqueAtual * precoCompra;

                                        const status = estoqueAtual <= estoqueMinimo
                                            ? 'Baixo'
                                            : estoqueAtual <= Math.ceil(estoqueMinimo * 1.2)
                                                ? 'Próximo do mínimo'
                                                : 'OK';

                                        const badgeClass = estoqueAtual <= estoqueMinimo
                                            ? 'badge bg-danger'
                                            : estoqueAtual <= Math.ceil(estoqueMinimo * 1.2)
                                                ? 'badge bg-warning text-dark'
                                                : 'badge bg-secondary';

                                        return `
                                            <tr>
                                                <td>${escapeHtml(p.nome || '-')}</td>
                                                <td>${escapeHtml(p.categoria || '-')}</td>
                                                <td>${estoqueAtual}</td>
                                                <td>${estoqueMinimo}</td>
                                                <td>${formatarUltimaCompraRelatorio(p.ultima_compra_data)}</td>
                                                <td>${formatCurrency(totalItem)}</td>
                                                <td><span class="${badgeClass}">${status}</span></td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="modal-footer no-print">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        <button type="button" class="btn btn-primary" onclick="toggleRelatorioProdutosMostrarTodos()">
                            ${exibirTodos ? 'Mostrar apenas estoque crítico' : 'Mostrar todos produtos'}
                        </button>
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
}

function renderProdutoRow(p) {
    return `
        <tr>
            <td>${escapeHtml(p.nome || '')}</td>
            <td>${escapeHtml(p.codigo || '')}</td>
            <td>${escapeHtml(p.categoria || p.categoria_nome || '')}</td>
            <td>${escapeHtml(p.unidade || '')}</td>
            <td>${formatCurrency(p.preco_compra || 0)}</td>
            <td>${formatCurrency(p.preco_venda || 0)}</td>
            <td>${formatarEstoqueProduto(p.estoque_atual, p.unidade)}</td>
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
    const produtosBase = window.produtosCache || [];

    if (!produtosBase.length) {
        showNotification('Nenhum produto encontrado para gerar relatório.', 'warning');
        return;
    }

    const escolha = confirm(
        'Deseja listar TODOS os produtos?\n\nOK = Todos os produtos\nCancelar = Apenas estoque baixo e próximo do mínimo'
    );

    const produtosRelatorio = escolha
        ? produtosBase
        : produtosBase.filter(p => {
            const estoque = Number(p.estoque_atual || 0);
            const minimo = Number(p.estoque_minimo || 0);

            if (minimo <= 0) return false;

            return estoque <= minimo || estoque <= minimo + 3;
        });

    if (!produtosRelatorio.length) {
        showNotification('Nenhum produto com estoque baixo ou próximo do mínimo.', 'success');
        return;
    }

    const linhas = produtosRelatorio.map(p => {
        const estoque = Number(p.estoque_atual || 0);
        const minimo = Number(p.estoque_minimo || 0);

        let status = 'OK';

        if (minimo > 0 && estoque <= minimo) {
            status = 'ESTOQUE BAIXO';
        } else if (minimo > 0 && estoque <= minimo + 3) {
            status = 'PRÓXIMO DO MÍNIMO';
        }

        return `
            <tr>
                <td>${escapeHtml(p.nome || '')}</td>
                <td>${escapeHtml(p.codigo || '')}</td>
                <td>${escapeHtml(p.categoria || p.categoria_nome || '')}</td>
                <td>${escapeHtml(p.subcategoria || p.subcategoria_nome || '')}</td>
                <td>${escapeHtml(p.unidade || '')}</td>
                <td>${estoque}</td>
                <td>${minimo}</td>
                <td>${formatCurrency(p.preco_compra || 0)}</td>
                <td>${formatCurrency(p.preco_venda || 0)}</td>
                <td><strong>${status}</strong></td>
            </tr>
        `;
    }).join('');

    const janela = window.open('', '_blank', 'width=1100,height=700');

    janela.document.write(`
        <html>
        <head>
            <title>Relatório de Estoque</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h2 { margin-bottom: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; }
                th { background: #f2f2f2; }
            </style>
        </head>
        <body>
            <h2>Relatório de Estoque</h2>
            <small>Gerado em: ${new Date().toLocaleString('pt-BR')}</small>
            <p>
                <strong>Modo:</strong>
                ${escolha ? 'Todos os produtos' : 'Estoque baixo e próximo do mínimo'}
            </p>

            <table>
                <thead>
                    <tr>
                        <th>Produto</th>
                        <th>Código</th>
                        <th>Categoria</th>
                        <th>Subcategoria</th>
                        <th>Unidade</th>
                        <th>Estoque Atual</th>
                        <th>Estoque Mínimo</th>
                        <th>Preço Compra</th>
                        <th>Preço Venda</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhas}
                </tbody>
            </table>

            <script>
                window.print();
            </script>
        </body>
        </html>
    `);

    janela.document.close();
}

// Renderiza listagem de produtos
function renderProdutos(produtos) {
    window.produtosCache = produtos;
    const html = `
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
                <div class="table-responsive">
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
                            ${renderProdutosAgrupados(produtos)}
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
}

function renderProdutosRows(produtos) {
    if (!produtos || produtos.length === 0) {
        return '<tr><td colspan="8" class="text-center">Nenhum produto cadastrado</td></tr>';
    }

    return produtos.map(p => {
        const estoqueAtual = Number(p.estoque_atual || 0);
        const estoqueMinimo = Number(p.estoque_minimo || 0);
        const estoqueBaixo = estoqueAtual <= estoqueMinimo;

        return `
            <tr class="${estoqueBaixo ? 'table-danger' : ''}">
                <td>${escapeHtml(p.nome || '')}</td>
                <td>${escapeHtml(p.codigo || '-')}</td>
                <td>${escapeHtml(p.categoria || '-')}</td>
                <td>${escapeHtml(p.unidade || '-')}</td>
                <td>${formatCurrency(Number(p.preco_compra || 0))}</td>
                <td>${formatCurrency(Number(p.preco_venda || 0))}</td>
                <td>
                    ${estoqueAtual}
                    ${estoqueBaixo ? '<span class="badge bg-danger ms-1">Baixo</span>' : ''}
                </td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="viewProduto(${p.id})" title="Detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="editProduto(${p.id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteProduto(${p.id})" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="showHistoricoPrecos(${p.id})" title="Histórico de preços">
                        <i class="fas fa-history"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
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