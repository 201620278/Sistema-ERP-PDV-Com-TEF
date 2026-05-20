function formatarMoedaDashboard(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function escapeHtmlDashboard(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function labelFormaPagamentoDashboard(forma) {
    const chave = String(forma || '').toLowerCase().trim();
    const mapa = {
        dinheiro: 'Dinheiro',
        pix: 'PIX',
        cartao_credito: 'Cartão crédito',
        credito: 'Cartão crédito',
        cartao_debito: 'Cartão débito',
        debito: 'Cartão débito',
        prazo: 'A prazo',
        misto: 'Pagamento misto',
        nao_informado: 'Não informado'
    };
    return mapa[chave] || (chave ? chave.charAt(0).toUpperCase() + chave.slice(1) : 'Não informado');
}

function setDashboardText(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

function formatarDataBr(iso) {
    if (!iso) return '';
    const partes = String(iso).split('-');
    if (partes.length !== 3) return iso;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function montarListaProdutosDashboard(lista) {
    if (!lista || lista.length === 0) {
        return '<div class="text-muted">Nenhum dado encontrado.</div>';
    }

    return lista.map((item, index) => `
        <div class="d-flex justify-content-between border-bottom py-2">
            <span>${index + 1}. ${escapeHtmlDashboard(item.nome)}</span>
            <strong>${Number(item.quantidade_vendida || 0)}</strong>
        </div>
    `).join('');
}

function montarListaEstoqueBaixo(lista) {
    if (!lista || lista.length === 0) {
        return '<div class="text-muted">Nenhum produto com estoque baixo.</div>';
    }

    return lista.map((item) => `
        <div class="d-flex justify-content-between border-bottom py-2">
            <span>${escapeHtmlDashboard(item.nome)}</span>
            <span class="text-danger">
                <strong>${Number(item.estoque_atual || 0)}</strong>
                <small class="text-muted">/ mín. ${Number(item.estoque_minimo || 0)} ${escapeHtmlDashboard(item.unidade || '')}</small>
            </span>
        </div>
    `).join('');
}

function montarListaFormasPagamento(lista) {
    if (!lista || lista.length === 0) {
        return '<div class="text-muted">Nenhuma venda no período.</div>';
    }

    return lista.map((item) => `
        <div class="d-flex justify-content-between border-bottom py-2">
            <span>${escapeHtmlDashboard(labelFormaPagamentoDashboard(item.forma_pagamento))}</span>
            <span class="text-end">
                <strong>${formatarMoedaDashboard(item.total)}</strong><br>
                <small class="text-muted">${Number(item.quantidade || 0)} venda(s)</small>
            </span>
        </div>
    `).join('');
}

function montarListaValidadeProdutos(lista) {
    if (!Array.isArray(lista) || lista.length === 0) {
        return '<div class="text-muted">Nenhum produto encontrado.</div>';
    }

    return lista.map(item => `
        <div class="d-flex justify-content-between border-bottom py-2">
            <div>
                <strong>${item.nome}</strong><br>
                <small>Estoque: ${item.estoque_atual ?? 0}</small>
            </div>
            <div class="text-end">
                <strong>${item.data_validade || '-'}</strong>
            </div>
        </div>
    `).join('');
}

function preencherDashboard(data) {
    const periodo = data.periodo || {};
    const labelPeriodo = document.getElementById('dashboardPeriodoLabel');
    if (labelPeriodo) {
        labelPeriodo.textContent = `Período: ${formatarDataBr(periodo.inicio)} a ${formatarDataBr(periodo.fim)}`;
    }

    setDashboardText('dashboardVendasHoje', data.vendas_hoje ?? 0);
    setDashboardText('dashboardFaturamentoHoje', formatarMoedaDashboard(data.faturamento_hoje));
    setDashboardText('dashboardLucroHoje', formatarMoedaDashboard(data.lucro_estimado_hoje));
    setDashboardText('dashboardTicketHoje', formatarMoedaDashboard(data.ticket_medio_hoje));

    setDashboardText('dashboardFaturamento', formatarMoedaDashboard(data.faturamento));
    setDashboardText('dashboardVendas', data.total_vendas ?? 0);
    setDashboardText('dashboardTicket', formatarMoedaDashboard(data.ticket_medio));
    setDashboardText('dashboardProdutos', data.produtos_vendidos ?? 0);
    setDashboardText('dashboardLucro', formatarMoedaDashboard(data.lucro_estimado));

    const receber = data.contas_receber || {};
    const pagar = data.contas_pagar || {};
    setDashboardText('dashboardContasReceber', formatarMoedaDashboard(receber.total));
    setDashboardText('dashboardContasReceberQtd', `${receber.quantidade || 0} pendência(s)`);
    setDashboardText('dashboardContasPagar', formatarMoedaDashboard(pagar.total));
    setDashboardText('dashboardContasPagarQtd', `${pagar.quantidade || 0} pendência(s)`);

    const mais = document.getElementById('dashboardMaisVendidos');
    const menos = document.getElementById('dashboardMenosVendidos');
    const estoque = document.getElementById('dashboardEstoqueBaixo');
    const formas = document.getElementById('dashboardFormasPagamento');

    if (mais) {
        mais.innerHTML = montarListaProdutosDashboard(data.mais_vendidos || data.produtos_mais_vendidos);
    }
    if (menos) {
        menos.innerHTML = montarListaProdutosDashboard(data.menos_vendidos || data.produtos_menos_vendidos);
    }
    if (estoque) {
        estoque.innerHTML = montarListaEstoqueBaixo(data.estoque_baixo);
    }
    if (formas) {
        formas.innerHTML = montarListaFormasPagamento(data.vendas_por_forma_pagamento);
    }

    const proximoVencimento = document.getElementById('dashboardProdutosProximoVencimento');
    const vencidos = document.getElementById('dashboardProdutosVencidos');

    if (proximoVencimento) {
        proximoVencimento.innerHTML = montarListaValidadeProdutos(data.produtos_proximo_vencimento);
    }
    if (vencidos) {
        vencidos.innerHTML = montarListaValidadeProdutos(data.produtos_vencidos);
    }
}

function mostrarErroDashboard(mensagem) {
    const msg = `<div class="text-danger">${escapeHtmlDashboard(mensagem)}</div>`;
    [
        'dashboardMaisVendidos',
        'dashboardMenosVendidos',
        'dashboardEstoqueBaixo',
        'dashboardFormasPagamento'
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = msg;
    });
}

function dataHojeDashboard() {
    return new Date().toISOString().slice(0, 10);
}

function dataDiasAtrasDashboard(dias) {
    const data = new Date();
    data.setDate(data.getDate() - Number(dias));
    return data.toISOString().slice(0, 10);
}

function prepararFiltroDashboard() {
    const filtro = document.getElementById('dashboardFiltroRapido');
    const inicio = document.getElementById('dashboardDataInicio');
    const fim = document.getElementById('dashboardDataFim');

    if (!filtro || !inicio || !fim) return;

    const hoje = dataHojeDashboard();

    if (!filtro.value) {
        filtro.value = '7';
    }

    if (filtro.value === 'hoje') {
        inicio.value = hoje;
        fim.value = hoje;
    } else if (filtro.value === '30') {
        inicio.value = dataDiasAtrasDashboard(30);
        fim.value = hoje;
    } else if (filtro.value === '7') {
        inicio.value = dataDiasAtrasDashboard(7);
        fim.value = hoje;
    }

    const personalizado = filtro.value === 'personalizado';

    inicio.disabled = !personalizado;
    fim.disabled = !personalizado;
}

function carregarDashboardComFiltro() {
    prepararFiltroDashboard();

    const inicio = document.getElementById('dashboardDataInicio')?.value || dataDiasAtrasDashboard(7);
    const fim = document.getElementById('dashboardDataFim')?.value || dataHojeDashboard();

    carregarDashboard(inicio, fim);
}

async function carregarDashboard(inicio = null, fim = null) {
    try {
        const apiUrl = (typeof API_URL === 'string' && API_URL.trim() !== '')
            ? API_URL
            : `${window.location.origin}/api`;

        const dataInicio = inicio || dataDiasAtrasDashboard(7);
        const dataFim = fim || dataHojeDashboard();

        const response = await fetch(`${apiUrl}/dashboard/resumo?inicio=${dataInicio}&fim=${dataFim}`, {
            headers: {
                Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erro ao carregar dashboard.');
        }

        preencherDashboard(data);

    } catch (error) {
        console.error('Erro dashboard:', error);
        mostrarErroDashboard(error.message || 'Erro ao carregar dashboard.');
    }
}

function initDashboard() {
    const filtro = document.getElementById('dashboardFiltroRapido');

    if (filtro) {
        filtro.addEventListener('change', () => {
            prepararFiltroDashboard();
            if (filtro.value !== 'personalizado') {
                carregarDashboardComFiltro();
            }
        });
    }

    prepararFiltroDashboard();
    carregarDashboardComFiltro();
}

window.initDashboard = initDashboard;
window.carregarDashboard = carregarDashboard;
window.carregarDashboardComFiltro = carregarDashboardComFiltro;
