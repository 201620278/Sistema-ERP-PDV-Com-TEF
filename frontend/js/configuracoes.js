function isAdminUser() {
    try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        return u.role === 'admin';
    } catch (e) {
        return false;
    }
}

function getUsernameLogado() {
    try {
        return JSON.parse(localStorage.getItem('user') || '{}').username || '';
    } catch (e) {
        return '';
    }
}

function renderLinhaUsuario(u, inativo = false) {
    const perfil = u.perfil || 'USUARIO';
    let badgePerfil = 'bg-secondary';
    let labelPerfil = 'Usuário';
    if (perfil === 'SUPER_ADMIN') {
        badgePerfil = 'bg-dark';
        labelPerfil = 'SUPER ADMIN';
    } else if (perfil === 'ADMIN') {
        badgePerfil = 'bg-danger';
        labelPerfil = 'ADMIN';
    }

    const acoes = u.username === getUsernameLogado()
        ? '<span class="text-muted small">você</span>'
        : (inativo
            ? `
                <button type="button" class="btn btn-sm btn-outline-success me-1" onclick="reativarUsuario(${u.id})" title="Reativar">
                    <i class="fas fa-user-check"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="removerUsuario(${u.id})" title="Excluir permanentemente">
                    <i class="fas fa-trash"></i>
                </button>
            `
            : `
                <button type="button" class="btn btn-sm btn-outline-primary me-1" onclick='showModalNovoUsuario(${JSON.stringify(u)})' title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-warning me-1" onclick="desativarUsuario(${u.id})" title="Desativar">
                    <i class="fas fa-user-slash"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="removerUsuario(${u.id})" title="Excluir permanentemente">
                    <i class="fas fa-trash"></i>
                </button>
            `);

    return `
        <tr>
            <td>${escapeHtml(u.username)}</td>
            <td><span class="badge ${badgePerfil}">${labelPerfil}</span></td>
            <td>${obterBadgePermissao(u.perfil)}</td>
            <td>${u.created_at ? formatDateTime(u.created_at) : '-'}</td>
            <td>${acoes}</td>
        </tr>
    `;
}

// Load configuracoes page
function loadConfiguracoes() {
    $.ajax({
        url: `${API_URL}/configuracoes`,
        method: 'GET',
        success: function(configuracoes) {
            if (isAdminUser()) {
                $.when(
                    $.get(`${API_URL}/auth/usuarios`),
                    $.get(`${API_URL}/auth/usuarios?status=inativos`)
                ).done(function(ativosResp, inativosResp) {
                    const usuarios = ativosResp[0] || [];
                    const usuariosInativos = inativosResp[0] || [];
                    renderConfiguracoes(configuracoes, usuarios, usuariosInativos);
                }).fail(function() {
                    renderConfiguracoes(configuracoes, null, null);
                });
            } else {
                renderConfiguracoes(configuracoes, null, null);
            }
        },
        error: function() {
            $('#page-content').html('<div class="alert alert-danger">Erro ao carregar configurações!</div>');
        }
    });
}

