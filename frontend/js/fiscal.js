let fiscalNotasCache = [];

function loadFiscal() {
    renderFiscal();
    carregarFiscalConfig();
    carregarFiscalNotas();
}

function renderFiscal() {
    const html = `
        <div class="card shadow-sm">
            <div class="card-header d-flex justify-content-between align-items-center">
                <div><i class="fas fa-receipt"></i> Módulo Fiscal NFC-e</div>
                <div class="d-flex gap-2">
                    <button class="btn btn-outline-primary btn-sm" onclick="carregarFiscalConfig()">
                        <i class="fas fa-rotate-right"></i> Recarregar
                    </button>
                    <button class="btn btn-success btn-sm" onclick="salvarConfigFiscal()">
                        <i class="fas fa-save"></i> Salvar Configuração
                    </button>
                </div>
            </div>
            <div class="card-body">
                <ul class="nav nav-tabs mb-3">
                    <li class="nav-item">
                        <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#fiscal-config-tab" type="button">
                            Configuração Fiscal
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#fiscal-notas-tab" type="button">
                            NFC-e Emitidas
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#fiscal-emissao-tab" type="button">
                            Emissão Manual
                        </button>
                    </li>
                </ul>

                <div class="tab-content">
                    <div class="tab-pane fade show active" id="fiscal-config-tab">
                        <div id="fiscal-config-form-area">
                            <div class="text-center p-4">
                                <div class="spinner-border text-primary"></div>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="fiscal-notas-tab">
                        <div class="row g-2 mb-3">
                            <div class="col-md-4">
                                <input type="text" id="fiscalBuscaNota" class="form-control" placeholder="Buscar por chave, venda ou protocolo" oninput="renderTabelaFiscalNotas()">
                            </div>
                            <div class="col-md-3">
                                <select id="fiscalFiltroStatus" class="form-control" onchange="renderTabelaFiscalNotas()">
                                    <option value="">Todos os status</option>
                                    <option value="autorizado">Autorizado</option>
                                    <option value="rejeitada">Rejeitada</option>
                                    <option value="erro">Erro</option>
                                    <option value="pendente">Pendente</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <button class="btn btn-primary w-100" onclick="carregarFiscalNotas()">
                                    <i class="fas fa-rotate-right"></i> Atualizar Notas
                                </button>
                            </div>
                        </div>
                        <div id="fiscal-notas-area"></div>
                    </div>

                    <div class="tab-pane fade" id="fiscal-emissao-tab">
                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label">ID da venda</label>
                                <input type="number" min="1" id="fiscalVendaIdManual" class="form-control" placeholder="Ex.: 15">
                            </div>
                            <div class="col-md-6 d-flex align-items-end">
                                <button class="btn btn-warning w-100" onclick="emitirFiscalManual()">
                                    <i class="fas fa-file-invoice"></i> Emitir NFC-e da venda
                                </button>
                            </div>
                        </div>

                        <div class="alert alert-info mt-3 mb-0">
                            Use esta aba para emitir manualmente uma NFC-e de uma venda já gravada no sistema.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('#page-content').html(html);
}

function getFiscalField(label, id, value = '', help = '', type = 'text', onblur = '', oninput = '') {
    const onblurAttr = onblur ? ` onblur="${onblur}"` : '';
    const oninputAttr = oninput ? ` oninput="${oninput}"` : '';
    return `
        <div class="col-md-4 mb-3">
            <label class="form-label">${label}</label>
            <input type="${type}" class="form-control fiscal-field" id="${id}" value="${String(value || '').replace(/"/g, '&quot;')}"${onblurAttr}${oninputAttr}>
            ${help ? `<div class="form-text">${help}</div>` : ''}
        </div>
    `;
}

function carregarFiscalConfig() {
    $.ajax({
        url: `${API_URL}/fiscal/config`,
        method: 'GET',
        success: function(cfg) {
            const html = `
                <div class="row">
                    <div class="col-md-4 mb-3">
                        <label class="form-label">Ambiente</label>
                        <select class="form-control fiscal-field" id="fiscal_ambiente">
                            <option value="">Selecione</option>
                            <option value="2" ${Number(cfg.ambiente) === 2 ? 'selected' : ''}>2 - Homologação</option>
                            <option value="1" ${Number(cfg.ambiente) === 1 ? 'selected' : ''}>1 - Produção</option>
                        </select>
                        <div class="form-text">Escolha manualmente o ambiente fiscal</div>
                        <div id="alertaAmbiente" class="mt-2"></div>
                    </div>
                    ${getFiscalField('UF', 'fiscal_uf_sigla', cfg.uf || 'CE')}
                    ${getFiscalField('Código UF', 'fiscal_codigo_uf', cfg.codigoUf || '23')}
                    ${getFiscalField('Série', 'fiscal_serie', cfg.serie || 1, '', 'number')}
                    ${getFiscalField('Número atual', 'fiscal_numero_atual', cfg.numeroAtual || 1, 'Próximo número que será usado', 'number')}
                    ${getFiscalField('Regime tributário CRT', 'fiscal_regime_tributario', cfg.crt || '1', '1 = Simples Nacional')}

                    ${getFiscalField('Nome da empresa', 'nome_empresa', cfg.nomeEmpresa || '')}
                    ${getFiscalField('CNPJ', 'cnpj', cfg.cnpj || '')}
                    ${getFiscalField('Inscrição Estadual', 'fiscal_ie', cfg.ie || '')}
                    ${getFiscalField('Telefone', 'telefone', cfg.telefone || '', '', 'text', '', 'formatPhone(this)')}
                    ${getFiscalField('Email', 'email', cfg.email || '')}

                    ${getFiscalField('Código do município', 'fiscal_municipio_codigo', cfg.municipioCodigo || '2307304')}
                    ${getFiscalField('Município', 'fiscal_municipio_nome', cfg.municipioNome || 'Juazeiro do Norte')}
                    ${getFiscalField('CEP emitente', 'fiscal_emitente_cep', cfg.cep || '', '', 'text', 'buscarCepFiscal(this.value)', 'formatCep(this)')}
                    ${getFiscalField('Logradouro', 'fiscal_emitente_logradouro', cfg.logradouro || '')}
                    ${getFiscalField('Número', 'fiscal_emitente_numero', cfg.numeroEndereco || 'S/N')}
                    ${getFiscalField('Bairro', 'fiscal_emitente_bairro', cfg.bairro || '')}

                    ${getFiscalField('ID CSC', 'fiscal_id_csc', cfg.idCSC || '')}
                    ${getFiscalField('Token CSC', 'fiscal_token_csc', cfg.tokenCSC || '')}

                    <div class="col-md-4 mb-3">
                        <label class="form-label">Enviar certificado A1 (.pfx)</label>
                        <input type="file" id="fiscal_certificado_upload" class="form-control" accept=".pfx">
                        <div class="form-text">Envie o certificado digital da empresa em formato .pfx</div>
                        <div class="form-text mt-2" style="color: ${cfg.certificadoPath ? 'green' : 'red'};">
                            ${cfg.certificadoPath ? 'Certificado ativo' : 'Certificado inativo'}
                        </div>
                    </div>
                    ${getFiscalField('Senha do certificado', 'fiscal_certificado_senha', cfg.certificadoSenha || '', '', 'password')}
                    <input type="hidden" class="fiscal-field" id="fiscal_certificado_path" value="${cfg.certificadoPath || ''}">
                    ${getFiscalField('Tipo impressão', 'fiscal_tp_imp', cfg.tpImp || 4, '4 = DANFE NFC-e')}
                    <div class="col-12">
                        <hr>
                        <h6 class="text-warning">URLs de Homologação</h6>
                    </div>

                    ${getFiscalField('URL consulta QRCode homologação', 'fiscal_csc_qrcode_url_homologacao', (cfg.urlsHomologacao && cfg.urlsHomologacao.consultaQr) || '')}
                    ${getFiscalField('URL consulta chave homologação', 'fiscal_consulta_chave_url_homologacao', (cfg.urlsHomologacao && cfg.urlsHomologacao.consultaChave) || '')}
                    ${getFiscalField('WS autorização homologação', 'fiscal_ws_autorizacao_homologacao', (cfg.urlsHomologacao && cfg.urlsHomologacao.autorizacao) || '')}
                    ${getFiscalField('WS retorno homologação', 'fiscal_ws_retorno_homologacao', (cfg.urlsHomologacao && cfg.urlsHomologacao.retorno) || '')}
                    ${getFiscalField('WS status homologação', 'fiscal_ws_status_homologacao', (cfg.urlsHomologacao && cfg.urlsHomologacao.status) || '')}

                    <div class="col-12">
                        <hr>
                        <h6 class="text-danger">URLs de Produção</h6>
                    </div>

                    ${getFiscalField('URL consulta QRCode produção', 'fiscal_csc_qrcode_url_producao', (cfg.urlsProducao && cfg.urlsProducao.consultaQr) || '')}
                    ${getFiscalField('URL consulta chave produção', 'fiscal_consulta_chave_url_producao', (cfg.urlsProducao && cfg.urlsProducao.consultaChave) || '')}
                    ${getFiscalField('WS autorização produção', 'fiscal_ws_autorizacao_producao', (cfg.urlsProducao && cfg.urlsProducao.autorizacao) || '')}
                    ${getFiscalField('WS retorno produção', 'fiscal_ws_retorno_producao', (cfg.urlsProducao && cfg.urlsProducao.retorno) || '')}
                    ${getFiscalField('WS status produção', 'fiscal_ws_status_producao', (cfg.urlsProducao && cfg.urlsProducao.status) || '')}
                </div>

                <div class="d-flex gap-2 flex-wrap align-items-center">
                    <button class="btn btn-success btn-sm" onclick="salvarConfigFiscal()">
                        <i class="fas fa-save"></i> Salvar tudo
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="uploadCertificadoFiscal()">
                        <i class="fas fa-upload"></i> Enviar certificado
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="testarCertificadoFiscal()">
                        <i class="fas fa-certificate"></i> Testar certificado
                    </button>
                </div>
            `;

            $('#fiscal-config-form-area').html(html);

            $('#fiscal_ambiente').on('change', function () {
                const val = $(this).val();

                if (val === '1') {
                    $('#alertaAmbiente').html(`
                        <div class="alert alert-danger">
                            ⚠️ Você está em PRODUÇÃO. As notas terão valor fiscal real.
                        </div>
                    `);
                } else if (val === '2') {
                    $('#alertaAmbiente').html(`
                        <div class="alert alert-warning">
                            🧪 Ambiente de HOMOLOGAÇÃO (teste sem valor fiscal).
                        </div>
                    `);
                } else {
                    $('#alertaAmbiente').html('');
                }
            }).trigger('change');
        },
        error: function(xhr) {
            $('#fiscal-config-form-area').html(`
                <div class="alert alert-danger">
                    Erro ao carregar configuração fiscal: ${xhr.responseJSON?.error || 'erro desconhecido'}
                </div>
            `);
        }
    });
}

function coletarPayloadFiscal() {
    const payload = {};

    $('.fiscal-field').each(function() {
        payload[$(this).attr('id')] = $(this).val();
    });

    return payload;
}

function salvarConfigFiscal() {
    const payload = coletarPayloadFiscal();

    $.ajax({
        url: `${API_URL}/fiscal/config`,
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify(payload),
        success: function() {
            showNotification('Configuração fiscal salva com sucesso!');
            carregarFiscalConfig();
        },
        error: function(xhr) {
            showNotification(xhr.responseJSON?.error || 'Erro ao salvar configuração fiscal.', 'danger');
        }
    });
}

function testarCertificadoFiscal() {
    const certificadoPath = $('#fiscal_certificado_path').val();
    const senha = $('#fiscal_certificado_senha').val();

    $.ajax({
        url: `${API_URL}/fiscal/config/certificado/testar`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ certificadoPath, senha }),
        success: function(resp) {
            showNotification(`Certificado validado com sucesso. Tamanho base64: ${resp.certBase64Length}`);
        },
        error: function(xhr) {
            showNotification(xhr.responseJSON?.error || 'Falha ao validar certificado.', 'danger');
        }
    });
}

function uploadCertificadoFiscal() {
    const input = document.getElementById('fiscal_certificado_upload');

    if (!input || !input.files || !input.files.length) {
        showNotification('Selecione um arquivo .pfx para enviar.', 'warning');
        return;
    }

    const formData = new FormData();
    formData.append('certificado', input.files[0]);

    $.ajax({
        url: `${API_URL}/fiscal/certificado/upload`,
        method: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function(resp) {
            $('#fiscal_certificado_path').val(resp.path || '');
            showNotification('Certificado enviado com sucesso!');
        },
        error: function(xhr) {
            showNotification(xhr.responseJSON?.error || 'Erro ao enviar certificado.', 'danger');
        }
    });
}

function carregarFiscalNotas() {
    $.ajax({
        url: `${API_URL}/fiscal/notas`,
        method: 'GET',
        success: function(notas) {
            fiscalNotasCache = Array.isArray(notas) ? notas : [];
            renderTabelaFiscalNotas();
        },
        error: function(xhr) {
            $('#fiscal-notas-area').html(`
                <div class="alert alert-danger">
                    Erro ao carregar NFC-e: ${xhr.responseJSON?.error || 'erro desconhecido'}
                </div>
            `);
        }
    });
}

function renderTabelaFiscalNotas() {
    const termo = ($('#fiscalBuscaNota').val() || '').toLowerCase().trim();
    const status = ($('#fiscalFiltroStatus').val() || '').toLowerCase().trim();

    const notas = fiscalNotasCache.filter(n => {
        const matchTermo = !termo || [n.chave_acesso, n.venda_codigo, n.protocolo, n.recibo, n.xml_retorno, n.xml_enviado]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(termo);

        const matchStatus = !status || String(n.status || '').toLowerCase().includes(status);
        return matchTermo && matchStatus;
    });

    const html = `
        <div class="table-responsive">
            <table class="table table-striped table-hover align-middle">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Venda</th>
                        <th>Situação</th>
                        <th>Chave</th>
                        <th>Protocolo</th>
                        <th>Data</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${notas.length ? notas.map(n => `
                        <tr>
                            <td>${n.id}</td>
                            <td>${n.venda_codigo || n.venda_id || '-'}</td>
                            <td><span class="badge ${getBadgeFiscalClass(n.status)}">${n.status || 'pendente'}</span></td>
                            <td style="max-width:220px; word-break:break-all;">${n.chave_acesso || '-'}</td>
                            <td>${n.protocolo || '-'}</td>
                            <td>${formatDateTime(n.created_at)}</td>
                            <td>
                                <button class="btn btn-sm btn-info" onclick="verDetalheFiscal(${n.id})" title="Visualizar">
                                    <i class="fas fa-eye"></i>
                                </button>

                                ${String(n.status || '').toLowerCase().includes('autoriz') ? `
                                    <button class="btn btn-sm btn-danger ms-1" onclick="cancelarNfce(${n.id})" title="Cancelar NFC-e">
                                        <i class="fas fa-ban"></i>
                                    </button>
                                ` : ''}
                            </td>
                        </tr>
                    `).join('') : `
                        <tr>
                            <td colspan="7" class="text-center text-muted">Nenhuma NFC-e encontrada.</td>
                        </tr>
                    `}
                </tbody>
            </table>
        </div>
    `;

    $('#fiscal-notas-area').html(html);
}

function getBadgeFiscalClass(status) {
    const s = String(status || '').toLowerCase();

    if (s.includes('autoriz')) return 'bg-success';
    if (s.includes('rejeit')) return 'bg-danger';
    if (s.includes('erro')) return 'bg-warning text-dark';

    return 'bg-secondary';
}

function verDetalheFiscal(id) {
    $.ajax({
        url: `${API_URL}/fiscal/notas/${id}`,
        method: 'GET',
        success: function(nota) {
            const modalHtml = `
                <div class="modal fade" id="modalDetalheFiscal" tabindex="-1">
                    <div class="modal-dialog modal-xl modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Detalhe NFC-e #${nota.id}</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="row mb-3">
                                    <div class="col-md-4"><strong>Venda:</strong> ${nota.venda_codigo || nota.venda_id || '-'}</div>
                                    <div class="col-md-4"><strong>Status:</strong> ${nota.status || '-'}</div>
                                    <div class="col-md-4"><strong>Protocolo:</strong> ${nota.protocolo || '-'}</div>
                                </div>

                                <div class="mb-2">
                                    <strong>Chave de acesso:</strong><br>${nota.chave_acesso || '-'}
                                </div>

                                <hr>

                                <h6>XML Enviado</h6>
                                <textarea class="form-control mb-3" rows="12" readonly>${nota.xml_enviado || ''}</textarea>

                                <h6>XML de Retorno</h6>
                                <textarea class="form-control" rows="12" readonly>${nota.xml_retorno || ''}</textarea>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            $('#modal-container').html(modalHtml);
            new bootstrap.Modal(document.getElementById('modalDetalheFiscal')).show();
        },
        error: function(xhr) {
            showNotification(xhr.responseJSON?.error || 'Erro ao buscar detalhe da NFC-e.', 'danger');
        }
    });
}

