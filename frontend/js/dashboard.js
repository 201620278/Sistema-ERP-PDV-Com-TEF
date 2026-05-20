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

async function carregarDashboard() {
    try {
        const apiUrl = (typeof API_URL === 'string' && API_URL.trim() !== '')
            ? API_URL
            : `${window.location.origin}/api`;

        const response = await fetch(`${apiUrl}/dashboard/resumo`, {
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
    carregarDashboard();
}

window.initDashboard = initDashboard;
window.carregarDashboard = carregarDashboard;