// Render configuracoes
function renderConfiguracoes(configuracoes, usuarios, usuariosInativos) {
    const currentUsername = getUsernameLogado();

    const fiscalConfigKeys = new Set([
        'nome_empresa',
        'cnpj',
        'fiscal_ambiente',
        'fiscal_uf_sigla',
        'fiscal_uf',
        'fiscal_codigo_uf',
        'fiscal_serie',
        'fiscal_numero_atual',
        'fiscal_regime_tributario',
        'fiscal_ie',
        'fiscal_im',
        'fiscal_cnae',
        'fiscal_certificado_path',
        'fiscal_certificado_senha',
        'fiscal_id_csc',
        'fiscal_token_csc',
        'fiscal_ws_autorizacao_homologacao',
        'fiscal_ws_retorno_homologacao',
        'fiscal_ws_status_homologacao',
        'fiscal_csc_qrcode_url_homologacao',
        'fiscal_consulta_chave_url_homologacao',
        'fiscal_tp_imp',
        'fiscal_municipio_codigo',
        'fiscal_municipio_nome',
        'fiscal_emitente_cep',
        'fiscal_emitente_logradouro',
        'fiscal_emitente_numero',
        'fiscal_emitente_bairro'
    ]);

    const backupConfigKeys = new Set([
        'backup_google_enabled',
        'backup_google_frequency',
        'backup_google_client_id',
        'backup_google_client_secret',
        'backup_google_redirect_uris',
        'backup_google_refresh_token'
    ]);

    // Chaves internas do Pix — configuradas apenas pelo modal "Configurar Pix Automático"
    const pixConfigKeys = new Set([
        'pix_automatico_ativo',
        'pix_provedor_ativo',
        'pix_configs_json'
    ]);

    configuracoes = configuracoes.filter(config =>
        !fiscalConfigKeys.has(config.chave) &&
        !backupConfigKeys.has(config.chave) &&
        !pixConfigKeys.has(config.chave) &&
        config.chave !== 'endereco'
    );

    const ordemCamposEmpresa = [
        'nome_empresa',
        'nome_fantasia',
        'razao_social',
        'cnpj',
        'ie',
        'im',
        'telefone',
        'whatsapp',
        'email',
        'cep',
        'logradouro',
        'numero',
        'complemento',
        'bairro',
        'cidade',
        'uf'
    ];

    configuracoes.sort((a, b) => {
        const ia = ordemCamposEmpresa.indexOf(a.chave);
        const ib = ordemCamposEmpresa.indexOf(b.chave);

        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    const blocoUsuarios = usuarios && isAdminUser() ? `
        <div class="card mt-3">
            <div class="card-header">
                <i class="fas fa-user-shield"></i> Usuários do sistema
            </div>
            <div class="card-body">
                <p class="text-muted small">
                    Desativar bloqueia o login, mas mantém o histórico — o usuário pode ser reativado depois.
                    Excluir remove o cadastro permanentemente do sistema.
                </p>
                <div class="table-responsive mb-3">
                    <table id="usuariosTable" class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th>Usuário</th>
                                <th>Perfil</th>
                                <th>Permissões</th>
                                <th>Cadastro</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usuarios.map(u => renderLinhaUsuario(u, false)).join('')}
                        </tbody>
                    </table>
                </div>
                <button type="button" class="btn btn-primary btn-sm" onclick="showModalNovoUsuario()">
                    <i class="fas fa-user-plus"></i> Novo usuário
                </button>
                ${usuariosInativos && usuariosInativos.length ? `
                <hr class="my-3">
                <h6 class="text-muted"><i class="fas fa-user-slash"></i> Usuários desativados</h6>
                <div class="table-responsive">
                    <table id="usuariosInativosTable" class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th>Usuário</th>
                                <th>Perfil</th>
                                <th>Permissões</th>
                                <th>Cadastro</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usuariosInativos.map(u => renderLinhaUsuario(u, true)).join('')}
                        </tbody>
                    </table>
                </div>
                ` : ''}
            </div>
        </div>
    ` : '';

    const html = `
        <div class="card">
            <div class="card-header">
                <i class="fas fa-cog"></i> Configurações do Sistema
            </div>
            <div class="card-body">
                <form id="configForm">
                    <div class="row">
                        ${configuracoes.filter(config => config.chave !== 'login_background').map(config => `
                            <div class="col-md-6 mb-3">
                                <label for="${config.chave}" class="form-label fw-bold">
                                    ${config.descricao || config.chave}
                                </label>
                                ${renderConfigField(config)}
                            </div>
                        `).join('')}
                    </div>

                    <button type="button" class="btn btn-primary" onclick="saveConfiguracoes()">
                        <i class="fas fa-save"></i> Salvar Configurações
                    </button>
                </form>
            </div>
        </div>

        <!-- Campo de imagem de fundo do login (após configurações fiscais) -->

        <div class="card mt-3">
            <div class="card-header">
                <i class="fas fa-qrcode"></i> Pix Automático
            </div>
            <div class="card-body">
                <div class="form-check form-switch mb-3">
                    <input
                        class="form-check-input"
                        type="checkbox"
                        id="togglePixAutomatico"
                        onchange="alterarPixAutomatico()"
                    >
                    <label class="form-check-label fw-bold" for="togglePixAutomatico">
                        Ativar automação bancária Pix
                    </label>
                </div>
                <small class="text-muted d-block mb-3">
                    Quando ativado, o sistema gera QR Code Pix automático e confirma o pagamento sozinho.
                </small>
                <div id="containerBotaoPixAutomatico" style="display:none;">
                    <button class="btn btn-success" onclick="abrirModalPixAutomatico()">
                        <i class="fas fa-qrcode"></i> Configurar Pix Automático
                    </button>
                </div>
            </div>
        </div>

        <div class="card mt-3">
            <div class="card-header">
                <i class="fas fa-image"></i> Personalização da Tela de Login
            </div>
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <label class="form-label fw-bold">Imagem de fundo da tela de login</label>
                        <input type="file" class="form-control form-control-sm" id="loginBackgroundUpload" accept="image/*">
                        <small class="text-muted">Recomendado: imagem 1920x1080px ou maior</small>
                        <input type="hidden" id="login_background_path" value="${escapeHtml(configuracoes.find(c => c.chave === 'login_background')?.valor || '')}">
                    </div>
                    <div class="col-md-4">
                        <div id="loginBackgroundPreview">
                            ${(() => {
                                const value = configuracoes.find(c => c.chave === 'login_background')?.valor || '';
                                const previewUrl = value && value.startsWith('/')
                                    ? `${API_URL.replace('/api', '')}${value}`
                                    : value;
                                const previewImg = previewUrl
                                    ? `<img src="${escapeHtml(previewUrl)}" alt="Fundo login atual" style="max-height: 60px; max-width: 120px; border: 1px solid #ddd; border-radius: 4px;" />`
                                    : '<span class="text-muted small">Nenhuma imagem definida</span>';
                                return previewImg;
                            })()}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card mt-3">
            <div class="card-header">
                <i class="fas fa-print"></i> Impressão
            </div>
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-8">
                        <label class="form-label fw-bold">Impressora de Cupom Fiscal</label>
                        <div id="impressoraAtual" class="text-muted small mb-2">
                            <i class="fas fa-spinner fa-spin"></i> Carregando...
                        </div>
                    </div>
                    <div class="col-md-4">
                        <button class="btn btn-info" onclick="configurarImpressoraCupom()">
                            <i class="fas fa-cog"></i> Configurar
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="card mt-3">
            <div class="card-header">
                <i class="fas fa-database"></i> Backup e Manutenção
            </div>
            <div class="card-body">
                <button class="btn btn-secondary" onclick="showBackupConfigModal()">
                    <i class="fas fa-cloud-upload-alt"></i> Configurar Backup Google Drive
                </button>
                <button class="btn btn-outline-primary ms-2" onclick="backupManual()">
                    <i class="fas fa-play"></i> Backup Google Agora
                </button>
                <button id="btnBackupManual" class="btn btn-success ms-2">
                    <i class="fas fa-database"></i> Backup Manual DB
                </button>
                <button id="btnEscolherPasta" class="btn btn-info ms-2">
                    <i class="fas fa-folder-open"></i> Escolher Pasta
                </button>
                <button class="btn btn-warning ms-2" onclick="limparCache()">
                    <i class="fas fa-trash"></i> Limpar Cache
                </button>
                <div id="pastaAtual" class="mt-2 text-muted small"></div>
                <div id="resultadoBackup" class="mt-2"></div>
            </div>
        </div>
        
        <div class="card mt-3">
            <div class="card-header">
                <i class="fas fa-info-circle"></i> Informações do Sistema
            </div>
            <div class="card-body">
                <p><strong>Versão:</strong> 1.0.0</p>
                <p><strong>Data de Instalação:</strong> ${new Date().toLocaleDateString()}</p>
                <p><strong>Desenvolvido por:</strong> Cicero Diego</p>
            </div>
        </div>
        ${blocoUsuarios}
    `;
    
    $('#page-content').html(html);

    // Configurar event listeners
    setupBackupManualListener();
    carregarPastaBackup();
    setupEscolherPastaListener();
    carregarImpressoraCupom();
    carregarStatusPixAutomatico();
}

// --- PIX AUTOMÁTICO ---
let catalogoPixAutomatico = {};

function headersPixApi() {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function abrirModalPixAutomatico() {
    try {
        const respProvedores = await fetch(`${API_URL}/pix/provedores`, {
            headers: headersPixApi()
        });
        const dadosProvedores = await respProvedores.json();

        const respConfig = await fetch(`${API_URL}/pix/config`, {
            headers: headersPixApi()
        });
        const dadosConfig = await respConfig.json();

        if (!dadosProvedores.success || !dadosConfig.success) {
            throw new Error('Erro ao carregar configuração Pix.');
        }

        catalogoPixAutomatico = dadosProvedores.provedores || {};

        const config = dadosConfig.config || {};
        const provedorAtivo = config.provedor || 'mercadopago';
        const configs = config.configs || {};

        const options = Object.entries(catalogoPixAutomatico).map(([key, item]) => {
            return `<option value="${key}" ${key === provedorAtivo ? 'selected' : ''}>${item.nome}</option>`;
        }).join('');

        $('#modal-container').html(`
            <div class="modal fade" id="modalPixConfig" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header bg-success text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-qrcode"></i> Configurar Pix Automático
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>

                        <div class="modal-body">
                            <div class="form-check form-switch mb-3">
                                <input class="form-check-input" type="checkbox" id="pixAutoAtivo" ${config.ativo ? 'checked' : ''}>
                                <label class="form-check-label fw-bold" for="pixAutoAtivo">
                                    Ativar Pix automático no PDV
                                </label>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Banco/Provedor Pix</label>
                                <select id="pixProvedorAtivo" class="form-select" onchange="renderCamposPixAutomatico()">
                                    ${options}
                                </select>
                            </div>

                            <div id="camposPixAutomatico"></div>

                            <div class="alert alert-warning mt-3 mb-0">
                                <strong>Atenção:</strong> Mercado Pago já usa Access Token.
                                Stone e bancos podem exigir contrato/API específica, token, webhook e dados da conta PJ.
                            </div>
                        </div>

                        <div class="modal-footer">
                            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                            <button class="btn btn-outline-primary" onclick="testarPixAutomatico()">Testar/Salvar</button>
                            <button class="btn btn-success" onclick="salvarPixAutomatico()">Salvar</button>
                        </div>
                    </div>
                </div>
            </div>
        `);

        window.pixConfigsAtuais = configs;

        renderCamposPixAutomatico();

        const modal = new bootstrap.Modal(document.getElementById('modalPixConfig'));
        modal.show();

    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Erro ao abrir configuração Pix.', 'danger');
    }
}

function renderCamposPixAutomatico() {
    const provedor = $('#pixProvedorAtivo').val();
    const item = catalogoPixAutomatico[provedor];

    if (!item) return;

    const config = (window.pixConfigsAtuais || {})[provedor] || {};

    if (!item.campos || item.campos.length === 0) {
        $('#camposPixAutomatico').html(`
            <div class="alert alert-info">
                Este provedor já está listado, mas a integração será adicionada depois.
            </div>
        `);
        return;
    }

    const html = item.campos.map(campo => {
        const valor = config[campo.name] ?? campo.default ?? '';
        return `
            <div class="mb-3">
                <label class="form-label">${campo.label}${campo.required ? ' *' : ''}</label>
                <input
                    type="${campo.type || 'text'}"
                    class="form-control campo-pix-auto"
                    data-name="${campo.name}"
                    value="${escapeHtml(String(valor))}"
                    ${campo.required ? 'required' : ''}
                >
            </div>
        `;
    }).join('');

    $('#camposPixAutomatico').html(html);
}

function coletarConfigPixAutomatico() {
    const provedor = $('#pixProvedorAtivo').val();
    const item = catalogoPixAutomatico[provedor] || {};
    const camposPorNome = {};
    (item.campos || []).forEach(c => { camposPorNome[c.name] = c; });

    const configs = { ...(window.pixConfigsAtuais || {}) };
    configs[provedor] = {};

    $('.campo-pix-auto').each(function() {
        const name = $(this).data('name');
        let valor = $(this).val();
        const campo = camposPorNome[name];
        if (campo?.type === 'number') {
            valor = Number(valor) || Number(campo.default) || 0;
        } else {
            valor = String(valor || '').trim();
        }
        configs[provedor][name] = valor;
    });

    window.pixConfigsAtuais = configs;

    return {
        ativo: $('#pixAutoAtivo').is(':checked'),
        provedor,
        configs
    };
}

async function salvarPixAutomatico() {
    try {
        const payload = coletarConfigPixAutomatico();

        const resp = await fetch(`${API_URL}/pix/config`, {
            method: 'POST',
            headers: headersPixApi(),
            body: JSON.stringify(payload)
        });

        const data = await resp.json();

        if (!resp.ok || !data.success) {
            throw new Error(data.error || 'Erro ao salvar Pix.');
        }

        showNotification('Configuração Pix salva com sucesso.', 'success');

        const modal = bootstrap.Modal.getInstance(document.getElementById('modalPixConfig'));
        if (modal) modal.hide();

    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Erro ao salvar Pix.', 'danger');
    }
}

async function testarPixAutomatico() {
    await salvarPixAutomatico();
    showNotification('Configuração salva. Faça uma venda teste em Pix para validar a cobrança.', 'info');
}

function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function showModalNovoUsuario(usuario = null) {
    const permissoesDisponiveis = [
        ['pdv', 'PDV'],
        ['vendas', 'Vendas'],
        ['produtos', 'Produtos'],
        ['clientes', 'Clientes'],
        ['compras', 'Compras'],
        ['fornecedores', 'Fornecedores'],
        ['financeiro', 'Financeiro'],
        ['caixa', 'Caixa'],
        ['fiscal', 'Fiscal'],
        ['configuracoes', 'Configurações'],
        ['usuarios', 'Usuários'],
        ['relatorios', 'Relatórios'],
        ['categorias', 'Categorias']
    ];

    const editando = !!usuario;
    const permissoesUsuario = usuario?.permissoes || [];

    const modalHtml = `
        <div class="modal fade" id="novoUsuarioModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${editando ? 'Editar usuário' : 'Novo usuário'}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>

                    <div class="modal-body">
                        <input type="hidden" id="usuario_id_edicao" value="${editando ? usuario.id : ''}">

                        <div class="mb-3">
                            <label class="form-label">Nome de usuário</label>
                            <input 
                                type="text" 
                                class="form-control" 
                                id="novo_usuario_login" 
                                value="${editando ? escapeHtml(usuario.username) : ''}"
                                ${editando ? 'disabled' : ''}
                            >
                        </div>

                        <div class="mb-3">
                            <label class="form-label">
                                Senha ${editando ? '<small class="text-muted">(deixe vazio para não alterar)</small>' : ''}
                            </label>
                            <input type="password" class="form-control" id="novo_usuario_senha" autocomplete="new-password">
                        </div>

                        <div class="mb-3">
                            <label class="form-label">Tipo de Acesso (role)</label>
                            <select class="form-control" id="novo_usuario_role" onchange="togglePermissoesUsuario()">
                                <option value="operador" ${usuario?.role === 'operador' ? 'selected' : ''}>Operador</option>
                                <option value="admin" ${usuario?.role === 'admin' ? 'selected' : ''}>Administrador</option>
                            </select>
                        </div>

                        <div class="mb-3">
                            <label class="form-label">Perfil de Permissão</label>
                            <select class="form-control" id="novo_usuario_perfil">
                                <option value="USUARIO" ${(usuario?.perfil || 'USUARIO') === 'USUARIO' ? 'selected' : ''}>Usuário Comum</option>
                                <option value="ADMIN" ${usuario?.perfil === 'ADMIN' ? 'selected' : ''}>Administrador (ADMIN)</option>
                                <option value="SUPER_ADMIN" ${usuario?.perfil === 'SUPER_ADMIN' ? 'selected' : ''}>Super Administrador</option>
                            </select>
                            <small class="text-muted">
                                SUPER_ADMIN: pode tudo | ADMIN: pode gerenciar usuários comuns | USUARIO: acesso limitado
                            </small>
                        </div>

                        <div class="mb-3" id="boxPodeAlterarSenhas">
                            <label class="form-check">
                                <input 
                                    type="checkbox" 
                                    class="form-check-input" 
                                    id="novo_usuario_pode_alterar_senhas"
                                    ${usuario?.pode_alterar_senhas ? 'checked' : ''}
                                >
                                <span class="form-check-label">
                                    Pode alterar senhas de outros usuários
                                </span>
                            </label>
                            <small class="text-muted d-block">
                                Apenas ADMINs com esta permissão podem alterar senhas de USUARIOs comuns
                            </small>
                        </div>

                        <div id="boxPermissoesUsuario">
                            <label class="form-label fw-bold">Permissões do operador</label>

                            <div class="row">
                                ${permissoesDisponiveis.map(([valor, label]) => `
                                    <div class="col-md-4 mb-2">
                                        <label class="form-check">
                                            <input 
                                                type="checkbox" 
                                                class="form-check-input permissao-usuario" 
                                                value="${valor}"
                                                ${permissoesUsuario.includes(valor) ? 'checked' : ''}
                                            >
                                            <span class="form-check-label">${label}</span>
                                        </label>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div id="novo-usuario-erro" class="alert alert-danger py-2 d-none"></div>
                    </div>

                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" onclick="salvarNovoUsuario()">
                            ${editando ? 'Salvar alterações' : 'Cadastrar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Limpar modais travados antes de criar novo
    if (typeof limparModaisTravados === 'function') {
        limparModaisTravados();
    }

    $('#modal-container').html(modalHtml);
    $('#novoUsuarioModal').modal('show');
    togglePermissoesUsuario();
}

function salvarNovoUsuario() {
    const id = $('#usuario_id_edicao').val();
    const username = $('#novo_usuario_login').val().trim();
    const password = $('#novo_usuario_senha').val();
    const role = $('#novo_usuario_role').val();
    const perfil = $('#novo_usuario_perfil').val();
    const podeAlterarSenhas = $('#novo_usuario_pode_alterar_senhas').is(':checked') ? 1 : 0;

    const permissoes = $('.permissao-usuario:checked')
        .map(function () {
            return $(this).val();
        })
        .get();

    const $err = $('#novo-usuario-erro');
    $err.addClass('d-none').text('');

    if (!id && (!username || !password)) {
        $err.removeClass('d-none').text('Preencha usuário e senha.');
        return;
    }

    const payload = {
        username,
        password,
        role,
        perfil,
        pode_alterar_senhas: podeAlterarSenhas,
        permissoes
    };

    $.ajax({
        url: id ? `${API_URL}/auth/usuarios/${id}` : `${API_URL}/auth/usuarios`,
        method: id ? 'PUT' : 'POST',
        contentType: 'application/json',
        data: JSON.stringify(payload),
        success: function () {
            $('#novoUsuarioModal').modal('hide');
            showNotification(id ? 'Usuário atualizado com sucesso!' : 'Usuário cadastrado com sucesso!');
            loadConfiguracoes();
        },
        error: function (xhr) {
            $err.removeClass('d-none').text(
                xhr.responseJSON && xhr.responseJSON.error
                    ? xhr.responseJSON.error
                    : 'Erro ao salvar usuário.'
            );
        }
    });
}

function togglePermissoesUsuario() {
    const role = $('#novo_usuario_role').val();

    if (role === 'admin') {
        $('#boxPermissoesUsuario').hide();
    } else {
        $('#boxPermissoesUsuario').show();
    }
}

function obterBadgePermissao(perfil) {
    const p = String(perfil || '').trim().toUpperCase();

    if (p === 'SUPER_ADMIN') {
        return `<span class="badge bg-dark">SUPER ADMIN</span>`;
    }

    if (p === 'ADMIN') {
        return `<span class="badge bg-danger">ADMIN</span>`;
    }

    return `<span class="badge bg-secondary">OPERADOR</span>`;
}

async function carregarUsuarios() {
    try {
        const resposta = await fetch(`${API_URL}/auth/usuarios`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!resposta.ok) {
            throw new Error('Erro ao carregar usuários.');
        }

        const usuarios = await resposta.json();
        renderizarUsuarios(usuarios);
    } catch (erro) {
        console.error('Erro ao carregar usuários:', erro);
    }
}

function renderizarUsuarios(usuarios) {
    const tbody = document.querySelector('#usuariosTable tbody');
    if (!tbody) return;
    tbody.innerHTML = usuarios.map(u => renderLinhaUsuario(u, false)).join('');
}

async function desativarUsuario(id) {
    if (!confirm('Deseja desativar este usuário? Ele não poderá mais fazer login, mas poderá ser reativado depois.')) return;

    try {
        const resposta = await fetch(`${API_URL}/auth/usuarios/${id}/desativar`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            alert(dados.erro || dados.error || 'Erro ao desativar usuário.');
            return;
        }

        showNotification(dados.mensagem || 'Usuário desativado com sucesso.', 'success');
        loadConfiguracoes();
    } catch (erro) {
        console.error('Erro ao desativar usuário:', erro);
        alert('Erro ao desativar usuário.');
    }
}

async function reativarUsuario(id) {
    if (!confirm('Deseja reativar este usuário?')) return;

    try {
        const resposta = await fetch(`${API_URL}/auth/usuarios/${id}/ativar`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            alert(dados.erro || dados.error || 'Erro ao reativar usuário.');
            return;
        }

        showNotification(dados.mensagem || 'Usuário reativado com sucesso.', 'success');
        loadConfiguracoes();
    } catch (erro) {
        console.error('Erro ao reativar usuário:', erro);
        alert('Erro ao reativar usuário.');
    }
}

async function removerUsuario(id) {
    if (!confirm('ATENÇÃO: esta ação exclui o usuário permanentemente do sistema. Deseja continuar?')) return;

    try {
        const resposta = await fetch(`${API_URL}/auth/usuarios/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            alert(dados.erro || dados.error || 'Erro ao excluir usuário.');
            return;
        }

        showNotification(dados.mensagem || 'Usuário excluído com sucesso.', 'success');
        loadConfiguracoes();
    } catch (erro) {
        console.error('Erro ao excluir usuário:', erro);
        alert('Erro ao excluir usuário.');
    }
}

// Render config field based on type
function renderConfigField(config) {
    const value = config.valor || '';

    if (config.chave === 'logo') {
        const previewUrl = value && value.startsWith('/')
            ? `${API_URL.replace('/api', '')}${value}`
            : value;

        const previewImg = previewUrl
            ? `<img src="${escapeHtml(previewUrl)}" alt="Logo atual" style="max-height: 100px;" />`
            : '';

        return `
            <div>
                <input type="file" class="form-control" id="logoUpload" accept="image/*">
                <input type="hidden" id="logo_path" value="${escapeHtml(value)}">
                <div id="logoPreview" class="mt-2">
                    ${previewImg}
                </div>
            </div>
        `;
    }

    if (config.chave === 'login_background') {
        const previewUrl = value && value.startsWith('/')
            ? `${API_URL.replace('/api', '')}${value}`
            : value;

        const previewImg = previewUrl
            ? `<img src="${escapeHtml(previewUrl)}" alt="Fundo login atual" style="max-height: 150px; max-width: 100%;" />`
            : '<span class="text-muted">Nenhuma imagem definida (usa gradiente padrão)</span>';

        return `
            <div>
                <input type="file" class="form-control" id="loginBackgroundUpload" accept="image/*">
                <small class="text-muted">Recomendado: imagem 1920x1080px ou maior</small>
                <input type="hidden" id="login_background_path" value="${escapeHtml(value)}">
                <div id="loginBackgroundPreview" class="mt-2">
                    ${previewImg}
                </div>
            </div>
        `;
    }

    if (config.chave === 'cep') {
        return `<input type="text" class="form-control" id="${config.chave}" value="${value}" onblur="buscarCep(this.value)" oninput="formatCep(this)">`;
    }

    if (config.chave === 'telefone' || config.chave === 'whatsapp') {
        return `<input type="text" class="form-control" id="${config.chave}" value="${value}" oninput="formatPhone(this)">`;
    }

    if (config.chave === 'cnpj') {
        return `<input type="text" class="form-control" id="${config.chave}" value="${formatarCNPJ(value)}" oninput="formatCNPJInput(this)" maxlength="18">`;
    }

    switch(config.tipo) {
        case 'boolean':
            return `
                <select class="form-control" id="${config.chave}">
                    <option value="true" ${value === 'true' ? 'selected' : ''}>Sim</option>
                    <option value="false" ${value === 'false' ? 'selected' : ''}>Não</option>
                </select>
            `;
        case 'text':
            return `<textarea class="form-control" id="${config.chave}" rows="3">${value}</textarea>`;
        default:
            return `<input type="text" class="form-control" id="${config.chave}" value="${value}">`;
    }
}

async function uploadLogoFile() {
    const logoInput = document.getElementById('logoUpload');
    if (!logoInput || !logoInput.files || logoInput.files.length === 0) {
        return null;
    }

    const formData = new FormData();
    formData.append('logo', logoInput.files[0]);

    const resp = await fetch(`${API_URL}/configuracoes/upload-logo`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
    });

    if (!resp.ok) {
        const errorData = await resp.json().catch(() => null);
        throw new Error(errorData?.error || 'Erro ao enviar a logo.');
    }

    const data = await resp.json();
    if (data.path) {
        $('#logo_path').val(data.path);
        $('#logoPreview').html(`<img src="${escapeHtml(data.path)}" alt="Logo atual" style="max-height: 100px;" />`);
        // Recarrega a logo na sidebar imediatamente
        setTimeout(() => {
            if (typeof carregarLogoSidebar === 'function') {
                carregarLogoSidebar();
            }
        }, 200);
    }

    return data.path;
}

async function uploadLoginBackgroundFile() {
    const bgInput = document.getElementById('loginBackgroundUpload');
    if (!bgInput || !bgInput.files || bgInput.files.length === 0) {
        return null;
    }

    const formData = new FormData();
    formData.append('imagem', bgInput.files[0]);

    const resp = await fetch(`${API_URL}/configuracoes/upload-login-background`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
    });

    if (!resp.ok) {
        const errorData = await resp.json().catch(() => null);
        throw new Error(errorData?.error || 'Erro ao enviar imagem de fundo.');
    }

    const data = await resp.json();
    if (data.path) {
        $('#login_background_path').val(data.path);
        $('#loginBackgroundPreview').html(`<img src="${escapeHtml(data.path)}" alt="Fundo login atual" style="max-height: 150px; max-width: 100%;" />`);
    }

    return data.path;
}

// Save configuracoes
async function saveConfiguracoes() {
    try {
        await uploadLogoFile();
        await uploadLoginBackgroundFile();
    } catch (error) {
        showNotification(error.message || 'Erro ao enviar imagem.', 'danger');
        return;
    }

    const configs = [];
    
    $('#configForm .form-control').each(function() {
        const chave = $(this).attr('id');
        const valor = $(this).val();
        if (!chave || chave === 'logoUpload' || chave === 'loginBackgroundUpload') return;
        if (chave === 'logo_path') {
            configs.push({
                chave: 'logo',
                valor: valor
            });
            return;
        }
        if (chave === 'login_background_path') {
            configs.push({
                chave: 'login_background',
                valor: valor
            });
            return;
        }

        configs.push({
            chave: chave,
            valor: valor
        });
    });
    
    let promises = [];
    
    configs.forEach(config => {
        const promise = $.ajax({
            url: `${API_URL}/configuracoes/${config.chave}`,
            method: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ valor: config.valor })
        });
        promises.push(promise);
    });
    
    Promise.all(promises)
        .then(() => {
            showNotification('Configurações salvas com sucesso!');
            // Recarrega a logo na sidebar
            if (typeof carregarLogoSidebar === 'function') {
                carregarLogoSidebar();
            }
            loadConfiguracoes();
        })
        .catch(() => {
            showNotification('Erro ao salvar configurações!', 'danger');
        });
}

// Fazer backup
function fazerBackup() {
    const data = {
        produtos: null,
        clientes: null,
        vendas: null,
        compras: null,
        financeiro: null
    };
    
    // Fetch all data
    const promises = [
        $.ajax({ url: `${API_URL}/produtos`, method: 'GET' }),
        $.ajax({ url: `${API_URL}/clientes`, method: 'GET' }),
        $.ajax({ url: `${API_URL}/vendas`, method: 'GET' }),
        $.ajax({ url: `${API_URL}/compras`, method: 'GET' }),
        $.ajax({ url: `${API_URL}/financeiro`, method: 'GET' })
    ];
    
    Promise.all(promises)
        .then(([produtos, clientes, vendas, compras, financeiro]) => {
            const backup = {
                data: new Date().toISOString(),
                produtos: produtos,
                clientes: clientes,
                vendas: vendas,
                compras: compras,
                financeiro: financeiro
            };
            
            const backupStr = JSON.stringify(backup, null, 2);
            const blob = new Blob([backupStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            showNotification('Backup gerado com sucesso!');
        })
        .catch(() => {
            showNotification('Erro ao gerar backup!', 'danger');
        });
}

// Buscar CEP
function buscarCep(cep) {
    if (!cep || cep.length < 8) return;

    // Remover caracteres não numéricos
    cep = cep.replace(/\D/g, '');

    if (cep.length !== 8) return;

    // Mostrar loading
    showNotification('Buscando endereço...', 'info');

    fetch(`https://viacep.com.br/ws/${cep}/json/`)
        .then(response => response.json())
        .then(data => {
            if (data.erro) {
                showNotification('CEP não encontrado.', 'warning');
                return;
            }

            // Preencher os campos
            $('#logradouro').val(data.logradouro || '');
            $('#bairro').val(data.bairro || '');
            $('#cidade').val(data.localidade || '');
            $('#uf').val(data.uf || '');

            showNotification('Endereço preenchido automaticamente.');
        })
        .catch(error => {
            console.error('Erro ao buscar CEP:', error);
            showNotification('Erro ao buscar CEP. Tente novamente.', 'danger');
        });
}

// Formatar telefone
function formatPhone(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length <= 11) {
        value = value.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, '($1)$2.$3-$4');
        input.value = value;
    }
}

// Formatar CEP
function formatCep(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length <= 8) {
        value = value.replace(/(\d{5})(\d{3})/, '$1-$2');
        input.value = value;
    }
}

// Formatar CNPJ em tempo real
function formatCNPJInput(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length <= 14) {
        value = value.replace(/(\d{2})(\d)/, '$1.$2');
        value = value.replace(/(\d{3})(\d)/, '$1.$2');
        value = value.replace(/(\d{3})(\d)/, '$1/$2');
        value = value.replace(/(\d{4})(\d)/, '$1-$2');
        input.value = value;
    }
}

// Configurar event listener do botão de backup manual
function setupBackupManualListener() {
    document.getElementById("btnBackupManual")?.addEventListener("click", async () => {
        const resultadoBackup = document.getElementById("resultadoBackup");

        try {
            resultadoBackup.innerHTML = "Fazendo backup...";

            const resposta = await fetch(`${API_URL}/backup/manual`, {
                method: "POST",
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            const dados = await resposta.json();

            if (!dados.sucesso) {
                throw new Error(dados.mensagem || "Erro ao fazer backup.");
            }

            resultadoBackup.innerHTML = `
                <div style="color: green;">
                    ✅ Backup realizado com sucesso!<br>
                    Arquivo: ${dados.backup.arquivo}<br>
                    Local: ${dados.backup.caminho}
                </div>
            `;
            showNotification('Backup realizado com sucesso!', 'success');
        } catch (error) {
            resultadoBackup.innerHTML = `
                <div style="color: red;">
                    ❌ Erro ao fazer backup: ${error.message}
                </div>
            `;
        }
    });
}

// Carregar pasta de backup atual
async function carregarPastaBackup() {
    try {
        const resp = await fetch(`${API_URL}/configuracoes/backup-path`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await resp.json();
        const pastaDiv = document.getElementById('pastaAtual');

        if (data.sucesso && data.caminho) {
            pastaDiv.innerHTML = `<i class="fas fa-folder"></i> Pasta atual: ${escapeHtml(data.caminho)}`;
        } else {
            pastaDiv.innerHTML = `<i class="fas fa-exclamation-triangle text-warning"></i> Nenhuma pasta de backup configurada`;
        }
    } catch (error) {
        console.error('Erro ao carregar pasta de backup:', error);
    }
}

// Configurar listener do botão para escolher pasta
function setupEscolherPastaListener() {
    document.getElementById("btnEscolherPasta")?.addEventListener("click", async () => {
        let pastaSelecionada = null;

        // Verificar se está rodando em Electron
        if (window.electronAPI && window.electronAPI.selecionarPastaBackup) {
            pastaSelecionada = await window.electronAPI.selecionarPastaBackup();
        } else {
            // Fallback para prompt em navegador web
            pastaSelecionada = prompt("Digite o caminho da pasta de backup (ex: C:\\CDS-Sistemas\\Backups):");

            if (pastaSelecionada) {
                pastaSelecionada = pastaSelecionada.trim();
                if (!pastaSelecionada) {
                    showNotification('Caminho inválido', 'danger');
                    return;
                }
            }
        }

        if (!pastaSelecionada) {
            return; // Usuário cancelou
        }

        try {
            const resp = await fetch(`${API_URL}/configuracoes/backup-path`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ caminho: pastaSelecionada })
            });

            const data = await resp.json();

            if (data.sucesso) {
                showNotification('Pasta de backup salva com sucesso!', 'success');
                carregarPastaBackup();
            } else {
                showNotification(data.mensagem || 'Erro ao salvar pasta', 'danger');
            }
        } catch (error) {
            showNotification('Erro ao salvar pasta de backup', 'danger');
        }
    });
}

// Função para carregar impressora configurada
async function carregarImpressoraCupom() {
    try {
        const resp = await fetch(`${API_URL}/configuracoes/impressora_cupom`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await resp.json();
        const impressoraDiv = document.getElementById('impressoraAtual');

        if (data.sucesso && data.caminho) {
            impressoraDiv.innerHTML = `<i class="fas fa-print"></i> ${escapeHtml(data.caminho)}`;
        } else {
            impressoraDiv.innerHTML = `<i class="fas fa-exclamation-triangle text-warning"></i> Nenhuma impressora configurada (será detectada automaticamente)`;
        }
    } catch (error) {
        console.error('Erro ao carregar impressora:', error);
        document.getElementById('impressoraAtual').innerHTML = `<i class="fas fa-exclamation-circle text-danger"></i> Erro ao carregar`;
    }
}

// Função para configurar impressora de cupom
async function configurarImpressoraCupom() {
    try {
        let impressoraSelecionada = null;

        // No Electron, listar impressoras disponíveis
        if (window.electronAPI && window.electronAPI.listarImpressoras) {
            try {
                const impressoras = await window.electronAPI.listarImpressoras();

                if (impressoras.length === 0) {
                    showNotification('Nenhuma impressora encontrada no sistema', 'warning');
                    return;
                }

                // Criar modal customizado
                const modalId = 'modalImpressoraCupom';

                // Remover modal anterior se existir
                const modalExistente = document.getElementById(modalId);
                if (modalExistente) modalExistente.remove();

                // Construir opções do select
                const opcoesHtml = impressoras.map(imp => {
                    const destaque = imp.name.toLowerCase().includes('cupom') ? ' ⭐' : '';
                    const padrao = imp.isDefault ? ' (padrão)' : '';
                    return `<option value="${escapeHtml(imp.name)}">${escapeHtml(imp.name)}${destaque}${padrao}</option>`;
                }).join('');

                const html = `
                    <div id="${modalId}" style="
                        position: fixed;
                        inset: 0;
                        background: rgba(0,0,0,.5);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 99999;
                    ">
                        <div style="
                            background: #fff;
                            padding: 25px;
                            border-radius: 8px;
                            width: 450px;
                            max-width: 90%;
                            box-shadow: 0 10px 30px rgba(0,0,0,.25);
                        ">
                            <h5 style="margin-top:0; margin-bottom:20px;">
                                <i class="fas fa-print"></i> Configurar impressora de cupom
                            </h5>

                            <div class="mb-3">
                                <label class="form-label">Selecione a impressora:</label>
                                <select id="selectImpressoraCupom" class="form-select">
                                    <option value="">-- Automático (detectar) --</option>
                                    ${opcoesHtml}
                                </select>
                                <small class="text-muted">⭐ = impressora de cupom detectada</small>
                            </div>

                            <div class="d-flex gap-2 justify-content-end">
                                <button type="button" class="btn btn-secondary" id="btnCancelarImpressora">
                                    Cancelar
                                </button>
                                <button type="button" class="btn btn-primary" id="btnSalvarImpressora">
                                    <i class="fas fa-save"></i> Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                document.body.insertAdjacentHTML('beforeend', html);

                // Evento cancelar
                document.getElementById('btnCancelarImpressora').onclick = () => {
                    document.getElementById(modalId).remove();
                };

                // Evento salvar
                document.getElementById('btnSalvarImpressora').onclick = async () => {
                    const impressora = document.getElementById('selectImpressoraCupom').value;

                    try {
                        const resp = await fetch(`${API_URL}/configuracoes/impressora_cupom`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ caminho: impressora })
                        });

                        const data = await resp.json();

                        if (data.sucesso) {
                            showNotification('Impressora configurada com sucesso!', 'success');
                            document.getElementById(modalId).remove();
                            carregarImpressoraCupom();
                        } else {
                            showNotification(data.mensagem || 'Erro ao configurar impressora', 'danger');
                        }
                    } catch (err) {
                        showNotification('Erro ao salvar impressora', 'danger');
                    }
                };

                // Fechar ao clicar fora
                document.getElementById(modalId).onclick = (e) => {
                    if (e.target.id === modalId) {
                        document.getElementById(modalId).remove();
                    }
                };

            } catch (err) {
                console.error('Erro ao listar impressoras:', err);
                showNotification('Erro ao listar impressoras: ' + err.message, 'danger');
            }
        } else {
            // Fallback: usar prompt no navegador ou input simples
            const impressora = prompt('Digite o nome exato da impressora de cupom (deixe em branco para automático):');

            if (impressora === null) return; // Cancelado

            try {
                const resp = await fetch(`${API_URL}/configuracoes/impressora_cupom`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ caminho: impressora || '' })
                });

                const data = await resp.json();

                if (data.sucesso) {
                    showNotification('Impressora configurada com sucesso!', 'success');
                    carregarImpressoraCupom();
                } else {
                    showNotification(data.mensagem || 'Erro ao configurar impressora', 'danger');
                }
            } catch (err) {
                showNotification('Erro ao salvar impressora', 'danger');
            }
        }
    } catch (error) {
        showNotification('Erro ao configurar impressora', 'danger');
        console.error(error);
    }
}

// Função para imprimir cupom
async function imprimirCupom() {
    try {
        const res = await fetch(`${API_URL}/impressao/imprimir`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await res.json();

        if (!data.sucesso) {
            throw new Error(data.mensagem || "Erro ao imprimir");
        }

        showNotification(`Impressão OK: ${data.impressora}`, 'success');
        console.log("Impressão OK:", data.impressora);
    } catch (err) {
        showNotification('Erro na impressão: ' + err.message, 'danger');
        console.error('Erro na impressão:', err);
    }
}

async function carregarStatusPixAutomatico() {
    try {
        const resp = await fetch(`${API_URL}/pix/config`, {
            headers: headersPixApi()
        });
        const data = await resp.json();

        if (!data.success) return;

        const ativo = data.config?.ativo === true;

        $('#togglePixAutomatico').prop('checked', ativo);
        $('#containerBotaoPixAutomatico').toggle(ativo);
    } catch (err) {
        console.error('Erro ao carregar Pix:', err);
    }
}

async function alterarPixAutomatico() {
    try {
        const ativo = $('#togglePixAutomatico').is(':checked');

        $('#containerBotaoPixAutomatico').toggle(ativo);

        const respAtual = await fetch(`${API_URL}/pix/config`, {
            headers: headersPixApi()
        });
        const atual = await respAtual.json();

        const payload = {
            ativo,
            provedor: atual.config?.provedor || 'mercadopago',
            configs: atual.config?.configs || {}
        };

        const resp = await fetch(`${API_URL}/pix/config`, {
            method: 'POST',
            headers: headersPixApi(),
            body: JSON.stringify(payload)
        });

        const data = await resp.json();

        if (!resp.ok || !data.success) {
            throw new Error(data.error || 'Erro ao salvar configuração Pix.');
        }

        showNotification(
            ativo ? 'Pix automático ativado.' : 'Pix automático desativado.',
            'success'
        );
    } catch (err) {
        console.error(err);
        showNotification('Erro ao alterar Pix automático.', 'danger');
        carregarStatusPixAutomatico();
    }
}