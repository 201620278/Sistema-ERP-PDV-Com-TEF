// API base URL (usa a mesma origem da aplicação para evitar conflito de porta)
const API_URL = (() => {
    if (typeof window.API_URL === 'string' && window.API_URL.trim() !== '') {
        return window.API_URL;
    }
    const resolved = `${window.location.origin}/api`;
    window.API_URL = resolved;
    return resolved;
})();

let currentPage = 'pdv';
let chart = null;

function handleUnauthorized() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

$(document).ajaxError(function(event, xhr) {
    if (xhr && (xhr.status === 401 || xhr.status === 403)) {
        handleUnauthorized();
    }
});

$(document).ready(function() {
    if (!localStorage.getItem('token')) return;

    carregarLogoSidebar();

    $('.nav-link').on('click', function(e) {
        e.preventDefault();
        const page = $(this).data('page');
        loadPage(page);
        $('.nav-link').removeClass('active');
        $(this).addClass('active');
    });

    // Carregar o PDV na primeira abertura do sistema
    $('.nav-link').removeClass('active');
    $('.nav-link[data-page="pdv"]').addClass('active');
    loadPage(currentPage);
});

function renderSidebarBrandPadrao() {
    const brand = document.getElementById('sidebar-brand');
    if (!brand) return;

    brand.innerHTML = `
        <h5 class="text-white">ESQUINÃO</h5>
        <small class="text-muted">DA ECONOMIA</small>
    `;
}

async function carregarLogoSidebar() {
    const brand = document.getElementById('sidebar-brand');
    if (!brand) return;

    try {
        const response = await fetch(`${API_URL}/configuracoes`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            renderSidebarBrandPadrao();
            return;
        }

        const configuracoes = await response.json();
        const logoConfig = Array.isArray(configuracoes)
            ? configuracoes.find((config) => config.chave === 'logo')
            : null;
        const logoPath = logoConfig && logoConfig.valor ? String(logoConfig.valor).trim() : '';

        if (!logoPath) {
            renderSidebarBrandPadrao();
            return;
        }

        const logoUrl = logoPath.startsWith('/')
            ? `${API_URL.replace('/api', '')}${logoPath}`
            : logoPath;

        brand.innerHTML = `
            <img
                src="${logoUrl}"
                alt="Logo da empresa"
                class="img-fluid"
                style="max-height: 110px; object-fit: contain;"
            >
        `;
    } catch (error) {
        console.error('Erro ao carregar logo da sidebar:', error);
        renderSidebarBrandPadrao();
    }
}

function isScriptAlreadyLoaded(src) {
    return Array.from(document.scripts).some(script => {
        return script.src && script.src.endsWith(src);
    });
}

function carregarPaginaHtml(url, callback) {
    $.get(url, function(html) {
        const $page = $('#page-content');
        const nodes = $.parseHTML(html, document, true);

        $page.empty();

        if (!nodes) {
            if (typeof callback === 'function') callback();
            return;
        }

        const inlineScripts = [];

        nodes.forEach(node => {
            if (node.nodeType === 1 && node.tagName.toLowerCase() === 'script') {
                if (node.src) {
                    const srcPath = node.getAttribute('src');
                    if (!isScriptAlreadyLoaded(srcPath)) {
                        const script = document.createElement('script');
                        script.src = srcPath;
                        document.body.appendChild(script);
                    }
                } else {
                    inlineScripts.push(node.text || node.textContent || node.innerHTML || '');
                }
            } else {
                $page.append(node);
            }
        });

        inlineScripts.forEach(code => {
            if (code.trim()) {
                $.globalEval(code);
            }
        });

        if (typeof callback === 'function') callback();
    }).fail(function() {
        $('#page-content').html('<div class="alert alert-danger">Erro ao carregar a página solicitada.</div>');
    });
}