function emitirFiscalManual() {
    const vendaId = Number($('#fiscalVendaIdManual').val());

    if (!vendaId) {
        showNotification('Informe um ID de venda válido.', 'warning');
        return;
    }

    $.ajax({
        url: `${API_URL}/fiscal/emitir/venda/${vendaId}`,
        method: 'POST',
        success: function(resp) {
            if (resp?.danfeHtml) {
                imprimirHtmlFiscal(resp.danfeHtml);
            }

            showNotification(resp?.message || 'Processo fiscal executado.');
            carregarFiscalNotas();
        },
        error: function(xhr) {
            showNotification(xhr.responseJSON?.error || 'Erro ao emitir NFC-e.', 'danger');
        }
    });
}

function imprimirHtmlFiscal(html) {
    const win = window.open('', '_blank', 'width=420,height=800');

    if (!win) {
        showNotification('Permita popups para imprimir o DANFE NFC-e.', 'warning');
        return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();

    setTimeout(() => win.print(), 500);
}

// Buscar CEP para configuração fiscal
function buscarCepFiscal(cep) {
    if (!cep || cep.length < 8) return;

    // Remover caracteres não numéricos
    cep = cep.replace(/\D/g, '');

    if (cep.length !== 8) return;

    // Mostrar loading
    showNotification('Buscando endereço fiscal...', 'info');

    fetch(`https://viacep.com.br/ws/${cep}/json/`)
        .then(response => response.json())
        .then(data => {
            if (data.erro) {
                showNotification('CEP não encontrado.', 'warning');
                return;
            }

            // Preencher os campos fiscais
            $('#fiscal_emitente_logradouro').val(data.logradouro || '');
            $('#fiscal_emitente_bairro').val(data.bairro || '');
            $('#fiscal_municipio_nome').val(data.localidade || '');
            $('#fiscal_uf_sigla').val(data.uf || '');

            showNotification('Endereço fiscal preenchido automaticamente.');
        })
        .catch(error => {
            console.error('Erro ao buscar CEP fiscal:', error);
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
function cancelarNfce(id) {
    const modalHtml = `
        <div class="modal fade" id="modalCancelarNfce" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-danger text-white">
                        <h5 class="modal-title"><i class="fas fa-ban"></i> Cancelar NFC-e #${id}</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <label class="form-label fw-bold">Justificativa do cancelamento (mínimo 15 caracteres):</label>
                        <textarea id="justificativaCancelarNfce" class="form-control" rows="4" maxlength="255" placeholder="Ex: Erro na emissão da nota fiscal..."></textarea>
                        <div class="form-text text-end"><span id="contarCharsCancelar">0</span>/255</div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-danger" id="btnConfirmarCancelarNfce">
                            <i class="fas fa-ban"></i> Confirmar Cancelamento
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('#modal-container').html(modalHtml);
    const modalEl = document.getElementById('modalCancelarNfce');
    const modal = new bootstrap.Modal(modalEl);

    const textarea = document.getElementById('justificativaCancelarNfce');
    const contador = document.getElementById('contarCharsCancelar');
    textarea.addEventListener('input', () => {
        contador.textContent = textarea.value.length;
    });

    document.getElementById('btnConfirmarCancelarNfce').addEventListener('click', () => {
        const justificativa = textarea.value.trim();

        if (!justificativa || justificativa.length < 15) {
            showNotification('A justificativa precisa ter no mínimo 15 caracteres.', 'warning');
            textarea.focus();
            return;
        }

        modal.hide();

        $.ajax({
            url: `${API_URL}/fiscal/notas/${id}/cancelar`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ justificativa }),
            success: function(resp) {
                showNotification(resp.message || 'Cancelamento enviado com sucesso.');
                carregarFiscalNotas();
            },
            error: function(xhr) {
                showNotification(xhr.responseJSON?.error || 'Erro ao cancelar NFC-e.', 'danger');
            }
        });
    });

    modal.show();
}

function formatCep(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length <= 8) {
        value = value.replace(/(\d{5})(\d{3})/, '$1-$2');
        input.value = value;
    }
}
