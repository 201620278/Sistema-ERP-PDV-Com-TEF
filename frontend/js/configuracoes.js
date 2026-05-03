function isAdminUser() {
    try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        return u.role === 'admin';
    } catch (e) {
        return false;
    }
}

// Load configuracoes page
function loadConfiguracoes() {
    $.ajax({
        url: `${API_URL}/configuracoes`,
        method: 'GET',
        success: function(configuracoes) {
            if (isAdminUser()) {
                $.ajax({
                    url: `${API_URL}/auth/usuarios`,
                    method: 'GET',
                    success: function(usuarios) {
                        renderConfiguracoes(configuracoes, usuarios);
                    },
                    error: function() {
                        renderConfiguracoes(configuracoes, null);
                    }
                });
            } else {
                renderConfiguracoes(configuracoes, null);
            }
        },
        error: function() {
            $('#page-content').html('<div class="alert alert-danger">Erro ao carregar configurações!</div>');
        }
    });
}

// Render configuracoes
function renderConfiguracoes(configuracoes, usuarios) {
    let currentUsername = '';
    try {
        currentUsername = JSON.parse(localStorage.getItem('user') || '{}').username || '';
    } catch (e) {}

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

    configuracoes = configuracoes.filter(config => !fiscalConfigKeys.has(config.chave) && !backupConfigKeys.has(config.chave) && config.chave !== 'endereco');

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
        'uf',
        'login_background'
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
                <p class="text-muted small">Apenas o administrador pode cadastrar ou remover usuários. O operador acessa o mesmo sistema, sem esta seção.</p>
                <div class="table-responsive mb-3">
                    <table class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th>Usuário</th>
                                <th>Perfil</th>
                                <th>Cadastro</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usuarios.map(u => `
                                <tr>
                                    <td>${escapeHtml(u.username)}</td>
                                    <td><span class="badge bg-${u.role === 'admin' ? 'danger' : 'secondary'}">${u.role === 'admin' ? 'Administrador' : 'Operador'}</span></td>
                                    <td>${u.created_at ? formatDateTime(u.created_at) : '-'}</td>
                                    <td>
                                        ${u.username !== JSON.parse(localStorage.getItem('user') || '{}').username ? `
                                            <button type="button" class="btn btn-sm btn-outline-primary me-1" onclick='showModalNovoUsuario(${JSON.stringify(u)})'>
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="excluirUsuarioSistema(${u.id}, '${escapeHtml(u.username).replace(/'/g, "\\'")}')">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        ` : '<span class="text-muted small">você</span>'}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <button type="button" class="btn btn-primary btn-sm" onclick="showModalNovoUsuario()">
                    <i class="fas fa-user-plus"></i> Novo usuário
                </button>
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
                        ${configuracoes.map(config => `
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

        <div class="card mt-3">
            <div class="card-header">
                <i class="fas fa-database"></i> Backup e Manutenção
            </div>
            <div class="card-body">
                <button class="btn btn-info" onclick="fazerBackup()">
                    <i class="fas fa-download"></i> Fazer Backup
                </button>
                <button class="btn btn-secondary ms-2" onclick="showBackupConfigModal()">
                    <i class="fas fa-cloud-upload-alt"></i> Configurar Backup Google Drive
                </button>
                <button class="btn btn-warning ms-2" onclick="limparCache()">
                    <i class="fas fa-trash"></i> Limpar Cache
                </button>
                <button class="btn btn-outline-primary ms-2" onclick="backupManual()">
                    <i class="fas fa-play"></i> Backup Manual Agora
                </button>
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
                            <label class="form-label">Perfil</label>
                            <select class="form-control" id="novo_usuario_role" onchange="togglePermissoesUsuario()">
                                <option value="operador" ${usuario?.role === 'operador' ? 'selected' : ''}>Operador</option>
                                <option value="admin" ${usuario?.role === 'admin' ? 'selected' : ''}>Administrador</option>
                            </select>
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

function excluirUsuarioSistema(id) {
    if (!confirm('Remover este usuário? Esta ação não pode ser desfeita.')) return;
    $.ajax({
        url: `${API_URL}/auth/usuarios/${id}`,
        method: 'DELETE',
        success: function() {
            showNotification('Usuário removido.');
            loadConfiguracoes();
        },
        error: function(xhr) {
            showNotification(xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : 'Erro ao remover.', 'danger');
        }
    });
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