function loadPage(page) {
    currentPage = page;
    switch (page) {
            case 'pdv':
            return carregarPaginaHtml('pdv.html', function() {
                if (typeof loadPDV === 'function') {
                    loadPDV();
                } else {
                    $('#page-content').html('<div class="alert alert-danger">Erro ao carregar o PDV.</div>');
                }
            });
        case 'produtos':
            return typeof loadProdutos === 'function' ? loadProdutos() : $('#page-content').html('<div class="alert alert-danger">Erro ao carregar produtos.</div>');
        case 'clientes':
            return typeof loadClientes === 'function' ? loadClientes() : $('#page-content').html('<div class="alert alert-danger">Erro ao carregar clientes.</div>');
        case 'compras':
            return typeof loadCompras === 'function' ? loadCompras() : $('#page-content').html('<div class="alert alert-danger">Erro ao carregar compras.</div>');
        case 'fornecedores':
            return typeof loadFornecedores === 'function' ? loadFornecedores() : $('#page-content').html('<div class="alert alert-danger">Erro ao carregar fornecedores.</div>');
        case 'vendas':
            return typeof loadVendas === 'function' ? loadVendas() : $('#page-content').html('<div class="alert alert-danger">Erro ao carregar histórico de vendas.</div>');
        case 'financeiro':
            return carregarPaginaHtml('financeiro.html', function() {
                if (typeof initFinanceiro === 'function') {
                    initFinanceiro();
                } else {
                    $('#page-content').html('<div class="alert alert-danger">Erro ao carregar financeiro.</div>');
                }
            });
        case 'caixa':
            return typeof loadCaixa === 'function' ? loadCaixa() : $('#page-content').html('<div class="alert alert-danger">Erro ao carregar caixa.</div>');
        case 'configuracoes':
            return typeof loadConfiguracoes === 'function' ? loadConfiguracoes() : $('#page-content').html('<div class="alert alert-danger">Erro ao carregar configurações.</div>');
        case 'fiscal':
            return typeof loadFiscal === 'function'
                ? loadFiscal()
                : $('#page-content').html('<div class="alert alert-danger">Erro ao carregar o módulo fiscal.</div>');
        case 'categorias':
            return carregarPaginaHtml('categorias.html', function() {
                if (typeof loadCategoriasAndSubcategorias === 'function') {
                    loadCategoriasAndSubcategorias();
                } else if (typeof loadCategorias === 'function') {
                    loadCategorias();
                }
            });
        default:
            $('#page-content').html('<div class="alert alert-warning">Página não encontrada.</div>');
    }
}

function formatCurrency(value) {
    if (value === undefined || value === null || Number.isNaN(Number(value))) value = 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(Number(value));
}

function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('pt-BR');
}

function formatDateTime(dateString) {
    if (!dateString) return '-';

    const data = new Date(dateString);

    return Number.isNaN(data.getTime())
        ? dateString
        : data.toLocaleString('pt-BR', {
            timeZone: 'America/Fortaleza'
        });
}

function formatarDataHoraBR(dataHora) {
  if (!dataHora) return '-';

  const [data, hora] = dataHora.split(' ');
  const [ano, mes, dia] = data.split('-');

  return `${dia}/${mes}/${ano} ${hora}`;
}

function showNotification(mensagem, tipo = 'success') {
    const container = document.getElementById('notification-container');

    if (!container) return;

    const id = 'notif-' + Date.now();

    const alert = document.createElement('div');
    alert.id = id;
    alert.className = `alert alert-${tipo} alert-dismissible fade show`;
    alert.innerHTML = `
        ${mensagem}
        <button type="button" class="btn-close" onclick="fecharNotificacao('${id}')"></button>
    `;

    container.appendChild(alert);

    setTimeout(() => {
        fecharNotificacao(id);
    }, 3000);
}

function fecharNotificacao(id) {
    const el = document.getElementById(id);
    if (!el) return;

    el.classList.remove('show');

    setTimeout(() => {
        el.remove();
    }, 300);
}

$.ajaxSetup({
    beforeSend: function(xhr, settings) {
        if (settings.url && !settings.url.includes('/api/')) return;
        const token = localStorage.getItem('token');
        if (token) {
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        }
    }
});
